import { IntegrationEvent } from "../integration-event";
import type { MoneyProps } from "../../money/money.props";
import { WagerTransactionKind } from "../../transaction/wager-transaction.enums";
import { FailureCode } from "../../transaction/failure-codes";

export interface WagerTransactionRejectedData {
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
  failureCode: FailureCode;
  failureMessage: string;
  rejectedAt: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  public readonly eventType = "WagerTransactionRejected";
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
    failureCode: FailureCode,
    failureMessage: string,
    occurredAt: Date,
  ): WagerTransactionRejected {
    return new WagerTransactionRejected({
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
        failureCode,
        failureMessage,
        rejectedAt: occurredAt.toISOString(),
      },
    });
  }
}
