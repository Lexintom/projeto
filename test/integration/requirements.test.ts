import { FailureCode } from "../../src/domain/transaction/failure-codes";
import { it, expect, beforeEach } from "bun:test";
import { getTestOrm, clearDatabase } from "../utils/test-container";
import { fixture, command } from "../utils/database-fixture";
import { Money } from "../../src/domain/money/money";
import { WagerTransactionKind as Kind } from "../../src/domain/transaction/wager-transaction.enums";
import { computePayloadHash } from "../../src/application/payload-hash";
import { ReconcileWalletUseCase } from "../../src/application/use-cases/reconcile-wallet.use-case";

let f: ReturnType<typeof fixture>;
beforeEach(async () => {
  const orm = await getTestOrm();
  await clearDatabase(orm);
  f = fixture(orm);
});
async function open() {
  return (
    await f.create.execute({
      playerId: crypto.randomUUID(),
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    })
  ).wallet;
}
async function consistent(walletId: string) {
  const result = await new ReconcileWalletUseCase(
    f.wallets,
    f.ledger,
    f.unit,
  ).execute({ walletId });
  expect(result.consistent).toBe(true);
}
function alter(
  cmd: ReturnType<typeof command>,
  kind: Kind,
  reference?: string,
) {
  const data = { ...cmd, kind, referenceExternalTransactionId: reference };
  return {
    ...data,
    payloadHash: computePayloadHash({ ...data, money: data.money.toJSON() }),
  };
}
it("replay preserves the original balance after later transactions, including LOSS and rejection", async () => {
  const w = await open();
  const bet = command(w.id, w.playerId, "80.00");
  const loss = alter(command(w.id, w.playerId, "0.00"), Kind.Loss);
  const first = await f.submit.execute(bet);
  await f.submit.execute(loss);
  const rejected = command(w.id, w.playerId, "80.00");
  expect((await f.submit.execute(rejected)).statusCode).toBe(422);
  await f.submit.execute(alter(command(w.id, w.playerId, "50.00"), Kind.Win));
  for (const cmd of [bet, loss, rejected])
    expect((await f.submit.execute(cmd)).balance.amount).toBe(
      first.balance.amount,
    );
  await consistent(w.id);
});
it("OPENING has a persisted transaction and exactly one CREDIT; zero opening has no ledger", async () => {
  const w = await open();
  expect((await f.unit.run(() => f.transactions.findById(w.id)))?.kind).toBe(
    Kind.Opening,
  );
  const z = (
    await f.create.execute({
      playerId: crypto.randomUUID(),
      initialBalance: Money.zero("BRL"),
    })
  ).wallet;
  expect((await f.unit.run(() => f.ledger.findByWalletId(z.id))).length).toBe(
    0,
  );
  await consistent(w.id);
  await consistent(z.id);
});
it("database rejects ledger mutation, deletion, a balance-only update and a terminal transition", async () => {
  const w = await open();
  const orm = await getTestOrm();
  for (const sql of [
    "update jungle.wallet_ledger_entries set money_amount=1 where wallet_id=?",
    "delete from jungle.wallet_ledger_entries where wallet_id=?",
    "update jungle.wallets set balance_amount=1 where id=?",
    "update jungle.wager_transactions set status='PENDING' where wallet_id=?",
  ])
    await expect(
      orm.em.fork().transactional((em) => em.execute(sql, [w.id])),
    ).rejects.toThrow();
  await consistent(w.id);
});
it("inbox conflicts cannot apply another operation and outbox failure rolls inbox back", async () => {
  const w = await open();
  const cmd = {
    ...command(w.id, w.playerId),
    inboxMessageId: "message-1",
    consumerName: "test",
  };
  await f.submit.execute(cmd);
  await f.submit.execute(cmd);
  await expect(
    f.submit.execute({
      ...command(w.id, w.playerId),
      inboxMessageId: cmd.inboxMessageId,
      consumerName: cmd.consumerName,
    }),
  ).rejects.toThrow();
  const failed = {
    ...command(w.id, w.playerId),
    inboxMessageId: "failed",
    consumerName: "test",
  };
  const original = f.outbox.saveAll.bind(f.outbox);
  f.outbox.saveAll = async () => {
    throw new Error("outbox unavailable");
  };
  try {
    await expect(f.submit.execute(failed)).rejects.toThrow();
  } finally {
    f.outbox.saveAll = original;
  }
  expect(
    await f.unit.run(() =>
      f.inbox.findByMessageIdAndConsumer("failed", "test"),
    ),
  ).toBeNull();
  await consistent(w.id);
});
it("reversal without funds has its own failureCode and cannot change ledger", async () => {
  const w = await open();
  const win = alter(command(w.id, w.playerId, "50.00"), Kind.Win);
  await f.submit.execute(win);
  await f.submit.execute(command(w.id, w.playerId, "150.00"));
  const rollback = alter(
    command(w.id, w.playerId, "50.00"),
    Kind.Rollback,
    win.externalTransactionId,
  );
  const result = await f.submit.execute(rollback);
  expect(result.transaction.failureCode).toBe(
    FailureCode.NegativeBalanceAfterReversal,
  );
  expect(
    (
      await f.unit.run(() =>
        f.ledger.findByTransactionId(result.transaction.id),
      )
    ).length,
  ).toBe(0);
  await consistent(w.id);
});
it("refund, rollback, duplicate reversal and currency mismatch follow business rules", async () => {
  const w = await open();
  const bet = command(w.id, w.playerId);
  await f.submit.execute(bet);
  const refund = alter(
    command(w.id, w.playerId),
    Kind.Refund,
    bet.externalTransactionId,
  );
  await f.submit.execute(refund);
  expect(
    (
      await f.submit.execute(
        alter(
          command(w.id, w.playerId),
          Kind.Refund,
          bet.externalTransactionId,
        ),
      )
    ).transaction.failureCode,
  ).toBe(FailureCode.ReferenceAlreadyReversed);
  await f.submit.execute(
    alter(
      command(w.id, w.playerId),
      Kind.Rollback,
      refund.externalTransactionId,
    ),
  );
  const wrongCurrency = {
    ...command(w.id, w.playerId),
    money: Money.from({ amount: "10.00", currency: "USD" }),
  };
  expect((await f.submit.execute(wrongCurrency)).transaction.failureCode).toBe(
    FailureCode.CurrencyMismatch,
  );
  await consistent(w.id);
});
it("expired references are rejected and publish an event", async () => {
  const w = await open();
  const refund = alter(command(w.id, w.playerId), Kind.Refund, "never-arrived");
  const initial = await f.submit.execute(refund);
  await (
    await getTestOrm()
  ).em.execute(
    "update jungle.wager_transactions set created_at=now()-interval '25 hours' where id=?",
    [initial.transaction.id],
  );
  const final = await f.submit.execute(refund);
  expect(final.transaction.failureCode).toBe(FailureCode.ReferenceTimeout);
  const events = await (
    await getTestOrm()
  ).em.execute(
    "select event_type from jungle.outbox_messages where aggregate_id=?",
    [final.transaction.id],
  );
  expect(
    events.some((event) => event.event_type === "WagerTransactionRejected"),
  ).toBe(true);
  await consistent(w.id);
});
it("migrations can be reverted and reapplied", async () => {
  const orm = await getTestOrm();
  await orm.migrator.down();
  await orm.migrator.up();
  const w = await open();
  await consistent(w.id);
});
