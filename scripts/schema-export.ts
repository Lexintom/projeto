import { MikroORM } from "@mikro-orm/core";
import { createMikroORM } from "../src/infrastructure/database/mikro-orm.config";
import { writeFileSync } from "fs";

async function main(): Promise<void> {
  const orm = await createMikroORM();
  const generator = orm.getSchemaGenerator();

  const sql = await generator.getCreateSchemaSQL();
  writeFileSync("schema.sql", sql, "utf-8");
  console.log("Schema exported to schema.sql");

  await orm.close();
}

main().catch((error) => {
  console.error("Schema export failed:", error);
  process.exit(1);
});
