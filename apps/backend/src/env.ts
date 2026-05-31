import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  SEFARIA_API_BASE_URL: z.string().url().default("https://www.sefaria.org/api"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_COMPLEMENT_MODEL: z.string().default("gpt-5.4-pro"),
  OPENAI_COMPLEMENT_SERVICE_TIER: z.enum(["auto", "default", "flex", "priority"]).default("flex"),
  OPENAI_COMPLEMENT_REASONING_EFFORT: z.enum(["medium", "high", "xhigh"]).default("medium"),
  OPENAI_COMPLEMENT_PROMPT_CACHE_RETENTION: z.enum(["in_memory", "24h"]).default("24h"),
  OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1200)
});

export const env = envSchema.parse(process.env);
