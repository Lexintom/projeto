import { IntegrationEvent } from "../integration-event";
import type { MoneyProps } from "../../money/money.props";
import { WagerTransactionKind } from "../../transaction/wager-transaction.enums";

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId: string;
  pendingSince: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  public readonly eventType = "WagerTransactionPendingReference";
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
    referenceExternalTransactionId: string,
    occurredAt: Date,
  ): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference({
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
        pendingSince: occurredAt.toISOString(),
      },
    });
  }
}
