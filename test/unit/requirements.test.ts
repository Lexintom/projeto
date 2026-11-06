import { it, expect } from "bun:test";
import { Decimal } from "decimal.js";
import { Money } from "../../src/domain/money/money";
import {
  createWallet,
  createWagerTransaction,
  createMoney,
} from "../utils/test-helpers";
import { WagerTransactionKind as Kind } from "../../src/domain/transaction/wager-transaction.enums";
import { OutboxMessage } from "../../src/domain/outbox/outbox-message";
import { WalletBalanceChanged } from "../../src/domain/outbox/events/wallet-balance-changed.event";
import { LedgerDirection } from "../../src/domain/ledger/ledger-direction.enum";

it("serializes all accepted scales to exactly two decimals", () => {
  for (const [amount, expected] of [
    ["1", "1.00"],
    ["1.2", "1.20"],
    ["1.23", "1.23"],
  ])
    expect(
      Money.from({ amount: amount!, currency: "BRL" }).toJSON().amount,
    ).toBe(expected!);
});
it("rounds internal decimal operations and refuses non-finite or overflowing results", () => {
  expect(Money.fromDecimal(new Decimal("1.235"), "BRL").amount).toBe("1.24");
  for (const amount of ["Infinity", "NaN", "100000000000000000"])
    expect(() => Money.fromDecimal(new Decimal(amount), "BRL")).toThrow();
});
it("does not accept unknown currency codes or negative aggregate movements", () => {
  expect(() => createMoney("1.00", "XYZ")).toThrow();
  const w = createWallet(),
    version = w.version;
  expect(() =>
    w.credit(createMoney("1.00").negate(), crypto.randomUUID(), new Date()),
  ).toThrow();
  expect(() =>
    w.debit(Money.zero("BRL"), crypto.randomUUID(), new Date()),
  ).toThrow();
  expect(w.version).toBe(version);
});
it("reference factories reject a missing external reference", () => {
  for (const kind of [Kind.Refund, Kind.Rollback]) {
    const valid = createWagerTransaction({ kind });
    const props = {
      ...valid.toJSON(),
      referenceExternalTransactionId: undefined,
    };
    expect(() => createFrom(props)).toThrow();
  }
});
import { WagerTransaction } from "../../src/domain/transaction/wager-transaction";
const createFrom = WagerTransaction.create;
it("WIN can refer to a BET with a different winning amount", () => {
  const bet = createWagerTransaction({
    kind: Kind.Bet,
    money: createMoney("10.00"),
  });
  const win = createWagerTransaction({
    kind: Kind.Win,
    money: createMoney("100.00"),
    walletId: bet.walletId,
    playerId: bet.playerId,
    roundId: bet.roundId,
    providerId: bet.providerId,
    referenceExternalTransactionId: bet.externalTransactionId,
  });
  expect(() => win.validateReference(bet)).not.toThrow();
});
it("outbox retries remain scheduled after repeated outages", () => {
  const w = createWallet();
  const event = WalletBalanceChanged.from(
    w.id,
    crypto.randomUUID(),
    LedgerDirection.Credit,
    createMoney("1.00").toJSON(),
    w.balance.toJSON(),
    w.balance.add(createMoney("1.00")).toJSON(),
    2,
    new Date(),
  );
  const message = OutboxMessage.enqueue({ event });
  for (let i = 0; i < 20; i++) message.scheduleRetry(new Date(), 1, 100, 3);
  expect(message.attempts).toBe(20);
  expect(message.nextAttemptAt).toBeDefined();
});
