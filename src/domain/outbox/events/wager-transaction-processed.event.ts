import { IntegrationEvent } from "../integration-event";
import type { MoneyProps } from "../../money/money.props";
import { WagerTransactionKind } from "../../transaction/wager-transaction.enums";
import { WagerTransactionStatus } from "../../transaction/wager-transaction.enums";
import { LedgerDirection } from "../../ledger/ledger-direction.enum";
import { FailureCode } from "../../transaction/failure-codes";

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
  referenceTransactionId?: string;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  ledgerDirection?: LedgerDirection;
  processedAt: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  public readonly eventType = "WagerTransactionProcessed";
  public readonly version = 1;

  public static from(
    transactionId: string,
    providerId: string,
    externalTransactionId: string,
    walletId: string,
    playerId: string,
    roundId: string,
    gameId: string,
    kind: WagerTransactionKind,
    money: MoneyProps,
    referenceExternalTransactionId: string | undefined,
    referenceTransactionId: string | undefined,
    balanceBefore: MoneyProps,
    balanceAfter: MoneyProps,
    ledgerDirection: LedgerDirection | undefined,
    occurredAt: Date,
  ): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      eventId: crypto.randomUUID(),
      aggregateId: transactionId,
      correlationId: transactionId,
      occurredAt,
      data: {
        transactionId,
        providerId,
        externalTransactionId,
        walletId,
        playerId,
        roundId,
        gameId,
        kind,
        money,
        referenceExternalTransactionId,
        referenceTransactionId,
        balanceBefore,
        balanceAfter,
        ledgerDirection,
        processedAt: occurredAt.toISOString(),
      },
    });
  }
}
