export class InvalidMoneyError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "InvalidMoneyError";
    this.code = code;
  }
}

export class CurrencyMismatchError extends Error {
  public readonly code = "CURRENCY_MISMATCH";

  constructor(expected: string, actual: string) {
    super(`Currency mismatch: expected ${expected}, got ${actual}`);
    this.name = "CurrencyMismatchError";
  }
}
