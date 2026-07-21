import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../src/env.js";
import {
  SEFARIA_COMPLEMENT_ACCEPTED_REVIEW_PROMPT_VERSIONS,
  SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
  SEFARIA_COMPLEMENT_REVIEW_VERDICTS,
  buildSefariaComplementReviewPrompt,
  recordSefariaComplementAiReview
} from "../src/repositories/sefariaComplementReviews.js";
import { getSefariaText } from "../src/sefaria/client.js";
import { buildSacksProcessingEligibilityWhere } from "../src/text/sacksProcessingEligibility.js";

const prisma = new PrismaClient();

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.slice(2).split("=");
      return [key, value] as const;
    })
);

const limit = Number(args.get("limit") ?? 5);
const model = args.get("model") ?? env.OPENROUTER_SEFARIA_REVIEW_MODEL;
const provider = "openrouter";
const bookSlug = args.get("book-slug");
const minConfidence = args.has("min-confidence") ? Number(args.get("min-confidence")) : undefined;
const maxConfidence = args.has("max-confidence") ? Number(args.get("max-confidence")) : undefined;
const maxTokens = Number(args.get("max-tokens") ?? 1200);
const dryRun = args.get("dry-run") === "true";
const delayMs = Number(args.get("delay-ms") ?? 1000);
const stopOnProviderError = args.get("stop-on-provider-error") !== "false";
const maxFailures = Number(args.get("max-failures") ?? 10);

const ReviewSchema = z.object({
  verdict: z.enum(SEFARIA_COMPLEMENT_REVIEW_VERDICTS),
  score: z.number().int().min(0).max(4),
  issueTags: z.array(z.string()).default([]),
  rationale: z.string().min(1),
  suggestedAction: z.string().nullable().optional(),
  suggestedRef: z.string().nullable().optional()
});

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  const candidate = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }

    throw new Error(`No parseable JSON object found in model output: ${candidate.slice(0, 500)}`);
  }
}

function getChatCompletionText(response: any) {
  const text = response.choices?.[0]?.message?.content;

  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error(`OpenRouter response did not include choices[0].message.content: ${JSON.stringify(response)}`);
  }

  return text;
}

function isProviderStopError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|quota|credit|insufficient|temporarily unavailable|overloaded|free|resourceexhausted|upstream error|worker local total request limit/i.test(
    message
  );
}

async function sleep(ms: number) {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function flattenSefariaText(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    const flattened = value.flat(Number.POSITIVE_INFINITY).filter((item) => typeof item === "string").join(" ").trim();
    return flattened || undefined;
  }

  return undefined;
}

async function getSourceText(ref: string) {
  try {
    const response = await getSefariaText(ref);
    return flattenSefariaText(response.text) ?? flattenSefariaText(response.he);
  } catch (error) {
    return `Sefaria fetch failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function getNeighboringParagraphs(textUnit: {
  bookId: string;
  language: string;
  chapter: number;
  paragraph: number;
}) {
  const baseWhere = {
    ...buildSacksProcessingEligibilityWhere(),
    bookId: textUnit.bookId,
    language: textUnit.language,
  };
  const select = { ref: true, text: true };
  const previous = await prisma.textUnit.findFirst({
    where: {
      ...baseWhere,
      OR: [{ chapter: { lt: textUnit.chapter } }, { chapter: textUnit.chapter, paragraph: { lt: textUnit.paragraph } }]
    },
    orderBy: [{ chapter: "desc" }, { paragraph: "desc" }],
    select
  });
  const next = await prisma.textUnit.findFirst({
    where: {
      ...baseWhere,
      OR: [{ chapter: { gt: textUnit.chapter } }, { chapter: textUnit.chapter, paragraph: { gt: textUnit.paragraph } }]
    },
    orderBy: [{ chapter: "asc" }, { paragraph: "asc" }],
    select
  });

  return { previous, next };
}

function createOpenRouterClient() {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required to review Sefaria complements with OpenRouter.");
  }

  return new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL,
    defaultHeaders: {
      ...(env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER } : {}),
      "X-OpenRouter-Title": env.OPENROUTER_APP_TITLE
    }
  });
}

async function selectRows() {
  const confidenceFilter =
    minConfidence === undefined && maxConfidence === undefined
      ? undefined
      : {
          gte: minConfidence,
          lte: maxConfidence
        };

  return prisma.textSefariaComplement.findMany({
    where: {
      deletedAt: null,
      confidence: confidenceFilter,
      sefariaReference: { deletedAt: null },
      textUnit: {
        ...buildSacksProcessingEligibilityWhere(bookSlug)
      },
      aiReviews: {
        none: {
          deletedAt: null,
          provider,
          model,
          promptVersion: { in: [...SEFARIA_COMPLEMENT_ACCEPTED_REVIEW_PROMPT_VERSIONS] },
          status: { in: ["pending", "completed"] }
        }
      }
    },
    include: {
      sefariaReference: true,
      textUnit: {
        include: {
          book: true,
          chapterRef: true
        }
      }
    },
    orderBy: [{ confidence: "asc" }, { createdAt: "asc" }],
    take: limit
  });
}

async function runReviews() {
  const rows = await selectRows();

  if (rows.length === 0) {
    console.log(JSON.stringify({ reviewed: false, reason: "No eligible complements found." }, null, 2));
    return;
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          reviewed: false,
          dryRun: true,
          provider,
          model,
          count: rows.length,
          complementIds: rows.map((row) => row.id),
          refs: rows.map((row) => ({ paragraphRef: row.textUnit.ref, sefariaRef: row.sefariaReference.ref }))
        },
        null,
        2
      )
    );
    return;
  }

  const openrouter = createOpenRouterClient();
  const results = [];
  let failures = 0;

  for (const [index, row] of rows.entries()) {
    const sefariaText = await getSourceText(row.sefariaReference.ref);
    const neighboringParagraphs = await getNeighboringParagraphs(row.textUnit);
    const prompt = buildSefariaComplementReviewPrompt({
      bookTitle: row.textUnit.book.title,
      chapterRef: row.textUnit.chapterRef?.ref,
      chapterTitle: row.textUnit.chapterRef?.title,
      paragraphRef: row.textUnit.ref,
      paragraphText: row.textUnit.text,
      previousParagraphRef: neighboringParagraphs.previous?.ref,
      previousParagraphText: neighboringParagraphs.previous?.text,
      nextParagraphRef: neighboringParagraphs.next?.ref,
      nextParagraphText: neighboringParagraphs.next?.text,
      sefariaRef: row.sefariaReference.ref,
      sefariaText,
      topic: row.topic,
      rationale: row.rationale,
      confidence: row.confidence
    });
    const request = {
      provider,
      api: "chat.completions.create",
      model,
      textSefariaComplementId: row.id,
      paragraphId: row.paragraphId,
      sefariaRef: row.sefariaReference.ref,
      maxTokens,
      responseFormat: "json_object"
    };
    let response: any;
    let responseText: string | undefined;

    try {
      response = await openrouter.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a strict Jewish source QA reviewer. Return exactly one JSON object and nothing else. Do not include analysis, markdown, preamble, or trailing text. The first character must be { and the last character must be }. Judge fit, not plausibility."
          },
          {
            role: "user",
            content: JSON.stringify(prompt)
          }
        ],
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      });
      responseText = getChatCompletionText(response);
      const parsed = ReviewSchema.parse(parseJsonObject(responseText));
      const completed = await recordSefariaComplementAiReview({
        textSefariaComplementId: row.id,
        provider,
        model,
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        prompt,
        request,
        response: response as any,
        responseText,
        providerRequestId: response.id,
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
        status: "completed",
        result: parsed,
        completedAt: new Date()
      });

      results.push({
        textSefariaComplementId: row.id,
        status: completed.status,
        reviewId: completed.id,
        verdict: completed.verdict,
        score: completed.score
      });
      console.log(
        JSON.stringify({
          progress: true,
          processed: results.length,
          total: rows.length,
          textSefariaComplementId: row.id,
          status: completed.status,
          verdict: completed.verdict,
          score: completed.score
        })
      );
    } catch (error) {
      failures += 1;
      const failed = await recordSefariaComplementAiReview({
        textSefariaComplementId: row.id,
        provider,
        model,
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        prompt,
        request,
        response: response as any,
        responseText,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      });

      results.push({ textSefariaComplementId: row.id, status: failed.status, reviewId: failed.id });
      console.log(
        JSON.stringify({
          progress: true,
          processed: results.length,
          total: rows.length,
          textSefariaComplementId: row.id,
          status: failed.status,
          error: error instanceof Error ? error.message : String(error)
        })
      );

      if (stopOnProviderError && isProviderStopError(error)) {
        console.error(
          JSON.stringify({
            stopped: true,
            reason: "Provider/rate-limit style error encountered.",
            processed: results.length,
            error: error instanceof Error ? error.message : String(error)
          })
        );
        break;
      }

      if (failures >= maxFailures) {
        console.error(
          JSON.stringify({
            stopped: true,
            reason: "Maximum failures reached.",
            processed: results.length,
            failures
          })
        );
        break;
      }
    }

    if (index < rows.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log(JSON.stringify({ reviewed: true, provider, model, count: rows.length, results }, null, 2));
}

try {
  await runReviews();
} finally {
  await prisma.$disconnect();
}
