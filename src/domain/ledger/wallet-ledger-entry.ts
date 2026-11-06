import { Entity } from "../shared/entity";
import { Money } from "../money/money";
import { LedgerDirection } from "./ledger-direction.enum";
import type {
  CreateLedgerEntryProps,
  LedgerEntryState,
} from "./wallet-ledger-entry.props";

export class LedgerEntryError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "LedgerEntryError";
    this.code = code;
  }
}

export class UnbalancedLedgerEntryError extends LedgerEntryError {
  constructor(
    direction: LedgerDirection,
    money: Money,
    balanceBefore: Money,
    balanceAfter: Money,
  ) {
    const expected =
      direction === LedgerDirection.Debit
        ? balanceBefore.subtract(money)
        : balanceBefore.add(money);
    super(
      `Unbalanced ledger entry: ${balanceBefore.toString()} ${direction} ${money.toString()} = ${balanceAfter.toString()}, expected ${expected.toString()}`,
      "UNBALANCED_LEDGER_ENTRY",
    );
  }
}

export class WalletLedgerEntry extends Entity<LedgerEntryState> {
  private constructor(state: LedgerEntryState) {
    super(state);
    Object.freeze(this._props);
  }

  private validate(): void {
    if (!this.isBalanced()) {
      throw new UnbalancedLedgerEntryError(
        this.direction,
        this.money,
        this.balanceBefore,
        this.balanceAfter,
      );
    }
  }

  public static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
    if (!props.money.isPositive())
      throw new LedgerEntryError(
        "Ledger amount must be positive",
        "INVALID_AMOUNT",
      );
    const id = crypto.randomUUID();
    const now = props.createdAt;

    const state: LedgerEntryState = {
      id,
      walletId: props.walletId,
      transactionId: props.transactionId,
      direction: props.direction,
      moneyAmount: props.money.amount,
      moneyCurrency: props.money.currency,
      balanceBeforeAmount: props.balanceBefore.amount,
      balanceBeforeCurrency: props.balanceBefore.currency,
      balanceAfterAmount: props.balanceAfter.amount,
      balanceAfterCurrency: props.balanceAfter.currency,
      createdAt: now,
    };

    const entry = new WalletLedgerEntry(state);
    entry.validate();
    return entry;
  }

  public static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return new WalletLedgerEntry(state);
  }

  get walletId(): string {
    return this.props.walletId;
  }

  get transactionId(): string {
    return this.props.transactionId;
  }

  get direction(): LedgerDirection {
    return this.props.direction;
  }

  get money(): Money {
    return Money.from({
      amount: this.props.moneyAmount,
      currency: this.props.moneyCurrency,
    });
  }

  get balanceBefore(): Money {
    return Money.from({
      amount: this.props.balanceBeforeAmount,
      currency: this.props.balanceBeforeCurrency,
    });
  }

  get balanceAfter(): Money {
    return Money.from({
      amount: this.props.balanceAfterAmount,
      currency: this.props.balanceAfterCurrency,
    });
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  public isBalanced(): boolean {
    const expected =
      this.direction === LedgerDirection.Debit
        ? this.balanceBefore.subtract(this.money)
        : this.balanceBefore.add(this.money);
    return expected.equals(this.balanceAfter);
  }

  public toJSON() {
    return {
      id: this.id,
      walletId: this.walletId,
      transactionId: this.transactionId,
      direction: this.direction,
      money: this.money.toJSON(),
      balanceBefore: this.balanceBefore.toJSON(),
      balanceAfter: this.balanceAfter.toJSON(),
      createdAt: this.createdAt,
    };
  }
}

export { LedgerDirection } from "./ledger-direction.enum";
