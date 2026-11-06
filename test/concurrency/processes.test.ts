import { it, expect, beforeEach } from "bun:test";
import { getTestOrm, clearDatabase } from "../utils/test-container";
import { fixture, command } from "../utils/database-fixture";
import { Money } from "../../src/domain/money/money";
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
async function invariant(id: string) {
  expect(
    (
      await new ReconcileWalletUseCase(f.wallets, f.ledger, f.unit).execute({
        walletId: id,
      })
    ).consistent,
  ).toBe(true);
}
function worker(jobs: ReturnType<typeof command>[]) {
  return Bun.spawn(
    [
      process.execPath,
      "test/support/process-worker.ts",
      "apply",
      JSON.stringify(jobs),
    ],
    {
      env: { ...process.env, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
}
async function success(proc: ReturnType<typeof worker>) {
  const [code, errors] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
    new Response(proc.stdout).text(),
  ]);
  if (code !== 0) throw new Error(errors);
}
it("50 parallel deliveries across three processes debit once, even after a restart", async () => {
  const w = await open();
  const cmd = command(w.id, w.playerId);
  const sizes = [17, 17, 16];
  await Promise.all(
    sizes.map((n) => success(worker(Array.from({ length: n }, () => cmd)))),
  );
  await success(worker([cmd]));
  const balance = await f.unit.run(() => f.wallets.findById(w.id));
  expect(balance?.balance.amount).toBe("90.00");
  expect((await f.unit.run(() => f.ledger.findByWalletId(w.id))).length).toBe(
    2,
  );
  await invariant(w.id);
}, 30000);
it("two simultaneous bets of 80 from 100 produce exactly one debit and one rejection", async () => {
  const w = await open();
  const a = command(w.id, w.playerId, "80.00"),
    b = command(w.id, w.playerId, "80.00");
  await Promise.all([
    success(worker([a])),
    success(worker([b])),
    success(worker([a, b])),
  ]);
  const rows = await (
    await getTestOrm()
  ).em.execute(
    "select status,count(*)::int as count from jungle.wager_transactions where wallet_id=? and kind='BET' group by status",
    [w.id],
  );
  expect(rows.find((row) => row.status === "PROCESSED")?.count).toBe(1);
  expect(rows.find((row) => row.status === "REJECTED")?.count).toBe(1);
  expect(
    (await f.unit.run(() => f.wallets.findById(w.id)))?.balance.amount,
  ).toBe("20.00");
  await invariant(w.id);
}, 30000);
it("distinct wallets run in independent processes", async () => {
  const wallets = await Promise.all([open(), open(), open()]);
  await Promise.all(
    wallets.map((w) => success(worker([command(w.id, w.playerId)]))),
  );
  for (const w of wallets) {
    expect(
      (await f.unit.run(() => f.wallets.findById(w.id)))?.balance.amount,
    ).toBe("90.00");
    await invariant(w.id);
  }
}, 30000);
