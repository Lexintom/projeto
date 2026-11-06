import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { UnitOfWork } from "../ports/unit-of-work";
import { IdempotencyConflictError } from "../../domain/transaction/wager-transaction.errors";
import { Wallet } from "../../domain/wallet/wallet";
import { WagerTransaction } from "../../domain/transaction/wager-transaction";
import { WalletLedgerEntry } from "../../domain/ledger/wallet-ledger-entry";
import { InboxMessage } from "../../domain/inbox/inbox-message";
import { OutboxMessage } from "../../domain/outbox/outbox-message";
import { Money } from "../../domain/money/money";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../domain/transaction/wager-transaction.enums";
import {
  FailureCode,
  FAILURE_CODE_DESCRIPTIONS,
} from "../../domain/transaction/failure-codes";
import type { WalletRepository } from "../../domain/wallet/wallet.repository.interface";
import type { WagerTransactionRepository } from "../../domain/transaction/wager-transaction.repository.interface";
import type { LedgerRepository } from "../../domain/ledger/ledger.repository.interface";
import type { InboxRepository } from "../../domain/inbox/inbox.repository.interface";
import type { OutboxRepository } from "../../domain/outbox/outbox.repository.interface";
import type { ReferenceResolver } from "../services/reference-resolver.service";
import { IntegrationEvent } from "../../domain/outbox/integration-event";
import { WagerTransactionProcessed } from "../../domain/outbox/events/wager-transaction-processed.event";
import { WagerTransactionRejected } from "../../domain/outbox/events/wager-transaction-rejected.event";
import { WalletBalanceChanged } from "../../domain/outbox/events/wallet-balance-changed.event";
import { WagerTransactionPendingReference } from "../../domain/outbox/events/wager-transaction-pending-reference.event";
import {
  InvalidTransactionStateError,
  ReferenceNotFoundError,
  ReferenceAlreadyReversedError,
  ReferenceMismatchError,
  TransactionRejectedError,
} from "../../domain/transaction/wager-transaction.errors";
import { InvalidMoneyError } from "../../domain/money/money.errors";
import { InsufficientBalanceError } from "../../domain/wallet/wallet.errors";
import { LedgerDirection } from "../../domain/ledger/ledger-direction.enum";

import type { ProcessingObserver } from "../ports/processing-observer";

export interface SubmitWagerTransactionCommand {
  correlationId?: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  inboxMessageId?: string;
  consumerName?: string;
}

export interface SubmitWagerTransactionResult {
  transaction: WagerTransaction;
  balance: Money;
  idempotentReplay: boolean;
  statusCode: number;
}

export class SubmitWagerTransactionUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly inboxRepository: InboxRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly maxRetries = 3,
    private readonly baseBackoffMs = 50,
    private readonly observer?: ProcessingObserver,
  ) {}

  async execute(
    command: SubmitWagerTransactionCommand,
  ): Promise<SubmitWagerTransactionResult> {
    const started = performance.now();
    for (let attempt = 0; ; attempt++) {
      try {
        // Each retry starts with new domain objects and a fresh DB transaction.
        const result = await this.unitOfWork.run(() => this.process(command));
        this.observer?.completed(
          command,
          result,
          (performance.now() - started) / 1000,
        );
        return result;
      } catch (error) {
        if (error instanceof IdempotencyConflictError)
          this.observer?.idempotencyConflict();
        const code = (error as { code?: string; cause?: { code?: string } })
          .code;
        const retryable =
          error instanceof OptimisticConflict ||
          ["23505", "40001", "40P01", "55P03"].includes(code ?? "");
        if (!retryable || attempt >= this.maxRetries) throw error;
        this.observer?.retry();
        await new Promise((resolve) =>
          setTimeout(resolve, this.baseBackoffMs * 2 ** attempt),
        );
      }
    }
  }

  private async process(
    command: SubmitWagerTransactionCommand,
  ): Promise<SubmitWagerTransactionResult> {
    const wallet = await this.walletRepository.findById(command.walletId, true);
    if (!wallet) throw new NotFoundException("Wallet not found");
    if (wallet.playerId !== command.playerId)
      throw new ForbiddenException("Wallet belongs to another player");
    if (command.kind === WagerTransactionKind.Opening)
      throw new BadRequestException(
        "OPENING is only allowed when creating a wallet",
      );

    if (command.inboxMessageId && command.consumerName) {
      const inbox = await this.inboxRepository.findByMessageIdAndConsumer(
        command.inboxMessageId,
        command.consumerName,
      );
      if (inbox && inbox.payloadHash !== command.payloadHash)
        throw new IdempotencyConflictError(command.inboxMessageId);
    }

    const existing =
      (await this.transactionRepository.findByIdempotencyKey(
        command.idempotencyKey,
      )) ??
      (await this.transactionRepository.findByProviderAndExternalId(
        command.providerId,
        command.externalTransactionId,
      ));
    if (existing && existing.idempotencyKey !== command.idempotencyKey)
      throw new IdempotencyConflictError(command.idempotencyKey);
    if (existing && !existing.matchesPayload(command.payloadHash))
      throw new IdempotencyConflictError(command.idempotencyKey);
    if (
      existing &&
      existing.status !== WagerTransactionStatus.PendingReference
    ) {
      await this.saveInbox(command);
      return this.buildResult(
        existing,
        existing.resultBalance ?? wallet.balance,
        true,
        existing.status === WagerTransactionStatus.Processed ? 200 : 422,
      );
    }

    if (
      command.kind !== WagerTransactionKind.Loss &&
      !command.money.isPositive()
    )
      throw new BadRequestException("Amount must be positive");
    if (
      [WagerTransactionKind.Refund, WagerTransactionKind.Rollback].includes(
        command.kind,
      ) &&
      !command.referenceExternalTransactionId
    )
      throw new BadRequestException("Reference is required");
    const transaction =
      existing ??
      WagerTransaction.create({
        ...command,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      });
    const before = wallet.balance;
    let entry: WalletLedgerEntry | undefined;
    let reference: WagerTransaction | null = null;
    let statusCode = 200;

    try {
      if (wallet.currency !== command.money.currency)
        throw new TransactionRejectedError(
          FailureCode.CurrencyMismatch,
          "Currency mismatch",
        );
      if (
        transaction.requiresReference() ||
        (transaction.kind === WagerTransactionKind.Win &&
          command.referenceExternalTransactionId)
      ) {
        if (!command.referenceExternalTransactionId)
          throw new TransactionRejectedError(
            FailureCode.ReferenceNotFound,
            "Reference is required",
          );
        reference = await this.transactionRepository.findByReference(
          command.providerId,
          command.referenceExternalTransactionId,
        );
        if (
          !reference ||
          [
            WagerTransactionStatus.Pending,
            WagerTransactionStatus.PendingReference,
          ].includes(reference.status)
        ) {
          transaction.deferReference(new Date());
          if (
            Date.now() - transaction.createdAt.getTime() >
            24 * 60 * 60 * 1000
          ) {
            transaction.reject(FailureCode.ReferenceTimeout);
            statusCode = 422;
          } else statusCode = 202;
        } else {
          transaction.validateReference(reference);
          if (reference.status !== WagerTransactionStatus.Processed)
            throw new TransactionRejectedError(
              FailureCode.ReferenceMismatch,
              "Reference was not processed",
            );
          if (
            await this.transactionRepository.hasReversal(
              reference.id,
              command.kind,
            )
          )
            throw new ReferenceAlreadyReversedError(reference.id, command.kind);
        }
      }

      if (statusCode === 200) {
        if (transaction.affectsBalance()) {
          const direction = transaction.ledgerDirectionFor(
            reference ?? undefined,
          );
          entry =
            direction === LedgerDirection.Debit
              ? wallet.debit(transaction.money, transaction.id, new Date())
                  .entry
              : wallet.credit(transaction.money, transaction.id, new Date())
                  .entry;
          if (
            !(await this.walletRepository.saveWithOptimisticLock(
              wallet,
              wallet.version - 1,
            ))
          )
            throw new OptimisticConflict();
        }
        transaction.markProcessed(reference?.id, new Date());
      }
    } catch (error) {
      if (error instanceof InsufficientBalanceError)
        transaction.reject(
          transaction.requiresReference()
            ? FailureCode.NegativeBalanceAfterReversal
            : FailureCode.InsufficientFunds,
        );
      else if (error instanceof InvalidMoneyError)
        transaction.reject(FailureCode.InvalidAmount);
      else if (error instanceof TransactionRejectedError)
        transaction.reject(error.failureCode);
      else if (error instanceof ReferenceMismatchError)
        transaction.reject(FailureCode.ReferenceMismatch);
      else if (error instanceof ReferenceAlreadyReversedError)
        transaction.reject(FailureCode.ReferenceAlreadyReversed);
      else throw error;
      statusCode = 422;
    }

    if (existing && statusCode === 202) {
      transaction.recordResult(wallet.balance);
      await this.transactionRepository.save(transaction);
      await this.saveInbox(command);
      return this.buildResult(transaction, wallet.balance, true, 202);
    }
    transaction.recordResult(wallet.balance);
    await this.saveTransactionAndEvents(
      transaction,
      command,
      wallet,
      entry,
      before,
      wallet.balance,
    );
    return this.buildResult(transaction, wallet.balance, false, statusCode);
  }

  private async saveInbox(
    command: SubmitWagerTransactionCommand,
  ): Promise<void> {
    if (!command.inboxMessageId || !command.consumerName) return;
    const previous = await this.inboxRepository.findByMessageIdAndConsumer(
      command.inboxMessageId,
      command.consumerName,
    );
    if (previous?.isProcessed()) return;
    const message =
      previous ??
      InboxMessage.receive({
        messageId: command.inboxMessageId,
        consumerName: command.consumerName,
        payloadHash: command.payloadHash,
        receivedAt: new Date(),
      });
    message.markProcessed(new Date());
    await this.inboxRepository.save(message);
  }

  private async saveTransactionAndEvents(
    transaction: WagerTransaction,
    command: SubmitWagerTransactionCommand,
    wallet?: Wallet,
    ledgerEntry?: WalletLedgerEntry,
    balanceBefore?: Money,
    balanceAfter?: Money,
  ): Promise<void> {
    const outboxEvents: IntegrationEvent<unknown>[] = [];

    const isProcessed = transaction.status === WagerTransactionStatus.Processed;
    const isPendingReference =
      transaction.status === WagerTransactionStatus.PendingReference;
    const isRejected = transaction.status === WagerTransactionStatus.Rejected;

    if (isProcessed) {
      outboxEvents.push(
        WagerTransactionProcessed.from(
          transaction.id,
          transaction.providerId,
          transaction.externalTransactionId,
          transaction.walletId,
          transaction.playerId,
          transaction.roundId,
          transaction.gameId,
          transaction.kind,
          transaction.money.toJSON(),
          transaction.referenceExternalTransactionId,
          transaction.referenceTransactionId,
          balanceBefore?.toJSON() ?? transaction.money.toJSON(),
          balanceAfter?.toJSON() ?? transaction.money.toJSON(),
          ledgerEntry?.direction,
          transaction.processedAt ?? new Date(),
        ),
      );

      // WalletBalanceChanged only when balance actually changes
      if (transaction.affectsBalance() && wallet) {
        outboxEvents.push(
          WalletBalanceChanged.from(
            wallet.id,
            transaction.id,
            ledgerEntry!.direction,
            transaction.money.toJSON(),
            balanceBefore!.toJSON(),
            balanceAfter!.toJSON(),
            wallet.version,
            transaction.processedAt ?? new Date(),
          ),
        );
      }
    } else if (isRejected) {
      outboxEvents.push(
        WagerTransactionRejected.from(
          transaction.id,
          transaction.providerId,
          transaction.externalTransactionId,
          transaction.walletId,
          transaction.playerId,
          transaction.roundId,
          transaction.gameId,
          transaction.kind,
          transaction.money.toJSON(),
          transaction.referenceExternalTransactionId,
          transaction.failureCode!,
          FAILURE_CODE_DESCRIPTIONS[transaction.failureCode!],
          transaction.processedAt ?? new Date(),
        ),
      );
    } else if (isPendingReference) {
      outboxEvents.push(
        WagerTransactionPendingReference.from(
          transaction.id,
          transaction.providerId,
          transaction.externalTransactionId,
          transaction.walletId,
          transaction.playerId,
          transaction.roundId,
          transaction.gameId,
          transaction.kind,
          transaction.money.toJSON(),
          transaction.referenceExternalTransactionId!,
          transaction.createdAt,
        ),
      );
    }

    // A UnitOfWork mantém estes writes na mesma transação.
    await this.transactionRepository.save(transaction);

    if (ledgerEntry) {
      await this.ledgerRepository.save(ledgerEntry);
    }

    await this.saveInbox(command);

    const outboxMessages = outboxEvents.map((e) =>
      OutboxMessage.enqueue({ event: e }),
    );
    await this.outboxRepository.saveAll(outboxMessages);
  }

  private buildResult(
    transaction: WagerTransaction,
    balance: Money,
    idempotentReplay: boolean,
    statusCode: number,
  ): SubmitWagerTransactionResult {
    return {
      transaction,
      balance,
      idempotentReplay,
      statusCode,
    };
  }
}

class OptimisticConflict extends Error {
  constructor() {
    super("Concurrent wallet update");
    this.name = "OptimisticConflict";
  }
}
