import { AggregateRoot } from "../shared/aggregate-root";
import type { EntityProps } from "../shared/entity";
import { Money } from "../money/money";
import type {
  WalletProps,
  CreateWalletProps,
  WalletState,
} from "./wallet.props";
import {
  WalletError,
  InsufficientBalanceError,
  WalletCurrencyMismatchError,
} from "./wallet.errors";
import { LedgerDirection } from "../ledger/ledger-direction.enum";
import { WalletLedgerEntry } from "../ledger/wallet-ledger-entry";

export interface DebitResult {
  entry: WalletLedgerEntry;
  newBalance: Money;
}

export interface CreditResult {
  entry: WalletLedgerEntry;
  newBalance: Money;
}

export class Wallet extends AggregateRoot<WalletProps> {
  private constructor(props: WalletProps) {
    super(props);
  }

  public static open(props: CreateWalletProps): Wallet {
    if (props.initialBalance.isNegative())
      throw new Error("Initial balance cannot be negative");
    const now = new Date();
    const walletProps: WalletProps = {
      id: props.id,
      playerId: props.playerId,
      currency: props.initialBalance.currency,
      balance: props.initialBalance,
      version: 1, // version 1 = wallet created
      createdAt: now,
      updatedAt: now,
    };

    const wallet = new Wallet(walletProps);

    if (!props.initialBalance.isZero()) {
      const entry = WalletLedgerEntry.create({
        walletId: wallet.id,
        transactionId: wallet.id, // OPENING uses the walletId itself as transactionId
        direction: LedgerDirection.Credit,
        money: props.initialBalance,
        balanceBefore: Money.zero(props.initialBalance.currency),
        balanceAfter: props.initialBalance,
        createdAt: now,
      });
      wallet.addDomainEvent(entry);
    }

    return wallet;
  }

  public static rehydrate(state: WalletState): Wallet {
    const props: WalletProps = {
      id: state.id,
      playerId: state.playerId,
      currency: state.currency,
      balance: Money.from({ amount: state.balance, currency: state.currency }),
      version: state.version,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
    return new Wallet(props);
  }

  get id(): string {
    return this.props.id;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get playerId(): string {
    return this.props.playerId;
  }

  get currency(): string {
    return this.props.currency;
  }

  get balance(): Money {
    return this.props.balance;
  }

  get version(): number {
    return this.props.version;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public debit(
    money: Money,
    transactionId: string,
    createdAt: Date,
  ): DebitResult {
    this.assertSameCurrency(money);
    if (!money.isPositive())
      throw new Error("Movement amount must be positive");

    const newBalance = this.props.balance.subtract(money);
    if (newBalance.isNegative()) {
      throw new InsufficientBalanceError(this.props.balance, money);
    }

    const entry = WalletLedgerEntry.create({
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Debit,
      money,
      balanceBefore: this.props.balance,
      balanceAfter: newBalance,
      createdAt,
    });

    this.props.balance = newBalance;
    this.props.version += 1;
    this.props.updatedAt = createdAt;

    return { entry, newBalance };
  }

  public credit(
    money: Money,
    transactionId: string,
    createdAt: Date,
  ): CreditResult {
    this.assertSameCurrency(money);
    if (!money.isPositive())
      throw new Error("Movement amount must be positive");

    const newBalance = this.props.balance.add(money);

    const entry = WalletLedgerEntry.create({
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Credit,
      money,
      balanceBefore: this.props.balance,
      balanceAfter: newBalance,
      createdAt,
    });

    this.props.balance = newBalance;
    this.props.version += 1;
    this.props.updatedAt = createdAt;

    return { entry, newBalance };
  }

  private assertSameCurrency(money: Money): void {
    if (this.props.currency !== money.currency) {
      throw new WalletCurrencyMismatchError(
        this.props.currency,
        money.currency,
      );
    }
  }

  public toJSON(): WalletProps {
    return {
      id: this.id,
      playerId: this.playerId,
      currency: this.currency,
      balance: this.balance,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
