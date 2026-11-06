import { describe, it, expect, beforeEach } from "bun:test";
import { Money } from "../../../src/domain/money/money";
import { Wallet } from "../../../src/domain/wallet/wallet";
import { LedgerDirection } from "../../../src/domain/ledger/ledger-direction.enum";
import {
  InsufficientBalanceError,
  WalletCurrencyMismatchError,
} from "../../../src/domain/wallet/wallet.errors";
import { createMoney, createWallet } from "../../utils/test-helpers";

describe("Wallet", () => {
  describe("open", () => {
    it("should create wallet with initial balance", () => {
      const wallet = createWallet({ initialBalance: createMoney("100.00") });
      expect(wallet.balance.amount).toBe("100.00");
      expect(wallet.version).toBe(1);
      expect(wallet.domainEvents.length).toBe(1);
    });

    it("should create wallet with zero balance", () => {
      const wallet = createWallet({ initialBalance: createMoney("0.00") });
      expect(wallet.balance.amount).toBe("0.00");
      expect(wallet.version).toBe(1);
      expect(wallet.domainEvents.length).toBe(0);
    });

    it("should generate unique IDs", () => {
      const wallet1 = createWallet();
      const wallet2 = createWallet();
      expect(wallet1.id).not.toBe(wallet2.id);
    });
  });

  describe("rehydrate", () => {
    it("should reconstruct wallet from state", () => {
      const wallet = createWallet({ initialBalance: createMoney("250.00") });
      const state = wallet.toJSON();

      const rehydrated = Wallet.rehydrate({
        id: state.id,
        playerId: state.playerId,
        currency: state.currency,
        balance: state.balance.amount,
        version: state.version,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      });

      expect(rehydrated.id).toBe(wallet.id);
      expect(rehydrated.balance.amount).toBe("250.00");
      expect(rehydrated.version).toBe(1);
    });
  });

  describe("debit", () => {
    it("should debit and create ledger entry", () => {
      const wallet = createWallet({ initialBalance: createMoney("100.00") });
      const money = createMoney("30.00");
      const result = wallet.debit(money, "txn-123", new Date());

      expect(wallet.balance.amount).toBe("70.00");
      expect(wallet.version).toBe(2);
      expect(result.entry.direction).toBe(LedgerDirection.Debit);
      expect(result.entry.money.amount).toBe("30.00");
      expect(result.entry.balanceBefore.amount).toBe("100.00");
      expect(result.entry.balanceAfter.amount).toBe("70.00");
    });

    it("should throw InsufficientBalanceError when balance insufficient", () => {
      const wallet = createWallet({ initialBalance: createMoney("50.00") });
      const money = createMoney("100.00");

      expect(() => wallet.debit(money, "txn-123", new Date())).toThrow(
        InsufficientBalanceError,
      );
      expect(wallet.balance.amount).toBe("50.00"); // Balance unchanged
      expect(wallet.version).toBe(1); // Version unchanged
    });

    it("should throw WalletCurrencyMismatchError for different currency", () => {
      const wallet = createWallet({
        initialBalance: createMoney("100.00", "BRL"),
      });
      const money = createMoney("10.00", "USD");

      expect(() => wallet.debit(money, "txn-123", new Date())).toThrow(
        WalletCurrencyMismatchError,
      );
    });

    it("should allow exact balance debit", () => {
      const wallet = createWallet({ initialBalance: createMoney("100.00") });
      const money = createMoney("100.00");
      wallet.debit(money, "txn-123", new Date());

      expect(wallet.balance.amount).toBe("0.00");
    });
  });

  describe("credit", () => {
    it("should credit and create ledger entry", () => {
      const wallet = createWallet({ initialBalance: createMoney("100.00") });
      const money = createMoney("30.00");
      const result = wallet.credit(money, "txn-123", new Date());

      expect(wallet.balance.amount).toBe("130.00");
      expect(wallet.version).toBe(2);
      expect(result.entry.direction).toBe(LedgerDirection.Credit);
      expect(result.entry.money.amount).toBe("30.00");
      expect(result.entry.balanceBefore.amount).toBe("100.00");
      expect(result.entry.balanceAfter.amount).toBe("130.00");
    });

    it("should throw WalletCurrencyMismatchError for different currency", () => {
      const wallet = createWallet({
        initialBalance: createMoney("100.00", "BRL"),
      });
      const money = createMoney("10.00", "USD");

      expect(() => wallet.credit(money, "txn-123", new Date())).toThrow(
        WalletCurrencyMismatchError,
      );
    });
  });

  describe("version increment", () => {
    it("should increment version on each balance change", () => {
      const wallet = createWallet({ initialBalance: createMoney("100.00") });
      expect(wallet.version).toBe(1);

      wallet.debit(createMoney("10.00"), "txn-1", new Date());
      expect(wallet.version).toBe(2);

      wallet.credit(createMoney("5.00"), "txn-2", new Date());
      expect(wallet.version).toBe(3);

      wallet.debit(createMoney("20.00"), "txn-3", new Date());
      expect(wallet.version).toBe(4);
    });

    it("should not increment version on failed debit", () => {
      const wallet = createWallet({ initialBalance: createMoney("50.00") });

      try {
        wallet.debit(createMoney("100.00"), "txn-1", new Date());
      } catch {}

      expect(wallet.version).toBe(1);
    });
  });
});
