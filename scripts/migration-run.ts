import { MikroORM } from "@mikro-orm/core";
import { createMikroORM } from "../src/infrastructure/database/mikro-orm.config";

async function main(): Promise<void> {
  const orm = await createMikroORM();
  const migrator = orm.getMigrator();

  const migrations = await migrator.getPendingMigrations();
  if (migrations.length === 0) {
    console.log("No pending migrations");
    await orm.close();
    return;
  }

  console.log(`Running ${migrations.length} migrations...`);
  await migrator.up();
  console.log("Migrations completed");

  await orm.close();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
