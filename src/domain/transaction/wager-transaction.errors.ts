import { FailureCode } from "./failure-codes";
export class TransactionError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TransactionError";
    this.code = code;
  }
}

export class InvalidTransactionStateError extends TransactionError {
  constructor(currentState: string, attemptedAction: string) {
    super(
      `Cannot ${attemptedAction} in state ${currentState}`,
      "INVALID_TRANSACTION_STATE",
    );
  }
}

export class ReferenceNotFoundError extends TransactionError {
  constructor(referenceExternalId: string, providerId: string) {
    super(
      `Reference transaction not found: ${referenceExternalId} for provider ${providerId}`,
      "REFERENCE_NOT_FOUND",
    );
  }
}

export class ReferenceAlreadyReversedError extends TransactionError {
  constructor(referenceId: string, reversalKind: string) {
    super(
      `Reference ${referenceId} already reversed by ${reversalKind}`,
      "REFERENCE_ALREADY_REVERSED",
    );
  }
}

export class ReferenceMismatchError extends TransactionError {
  constructor(field: string) {
    super(`Reference mismatch on ${field}`, "REFERENCE_MISMATCH");
  }
}

export class IdempotencyConflictError extends TransactionError {
  constructor(key: string) {
    super(
      `Idempotency key ${key} already used with different payload`,
      "IDEMPOTENCY_CONFLICT",
    );
  }
}

export class TransactionRejectedError extends TransactionError {
  public readonly failureCode: FailureCode;

  constructor(failureCode: FailureCode, message: string) {
    super(message, "TRANSACTION_REJECTED");
    this.failureCode = failureCode;
  }
}
