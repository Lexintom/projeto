import { describe, it, expect, beforeEach } from "bun:test";
import { getTestOrm, clearDatabase } from "../utils/test-container";
import { fixture, command } from "../utils/database-fixture";
import { Money } from "../../src/domain/money/money";
import { OutboxMessageEntity } from "../../src/infrastructure/database/repositories/outbox-message.entity";
import { WagerTransactionKind } from "../../src/domain/transaction/wager-transaction.enums";

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
describe("Persistência no PostgreSQL", () => {
  it("grava abertura, aposta, saldo e eventos sem duplicar o replay", async () => {
    const wallet = await open();
    const cmd = command(wallet.id, wallet.playerId);
    await f.submit.execute(cmd);
    const replay = await f.submit.execute(cmd);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.balance.amount).toBe("90.00");
    await f.unit.run(async () => {
      expect((await f.ledger.findByWalletId(wallet.id)).length).toBe(2);
      expect((await f.ledger.calculateBalance(wallet.id))?.amount).toBe(
        "90.00",
      );
    });
  });
  it("recusa reutilização da chave com outro conteúdo", async () => {
    const wallet = await open();
    const cmd = command(wallet.id, wallet.playerId);
    await f.submit.execute(cmd);
    await expect(
      f.submit.execute({ ...cmd, idempotencyKey: "another-key" }),
    ).rejects.toThrow();
    await expect(
      f.submit.execute({ ...cmd, payloadHash: "different" }),
    ).rejects.toThrow();
    expect(
      (await f.unit.run(() => f.wallets.findById(wallet.id)))?.balance.amount,
    ).toBe("90.00");
  });
  it("reverte o débito se a gravação dos eventos falhar", async () => {
    const wallet = await open();
    const original = f.outbox.saveAll.bind(f.outbox);
    f.outbox.saveAll = async () => {
      throw new Error("Falha de gravação simulada");
    };
    await expect(
      f.submit.execute(command(wallet.id, wallet.playerId)),
    ).rejects.toThrow();
    f.outbox.saveAll = original;
    expect(
      (await f.unit.run(() => f.wallets.findById(wallet.id)))?.balance.amount,
    ).toBe("100.00");
  });
  it("processa uma referência pendente quando a aposta chega", async () => {
    const wallet = await open();
    const bet = command(wallet.id, wallet.playerId);
    const refund = {
      ...command(wallet.id, wallet.playerId),
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: bet.externalTransactionId,
    };
    expect((await f.submit.execute(refund)).statusCode).toBe(202);
    await f.submit.execute(bet);
    expect((await f.submit.execute(refund)).statusCode).toBe(200);
    expect(
      (await f.unit.run(() => f.wallets.findById(wallet.id)))?.balance.amount,
    ).toBe("100.00");
  });
});
