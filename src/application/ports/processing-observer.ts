import type {
  SubmitWagerTransactionCommand,
  SubmitWagerTransactionResult,
} from "../use-cases/submit-wager-transaction.use-case";

export interface ProcessingObserver {
  completed(
    command: SubmitWagerTransactionCommand,
    result: SubmitWagerTransactionResult,
    seconds: number,
  ): void;
  retry(): void;
  idempotencyConflict(): void;
}
