import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { authorsRouter } from "./routes/authors.js";
import { healthRouter } from "./routes/health.js";
import { rabbiSacksRouter } from "./routes/rabbiSacks.js";
import { sourcesRouter } from "./routes/sources.js";
import { textsRouter } from "./routes/texts.js";

const app = express();

app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json());

app.use("/authors", authorsRouter);
app.use("/health", healthRouter);
app.use("/rabbi-sacks", rabbiSacksRouter);
app.use("/sources", sourcesRouter);
app.use("/texts", textsRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", issues: error.issues });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
