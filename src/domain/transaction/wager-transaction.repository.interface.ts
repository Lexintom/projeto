import { WagerTransaction } from "./wager-transaction";
import type { WagerTransactionState } from "./wager-transaction.props";

export interface WagerTransactionRepository {
  hasReversal(
    referenceId: string,
    kind: import("./wager-transaction.enums").WagerTransactionKind,
  ): Promise<boolean>;
  findById(id: string): Promise<WagerTransaction | null>;
  findByIdempotencyKey(key: string): Promise<WagerTransaction | null>;
  findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;
  findByReference(
    providerId: string,
    referenceExternalTransactionId: string,
  ): Promise<WagerTransaction | null>;
  findPendingReferences(
    walletId: string,
    limit: number,
  ): Promise<WagerTransaction[]>;
  findPendingReferencesGlobal(limit: number): Promise<WagerTransaction[]>;
  save(transaction: WagerTransaction): Promise<void>;
  updateStatus(
    id: string,
    status: WagerTransactionState["status"],
    failureCode?: WagerTransactionState["failureCode"],
  ): Promise<void>;
}
