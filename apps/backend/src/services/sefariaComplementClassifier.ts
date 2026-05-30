import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { OpenAIChatModel } from "@tanstack/ai-openai";
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
  normalizedRef: z.string().min(1).optional(),
  book: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  url: z.string().url().optional(),
  topic: z.string().min(1).optional(),
  rationale: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  rank: z.number().int().positive().optional()
});

const ComplementClassificationSchema = z.object({
  complements: z.array(ComplementSchema).max(8)
});

export type ComplementClassificationResult = z.infer<typeof ComplementClassificationSchema>;

const systemPrompt = [
  "You are classifying Rabbi Jonathan Sacks paragraphs against Jewish source texts.",
  "Find sources that complement the paragraph's ideas, questions, tensions, or ethical themes.",
  "Only use sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam.",
  "Prefer canonical Sefaria refs. If a broad source is useful, return the tightest relevant ref.",
  "Do not return sources from midrash, commentaries, halakhic works outside Shulchan Aruch/Rambam, or modern books."
].join(" ");

export async function classifySefariaComplements(input: {
  paragraphId: string;
  sefariaRef: string;
  text: string;
  model?: string;
}) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to classify Sefaria complements.");
  }

  const model = input.model ?? env.OPENAI_COMPLEMENT_MODEL;
  const prompt = buildComplementClassificationPrompt({
    sefariaRef: input.sefariaRef,
    text: input.text
  });
  const request = {
    adapter: "openaiText",
    provider: "openai",
    model,
    systemPrompt,
    prompt
  };

  const response = await chat({
    adapter: openaiText(model as OpenAIChatModel),
    systemPrompts: [systemPrompt],
    messages: [
      {
        role: "user",
        content: JSON.stringify(prompt)
      }
    ],
    outputSchema: ComplementClassificationSchema,
    temperature: 0.1
  });

  return recordLlmTextClassification({
    paragraphId: input.paragraphId,
    provider: "openai",
    model,
    promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
    prompt,
    request,
    response,
    responseText: JSON.stringify(response),
    complements: response.complements
  });
}

export function buildDryRunComplementClassificationRequest(input: { sefariaRef: string; text: string; model?: string }) {
  const model = input.model ?? env.OPENAI_COMPLEMENT_MODEL;
  const prompt = buildComplementClassificationPrompt(input);

  return {
    provider: "openai",
    model,
    promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
    systemPrompt,
    prompt,
    outputSchema: "ComplementClassificationSchema"
  };
}
