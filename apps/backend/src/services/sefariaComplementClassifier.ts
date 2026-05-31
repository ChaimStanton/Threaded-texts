import type { Prisma } from "@prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { env } from "../env.js";
import {
  ALLOWED_COMPLEMENT_CORPORA,
  COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
  buildComplementClassificationPrompt,
  recordLlmTextClassification
} from "../repositories/textClassifications.js";

const ComplementSchema = z.object({
  ref: z.string().min(1),
  corpus: z.enum(ALLOWED_COMPLEMENT_CORPORA),
  normalizedRef: z.string().nullable(),
  book: z.string().nullable(),
  category: z.string().nullable(),
  url: z.string().nullable(),
  topic: z.string().nullable(),
  rationale: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  rank: z.number().int().positive().nullable()
});

const ComplementClassificationSchema = z.object({
  complements: z.array(ComplementSchema).max(8)
});

export type ComplementClassificationResult = z.infer<typeof ComplementClassificationSchema>;

type ModelPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const pricingByModel: Record<string, ModelPricing> = {
  "gpt-5.2": { inputUsdPerMillion: 1.75, outputUsdPerMillion: 14 },
  "gpt-5.4": { inputUsdPerMillion: 2.5, outputUsdPerMillion: 15 },
  "gpt-5.4-pro": { inputUsdPerMillion: 30, outputUsdPerMillion: 180 },
  "gpt-5.4-mini": { inputUsdPerMillion: 0.75, outputUsdPerMillion: 4.5 }
};

const systemPrompt = [
  "You are classifying Rabbi Jonathan Sacks paragraphs against Jewish source texts.",
  "Find classical source-text entry points that help a reader discover and understand the Rabbi Sacks paragraph's ideas, questions, tensions, or ethical themes.",
  "The direction matters: the source should lead readers toward Rabbi Sacks, not merely be something Rabbi Sacks happens to complement.",
  "Only use sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam.",
  "Prefer canonical Sefaria refs. If a broad source is useful, return the tightest relevant ref.",
  "Do not return sources from midrash, commentaries, halakhic works outside Shulchan Aruch/Rambam, or modern books."
].join(" ");

function estimateCostUsd(input: { model: string; inputTokens?: number; outputTokens?: number }) {
  const pricing = pricingByModel[input.model];

  if (!pricing || input.inputTokens === undefined || input.outputTokens === undefined) {
    return undefined;
  }

  return (
    (input.inputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (input.outputTokens / 1_000_000) * pricing.outputUsdPerMillion
  );
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function supportsStructuredOutputs(model: string) {
  return model !== "gpt-5.4-pro";
}

export async function classifySefariaComplements(input: {
  paragraphId: string;
  sefariaRef: string;
  text: string;
  model?: string;
}) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to classify Sefaria complements.");
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = input.model ?? env.OPENAI_COMPLEMENT_MODEL;
  const prompt = buildComplementClassificationPrompt({
    sefariaRef: input.sefariaRef,
    text: input.text
  });
  const request = {
    provider: "openai",
    api: "responses.create",
    model,
    instructions: systemPrompt,
    input: JSON.stringify(prompt),
    service_tier: env.OPENAI_COMPLEMENT_SERVICE_TIER,
    prompt_cache_key: "sefaria-complement-classification-v1",
    prompt_cache_retention: env.OPENAI_COMPLEMENT_PROMPT_CACHE_RETENTION,
    reasoning: { effort: env.OPENAI_COMPLEMENT_REASONING_EFFORT },
    max_output_tokens: env.OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS,
    text: {
      format: supportsStructuredOutputs(model) ? "sefaria_complement_classification" : "plain_json"
    }
  };

  try {
    const responseOptions = {
      model,
      instructions: systemPrompt,
      input: JSON.stringify(prompt),
      service_tier: env.OPENAI_COMPLEMENT_SERVICE_TIER,
      prompt_cache_key: "sefaria-complement-classification-v1",
      prompt_cache_retention: env.OPENAI_COMPLEMENT_PROMPT_CACHE_RETENTION,
      reasoning: { effort: env.OPENAI_COMPLEMENT_REASONING_EFFORT },
      max_output_tokens: env.OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS,
      temperature: 0.1
    } as const;
    const response = await openai.responses.create(
      supportsStructuredOutputs(model)
        ? {
            ...responseOptions,
            text: {
              format: zodTextFormat(ComplementClassificationSchema, "sefaria_complement_classification")
            }
          }
        : responseOptions
    );
    const parsed = ComplementClassificationSchema.parse(parseJsonObject(response.output_text));
    const inputTokens = response.usage?.input_tokens;
    const outputTokens = response.usage?.output_tokens;
    const estimatedCostUsd = estimateCostUsd({ model, inputTokens, outputTokens });

    return recordLlmTextClassification({
      paragraphId: input.paragraphId,
      provider: "openai",
      model,
      promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
      prompt,
      request,
      response: response as unknown as Prisma.InputJsonValue,
      responseText: response.output_text,
      providerRequestId: response.id,
      inputTokens,
      cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens,
      outputTokens,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens,
      totalTokens: response.usage?.total_tokens,
      estimatedCostUsd,
      complements: parsed.complements.map((complement) => ({
        ref: complement.ref,
        corpus: complement.corpus,
        normalizedRef: complement.normalizedRef ?? undefined,
        book: complement.book ?? undefined,
        category: complement.category ?? undefined,
        url: complement.url ?? undefined,
        topic: complement.topic ?? undefined,
        rationale: complement.rationale ?? undefined,
        confidence: complement.confidence ?? undefined,
        rank: complement.rank ?? undefined
      }))
    });
  } catch (error) {
    return recordLlmTextClassification({
      paragraphId: input.paragraphId,
      provider: "openai",
      model,
      promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
      prompt,
      request,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date()
    });
  }
}

export function buildDryRunComplementClassificationRequest(input: { sefariaRef: string; text: string; model?: string }) {
  const model = input.model ?? env.OPENAI_COMPLEMENT_MODEL;
  const prompt = buildComplementClassificationPrompt(input);

  return {
    provider: "openai",
    api: "responses.create",
    model,
    promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
    instructions: systemPrompt,
    serviceTier: env.OPENAI_COMPLEMENT_SERVICE_TIER,
    promptCacheKey: "sefaria-complement-classification-v1",
    promptCacheRetention: env.OPENAI_COMPLEMENT_PROMPT_CACHE_RETENTION,
    reasoningEffort: env.OPENAI_COMPLEMENT_REASONING_EFFORT,
    maxOutputTokens: env.OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS,
    prompt,
    outputSchema: supportsStructuredOutputs(model) ? "ComplementClassificationSchema" : "plain JSON parsed locally"
  };
}
