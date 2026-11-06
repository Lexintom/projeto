import { describe, it, expect, beforeEach } from "bun:test";
import { Money } from "../../../src/domain/money/money";
import {
  InvalidMoneyError,
  CurrencyMismatchError,
} from "../../../src/domain/money/money.errors";

describe("Money", () => {
  describe("from", () => {
    it("should create Money from valid props", () => {
      const money = Money.from({ amount: "25.00", currency: "BRL" });
      expect(money.amount).toBe("25.00");
      expect(money.currency).toBe("BRL");
    });

    it("should normalize currency to uppercase", () => {
      const money = Money.from({ amount: "10.00", currency: "brl" });
      expect(money.currency).toBe("BRL");
    });

    it("should throw for empty amount", () => {
      expect(() => Money.from({ amount: "", currency: "BRL" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should throw for empty currency", () => {
      expect(() => Money.from({ amount: "10.00", currency: "" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should throw for NaN", () => {
      expect(() => Money.from({ amount: "NaN", currency: "BRL" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should throw for Infinity", () => {
      expect(() => Money.from({ amount: "Infinity", currency: "BRL" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should throw for scientific notation", () => {
      expect(() => Money.from({ amount: "1e10", currency: "BRL" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should throw for negative amount", () => {
      expect(() => Money.from({ amount: "-10.00", currency: "BRL" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should throw for more than 2 decimal places", () => {
      expect(() => Money.from({ amount: "10.123", currency: "BRL" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should throw for invalid currency length", () => {
      expect(() => Money.from({ amount: "10.00", currency: "BR" })).toThrow(
        InvalidMoneyError,
      );
      expect(() => Money.from({ amount: "10.00", currency: "BRAZ" })).toThrow(
        InvalidMoneyError,
      );
    });

    it("should accept 1 decimal place", () => {
      const money = Money.from({ amount: "10.5", currency: "BRL" });
      expect(money.amount).toBe("10.50");
    });

    it("should accept integer amount", () => {
      const money = Money.from({ amount: "10", currency: "BRL" });
      expect(money.amount).toBe("10.00");
    });

    it("should accept zero", () => {
      const money = Money.from({ amount: "0.00", currency: "BRL" });
      expect(money.isZero()).toBe(true);
    });
  });

  describe("zero", () => {
    it("should create zero money", () => {
      const money = Money.zero("BRL");
      expect(money.amount).toBe("0.00");
      expect(money.currency).toBe("BRL");
      expect(money.isZero()).toBe(true);
    });
  });

  describe("add", () => {
    it("should add two moneys of same currency", () => {
      const a = Money.from({ amount: "10.00", currency: "BRL" });
      const b = Money.from({ amount: "5.50", currency: "BRL" });
      const result = a.add(b);
      expect(result.amount).toBe("15.50");
      expect(result.currency).toBe("BRL");
    });

    it("should throw for different currencies", () => {
      const a = Money.from({ amount: "10.00", currency: "BRL" });
      const b = Money.from({ amount: "5.50", currency: "USD" });
      expect(() => a.add(b)).toThrow(CurrencyMismatchError);
    });
  });

  describe("subtract", () => {
    it("should subtract two moneys of same currency", () => {
      const a = Money.from({ amount: "10.00", currency: "BRL" });
      const b = Money.from({ amount: "3.50", currency: "BRL" });
      const result = a.subtract(b);
      expect(result.amount).toBe("6.50");
    });

    it("should allow negative result", () => {
      const a = Money.from({ amount: "5.00", currency: "BRL" });
      const b = Money.from({ amount: "10.00", currency: "BRL" });
      const result = a.subtract(b);
      expect(result.amount).toBe("-5.00");
      expect(result.isNegative()).toBe(true);
    });
  });

  describe("negate", () => {
    it("should negate money", () => {
      const money = Money.from({ amount: "10.00", currency: "BRL" });
      const negated = money.negate();
      expect(negated.amount).toBe("-10.00");
    });
  });

  describe("comparisons", () => {
    const a = Money.from({ amount: "10.00", currency: "BRL" });
    const b = Money.from({ amount: "5.00", currency: "BRL" });
    const c = Money.from({ amount: "10.00", currency: "BRL" });

    it("isLessThan", () => {
      expect(b.isLessThan(a)).toBe(true);
      expect(a.isLessThan(b)).toBe(false);
    });

    it("isGreaterThan", () => {
      expect(a.isGreaterThan(b)).toBe(true);
      expect(b.isGreaterThan(a)).toBe(false);
    });

    it("equals", () => {
      expect(a.equals(c)).toBe(true);
      expect(a.equals(b)).toBe(false);
    });

    it("isZero", () => {
      expect(Money.zero("BRL").isZero()).toBe(true);
      expect(a.isZero()).toBe(false);
    });

    it("isPositive", () => {
      expect(a.isPositive()).toBe(true);
      expect(Money.zero("BRL").isPositive()).toBe(false);
    });

    it("isNegative", () => {
      const neg = Money.from({ amount: "10.00", currency: "BRL" }).negate();
      expect(neg.isNegative()).toBe(true);
      expect(a.isNegative()).toBe(false);
    });
  });

  describe("toJSON", () => {
    it("should serialize to MoneyProps", () => {
      const money = Money.from({ amount: "25.00", currency: "BRL" });
      expect(money.toJSON()).toEqual({ amount: "25.00", currency: "BRL" });
    });
  });

  describe("toString", () => {
    it("should format as string", () => {
      const money = Money.from({ amount: "25.00", currency: "BRL" });
      expect(money.toString()).toBe("25.00 BRL");
    });
  });
});
