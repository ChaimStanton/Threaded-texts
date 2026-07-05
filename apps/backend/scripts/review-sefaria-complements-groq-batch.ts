import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../src/env.js";
import {
  SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
  SEFARIA_COMPLEMENT_REVIEW_VERDICTS,
  buildSefariaComplementReviewPrompt,
  recordSefariaComplementAiReview
} from "../src/repositories/sefariaComplementReviews.js";
import { getSefariaText } from "../src/sefaria/client.js";

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

const mode = args.get("mode") ?? "submit";
const batchId = args.get("batch-id");
const limit = Number(args.get("limit") ?? 5);
const model = args.get("model") ?? env.GROQ_SEFARIA_REVIEW_MODEL;
const provider = "groq";
const bookSlug = args.get("book-slug");
const minConfidence = args.has("min-confidence") ? Number(args.get("min-confidence")) : undefined;
const maxConfidence = args.has("max-confidence") ? Number(args.get("max-confidence")) : undefined;
const maxTokens = Number(args.get("max-tokens") ?? 600);
const completionWindow = args.get("completion-window") ?? "24h";
const pollIntervalMs = Number(args.get("poll-interval-ms") ?? 30000);
const maxWaitMs = Number(args.get("max-wait-ms") ?? 300000);

if (!env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is required to review Sefaria complements with Groq batch.");
}

const groq = new OpenAI({
  apiKey: env.GROQ_API_KEY,
  baseURL: env.GROQ_BASE_URL
});

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
    throw new Error(`Groq batch response did not include choices[0].message.content: ${JSON.stringify(response)}`);
  }

  return text;
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

async function writeJsonl(path: string, lines: unknown[]) {
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(path, { encoding: "utf8" });
    stream.on("error", reject);
    stream.on("finish", resolve);
    for (const line of lines) {
      stream.write(`${JSON.stringify(line)}\n`);
    }
    stream.end();
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
        deletedAt: null,
        isAuxiliary: false,
        book: {
          deletedAt: null,
          slug: bookSlug
        },
        chapterRef: { deletedAt: null, isNonMainText: false }
      },
      aiReviews: {
        none: {
          deletedAt: null,
          provider,
          model,
          promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
          status: { in: ["pending", "completed"] }
        }
      }
    },
    include: {
      sefariaReference: true,
      textUnit: true
    },
    orderBy: [{ confidence: "asc" }, { createdAt: "asc" }],
    take: limit
  });
}

async function submitBatch() {
  const rows = await selectRows();

  if (rows.length === 0) {
    console.log(JSON.stringify({ submitted: false, reason: "No eligible complements found." }, null, 2));
    return;
  }

  await mkdir(join(tmpdir(), "lsjs-sacks-groq-batches"), { recursive: true });
  const jsonlPath = join(tmpdir(), "lsjs-sacks-groq-batches", `sefaria-review-${Date.now()}.jsonl`);
  const requests = [];

  for (const row of rows) {
    const sefariaText = await getSourceText(row.sefariaReference.ref);
    const prompt = buildSefariaComplementReviewPrompt({
      paragraphRef: row.textUnit.ref,
      paragraphText: row.textUnit.text,
      sefariaRef: row.sefariaReference.ref,
      sefariaText,
      topic: row.topic,
      rationale: row.rationale,
      confidence: row.confidence
    });
    const body = {
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
    };
    const request = {
      provider,
      api: "batches.create",
      model,
      textSefariaComplementId: row.id,
      paragraphId: row.paragraphId,
      sefariaRef: row.sefariaReference.ref,
      maxTokens,
      responseFormat: "json_object"
    };

    requests.push({
      custom_id: row.id,
      method: "POST",
      url: "/v1/chat/completions",
      body,
      metadata: {
        prompt,
        request
      }
    });
  }

  await writeJsonl(jsonlPath, requests.map(({ metadata: _metadata, ...request }) => request));
  let file: any;
  let batch: any;

  try {
    file = await groq.files.create({
      file: Readable.from(await readFile(jsonlPath), { objectMode: false }) as any,
      purpose: "batch"
    });
    batch = await (groq.batches as any).create({
      input_file_id: file.id,
      endpoint: "/v1/chat/completions",
      completion_window: completionWindow,
      metadata: {
        job: "sefaria-complement-reviews",
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        model,
        count: String(rows.length)
      }
    });
  } catch (error: any) {
    if (error?.status === 403 || error?.code === "not_available_for_plan") {
      console.error(
        JSON.stringify(
          {
            submitted: false,
            provider,
            model,
            reason: "Groq batch is not available for the current account plan.",
            status: error.status,
            code: error.code,
            message: error.message
          },
          null,
          2
        )
      );
      return;
    }

    throw error;
  } finally {
    await unlink(jsonlPath).catch(() => undefined);
  }

  for (const item of requests) {
    await prisma.sefariaComplementAiReview.create({
      data: {
        textSefariaComplementId: item.custom_id,
        provider,
        model,
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        prompt: item.metadata.prompt,
        request: {
          ...item.metadata.request,
          batchId: batch.id,
          inputFileId: file.id,
          customId: item.custom_id,
          completionWindow
        },
        providerRequestId: batch.id,
        status: "pending"
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        submitted: true,
        batchId: batch.id,
        inputFileId: file.id,
        count: rows.length,
        status: batch.status,
        requestCounts: batch.request_counts,
        refs: rows.map((row) => ({ paragraphRef: row.textUnit.ref, sefariaRef: row.sefariaReference.ref }))
      },
      null,
      2
    )
  );
}

async function importBatch(batchIdToImport: string) {
  const batch = await (groq.batches as any).retrieve(batchIdToImport);

  if (batch.status !== "completed" || !batch.output_file_id) {
    console.log(JSON.stringify({ imported: false, batch }, null, 2));
    return false;
  }

  const content = await groq.files.content(batch.output_file_id);
  const text = await content.text();
  const results = [];

  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const output = JSON.parse(line);
    const textSefariaComplementId = output.custom_id as string;
    const pending = await prisma.sefariaComplementAiReview.findFirst({
      where: {
        textSefariaComplementId,
        provider,
        model,
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        providerRequestId: batchIdToImport,
        status: "pending",
        deletedAt: null
      },
      orderBy: { createdAt: "desc" }
    });

    if (!pending) {
      results.push({ textSefariaComplementId, status: "skipped", reason: "No active pending review row." });
      continue;
    }

    await prisma.sefariaComplementAiReview.update({
      where: { id: pending.id },
      data: { deletedAt: new Date() }
    });

    if (output.error || output.response?.status_code >= 400) {
      const failed = await recordSefariaComplementAiReview({
        textSefariaComplementId,
        provider,
        model,
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        prompt: pending.prompt,
        request: pending.request,
        response: output,
        providerRequestId: output.response?.request_id ?? batchIdToImport,
        status: "failed",
        error: output.error?.message ?? `Batch request failed with status ${output.response?.status_code}`,
        completedAt: new Date()
      });
      results.push({ textSefariaComplementId, status: failed.status, reviewId: failed.id });
      continue;
    }

    const body = output.response.body;
    const responseText = getChatCompletionText(body);
    const inputTokens = body.usage?.prompt_tokens;
    const outputTokens = body.usage?.completion_tokens;

    try {
      const parsed = ReviewSchema.parse(parseJsonObject(responseText));
      const completed = await recordSefariaComplementAiReview({
        textSefariaComplementId,
        provider,
        model,
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        prompt: pending.prompt,
        request: pending.request,
        response: body,
        responseText,
        providerRequestId: output.response.request_id ?? body.id,
        inputTokens,
        outputTokens,
        totalTokens: body.usage?.total_tokens,
        status: "completed",
        result: parsed,
        completedAt: new Date()
      });
      results.push({
        textSefariaComplementId,
        status: completed.status,
        reviewId: completed.id,
        verdict: completed.verdict,
        score: completed.score
      });
    } catch (error) {
      const failed = await recordSefariaComplementAiReview({
        textSefariaComplementId,
        provider,
        model,
        promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
        prompt: pending.prompt,
        request: pending.request,
        response: body,
        responseText,
        providerRequestId: output.response.request_id ?? body.id,
        inputTokens,
        outputTokens,
        totalTokens: body.usage?.total_tokens,
        status: "failed",
        error: error instanceof Error ? `Failed to parse review JSON: ${error.message}` : String(error),
        completedAt: new Date()
      });
      results.push({ textSefariaComplementId, status: failed.status, reviewId: failed.id });
    }
  }

  console.log(JSON.stringify({ imported: true, batchId: batch.id, results }, null, 2));
  return true;
}

async function pollBatch(batchIdToPoll: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= maxWaitMs) {
    const batch = await (groq.batches as any).retrieve(batchIdToPoll);
    console.log(
      JSON.stringify({
        batchId: batch.id,
        status: batch.status,
        requestCounts: batch.request_counts,
        outputFileId: batch.output_file_id,
        errorFileId: batch.error_file_id
      })
    );

    if (batch.status === "completed") {
      await importBatch(batchIdToPoll);
      return;
    }

    if (["failed", "expired", "cancelled", "cancelling"].includes(batch.status)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

try {
  if (mode === "submit") {
    await submitBatch();
  } else if (mode === "poll") {
    if (!batchId) {
      throw new Error("--batch-id is required for poll mode.");
    }
    await pollBatch(batchId);
  } else if (mode === "import") {
    if (!batchId) {
      throw new Error("--batch-id is required for import mode.");
    }
    await importBatch(batchId);
  } else {
    throw new Error(`Unsupported mode: ${mode}`);
  }
} finally {
  await prisma.$disconnect();
}
