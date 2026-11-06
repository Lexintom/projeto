import { Wallet } from "./wallet";
import type { WalletState } from "./wallet.props";

export interface WalletRepository {
  findById(id: string, forUpdate?: boolean): Promise<Wallet | null>;
  findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  saveWithOptimisticLock(
    wallet: Wallet,
    expectedVersion: number,
  ): Promise<boolean>;
}
