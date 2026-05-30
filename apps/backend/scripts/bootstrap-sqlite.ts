import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const sql = readFileSync("prisma/migrations/20260525154500_init/migration.sql", "utf8");
const db = new DatabaseSync("prisma/dev.db");

db.exec(sql);
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
db.prepare(`
  INSERT OR IGNORE INTO _prisma_migrations (
    id,
    checksum,
    finished_at,
    migration_name,
    applied_steps_count
  ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
`).run("20260525154500_init", "manual-sqlite-bootstrap", "20260525154500_init", 1);

db.close();
