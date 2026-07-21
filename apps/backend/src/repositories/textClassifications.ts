import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { buildSacksProcessingEligibilityWhere } from "../text/sacksProcessingEligibility.js";

export const ALLOWED_COMPLEMENT_CORPORA = ["tanach", "gemara", "mishna", "shulchan_aruch", "rambam"] as const;

export type ComplementCorpus = (typeof ALLOWED_COMPLEMENT_CORPORA)[number];
export type ComplementReviewOutcome = "all" | "accept" | "borderline" | "reject" | "pending" | "failed" | "unreviewed";

export const COMPLEMENT_CLASSIFICATION_PROMPT_VERSION = "complementary-sefaria-refs-v1";

export const COMPLEMENT_CLASSIFICATION_QUESTION =
  "Which sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam help a reader discover and understand this Rabbi Sacks paragraph?";

export function buildComplementClassificationPrompt(input: { sefariaRef: string; text: string }): Prisma.InputJsonObject {
  return {
    version: COMPLEMENT_CLASSIFICATION_PROMPT_VERSION,
    question: COMPLEMENT_CLASSIFICATION_QUESTION,
    allowedCorpora: ALLOWED_COMPLEMENT_CORPORA,
    instructions: [
      "Return zero complements when the paragraph is too short, transitional, historical-only, or lacks a strong classical source hook.",
      "Return at most three complements.",
      "Find source-text entry points into the Rabbi Sacks paragraph's themes; do not merely keyword match.",
      "The discovery direction is from the classical source to Rabbi Sacks: a reader should be able to start with the source and then find this paragraph illuminating.",
      "Require a concrete hook: a shared legal principle, biblical verse, covenantal idea, moral problem, or explicit source cited by the paragraph.",
      "Do not return generic mood links such as 'questioning', 'uncertainty', 'teaching', or 'exile' unless the source itself addresses the same specific problem.",
      "Do not use a source merely because it contains a matching word, name, or label; the source must develop the idea the paragraph is using.",
      "For education/transmission paragraphs, prefer sources about teaching, memory, covenant, or public education over generic verses about children as blessing or legacy.",
      "Prefer explicit refs quoted or footnoted in the paragraph when they are inside the allowed corpora.",
      "Only return sources from Tanach, Gemara, Mishnah, Shulchan Aruch, or Rambam.",
      "Use canonical Sefaria refs when possible, for example 'Pirkei Avot 2:5' or 'Genesis 1:1'.",
      "For Rambam/Mishneh Torah refs, use Sefaria's title form without a 'Rambam,' prefix, for example 'Mishneh Torah, Repentance 5:1'.",
      "Use the tightest relevant Sefaria ref available, including segment refs for Talmud when possible.",
      "For the two travelers with one jug of water / 'your life takes precedence' case, use 'Bava Metzia 62a:2', not 'Bava Metzia 62a:13'.",
      "For 'כל ישראל ערבים זה בזה' / mutual responsibility, use 'Shevuot 39a:22' when citing Shevuot; do not use 'Shevuot 39a:6'.",
      "Do not use Shevuot 39a:22 for general connectedness, peoplehood, or community; use it only when the paragraph is specifically about mutual legal or moral responsibility.",
      "For the idea that all people are stamped from Adam yet no two are alike, use 'Mishnah Sanhedrin 4:5', not 'Sanhedrin 38a'.",
      "Do not use Mishnah Sanhedrin 4:5 for general individuality or contribution to a larger story; use it only for unique human dignity from a common human origin.",
      "For Israel's enduring nationhood compared to the fixed laws of sun, moon, and stars, use 'Jeremiah 31:35-36', not 'Jeremiah 31:34-36'.",
      "Do not overuse anchor verses. Esther 3:8 is appropriate only when the paragraph is specifically about Jews as a scattered/distinct people whose laws make them politically suspect. Leviticus 26:44 is appropriate only when the paragraph is specifically about covenantal survival despite exile/enemies.",
      "A useful complement should help a teacher frame a source-based discussion, not merely provide a vague thematic echo.",
      "Order returned complements by educational usefulness and closeness of fit; rank 1 should be the strongest source, and confidence should generally descend with rank.",
      "Confidence must be calibrated: 0.85-1.0 for direct quotation/citation or a close conceptual match, 0.65-0.84 for a strong but indirect match. Do not return plausible-but-weak matches below 0.65.",
      "Return concise rationales grounded in the paragraph and the source."
    ],
    responseFormat: "Return only a valid JSON object matching outputSchema. Do not wrap it in markdown.",
    outputSchema: {
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
        ...buildSacksProcessingEligibilityWhere()
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
  reviewOutcome?: ComplementReviewOutcome;
  limit?: number;
}) {
  const trimmedQuery = input.query?.trim();
  const complementWhere = {
    deletedAt: null,
    confidence: input.minConfidence === undefined ? undefined : { gte: input.minConfidence },
    textUnit: {
      ...buildSacksProcessingEligibilityWhere()
    }
  } satisfies Prisma.TextSefariaComplementWhereInput;

  const sources = await prisma.sefariaReference.findMany({
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
          aiReviews: {
            where: { deletedAt: null },
            orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
            take: 1
          },
          textUnit: {
            include: {
              book: true,
              chapterRef: true
            }
          }
        },
        orderBy: [{ rank: "asc" }, { confidence: "desc" }, { createdAt: "asc" }],
        ...(input.reviewOutcome && input.reviewOutcome !== "all" ? {} : { take: 6 })
      }
    },
    orderBy: [{ ref: "asc" }]
  });

  const reviewFilteredSources = sources
    .map((source) => {
      const passages = source.textComplements
        .filter((passage) => matchesComplementReviewOutcome(passage.aiReviews[0], input.reviewOutcome))
        .slice(0, 6);

      return {
        ...source,
        textComplements: passages,
        _count: {
          ...source._count,
          textComplements: passages.length
        }
      };
    })
    .filter((source) => source.textComplements.length > 0);

  return reviewFilteredSources.slice(0, input.limit ?? 50);
}

function matchesComplementReviewOutcome(
  review: { status: string; verdict: string | null } | undefined,
  reviewOutcome?: ComplementReviewOutcome
) {
  if (!reviewOutcome || reviewOutcome === "all") {
    return true;
  }

  if (reviewOutcome === "unreviewed") {
    return !review;
  }

  if (!review) {
    return false;
  }

  if (reviewOutcome === "pending" || reviewOutcome === "failed") {
    return review.status === reviewOutcome;
  }

  return review.verdict === reviewOutcome;
}
