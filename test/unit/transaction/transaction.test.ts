import { describe, it, expect, beforeEach } from "bun:test";
import { Money } from "../../../src/domain/money/money";
import { Wallet } from "../../../src/domain/wallet/wallet";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../src/domain/transaction/wager-transaction";
import {
  WalletLedgerEntry,
  LedgerDirection,
} from "../../../src/domain/ledger/wallet-ledger-entry";
import { FailureCode } from "../../../src/domain/transaction/failure-codes";
import {
  InvalidTransactionStateError,
  ReferenceNotFoundError,
  ReferenceAlreadyReversedError,
  ReferenceMismatchError,
  TransactionRejectedError,
} from "../../../src/domain/transaction/wager-transaction.errors";
import { InsufficientBalanceError } from "../../../src/domain/wallet/wallet.errors";
import {
  createMoney,
  createWallet,
  createWagerTransaction,
  createLedgerEntry,
} from "../../utils/test-helpers";

describe("WagerTransaction", () => {
  let wallet: Wallet;
  const baseTime = new Date("2024-01-01T00:00:00.000Z");

  beforeEach(() => {
    wallet = createWallet({ initialBalance: createMoney("1000.00") });
  });

  describe("create", () => {
    it("should create BET transaction in PENDING state", () => {
      const tx = createWagerTransaction({
        kind: WagerTransactionKind.Bet,
        money: createMoney("100.00"),
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.kind).toBe(WagerTransactionKind.Bet);
      expect(tx.requiresReference()).toBe(false);
      expect(tx.affectsBalance()).toBe(true);
    });

    it("should create WIN transaction in PENDING state", () => {
      const tx = createWagerTransaction({
        kind: WagerTransactionKind.Win,
        money: createMoney("200.00"),
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBe(false);
      expect(tx.affectsBalance()).toBe(true);
    });

    it("should create LOSS transaction in PENDING state", () => {
      const tx = createWagerTransaction({
        kind: WagerTransactionKind.Loss,
        money: createMoney("100.00"),
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.affectsBalance()).toBe(false);
    });

    it("should create REFUND transaction in PENDING state", () => {
      const tx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        money: createMoney("100.00"),
        referenceExternalTransactionId: "ref-123",
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBe(true);
    });

    it("should create ROLLBACK transaction in PENDING state", () => {
      const tx = createWagerTransaction({
        kind: WagerTransactionKind.Rollback,
        money: createMoney("200.00"),
        referenceExternalTransactionId: "ref-123",
      });
      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBe(true);
    });

    it("should create OPENING transaction in PROCESSED state", () => {
      const tx = createWagerTransaction({
        kind: WagerTransactionKind.Opening,
        money: createMoney("1000.00"),
      });
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.processedAt).toBeDefined();
    });
  });

  describe("transitions", () => {
    it("should mark as processed", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.markProcessed(undefined, baseTime);

      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.processedAt).toEqual(baseTime);
    });

    it("should mark as pending reference", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.markPendingReference();

      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
    });

    it("should reject with failure code", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.reject(FailureCode.InsufficientFunds);

      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.InsufficientFunds);
      expect(tx.processedAt).toBeDefined();
    });

    it("should fail with failure code", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.fail(FailureCode.InternalError);

      expect(tx.status).toBe(WagerTransactionStatus.Failed);
      expect(tx.failureCode).toBe(FailureCode.InternalError);
    });

    it("should throw InvalidTransactionStateError when transitioning from terminal state", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.markProcessed(undefined, baseTime);

      expect(() => tx.markPendingReference()).toThrow(
        InvalidTransactionStateError,
      );
      expect(() => tx.reject(FailureCode.InsufficientFunds)).toThrow(
        InvalidTransactionStateError,
      );
      expect(() => tx.fail(FailureCode.InternalError)).toThrow(
        InvalidTransactionStateError,
      );
    });
  });

  describe("reference validation", () => {
    it("should validate reference matches provider, player, wallet, currency, round", () => {
      const refTx = createWagerTransaction({
        id: "ref-1",
        kind: WagerTransactionKind.Bet,
        money: createMoney("100.00"),
        providerId: "provider-a",
        playerId: "player-1",
        walletId: wallet.id,
        roundId: "round-1",
        externalTransactionId: "ext-ref-1",
      });

      const refundTx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        money: createMoney("100.00"),
        referenceExternalTransactionId: "ext-ref-1",
        providerId: "provider-a",
        playerId: "player-1",
        walletId: wallet.id,
        roundId: "round-1",
      });

      // Should not throw
      refundTx.validateReference(refTx);
    });

    it("should throw ReferenceMismatchError for different provider", () => {
      const refTx = createWagerTransaction({
        providerId: "provider-a",
        externalTransactionId: "ext-ref-1",
      });

      const refundTx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "ext-ref-1",
        providerId: "provider-b",
      });

      expect(() => refundTx.validateReference(refTx)).toThrow(
        ReferenceMismatchError,
      );
    });

    it("should throw ReferenceMismatchError for different player", () => {
      const refTx = createWagerTransaction({
        playerId: "player-1",
        externalTransactionId: "ext-ref-1",
      });

      const refundTx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "ext-ref-1",
        playerId: "player-2",
      });

      expect(() => refundTx.validateReference(refTx)).toThrow(
        ReferenceMismatchError,
      );
    });

    it("should throw ReferenceMismatchError for different wallet", () => {
      const refTx = createWagerTransaction({
        walletId: wallet.id,
        externalTransactionId: "ext-ref-1",
      });

      const otherWallet = createWallet();
      const refundTx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "ext-ref-1",
        walletId: otherWallet.id,
      });

      expect(() => refundTx.validateReference(refTx)).toThrow(
        ReferenceMismatchError,
      );
    });

    it("should throw ReferenceMismatchError for different currency", () => {
      const refTx = createWagerTransaction({
        money: createMoney("100.00", "BRL"),
        externalTransactionId: "ext-ref-1",
      });

      const refundTx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        money: createMoney("100.00", "USD"),
        referenceExternalTransactionId: "ext-ref-1",
      });

      expect(() => refundTx.validateReference(refTx)).toThrow(
        ReferenceMismatchError,
      );
    });

    it("should throw ReferenceMismatchError for different round", () => {
      const refTx = createWagerTransaction({
        roundId: "round-1",
        externalTransactionId: "ext-ref-1",
      });

      const refundTx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "ext-ref-1",
        roundId: "round-2",
      });

      expect(() => refundTx.validateReference(refTx)).toThrow(
        ReferenceMismatchError,
      );
    });

    it("should throw TransactionRejectedError for invalid REFUND reference kind", () => {
      const refTx = createWagerTransaction({
        kind: WagerTransactionKind.Win,
        externalTransactionId: "ext-ref-1",
      });

      const refundTx = createWagerTransaction({
        playerId: refTx.playerId,
        walletId: refTx.walletId,
        roundId: refTx.roundId,
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "ext-ref-1",
      });

      expect(() => refundTx.validateReference(refTx)).toThrow(
        TransactionRejectedError,
      );
    });

    it("should throw TransactionRejectedError for invalid ROLLBACK reference kind", () => {
      const refTx = createWagerTransaction({
        kind: WagerTransactionKind.Loss,
        externalTransactionId: "ext-ref-1",
      });

      const rollbackTx = createWagerTransaction({
        playerId: refTx.playerId,
        walletId: refTx.walletId,
        roundId: refTx.roundId,
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: "ext-ref-1",
      });

      expect(() => rollbackTx.validateReference(refTx)).toThrow(
        TransactionRejectedError,
      );
    });

    it("should allow ROLLBACK to reference BET, WIN, REFUND", () => {
      for (const kind of [
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
      ]) {
        const refTx = createWagerTransaction({
          kind,
          externalTransactionId: "ext-ref-1",
        });
        const rollbackTx = createWagerTransaction({
          playerId: refTx.playerId,
          walletId: refTx.walletId,
          roundId: refTx.roundId,
          kind: WagerTransactionKind.Rollback,
          referenceExternalTransactionId: "ext-ref-1",
        });
        expect(() => rollbackTx.validateReference(refTx)).not.toThrow();
      }
    });

    it("should throw TransactionRejectedError for amount mismatch", () => {
      const refTx = createWagerTransaction({
        money: createMoney("100.00"),
        externalTransactionId: "ext-ref-1",
      });

      const refundTx = createWagerTransaction({
        playerId: refTx.playerId,
        walletId: refTx.walletId,
        roundId: refTx.roundId,
        kind: WagerTransactionKind.Refund,
        money: createMoney("50.00"),
        referenceExternalTransactionId: "ext-ref-1",
      });

      expect(() => refundTx.validateReference(refTx)).toThrow(
        TransactionRejectedError,
      );
    });
  });

  describe("ledgerDirectionFor", () => {
    it("should return Credit for OPENING", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Opening });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it("should return Credit for WIN", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Win });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it("should return Credit for REFUND", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Refund });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it("should return Debit for BET", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    });

    it("should return inverse for ROLLBACK of BET", () => {
      const refTx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      const rollbackTx = createWagerTransaction({
        kind: WagerTransactionKind.Rollback,
      });
      expect(rollbackTx.ledgerDirectionFor(refTx)).toBe(LedgerDirection.Credit);
    });

    it("should return inverse for ROLLBACK of WIN", () => {
      const refTx = createWagerTransaction({ kind: WagerTransactionKind.Win });
      const rollbackTx = createWagerTransaction({
        kind: WagerTransactionKind.Rollback,
      });
      expect(rollbackTx.ledgerDirectionFor(refTx)).toBe(LedgerDirection.Debit);
    });

    it("should throw for ROLLBACK without reference", () => {
      const rollbackTx = createWagerTransaction({
        kind: WagerTransactionKind.Rollback,
      });
      expect(() => rollbackTx.ledgerDirectionFor()).toThrow(
        ReferenceNotFoundError,
      );
    });
  });

  describe("setReferenceTransactionId", () => {
    it("should set reference transaction ID", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Refund });
      tx.setReferenceTransactionId("ref-txn-id");
      expect(tx.referenceTransactionId).toBe("ref-txn-id");
    });

    it("should throw ReferenceAlreadyReversedError if already set", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Refund });
      tx.setReferenceTransactionId("ref-txn-id");
      expect(() => tx.setReferenceTransactionId("other-id")).toThrow(
        ReferenceAlreadyReversedError,
      );
    });
  });

  describe("isTerminal", () => {
    it("should return false for PENDING", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      expect(tx.isTerminal()).toBe(false);
    });

    it("should return false for PENDING_REFERENCE", () => {
      const tx = createWagerTransaction({
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: "ref",
      });
      expect(tx.isTerminal()).toBe(false);
    });

    it("should return true for PROCESSED", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.markProcessed(undefined, baseTime);
      expect(tx.isTerminal()).toBe(true);
    });

    it("should return true for REJECTED", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.reject(FailureCode.InsufficientFunds);
      expect(tx.isTerminal()).toBe(true);
    });

    it("should return true for FAILED", () => {
      const tx = createWagerTransaction({ kind: WagerTransactionKind.Bet });
      tx.fail(FailureCode.InternalError);
      expect(tx.isTerminal()).toBe(true);
    });
  });
});
