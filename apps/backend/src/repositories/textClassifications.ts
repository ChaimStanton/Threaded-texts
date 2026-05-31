import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export const ALLOWED_COMPLEMENT_CORPORA = ["tanach", "gemara", "mishna", "shulchan_aruch", "rambam"] as const;

export type ComplementCorpus = (typeof ALLOWED_COMPLEMENT_CORPORA)[number];

export const COMPLEMENT_CLASSIFICATION_PROMPT_VERSION = "complementary-sefaria-refs-v1";

export const COMPLEMENT_CLASSIFICATION_QUESTION =
  "Which sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam help a reader discover and understand this Rabbi Sacks paragraph?";

export function buildComplementClassificationPrompt(input: { sefariaRef: string; text: string }): Prisma.InputJsonObject {
  return {
    version: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
    question: COMPLEMENT_CLASSIFICATION_QUESTION,
    allowedCorpora: ALLOWED_COMPLEMENT_CORPORA,
    instructions: [
      "Find source-text entry points into the Rabbi Sacks paragraph's themes; do not merely keyword match.",
      "The discovery direction is from the classical source to Rabbi Sacks: a reader should be able to start with the source and then find this paragraph illuminating.",
      "Only return sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam.",
      "Use canonical Sefaria refs when possible, for example 'Pirkei Avot 2:5' or 'Genesis 1:1'.",
      "Return concise rationales grounded in the paragraph and the source."
    ],
    responseFormat: "Return only a valid JSON object matching outputSchema. Do not wrap it in markdown.",
    outputSchema: {
      complements: [
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
  providerRequestId?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
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
    if ((input.status ?? "completed") === "completed") {
      const existingClassificationRun = await tx.llmTextClassification.findFirst({
        where: {
          paragraphId: input.paragraphId,
          provider: input.provider,
          model: input.model,
          promptVersion: input.promptVersion,
          status: "completed",
          deletedAt: null
        },
        include: {
          sefariaComplements: {
            where: { deletedAt: null },
            include: { sefariaReference: true },
            orderBy: [{ rank: "asc" }, { createdAt: "asc" }]
          }
        }
      });

      if (existingClassificationRun) {
        return existingClassificationRun;
      }
    }

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
        providerRequestId: input.providerRequestId,
        inputTokens: input.inputTokens,
        cachedInputTokens: input.cachedInputTokens,
        outputTokens: input.outputTokens,
        reasoningTokens: input.reasoningTokens,
        totalTokens: input.totalTokens,
        estimatedCostUsd: input.estimatedCostUsd,
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
      sefariaReference: { deletedAt: null },
      textUnit: {
        deletedAt: null,
        isAuxiliary: false,
        chapterRef: { deletedAt: null, isNonMainText: false }
      }
    },
    include: {
      sefariaReference: true,
      classificationRun: true
    },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }]
  });
}

export async function listSefariaReferenceConnections(input: {
  query?: string;
  corpus?: ComplementCorpus;
  minConfidence?: number;
  limit?: number;
}) {
  const trimmedQuery = input.query?.trim();
  const complementWhere = {
    deletedAt: null,
    confidence: input.minConfidence === undefined ? undefined : { gte: input.minConfidence },
    textUnit: {
      deletedAt: null,
      isAuxiliary: false,
      chapterRef: { deletedAt: null, isNonMainText: false }
    }
  } satisfies Prisma.TextSefariaComplementWhereInput;

  return prisma.sefariaReference.findMany({
    where: {
      deletedAt: null,
      corpus: input.corpus,
      textComplements: {
        some: complementWhere
      },
      ...(trimmedQuery
        ? {
            OR: [
              { ref: { contains: trimmedQuery } },
              { normalizedRef: { contains: trimmedQuery } },
              { book: { contains: trimmedQuery } },
              { category: { contains: trimmedQuery } },
              {
                textComplements: {
                  some: {
                    ...complementWhere,
                    OR: [{ topic: { contains: trimmedQuery } }, { rationale: { contains: trimmedQuery } }]
                  }
                }
              }
            ]
          }
        : {})
    },
    include: {
      _count: {
        select: {
          textComplements: {
            where: complementWhere
          }
        }
      },
      textComplements: {
        where: complementWhere,
        include: {
          classificationRun: true,
          textUnit: {
            include: {
              book: true,
              chapterRef: true
            }
          }
        },
        orderBy: [{ rank: "asc" }, { confidence: "desc" }, { createdAt: "asc" }],
        take: 6
      }
    },
    orderBy: [{ ref: "asc" }],
    take: input.limit ?? 50
  });
}
