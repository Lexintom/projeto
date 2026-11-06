import "reflect-metadata";
import { afterAll } from "bun:test";
import { createMikroORM } from "../../src/infrastructure/database/mikro-orm.config";
import type { MikroORM } from "@mikro-orm/postgresql";

let orm: MikroORM | undefined;
export async function getTestOrm(): Promise<MikroORM> {
  if (!process.env.DATABASE_NAME?.endsWith("_test")) {
    throw new Error(
      "Use DATABASE_NAME com sufixo _test. Os testes limpam as tabelas.",
    );
  }
  if (!orm) {
    orm = await createMikroORM();
    await orm.migrator.up();
  }
  return orm;
}
export async function clearDatabase(db: MikroORM): Promise<void> {
  await db.em.execute(
    "truncate jungle.wallets, jungle.wager_transactions, jungle.wallet_ledger_entries, jungle.inbox_messages, jungle.outbox_messages cascade",
  );
}
export async function closeTestOrm(): Promise<void> {
  if (orm) await orm.close(true);
  orm = undefined;
}
afterAll(closeTestOrm);
