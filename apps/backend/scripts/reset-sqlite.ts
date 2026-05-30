import { rmSync } from "node:fs";

rmSync("prisma/dev.db", { force: true });
rmSync("prisma/dev.db-journal", { force: true });

await import("./bootstrap-sqlite.ts");
