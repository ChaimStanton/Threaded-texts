import { PrismaClient } from "@prisma/client";
import {
  buildDryRunComplementClassificationRequest,
  classifySefariaComplements,
  classifySefariaComplementsBatch
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

const limit = Number(args.get("limit") ?? 1);
const model = args.get("model");
const paragraphId = args.get("paragraph-id");
const bookId = args.get("book-id");
const bookSlug = args.get("book-slug");
const language = args.get("language") ?? "en";
const batchSize = Number(args.get("batch-size") ?? 1);
const dryRun = args.get("dry-run") === "true";

const rows = await prisma.textUnit.findMany({
  where: {
    ...buildSacksProcessingEligibilityWhere(bookSlug),
    paragraphId: paragraphId ? paragraphId : undefined,
    language,
    bookId: bookId ? bookId : undefined,
    classificationRuns: {
      none: {
        deletedAt: null,
        promptVersion: "complementary-sefaria-refs-v1",
        status: { in: ["completed", "pending"] }
      }
    }
  },
  orderBy: [{ book: { title: "asc" } }, { chapter: "asc" }, { verse: "asc" }, { paragraph: "asc" }],
  take: limit
});

const results = [];

for (let index = 0; index < rows.length; index += batchSize) {
  const batch = rows.slice(index, index + batchSize);

  if (dryRun) {
    for (const row of batch) {
      results.push({
        paragraphId: row.paragraphId,
        ref: row.ref,
        request: buildDryRunComplementClassificationRequest({
          sefariaRef: row.ref,
          text: row.text,
          model
        })
      });
    }
    continue;
  }

  const classifications =
    batch.length === 1
      ? [
          await classifySefariaComplements({
            paragraphId: batch[0].paragraphId,
            sefariaRef: batch[0].ref,
            text: batch[0].text,
            model
          })
        ]
      : await classifySefariaComplementsBatch(
          batch.map((row) => ({
            paragraphId: row.paragraphId,
            sefariaRef: row.ref,
            text: row.text
          })),
          { model }
        );

  for (const classification of classifications) {
    const row = batch.find((item) => item.paragraphId === classification.paragraphId);

    results.push({
      paragraphId: classification.paragraphId,
      ref: row?.ref,
      classificationRunId: classification.id,
      status: classification.status,
      complements: classification.sefariaComplements.map((complement) => ({
        ref: complement.sefariaReference.ref,
        corpus: complement.sefariaReference.corpus,
        topic: complement.topic,
        confidence: complement.confidence,
        rank: complement.rank
      }))
    });
  }
}

console.log(JSON.stringify({ dryRun, requested: limit, batchSize, processed: results.length, results }, null, 2));

await prisma.$disconnect();
