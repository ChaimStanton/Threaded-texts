import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
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
import {
  buildSacksProcessingEligibilityWhere,
  SACKS_TARGET_BOOK_SLUGS
} from "../src/text/sacksProcessingEligibility.js";

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
const limit = Number(args.get("limit") ?? 100);
const model = args.get("model") ?? env.TOGETHER_SEFARIA_REVIEW_MODEL;
const provider = "together";
const bookSlug = args.get("book-slug");
const minConfidence = args.has("min-confidence") ? Number(args.get("min-confidence")) : undefined;
const maxConfidence = args.has("max-confidence") ? Number(args.get("max-confidence")) : undefined;
const maxTokens = Number(args.get("max-tokens") ?? 600);
const pollIntervalMs = Number(args.get("poll-interval-ms") ?? 30000);
const maxWaitMs = Number(args.get("max-wait-ms") ?? 300000);

if (!env.TOGETHER_API_KEY) {
  throw new Error("TOGETHER_API_KEY is required to review Sefaria complements with Together batch.");
}

const ReviewSchema = z.object({
  verdict: z.enum(SEFARIA_COMPLEMENT_REVIEW_VERDICTS),
  score: z.number().int().min(0).max(4),
  issueTags: z.array(z.string()).default([]),
  rationale: z.string().min(1),
  suggestedAction: z.string().nullable().optional(),
  suggestedRef: z.string().nullable().optional()
});

function estimateCostUsd(inputTokens?: number, outputTokens?: number) {
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  if (model === "meta-llama/Llama-3.3-70B-Instruct-Turbo") {
    return ((inputTokens + outputTokens) / 1_000_000) * 0.52;
  }

  return undefined;
}

function authHeaders(extra?: HeadersInit) {
  return {
    Authorization: `Bearer ${env.TOGETHER_API_KEY}`,
    ...extra
  };
}

async function togetherJson(path: string, init?: RequestInit) {
  const response = await fetch(`${env.TOGETHER_BASE_URL}${path}`, {
    ...init,
    headers: authHeaders(init?.headers)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Together API ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function togetherText(path: string) {
  const response = await fetch(`${env.TOGETHER_BASE_URL}${path}`, {
    headers: authHeaders()
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Together API ${response.status}: ${text}`);
  }

  return text;
}

async function uploadFile(path: string) {
  const form = new FormData();
  const bytes = await readFile(path);
  form.append("purpose", "batch-api");
  form.append("file_name", basename(path));
  form.append("file", new Blob([bytes], { type: "application/jsonl" }), basename(path));

  return togetherJson("/files/upload", {
    method: "POST",
    body: form
  });
}

async function createBatch(inputFileId: string) {
  return togetherJson("/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_file_id: inputFileId,
      endpoint: "/v1/chat/completions"
    })
  });
}

async function retrieveBatch(id: string) {
  return togetherJson(`/batches/${encodeURIComponent(id)}`);
}

function getBatchObject(response: any) {
  return response?.job ?? response;
}

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
    throw new Error(`Together batch response did not include choices[0].message.content: ${JSON.stringify(response)}`);
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
        ...buildSacksProcessingEligibilityWhere(bookSlug),
        ...(bookSlug
          ? {}
          : {
              book: {
                deletedAt: null,
                slug: { in: Object.values(SACKS_TARGET_BOOK_SLUGS) }
              }
            })
      },
      aiReviews: {
        none: {
          deletedAt: null,
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

async function submitBatch() {
  const rows = await selectRows();

  if (rows.length === 0) {
    console.log(JSON.stringify({ submitted: false, reason: "No eligible complements found." }, null, 2));
    return;
  }

  await mkdir(join(tmpdir(), "lsjs-sacks-together-batches"), { recursive: true });
  const jsonlPath = join(tmpdir(), "lsjs-sacks-together-batches", `sefaria-review-${Date.now()}.jsonl`);
  const requests = [];

  for (const row of rows) {
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
    file = await uploadFile(jsonlPath);
    batch = getBatchObject(await createBatch(file.id));
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
          customId: item.custom_id
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
        progress: batch.progress,
        outputFileId: batch.output_file_id,
        errorFileId: batch.error_file_id,
        refs: rows.map((row) => ({ paragraphRef: row.textUnit.ref, sefariaRef: row.sefariaReference.ref }))
      },
      null,
      2
    )
  );
}

async function recordFailure(textSefariaComplementId: string, pending: any, output: any, message: string) {
  const failed = await recordSefariaComplementAiReview({
    textSefariaComplementId,
    provider,
    model,
    promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
    prompt: pending.prompt,
    request: pending.request,
    response: output,
    providerRequestId: output.response?.request_id ?? output.id ?? pending.providerRequestId,
    status: "failed",
    error: message,
    completedAt: new Date()
  });
  return { textSefariaComplementId, status: failed.status, reviewId: failed.id };
}

async function importOutputLine(output: any) {
  const textSefariaComplementId = output.custom_id as string;
  const pending = await prisma.sefariaComplementAiReview.findFirst({
    where: {
      textSefariaComplementId,
      provider,
      model,
      promptVersion: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
      providerRequestId: batchId,
      status: "pending",
      deletedAt: null
    },
    orderBy: { createdAt: "desc" }
  });

  if (!pending) {
    return { textSefariaComplementId, status: "skipped", reason: "No active pending review row." };
  }

  await prisma.sefariaComplementAiReview.update({
    where: { id: pending.id },
    data: { deletedAt: new Date() }
  });

  if (output.error || output.response?.status_code >= 400) {
    return recordFailure(
      textSefariaComplementId,
      pending,
      output,
      output.error?.message ?? `Batch request failed with status ${output.response?.status_code}`
    );
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
      estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
      status: "completed",
      result: parsed,
      completedAt: new Date()
    });
    return {
      textSefariaComplementId,
      status: completed.status,
      reviewId: completed.id,
      verdict: completed.verdict,
      score: completed.score
    };
  } catch (error) {
    return recordFailure(
      textSefariaComplementId,
      pending,
      output,
      error instanceof Error ? `Failed to parse review JSON: ${error.message}` : String(error)
    );
  }
}

async function importBatch(batchIdToImport: string) {
  const batch = getBatchObject(await retrieveBatch(batchIdToImport));
  const terminalStatuses = ["COMPLETED", "FAILED", "EXPIRED", "CANCELLED"];

  if (!terminalStatuses.includes(batch.status)) {
    console.log(JSON.stringify({ imported: false, batch }, null, 2));
    return false;
  }

  const results = [];
  if (batch.output_file_id) {
    const outputText = await togetherText(`/files/${encodeURIComponent(batch.output_file_id)}/content`);

    for (const line of outputText.split(/\r?\n/).filter(Boolean)) {
      results.push(await importOutputLine(JSON.parse(line)));
    }
  }

  if (batch.error_file_id) {
    const errorText = await togetherText(`/files/${encodeURIComponent(batch.error_file_id)}/content`);

    for (const line of errorText.split(/\r?\n/).filter(Boolean)) {
      results.push(await importOutputLine(JSON.parse(line)));
    }
  }

  const residual = await prisma.sefariaComplementAiReview.updateMany({
    where: { providerRequestId: batch.id, status: "pending", deletedAt: null },
    data: {
      status: "failed",
      error: `Together batch ended with status ${batch.status} without an imported output line.`,
      completedAt: new Date()
    }
  });

  console.log(
    JSON.stringify(
      { imported: true, batchId: batch.id, terminalStatus: batch.status, residualFailed: residual.count, results },
      null,
      2
    )
  );
  return true;
}

async function pollBatch(batchIdToPoll: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= maxWaitMs) {
    const batch = getBatchObject(await retrieveBatch(batchIdToPoll));
    console.log(
      JSON.stringify({
        batchId: batch.id,
        status: batch.status,
        progress: batch.progress,
        outputFileId: batch.output_file_id,
        errorFileId: batch.error_file_id
      })
    );

    if (batch.status === "COMPLETED") {
      await importBatch(batchIdToPoll);
      return;
    }

    if (["FAILED", "EXPIRED", "CANCELLED"].includes(batch.status)) {
      await importBatch(batchIdToPoll);
      throw new Error(`Together batch ${batch.id} ended with status ${batch.status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Together batch ${batchIdToPoll} is still pending after ${maxWaitMs}ms.`);
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
