import { Money } from "../money/money";
export interface WalletProps {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class WalletError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

export class InsufficientBalanceError extends WalletError {
  constructor(balance: Money, requested: Money) {
    super(
      `Insufficient balance: ${balance.toString()} < ${requested.toString()}`,
      "INSUFFICIENT_BALANCE",
    );
  }
}

export class WalletCurrencyMismatchError extends WalletError {
  constructor(walletCurrency: string, operationCurrency: string) {
    super(
      `Wallet currency ${walletCurrency} does not match operation currency ${operationCurrency}`,
      "CURRENCY_MISMATCH",
    );
  }
}

export class WalletNotFoundError extends WalletError {
  constructor(id: string) {
    super(`Wallet not found: ${id}`, "WALLET_NOT_FOUND");
  }
}
