import { PrismaClient } from "@prisma/client";
import {
  buildDryRunComplementClassificationRequest,
  classifySefariaComplements
} from "../src/services/sefariaComplementClassifier.js";

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
const dryRun = args.get("dry-run") === "true";

const rows = await prisma.textUnit.findMany({
  where: {
    paragraphId: paragraphId ? paragraphId : undefined,
    language: "en",
    isAuxiliary: false,
    deletedAt: null,
    book: { deletedAt: null },
    chapterRef: { deletedAt: null },
    classificationRuns: {
      none: {
        deletedAt: null,
        promptVersion: "complementary-sefaria-refs-v1",
        status: "completed"
      }
    }
  },
  orderBy: [{ book: { title: "asc" } }, { chapter: "asc" }, { verse: "asc" }, { paragraph: "asc" }],
  take: limit
});

const results = [];

for (const row of rows) {
  if (dryRun) {
    results.push({
      paragraphId: row.paragraphId,
      ref: row.ref,
      request: buildDryRunComplementClassificationRequest({
        sefariaRef: row.ref,
        text: row.text,
        model
      })
    });
    continue;
  }

  const classification = await classifySefariaComplements({
    paragraphId: row.paragraphId,
    sefariaRef: row.ref,
    text: row.text,
    model
  });

  results.push({
    paragraphId: row.paragraphId,
    ref: row.ref,
    classificationRunId: classification.id,
    complements: classification.sefariaComplements.map((complement) => ({
      ref: complement.sefariaReference.ref,
      corpus: complement.sefariaReference.corpus,
      topic: complement.topic,
      confidence: complement.confidence,
      rank: complement.rank
    }))
  });
}

console.log(JSON.stringify({ dryRun, requested: limit, processed: results.length, results }, null, 2));

await prisma.$disconnect();
