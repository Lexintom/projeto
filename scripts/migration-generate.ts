import { MikroORM } from "@mikro-orm/core";
import { createMikroORM } from "../src/infrastructure/database/mikro-orm.config";

async function main(): Promise<void> {
  const orm = await createMikroORM();
  const migrator = orm.getMigrator();

  await migrator.createMigration();
  console.log(
    "Migration criada. Importe a nova classe e inclua em migrationsList no mikro-orm.config.ts.",
  );

  await orm.close();
}

main().catch((error) => {
  console.error("Migration generation failed:", error);
  process.exit(1);
});
