import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export const ALLOWED_COMPLEMENT_CORPORA = ["tanach", "gemara", "mishna", "shulchan_aruch", "rambam"] as const;

export type ComplementCorpus = (typeof ALLOWED_COMPLEMENT_CORPORA)[number];

export const COMPLEMENT_CLASSIFICATION_PROMPT_VERSION = "complementary-sefaria-refs-v1";

export const COMPLEMENT_CLASSIFICATION_QUESTION =
  "Which sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam complement this paragraph?";

export function buildComplementClassificationPrompt(input: { sefariaRef: string; text: string }): Prisma.InputJsonObject {
  return {
    version: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
    question: COMPLEMENT_CLASSIFICATION_QUESTION,
    allowedCorpora: ALLOWED_COMPLEMENT_CORPORA,
    instructions: [
      "Find sources that complement the paragraph's themes; do not merely keyword match.",
      "Only return sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam.",
      "Use canonical Sefaria refs when possible, for example 'Pirkei Avot 2:5' or 'Genesis 1:1'.",
      "Return concise rationales grounded in the paragraph and the source."
    ],
    outputSchema: {
      complements: [
        {
          ref: "string",
          corpus: "tanach | gemara | mishna | shulchan_aruch | rambam",
          topic: "string",
          rationale: "string",
          confidence: "number from 0 to 1",
          rank: "integer, 1 is best"
        }
      ]
    },
    paragraph: {
      sefariaRef: input.sefariaRef,
      text: input.text
    }
  };
}

export type SefariaComplementInput = {
  ref: string;
  corpus: ComplementCorpus;
  normalizedRef?: string;
  book?: string;
  category?: string;
  url?: string;
  topic?: string;
  rationale?: string;
  confidence?: number;
  rank?: number;
};

export type RecordLlmTextClassificationInput = {
  paragraphId: string;
  provider: string;
  model: string;
  promptVersion: string;
  prompt: Prisma.InputJsonValue;
  request: Prisma.InputJsonValue;
  response?: Prisma.InputJsonValue;
  responseText?: string;
  status?: string;
  error?: string;
  completedAt?: Date;
  complements?: SefariaComplementInput[];
};

function assertAllowedCorpus(corpus: string): asserts corpus is ComplementCorpus {
  if (!ALLOWED_COMPLEMENT_CORPORA.includes(corpus as ComplementCorpus)) {
    throw new Error(`Unsupported complement corpus: ${corpus}`);
  }
}

export async function recordLlmTextClassification(input: RecordLlmTextClassificationInput) {
  return prisma.$transaction(async (tx) => {
    const classificationRun = await tx.llmTextClassification.create({
      data: {
        paragraphId: input.paragraphId,
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        prompt: input.prompt,
        request: input.request,
        response: input.response,
        responseText: input.responseText,
        status: input.status ?? "completed",
        error: input.error,
        completedAt: input.completedAt ?? new Date()
      }
    });

    for (const complement of input.complements ?? []) {
      assertAllowedCorpus(complement.corpus);

      const sefariaReference = await tx.sefariaReference.upsert({
        where: { ref: complement.ref },
        create: {
          ref: complement.ref,
          normalizedRef: complement.normalizedRef,
          corpus: complement.corpus,
          book: complement.book,
          category: complement.category,
          url: complement.url
        },
        update: {
          normalizedRef: complement.normalizedRef,
          corpus: complement.corpus,
          book: complement.book,
          category: complement.category,
          url: complement.url,
          deletedAt: null
        }
      });

      await tx.textSefariaComplement.upsert({
        where: {
          paragraphId_sefariaReferenceId_classificationRunId: {
            paragraphId: input.paragraphId,
            sefariaReferenceId: sefariaReference.id,
            classificationRunId: classificationRun.id
          }
        },
        create: {
          paragraphId: input.paragraphId,
          sefariaReferenceId: sefariaReference.id,
          classificationRunId: classificationRun.id,
          topic: complement.topic,
          rationale: complement.rationale,
          confidence: complement.confidence,
          rank: complement.rank
        },
        update: {
          topic: complement.topic,
          rationale: complement.rationale,
          confidence: complement.confidence,
          rank: complement.rank,
          deletedAt: null
        }
      });
    }

    return tx.llmTextClassification.findUniqueOrThrow({
      where: { id: classificationRun.id },
      include: {
        sefariaComplements: {
          include: { sefariaReference: true },
          orderBy: [{ rank: "asc" }, { createdAt: "asc" }]
        }
      }
    });
  });
}

export async function listTextSefariaComplements(paragraphId: string) {
  return prisma.textSefariaComplement.findMany({
    where: {
      paragraphId,
      deletedAt: null,
      sefariaReference: { deletedAt: null }
    },
    include: {
      sefariaReference: true,
      classificationRun: true
    },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }]
  });
}
