import { readdirSync, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("prisma/dev.db");
const migrations = readdirSync("prisma/migrations")
  .filter((entry) => statSync(`prisma/migrations/${entry}`).isDirectory())
  .sort();

db.exec(`
  CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    finished_at DATETIME,
    migration_name TEXT NOT NULL,
    logs TEXT,
    rolled_back_at DATETIME,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_steps_count INTEGER NOT NULL DEFAULT 0
  );
`);

for (const migration of migrations) {
  const alreadyApplied = db
    .prepare("SELECT 1 FROM _prisma_migrations WHERE migration_name = ? AND rolled_back_at IS NULL")
    .get(migration);

  if (alreadyApplied) {
    continue;
  }

  const sql = readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8");
  db.exec(sql);
  db
    .prepare(
      `
      INSERT OR IGNORE INTO _prisma_migrations (
        id,
        checksum,
        finished_at,
        migration_name,
        applied_steps_count
      ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
    `
    )
    .run(migration, "manual-sqlite-bootstrap", migration, 1);
}

db.close();
