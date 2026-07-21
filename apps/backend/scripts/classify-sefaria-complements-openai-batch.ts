import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { env } from "../src/env.js";
import {
  COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
  recordLlmTextClassification
} from "../src/repositories/textClassifications.js";
import {
  buildComplementResponseBody,
  estimateCostUsd,
  parseComplementClassificationResponseText,
  toStoredComplements
} from "../src/services/sefariaComplementClassifier.js";
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

const mode = args.get("mode") ?? "submit";
const batchId = args.get("batch-id");
const limit = Number(args.get("limit") ?? 1);
const model = args.get("model") ?? env.OPENAI_COMPLEMENT_MODEL;
const language = args.get("language") ?? "en";
const bookSlug = args.get("book-slug");
const maxOutputTokens = Number(args.get("max-output-tokens") ?? env.OPENAI_COMPLEMENT_MAX_OUTPUT_TOKENS);
const pollIntervalMs = Number(args.get("poll-interval-ms") ?? 15000);
const maxWaitMs = Number(args.get("max-wait-ms") ?? 180000);

if (!env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to classify Sefaria complements.");
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

function extractResponseText(body: any) {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  const chunks: string[] = [];
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("");
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

async function submitBatch() {
  const rows = await prisma.textUnit.findMany({
    where: {
      ...buildSacksProcessingEligibilityWhere(bookSlug),
      language,
      classificationRuns: {
        none: {
          deletedAt: null,
          promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
          status: { in: ["completed", "pending"] }
        }
      }
    },
    orderBy: [{ book: { title: "asc" } }, { chapter: "asc" }, { verse: "asc" }, { paragraph: "asc" }],
    take: limit
  });

  if (rows.length === 0) {
    console.log(JSON.stringify({ submitted: false, reason: "No eligible rows found." }, null, 2));
    return;
  }

  await mkdir(join(tmpdir(), "lsjs-sacks-openai-batches"), { recursive: true });
  const jsonlPath = join(tmpdir(), "lsjs-sacks-openai-batches", `sefaria-complements-${Date.now()}.jsonl`);
  const requests = rows.map((row) => {
    const { body, prompt, request } = buildComplementResponseBody({
      sefariaRef: row.ref,
      text: row.text,
      model,
      maxOutputTokens
    });

    return {
      custom_id: row.paragraphId,
      method: "POST",
      url: "/v1/responses",
      body,
      metadata: {
        paragraphId: row.paragraphId,
        ref: row.ref,
        prompt,
        request
      }
    };
  });

  await writeJsonl(jsonlPath, requests.map(({ metadata: _metadata, ...request }) => request));
  const file = await openai.files.create({
    file: Readable.from(await readFile(jsonlPath), { objectMode: false }) as any,
    purpose: "batch"
  });
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
    metadata: {
      job: "sefaria-complements",
      promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
      model,
      count: String(rows.length)
    }
  });

  for (const item of requests) {
    await prisma.llmTextClassification.create({
      data: {
        paragraphId: item.custom_id,
        provider: "openai",
        model,
        promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
        prompt: item.metadata.prompt,
        request: {
          ...item.metadata.request,
          api: "batches.create",
          batchId: batch.id,
          inputFileId: file.id,
          customId: item.custom_id,
          batchDiscount: true
        },
        providerRequestId: batch.id,
        status: "pending"
      }
    });
  }

  await unlink(jsonlPath);
  console.log(
    JSON.stringify(
      {
        submitted: true,
        batchId: batch.id,
        inputFileId: file.id,
        count: rows.length,
        status: batch.status,
        refs: rows.map((row) => row.ref)
      },
      null,
      2
    )
  );
}

async function importBatch(batchIdToImport: string) {
  const batch = await openai.batches.retrieve(batchIdToImport);

  if (batch.status !== "completed" || !batch.output_file_id) {
    console.log(JSON.stringify({ imported: false, batch }, null, 2));
    return false;
  }

  const content = await openai.files.content(batch.output_file_id);
  const text = await content.text();
  const results = [];

  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const output = JSON.parse(line);
    const paragraphId = output.custom_id as string;
    const pending = await prisma.llmTextClassification.findFirst({
      where: {
        paragraphId,
        provider: "openai",
        model,
        promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
        providerRequestId: batchIdToImport,
        status: "pending",
        deletedAt: null
      },
      orderBy: { createdAt: "desc" }
    });

    if (!pending) {
      results.push({ paragraphId, status: "skipped", reason: "No active pending row." });
      continue;
    }

    await prisma.llmTextClassification.update({
      where: { id: pending.id },
      data: { deletedAt: new Date() }
    });

    if (output.error || output.response?.status_code >= 400) {
      const failed = await recordLlmTextClassification({
        paragraphId,
        provider: "openai",
        model,
        promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
        prompt: pending.prompt,
        request: pending.request,
        response: output,
        providerRequestId: output.response?.request_id ?? batchIdToImport,
        status: "failed",
        error: output.error?.message ?? `Batch request failed with status ${output.response?.status_code}`,
        completedAt: new Date()
      });
      results.push({ paragraphId, status: failed.status, classificationRunId: failed.id });
      continue;
    }

    const body = output.response.body;
    const responseText = extractResponseText(body);
    const inputTokens = body.usage?.input_tokens;
    const outputTokens = body.usage?.output_tokens;

    try {
      const parsed = parseComplementClassificationResponseText(responseText);
      const completed = await recordLlmTextClassification({
        paragraphId,
        provider: "openai",
        model,
        promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
        prompt: pending.prompt,
        request: pending.request,
        response: body,
        responseText,
        providerRequestId: output.response.request_id ?? body.id,
        inputTokens,
        cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens,
        outputTokens,
        reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens,
        totalTokens: body.usage?.total_tokens,
        estimatedCostUsd: estimateCostUsd({ model, inputTokens, outputTokens, batchDiscount: true }),
        completedAt: new Date(),
        complements: toStoredComplements(parsed.complements)
      });

      results.push({
        paragraphId,
        status: completed.status,
        classificationRunId: completed.id,
        complements: completed.sefariaComplements.length
      });
    } catch (error) {
      const failed = await recordLlmTextClassification({
        paragraphId,
        provider: "openai",
        model,
        promptVersion: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
        prompt: pending.prompt,
        request: pending.request,
        response: body,
        responseText,
        providerRequestId: output.response.request_id ?? body.id,
        inputTokens,
        cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens,
        outputTokens,
        reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens,
        totalTokens: body.usage?.total_tokens,
        estimatedCostUsd: estimateCostUsd({ model, inputTokens, outputTokens, batchDiscount: true }),
        status: "failed",
        error: error instanceof Error ? `Failed to parse model JSON: ${error.message}` : String(error),
        completedAt: new Date()
      });

      results.push({ paragraphId, status: failed.status, classificationRunId: failed.id });
    }
  }

  console.log(JSON.stringify({ imported: true, batchId: batch.id, results }, null, 2));
  return true;
}

async function pollBatch(batchIdToPoll: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= maxWaitMs) {
    const batch = await openai.batches.retrieve(batchIdToPoll);
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

    if (["failed", "expired", "cancelled"].includes(batch.status)) {
      await prisma.llmTextClassification.updateMany({
        where: { providerRequestId: batch.id, status: "pending", deletedAt: null },
        data: {
          status: "failed",
          error: `OpenAI batch ended with status ${batch.status}.`,
          completedAt: new Date()
        }
      });
      throw new Error(`OpenAI batch ${batch.id} ended with status ${batch.status}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`OpenAI batch ${batchIdToPoll} is still pending after ${maxWaitMs}ms.`);
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
