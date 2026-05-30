import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  SEFARIA_API_BASE_URL: z.string().url().default("https://www.sefaria.org/api"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_COMPLEMENT_MODEL: z.string().default("gpt-5.2")
});

export const env = envSchema.parse(process.env);
