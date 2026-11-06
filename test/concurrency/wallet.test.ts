import { it, expect, beforeEach } from "bun:test";
import { getTestOrm, clearDatabase } from "../utils/test-container";
import { fixture, command } from "../utils/database-fixture";
import { Money } from "../../src/domain/money/money";
let f: ReturnType<typeof fixture>;
beforeEach(async () => {
  const orm = await getTestOrm();
  await clearDatabase(orm);
  f = fixture(orm);
});

it("apostas paralelas não perdem atualizações de saldo", async () => {
  const wallet = (
    await f.create.execute({
      playerId: crypto.randomUUID(),
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    })
  ).wallet;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      f.submit.execute(command(wallet.id, wallet.playerId)),
    ),
  );
  await f.unit.run(async () => {
    expect((await f.wallets.findById(wallet.id))?.balance.amount).toBe("20.00");
    expect((await f.ledger.findByWalletId(wallet.id)).length).toBe(9);
  });
});
it("entregas paralelas da mesma operação debitam uma vez", async () => {
  const wallet = (
    await f.create.execute({
      playerId: crypto.randomUUID(),
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    })
  ).wallet;
  const cmd = command(wallet.id, wallet.playerId);
  await Promise.all(Array.from({ length: 8 }, () => f.submit.execute(cmd)));
  expect(
    (await f.unit.run(() => f.wallets.findById(wallet.id)))?.balance.amount,
  ).toBe("90.00");
});
