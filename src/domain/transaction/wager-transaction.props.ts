import { Money } from "../money/money";
import { WagerTransactionKind } from "./wager-transaction.enums";
import { WagerTransactionStatus } from "./wager-transaction.enums";
import { FailureCode } from "./failure-codes";

export interface CreateWagerTransactionProps {
  id: string;
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
  createdAt: Date;
}

export interface WagerTransactionState {
  resultBalance?: string;
  resultCurrency?: string;
  referenceAttempts?: number;
  nextReferenceAttemptAt?: Date;
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  moneyAmount: string;
  moneyCurrency: string;
  referenceExternalTransactionId: string | null;
  referenceTransactionId: string | null;
  status: WagerTransactionStatus;
  failureCode: FailureCode | null;
  createdAt: Date;
  processedAt: Date | null;
  updatedAt: Date;
}
