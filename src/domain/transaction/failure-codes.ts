export enum FailureCode {
  InsufficientFunds = "INSUFFICIENT_FUNDS",
  NegativeBalanceAfterReversal = "NEGATIVE_BALANCE_AFTER_REVERSAL",
  ReferenceNotFound = "REFERENCE_NOT_FOUND",
  ReferenceAlreadyReversed = "REFERENCE_ALREADY_REVERSED",
  ReferenceMismatch = "REFERENCE_MISMATCH",
  InvalidKindForReference = "INVALID_KIND_FOR_REFERENCE",
  InvalidAmount = "INVALID_AMOUNT",
  CurrencyMismatch = "CURRENCY_MISMATCH",
  WalletNotFound = "WALLET_NOT_FOUND",
  IdempotencyConflict = "IDEMPOTENCY_CONFLICT",
  ReferenceTimeout = "REFERENCE_TIMEOUT",
  InternalError = "INTERNAL_ERROR",
}

export const FAILURE_CODE_DESCRIPTIONS: Record<FailureCode, string> = {
  [FailureCode.InsufficientFunds]: "Insufficient balance to process the bet",
  [FailureCode.NegativeBalanceAfterReversal]:
    "Reversal would result in negative balance",
  [FailureCode.ReferenceNotFound]: "Referenced transaction not found",
  [FailureCode.ReferenceAlreadyReversed]:
    "Referenced transaction already reversed by same operation type",
  [FailureCode.ReferenceMismatch]:
    "Referenced transaction does not match required criteria",
  [FailureCode.InvalidKindForReference]:
    "Operation kind cannot reference the given transaction kind",
  [FailureCode.InvalidAmount]:
    "Invalid amount, overflow, or amount differs from reference",
  [FailureCode.CurrencyMismatch]:
    "Currency mismatch between transaction and wallet/reference",
  [FailureCode.WalletNotFound]: "Wallet not found",
  [FailureCode.IdempotencyConflict]:
    "Idempotency key conflict with different payload",
  [FailureCode.ReferenceTimeout]: "Reference transaction not found within TTL",
  [FailureCode.InternalError]: "Internal processing error",
};

export function isRetryableFailure(code: FailureCode): boolean {
  return code === FailureCode.ReferenceNotFound;
}

export function isBusinessRejection(code: FailureCode): boolean {
  return [
    FailureCode.InsufficientFunds,
    FailureCode.NegativeBalanceAfterReversal,
    FailureCode.ReferenceAlreadyReversed,
    FailureCode.ReferenceMismatch,
    FailureCode.InvalidKindForReference,
    FailureCode.InvalidAmount,
    FailureCode.CurrencyMismatch,
    FailureCode.WalletNotFound,
    FailureCode.IdempotencyConflict,
  ].includes(code);
}
