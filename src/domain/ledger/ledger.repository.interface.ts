import { WalletLedgerEntry } from "./wallet-ledger-entry";
import type { LedgerEntryState } from "./wallet-ledger-entry.props";

export interface LedgerRepository {
  findByTransactionId(transactionId: string): Promise<WalletLedgerEntry[]>;
  findByWalletId(
    walletId: string,
    cursor?: string,
    limit?: number,
  ): Promise<WalletLedgerEntry[]>;
  save(entry: WalletLedgerEntry): Promise<void>;
  saveAll(entries: WalletLedgerEntry[]): Promise<void>;
  calculateBalance(
    walletId: string,
  ): Promise<{ amount: string; currency: string } | null>;
}
