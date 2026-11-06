import { Decimal } from "decimal.js";
import { ValueObject } from "../shared/value-objects/value-object";
import type { MoneyProps } from "./money.props";
import { InvalidMoneyError, CurrencyMismatchError } from "./money.errors";

// 2 decimal places = standard for fiat currencies (cents)
// Using string storage avoids floating-point precision bugs entirely
const MONEY_SCALE = 2;
const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

// High precision for intermediate calculations, round half-up for financial correctness
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export class Money extends ValueObject<MoneyProps> {
  private readonly _value: Decimal;

  private constructor(props: MoneyProps) {
    super(props);
    this._value = new Decimal(props.amount);
  }

  public static from(props: MoneyProps): Money {
    Money.validateProps(props);
    return new Money({
      amount: props.amount,
      currency: props.currency.toUpperCase(),
    });
  }

  public static zero(currency: string): Money {
    return new Money({ amount: "0.00", currency: currency.toUpperCase() });
  }

  public static fromDecimal(value: Decimal, currency: string): Money {
    if (!value.isFinite() || value.abs().greaterThan("99999999999999999.99"))
      throw new InvalidMoneyError(
        "Money result is outside supported range",
        "INVALID_AMOUNT",
      );
    const amount = value.toFixed(MONEY_SCALE);
    return new Money({ amount, currency: currency.toUpperCase() });
  }

  private static validateProps(props: MoneyProps): void {
    if (!props.amount || typeof props.amount !== "string") {
      throw new InvalidMoneyError(
        "Amount is required and must be a string",
        "AMOUNT_REQUIRED",
      );
    }
    if (!props.currency || typeof props.currency !== "string") {
      throw new InvalidMoneyError(
        "Currency is required and must be a string",
        "CURRENCY_REQUIRED",
      );
    }
    if (!MONEY_REGEX.test(props.amount)) {
      throw new InvalidMoneyError(
        "Amount must be a valid decimal string with up to 2 decimal places, no scientific notation",
        "INVALID_AMOUNT_FORMAT",
      );
    }
    const decimal = new Decimal(props.amount);
    if (!decimal.isFinite()) {
      throw new InvalidMoneyError(
        "Amount must be a finite number",
        "INVALID_AMOUNT",
      );
    }
    if (decimal.isNegative()) {
      throw new InvalidMoneyError(
        "Amount cannot be negative in input contracts",
        "NEGATIVE_AMOUNT_NOT_ALLOWED",
      );
    }
    if (decimal.decimalPlaces() > MONEY_SCALE) {
      throw new InvalidMoneyError(
        `Amount cannot have more than ${MONEY_SCALE} decimal places`,
        "TOO_MANY_DECIMALS",
      );
    }
    if (decimal.greaterThan("99999999999999999.99"))
      throw new InvalidMoneyError(
        "Amount exceeds numeric(19,2)",
        "INVALID_AMOUNT",
      );
    if (
      !/^[A-Za-z]{3}$/.test(props.currency) ||
      !Intl.supportedValuesOf("currency").includes(props.currency.toUpperCase())
    ) {
      throw new InvalidMoneyError(
        "Currency must be a 3-letter ISO-4217 code",
        "INVALID_CURRENCY",
      );
    }
  }

  public get amount(): string {
    return this._value.toFixed(MONEY_SCALE);
  }

  public get currency(): string {
    return this.props.currency;
  }

  // Internal decimal for calculations - not exposed in JSON/serialization
  public get value(): Decimal {
    return this._value;
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromDecimal(this._value.plus(other._value), this.currency);
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromDecimal(this._value.minus(other._value), this.currency);
  }

  public negate(): Money {
    return Money.fromDecimal(this._value.negated(), this.currency);
  }

  public multiply(factor: number | Decimal): Money {
    const factorDecimal =
      factor instanceof Decimal ? factor : new Decimal(factor);
    return Money.fromDecimal(this._value.times(factorDecimal), this.currency);
  }

  public divide(divisor: number | Decimal): Money {
    const divisorDecimal =
      divisor instanceof Decimal ? divisor : new Decimal(divisor);
    return Money.fromDecimal(this._value.div(divisorDecimal), this.currency);
  }

  public isZero(): boolean {
    return this._value.isZero();
  }

  public isPositive(): boolean {
    return this._value.greaterThan(0);
  }

  public isNegative(): boolean {
    return this._value.isNegative();
  }

  public isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._value.lessThan(other._value);
  }

  public isLessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._value.lessThanOrEqualTo(other._value);
  }

  public isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._value.greaterThan(other._value);
  }

  public isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._value.greaterThanOrEqualTo(other._value);
  }

  public equals(other: Money): boolean {
    if (!other || this.currency !== other.currency) return false;
    return this._value.equals(other._value);
  }

  public toJSON(): MoneyProps {
    return { amount: this.amount, currency: this.currency };
  }

  public toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  public assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  public static getScale(): number {
    return MONEY_SCALE;
  }
}
