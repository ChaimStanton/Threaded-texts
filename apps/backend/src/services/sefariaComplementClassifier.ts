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
  complements: z.array(ComplementSchema).max(3)
});

const BatchComplementClassificationSchema = z.object({
  results: z.array(
    z.object({
      paragraphId: z.string().min(1),
      complements: z.array(ComplementSchema).max(3)
    })
  )
});

export type ComplementClassificationResult = z.infer<typeof ComplementClassificationSchema>;
export type BatchComplementClassificationResult = z.infer<typeof BatchComplementClassificationSchema>;

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
  "Return no complements when a paragraph is too short, transitional, historical-only, or lacks a strong classical source hook.",
  "Require a concrete hook: a shared legal principle, biblical verse, covenantal idea, moral problem, or explicit source cited by the paragraph.",
  "Do not return generic mood links such as questioning, uncertainty, teaching, or exile unless the source itself addresses the same specific problem.",
  "Only use sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam.",
  "Prefer explicit refs quoted or footnoted in the paragraph when they are inside the allowed corpora.",
  "Prefer canonical Sefaria refs. If a broad source is useful, return the tightest relevant ref, including segment refs for Talmud when possible.",
  "For Rambam/Mishneh Torah refs, use Sefaria's title form without a 'Rambam,' prefix, for example 'Mishneh Torah, Repentance 5:1'.",
  "Do not overuse anchor verses. Esther 3:8 is appropriate only when the paragraph is specifically about Jews as a scattered/distinct people whose laws make them politically suspect. Leviticus 26:44 is appropriate only when the paragraph is specifically about covenantal survival despite exile/enemies.",
  "A useful complement should help a teacher frame a source-based discussion, not merely provide a vague thematic echo.",
  "Do not return confidence below 0.65.",
  "Do not return sources from midrash, commentaries, halakhic works outside Shulchan Aruch/Rambam, or modern books."
].join(" ");

export function estimateCostUsd(input: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  batchDiscount?: boolean;
}) {
  const pricing = pricingByModel[input.model];

  if (!pricing || input.inputTokens === undefined || input.outputTokens === undefined) {
    return undefined;
  }

  const cost =
    (input.inputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (input.outputTokens / 1_000_000) * pricing.outputUsdPerMillion;

  return input.batchDiscount ? cost * 0.5 : cost;
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function supportsStructuredOutputs(model: string) {
  return model !== "gpt-5.4-pro";
}

function supportsTemperature(model: string) {
  return !model.startsWith("gpt-5.4");
}

function isUsableComplement(complement: ComplementClassificationResult["complements"][number]) {
  return (
    !complement.ref.includes("?") &&
    complement.confidence !== null &&
    complement.confidence >= 0.65 &&
    complement.rank !== null
  );
}

export function buildComplementResponseBody(input: {
  sefariaRef: string;
  text: string;
  model?: string;
  maxOutputTokens?: number;
}) {
  const model = input.model ?? env.OPENAI_COMPLEMENT_MODEL;
  const prompt = buildComplementClassificationPrompt({
    sefariaRef: input.sefariaRef,
    text: input.text
  });
  const responseOptions = {
    model,
    instructions: systemPrompt,
    input: JSON.stringify(prompt),
    prompt_cache_key: "sefaria-complement-classification-v1",
    prompt_cache_retention: env.OPENAI_COMPLEMENT_PROMPT_CACHE_RETENTION,
    reasoning: { effort: env.OPENAI_COMPLEMENT_REASONING_EFFORT },
    max_output_tokens: input.maxOutputTokens ?? env.OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS,
    ...(supportsTemperature(model) ? { temperature: 0.1 } : {})
  } as const;

  return {
    prompt,
    body: supportsStructuredOutputs(model)
      ? {
          ...responseOptions,
          text: {
            format: zodTextFormat(ComplementClassificationSchema, "sefaria_complement_classification")
          }
        }
      : responseOptions,
    request: {
      provider: "openai",
      api: "responses.create",
      model,
      instructions: systemPrompt,
      input: JSON.stringify(prompt),
      prompt_cache_key: "sefaria-complement-classification-v1",
      prompt_cache_retention: env.OPENAI_COMPLEMENT_PROMPT_CACHE_RETENTION,
      reasoning: { effort: env.OPENAI_COMPLEMENT_REASONING_EFFORT },
      max_output_tokens: input.maxOutputTokens ?? env.OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS,
      text: {
        format: supportsStructuredOutputs(model) ? "sefaria_complement_classification" : "plain_json"
      }
    } satisfies Prisma.InputJsonObject
  };
}

export function parseComplementClassificationResponseText(responseText: string) {
  return ComplementClassificationSchema.parse(parseJsonObject(responseText));
}

export function toStoredComplements(complements: ComplementClassificationResult["complements"]) {
  return complements.filter(isUsableComplement).map((complement) => ({
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
  }));
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
  const { body: responseBody, prompt, request } = buildComplementResponseBody({
    sefariaRef: input.sefariaRef,
    text: input.text,
    model
  });

  try {
    const response = await openai.responses.create({
      ...responseBody,
      service_tier: env.OPENAI_COMPLEMENT_SERVICE_TIER
    });
    const inputTokens = response.usage?.input_tokens;
    const outputTokens = response.usage?.output_tokens;
    const estimatedCostUsd = estimateCostUsd({ model, inputTokens, outputTokens });
    let parsed: ComplementClassificationResult;

    try {
      parsed = parseComplementClassificationResponseText(response.output_text);
    } catch (error) {
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
        status: "failed",
        error: error instanceof Error ? `Failed to parse model JSON: ${error.message}` : String(error),
        completedAt: new Date()
      });
    }

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
      complements: toStoredComplements(parsed.complements)
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

export async function classifySefariaComplementsBatch(
  inputs: Array<{
    paragraphId: string;
    sefariaRef: string;
    text: string;
  }>,
  options: { model?: string } = {}
) {
  if (inputs.length === 0) {
    return [];
  }

  if (inputs.length === 1) {
    return [
      await classifySefariaComplements({
        ...inputs[0],
        model: options.model
      })
    ];
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to classify Sefaria complements.");
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = options.model ?? env.OPENAI_COMPLEMENT_MODEL;
  const prompt = {
    version: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
    question:
      "For each Rabbi Sacks paragraph, which sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam help a reader discover and understand it?",
    allowedCorpora: ALLOWED_COMPLEMENT_CORPORA,
    instructions: [
      "Classify each paragraph independently.",
      "Return zero complements when a paragraph is too short, transitional, historical-only, or lacks a strong classical source hook.",
      "Return at most three complements for each paragraph.",
      "Find source-text entry points into each paragraph's themes; do not merely keyword match.",
      "The discovery direction is from the classical source to Rabbi Sacks.",
      "Require a concrete hook: a shared legal principle, biblical verse, covenantal idea, moral problem, or explicit source cited by the paragraph.",
      "Do not return generic mood links such as 'questioning', 'uncertainty', 'teaching', or 'exile' unless the source itself addresses the same specific problem.",
      "Prefer explicit refs quoted or footnoted in the paragraph when they are inside the allowed corpora.",
      "Only return sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam.",
      "Use canonical Sefaria refs when possible, and use the tightest relevant segment ref for Talmud when possible.",
      "For Rambam/Mishneh Torah refs, use Sefaria's title form without a 'Rambam,' prefix, for example 'Mishneh Torah, Repentance 5:1'.",
      "Do not overuse anchor verses. Esther 3:8 is appropriate only when the paragraph is specifically about Jews as a scattered/distinct people whose laws make them politically suspect. Leviticus 26:44 is appropriate only when the paragraph is specifically about covenantal survival despite exile/enemies.",
      "A useful complement should help a teacher frame a source-based discussion, not merely provide a vague thematic echo.",
      "Do not return confidence below 0.65.",
      "Return concise rationales grounded in the paragraph and the source.",
      "Every result must use the exact paragraphId supplied in the input."
    ],
    responseFormat: "Return only a valid JSON object matching outputSchema. Do not wrap it in markdown.",
    outputSchema: {
      results: [
        {
          paragraphId: "string, copied exactly from input",
          complements: "array of zero to three items",
          complementItemShape: [
            {
              ref: "string, canonical Sefaria ref",
              corpus: "tanach | gemara | mishna | shulchan_aruch | rambam",
              normalizedRef: "string or null",
              book: "string or null",
              category: "string or null",
              url: "string or null",
              topic: "string or null",
              rationale: "string or null",
              confidence: "number from 0 to 1",
              rank: "integer, 1 is best"
            }
          ]
        }
      ]
    },
    paragraphs: inputs.map((input) => ({
      paragraphId: input.paragraphId,
      sefariaRef: input.sefariaRef,
      text: input.text
    }))
  } satisfies Prisma.InputJsonObject;
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
    batchSize: inputs.length,
    text: {
      format: supportsStructuredOutputs(model) ? "batch_sefaria_complement_classification" : "plain_json"
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
      ...(supportsTemperature(model) ? { temperature: 0.1 } : {})
    } as const;
    const response = await openai.responses.create(
      supportsStructuredOutputs(model)
        ? {
            ...responseOptions,
            text: {
              format: zodTextFormat(BatchComplementClassificationSchema, "batch_sefaria_complement_classification")
            }
          }
        : responseOptions
    );
    const inputTokens = response.usage?.input_tokens;
    const outputTokens = response.usage?.output_tokens;
    const totalEstimatedCostUsd = estimateCostUsd({ model, inputTokens, outputTokens });
    let parsed: BatchComplementClassificationResult;

    try {
      parsed = BatchComplementClassificationSchema.parse(parseJsonObject(response.output_text));
    } catch (error) {
      const failedRuns = [];

      for (const input of inputs) {
        failedRuns.push(
          await recordLlmTextClassification({
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
            estimatedCostUsd: totalEstimatedCostUsd,
            status: "failed",
            error: error instanceof Error ? `Failed to parse model JSON: ${error.message}` : String(error),
            completedAt: new Date()
          })
        );
      }

      return failedRuns;
    }

    const resultsByParagraphId = new Map(parsed.results.map((result) => [result.paragraphId, result]));
    const inputTokenShare = inputTokens === undefined ? undefined : Math.round(inputTokens / inputs.length);
    const outputTokenShare = outputTokens === undefined ? undefined : Math.round(outputTokens / inputs.length);
    const totalTokenShare = response.usage?.total_tokens === undefined ? undefined : Math.round(response.usage.total_tokens / inputs.length);
    const reasoningTokenShare =
      response.usage?.output_tokens_details?.reasoning_tokens === undefined
        ? undefined
        : Math.round(response.usage.output_tokens_details.reasoning_tokens / inputs.length);
    const cachedInputTokenShare =
      response.usage?.input_tokens_details?.cached_tokens === undefined
        ? undefined
        : Math.round(response.usage.input_tokens_details.cached_tokens / inputs.length);
    const costShare = totalEstimatedCostUsd === undefined ? undefined : totalEstimatedCostUsd / inputs.length;
    const recordedRuns = [];

    for (const input of inputs) {
      const result = resultsByParagraphId.get(input.paragraphId);

      recordedRuns.push(
        await recordLlmTextClassification({
          paragraphId: input.paragraphId,
          provider: "openai",
          model,
          promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
          prompt,
          request,
          response: response as unknown as Prisma.InputJsonValue,
          responseText: response.output_text,
          providerRequestId: response.id,
          inputTokens: inputTokenShare,
          cachedInputTokens: cachedInputTokenShare,
          outputTokens: outputTokenShare,
          reasoningTokens: reasoningTokenShare,
          totalTokens: totalTokenShare,
          estimatedCostUsd: costShare,
          status: result ? "completed" : "failed",
          error: result ? undefined : "Batch response did not include this paragraphId.",
          completedAt: new Date(),
          complements: (result?.complements ?? []).filter(isUsableComplement).map((complement) => ({
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
        })
      );
    }

    return recordedRuns;
  } catch (error) {
    const failedRuns = [];

    for (const input of inputs) {
      failedRuns.push(
        await recordLlmTextClassification({
          paragraphId: input.paragraphId,
          provider: "openai",
          model,
          promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
          prompt,
          request,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date()
        })
      );
    }

    return failedRuns;
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
