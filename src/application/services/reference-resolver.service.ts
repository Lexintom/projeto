import { WagerTransaction } from "../../domain/transaction/wager-transaction";
import type { WagerTransactionRepository } from "../../domain/transaction/wager-transaction.repository.interface";

export interface ReferenceResolver {
  resolveReference(
    providerId: string,
    referenceExternalTransactionId: string,
    walletId: string,
  ): Promise<WagerTransaction | null>;
  scheduleRetry(transaction: WagerTransaction): void;
  processPendingReferences(): Promise<void>;
}
