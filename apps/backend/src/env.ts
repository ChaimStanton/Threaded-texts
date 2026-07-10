import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  SEFARIA_API_BASE_URL: z.string().url().default("https://www.sefaria.org/api"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_COMPLEMENT_MODEL: z.string().default("gpt-5.4"),
  OPENAI_COMPLEMENT_SERVICE_TIER: z.enum(["auto", "default", "flex", "priority"]).default("flex"),
  OPENAI_COMPLEMENT_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high", "xhigh"]).default("low"),
  OPENAI_COMPLEMENT_PROMPT_CACHE_RETENTION: z.enum(["in_memory", "24h"]).default("24h"),
  OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(3000),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_HTTP_REFERER: z.string().url().optional(),
  OPENROUTER_APP_TITLE: z.string().default("LSJS Sacks"),
  OPENROUTER_SEFARIA_REVIEW_MODEL: z.string().default("openai/gpt-oss-120b:free"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  GROQ_SEFARIA_REVIEW_MODEL: z.string().default("llama-3.3-70b-versatile"),
  TOGETHER_API_KEY: z.string().optional(),
  TOGETHER_BASE_URL: z.string().url().default("https://api.together.ai/v1"),
  TOGETHER_SEFARIA_REVIEW_MODEL: z.string().default("meta-llama/Llama-3.3-70B-Instruct-Turbo")
});

export const env = envSchema.parse(process.env);
