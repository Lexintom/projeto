import type { WagerTransactionRepository } from "../../domain/transaction/wager-transaction.repository.interface";
import type { OutboxRepository } from "../../domain/outbox/outbox.repository.interface";
import {
  WagerTransaction,
  WagerTransactionKind,
} from "../../domain/transaction/wager-transaction";
import { OutboxMessage } from "../../domain/outbox/outbox-message";
import { WagerTransactionProcessed } from "../../domain/outbox/events/wager-transaction-processed.event";
import { WalletBalanceChanged } from "../../domain/outbox/events/wallet-balance-changed.event";
import { computePayloadHash } from "../payload-hash";
import { ConflictException } from "@nestjs/common";
import type { UnitOfWork } from "../ports/unit-of-work";
import type { LedgerRepository } from "../../domain/ledger/ledger.repository.interface";
import { WalletLedgerEntry } from "../../domain/ledger/wallet-ledger-entry";
import { Wallet } from "../../domain/wallet/wallet";
import { Money } from "../../domain/money/money";
import type { WalletRepository } from "../../domain/wallet/wallet.repository.interface";

export interface CreateWalletCommand {
  playerId: string;
  initialBalance: Money;
}

export interface CreateWalletResult {
  wallet: Wallet;
}

export class CreateWalletUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly transactions: WagerTransactionRepository,
    private readonly outbox: OutboxRepository,
  ) {}

  async execute(command: CreateWalletCommand): Promise<CreateWalletResult> {
    return this.unitOfWork.run(async () => {
      const existing = await this.walletRepository.findByPlayerIdAndCurrency(
        command.playerId,
        command.initialBalance.currency,
      );

      if (existing) {
        throw new ConflictException(
          "Wallet already exists for this player and currency",
        );
      }

      const wallet = Wallet.open({
        id: crypto.randomUUID(),
        playerId: command.playerId,
        initialBalance: command.initialBalance,
      });

      await this.walletRepository.save(wallet);

      for (const entry of wallet.popDomainEvents()) {
        if (!(entry instanceof WalletLedgerEntry)) continue;
        const opening = WagerTransaction.create({
          id: entry.transactionId,
          providerId: "internal",
          externalTransactionId: wallet.id,
          idempotencyKey: `opening:${wallet.id}`,
          payloadHash: computePayloadHash({
            walletId: wallet.id,
            initialBalance: command.initialBalance.toJSON(),
          }),
          walletId: wallet.id,
          playerId: wallet.playerId,
          roundId: "opening",
          gameId: "internal",
          kind: WagerTransactionKind.Opening,
          money: command.initialBalance,
          createdAt: wallet.createdAt,
        });
        opening.recordResult(wallet.balance);
        await this.transactions.save(opening);
        await this.ledgerRepository.save(entry);
        const processed = WagerTransactionProcessed.from(
          opening.id,
          opening.providerId,
          opening.externalTransactionId,
          wallet.id,
          wallet.playerId,
          opening.roundId,
          opening.gameId,
          opening.kind,
          opening.money.toJSON(),
          undefined,
          undefined,
          entry.balanceBefore.toJSON(),
          entry.balanceAfter.toJSON(),
          entry.direction,
          wallet.createdAt,
        );
        const changed = WalletBalanceChanged.from(
          wallet.id,
          opening.id,
          entry.direction,
          entry.money.toJSON(),
          entry.balanceBefore.toJSON(),
          entry.balanceAfter.toJSON(),
          wallet.version,
          wallet.createdAt,
        );
        await this.outbox.saveAll(
          [processed, changed].map((event) => OutboxMessage.enqueue({ event })),
        );
      }
      return { wallet };
    });
  }
}
