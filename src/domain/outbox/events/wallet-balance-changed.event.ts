import { IntegrationEvent } from "../integration-event";
import type { MoneyProps } from "../../money/money.props";
import { LedgerDirection } from "../../ledger/ledger-direction.enum";

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  public readonly eventType = "WalletBalanceChanged";
  public readonly version = 1;

  public static from(
    walletId: string,
    transactionId: string,
    direction: LedgerDirection,
    money: MoneyProps,
    balanceBefore: MoneyProps,
    balanceAfter: MoneyProps,
    walletVersion: number,
    occurredAt: Date,
  ): WalletBalanceChanged {
    return new WalletBalanceChanged({
      eventId: crypto.randomUUID(),
      aggregateId: walletId,
      correlationId: transactionId,
      occurredAt,
      data: {
        walletId,
        transactionId,
        direction,
        money,
        balanceBefore,
        balanceAfter,
        walletVersion,
      },
    });
  }
}
