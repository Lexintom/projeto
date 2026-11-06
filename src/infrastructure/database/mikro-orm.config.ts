import "reflect-metadata";
import { MikroORM, defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { WalletEntity } from "./repositories/wallet.entity";
import { WagerTransactionEntity } from "./repositories/wager-transaction.entity";
import { WalletLedgerEntryEntity } from "./repositories/wallet-ledger-entry.entity";
import { InboxMessageEntity } from "./repositories/inbox-message.entity";
import { OutboxMessageEntity } from "./repositories/outbox-message.entity";
import { Migration20261105000000 } from "./migrations/Migration20261105000000";

import { Migration20261106000000 } from "./migrations/Migration20261106000000";

export const entities = [
  WalletEntity,
  WagerTransactionEntity,
  WalletLedgerEntryEntity,
  InboxMessageEntity,
  OutboxMessageEntity,
];

export const mikroOrmConfig = defineConfig({
  dbName: process.env.DATABASE_NAME ?? "jungle_gaming",
  host: process.env.DATABASE_HOST ?? "localhost",
  port: Number(process.env.DATABASE_PORT ?? "5432"),
  user: process.env.DATABASE_USER ?? "jungle",
  password: process.env.DATABASE_PASSWORD ?? "jungle_secret",
  schema: "jungle",
  entities,
  extensions: [Migrator],
  migrations: {
    path: "./dist/infrastructure/database/migrations",
    pathTs: "./src/infrastructure/database/migrations",
    migrationsList: [Migration20261105000000, Migration20261106000000],
    transactional: true,
    allOrNothing: true,
    dropTables: false,
    emit: "ts",
  },
  driverOptions: {
    connection: { ssl: process.env.DATABASE_SSL === "true" ? true : false },
  },
  pool: { min: 0, max: Number(process.env.DATABASE_POOL_SIZE ?? "20") },
  debug: false,
});

export async function createMikroORM() {
  return MikroORM.init(mikroOrmConfig);
}
