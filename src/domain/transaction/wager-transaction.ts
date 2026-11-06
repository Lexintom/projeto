import { Entity } from "../shared/entity";
import { Money } from "../money/money";
import { LedgerDirection } from "../ledger/ledger-direction.enum";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
  TERMINAL_STATUSES,
} from "./wager-transaction.enums";
import type {
  CreateWagerTransactionProps,
  WagerTransactionState,
} from "./wager-transaction.props";
import { FailureCode } from "./failure-codes";
import {
  InvalidTransactionStateError,
  ReferenceNotFoundError,
  ReferenceAlreadyReversedError,
  ReferenceMismatchError,
  TransactionRejectedError,
} from "./wager-transaction.errors";

export interface LedgerDirectionForReference {
  direction: LedgerDirection;
  referenceTransaction?: WagerTransaction;
}

export class WagerTransaction extends Entity<WagerTransactionState> {
  private constructor(state: WagerTransactionState) {
    super(state);
  }

  public static create(props: CreateWagerTransactionProps): WagerTransaction {
    const now = props.createdAt;
    if (props.kind !== WagerTransactionKind.Loss && !props.money.isPositive())
      throw new TransactionRejectedError(
        FailureCode.InvalidAmount,
        "Amount must be positive",
      );
    // Opening is processed immediately (no wallet dependency for validation)
    const initialStatus =
      props.kind === WagerTransactionKind.Opening
        ? WagerTransactionStatus.Processed
        : WagerTransactionStatus.Pending;

    const requiresReference =
      props.kind === WagerTransactionKind.Refund ||
      props.kind === WagerTransactionKind.Rollback;

    const state: WagerTransactionState = {
      id: props.id,
      providerId: props.providerId,
      externalTransactionId: props.externalTransactionId,
      idempotencyKey: props.idempotencyKey,
      payloadHash: props.payloadHash,
      walletId: props.walletId,
      playerId: props.playerId,
      roundId: props.roundId,
      gameId: props.gameId,
      kind: props.kind,
      moneyAmount: props.money.amount,
      moneyCurrency: props.money.currency,
      referenceExternalTransactionId:
        props.referenceExternalTransactionId ?? null,
      referenceTransactionId: null,
      status: initialStatus,
      failureCode: null,
      createdAt: now,
      processedAt:
        initialStatus === WagerTransactionStatus.Processed ? now : null,
      updatedAt: now,
    };

    const transaction = new WagerTransaction(state);

    if (requiresReference && !props.referenceExternalTransactionId) {
      throw new TransactionRejectedError(
        FailureCode.ReferenceNotFound,
        "Reference is required",
      );
    }

    return transaction;
  }

  public static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(state);
  }

  get resultBalance(): Money | undefined {
    return this.props.resultBalance === undefined
      ? undefined
      : Money.from({
          amount: this.props.resultBalance,
          currency: this.props.resultCurrency ?? this.money.currency,
        });
  }

  get referenceAttempts(): number {
    return this.props.referenceAttempts ?? 0;
  }
  get nextReferenceAttemptAt(): Date | undefined {
    return this.props.nextReferenceAttemptAt;
  }

  recordResult(balance: Money): void {
    this.props.resultBalance = balance.amount;
    this.props.resultCurrency = balance.currency;
  }

  deferReference(now: Date): void {
    this.markPendingReference();
    this.props.referenceAttempts = this.referenceAttempts + 1;
    this.props.nextReferenceAttemptAt = new Date(
      now.getTime() +
        Math.min(300000, 1000 * 2 ** Math.min(this.referenceAttempts, 18)),
    );
  }

  get providerId(): string {
    return this.props.providerId;
  }

  get externalTransactionId(): string {
    return this.props.externalTransactionId;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get payloadHash(): string {
    return this.props.payloadHash;
  }

  get walletId(): string {
    return this.props.walletId;
  }

  get playerId(): string {
    return this.props.playerId;
  }

  get roundId(): string {
    return this.props.roundId;
  }

  get gameId(): string {
    return this.props.gameId;
  }

  get kind(): WagerTransactionKind {
    return this.props.kind;
  }

  get money(): Money {
    return Money.from({
      amount: this.props.moneyAmount,
      currency: this.props.moneyCurrency,
    });
  }

  get referenceExternalTransactionId(): string | undefined {
    return this.props.referenceExternalTransactionId ?? undefined;
  }

  get referenceTransactionId(): string | undefined {
    return this.props.referenceTransactionId ?? undefined;
  }

  get status(): WagerTransactionStatus {
    return this.props.status;
  }

  get failureCode(): FailureCode | undefined {
    return this.props.failureCode ?? undefined;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get processedAt(): Date | undefined {
    return this.props.processedAt ?? undefined;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public isTerminal(): boolean {
    return TERMINAL_STATUSES.includes(this.props.status);
  }

  public affectsBalance(): boolean {
    return this.props.kind !== WagerTransactionKind.Loss;
  }

  public requiresReference(): boolean {
    return (
      this.props.kind === WagerTransactionKind.Refund ||
      this.props.kind === WagerTransactionKind.Rollback
    );
  }

  public matchesPayload(payloadHash: string): boolean {
    return this.props.payloadHash === payloadHash;
  }

  public ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.props.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Rollback:
        if (!reference) {
          throw new ReferenceNotFoundError(
            this.props.referenceExternalTransactionId ?? "unknown",
            this.props.providerId,
          );
        }
        return reference.ledgerDirectionFor() === LedgerDirection.Debit
          ? LedgerDirection.Credit
          : LedgerDirection.Debit;
      default:
        throw new Error(
          `Cannot determine ledger direction for kind: ${this.props.kind}`,
        );
    }
  }

  public markProcessed(
    referenceTransactionId: string | undefined,
    at: Date,
  ): void {
    this.assertNotTerminal("markProcessed");
    this.props.status = WagerTransactionStatus.Processed;
    this.props.referenceTransactionId = referenceTransactionId ?? null;
    this.props.processedAt = at;
    this.props.updatedAt = at;
  }

  public markPendingReference(): void {
    this.assertNotTerminal("markPendingReference");
    this.props.status = WagerTransactionStatus.PendingReference;
    this.props.updatedAt = new Date();
  }

  public reject(code: FailureCode): void {
    this.assertNotTerminal("reject");
    this.props.status = WagerTransactionStatus.Rejected;
    this.props.failureCode = code;
    this.props.processedAt = new Date();
    this.props.updatedAt = new Date();
  }

  public fail(code: FailureCode): void {
    this.assertNotTerminal("fail");
    this.props.status = WagerTransactionStatus.Failed;
    this.props.failureCode = code;
    this.props.processedAt = new Date();
    this.props.updatedAt = new Date();
  }

  public setReferenceTransactionId(referenceId: string): void {
    this.assertNotTerminal("setReferenceTransactionId");
    if (this.props.referenceTransactionId !== null) {
      throw new ReferenceAlreadyReversedError(
        this.props.referenceTransactionId,
        this.props.kind,
      );
    }
    this.props.referenceTransactionId = referenceId;
  }

  public validateReference(reference: WagerTransaction): void {
    if (reference.providerId !== this.props.providerId) {
      throw new ReferenceMismatchError("providerId");
    }
    if (reference.playerId !== this.props.playerId) {
      throw new ReferenceMismatchError("playerId");
    }
    if (reference.walletId !== this.props.walletId) {
      throw new ReferenceMismatchError("walletId");
    }
    if (reference.money.currency !== this.props.moneyCurrency) {
      throw new ReferenceMismatchError("currency");
    }
    if (reference.roundId !== this.props.roundId) {
      throw new ReferenceMismatchError("roundId");
    }

    if (this.props.kind === WagerTransactionKind.Win) {
      if (reference.kind !== WagerTransactionKind.Bet)
        throw new TransactionRejectedError(
          FailureCode.InvalidKindForReference,
          "WIN must reference BET",
        );
      return;
    }

    if (this.props.kind === WagerTransactionKind.Refund) {
      if (reference.kind !== WagerTransactionKind.Bet) {
        throw new TransactionRejectedError(
          FailureCode.InvalidKindForReference,
          "REFUND can only reference BET transactions",
        );
      }
    }

    if (this.props.kind === WagerTransactionKind.Rollback) {
      const validKinds = [
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
      ];
      if (!validKinds.includes(reference.kind)) {
        throw new TransactionRejectedError(
          FailureCode.InvalidKindForReference,
          "ROLLBACK can only reference BET, WIN, or REFUND transactions",
        );
      }
    }

    if (!reference.money.equals(this.money)) {
      throw new TransactionRejectedError(
        FailureCode.InvalidAmount,
        `Amount ${this.money.toString()} does not match reference ${reference.money.toString()}`,
      );
    }
  }

  private assertNotTerminal(action: string): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(this.props.status, action);
    }
  }

  public toJSON(): CreateWagerTransactionProps & {
    status: WagerTransactionStatus;
    referenceTransactionId: string | undefined;
    failureCode: FailureCode | undefined;
    processedAt: Date | undefined;
  } {
    return {
      id: this.id,
      providerId: this.providerId,
      externalTransactionId: this.externalTransactionId,
      idempotencyKey: this.idempotencyKey,
      payloadHash: this.payloadHash,
      walletId: this.walletId,
      playerId: this.playerId,
      roundId: this.roundId,
      gameId: this.gameId,
      kind: this.kind,
      money: this.money,
      referenceExternalTransactionId: this.referenceExternalTransactionId,
      createdAt: this.createdAt,
      status: this.status,
      referenceTransactionId: this.referenceTransactionId,
      failureCode: this.failureCode,
      processedAt: this.processedAt,
    };
  }
}

export {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "./wager-transaction.enums";
