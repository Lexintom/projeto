import { Money } from "../money/money";
import { LedgerDirection } from "./ledger-direction.enum";

export interface CreateLedgerEntryProps {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export interface LedgerEntryState {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  moneyAmount: string;
  moneyCurrency: string;
  balanceBeforeAmount: string;
  balanceBeforeCurrency: string;
  balanceAfterAmount: string;
  balanceAfterCurrency: string;
  createdAt: Date;
}
