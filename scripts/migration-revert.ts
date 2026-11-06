import { MikroORM } from "@mikro-orm/core";
import { createMikroORM } from "../src/infrastructure/database/mikro-orm.config";

async function main(): Promise<void> {
  const orm = await createMikroORM();
  const migrator = orm.getMigrator();

  await migrator.down();
  console.log("Migration reverted");

  await orm.close();
}

main().catch((error) => {
  console.error("Migration revert failed:", error);
  process.exit(1);
});
