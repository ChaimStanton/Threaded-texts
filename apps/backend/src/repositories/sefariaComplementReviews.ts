import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export const SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION = "sefaria-complement-review-v3";
export const SEFARIA_COMPLEMENT_ACCEPTED_REVIEW_PROMPT_VERSIONS = [
  "sefaria-complement-review-v2",
  SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION
] as const;
export const SACKS_PUBLICATION_AUDIT_PROVIDER = "codex";
export const SACKS_PUBLICATION_AUDIT_MODEL = "manual-sefaria-audit";
export const SACKS_PUBLICATION_AUDIT_PROMPT_VERSION = "sacks-publication-codex-audit-v1";

export const SEFARIA_COMPLEMENT_REVIEW_VERDICTS = ["accept", "borderline", "reject"] as const;

export type SefariaComplementReviewVerdict = (typeof SEFARIA_COMPLEMENT_REVIEW_VERDICTS)[number];

export type SefariaComplementReviewResult = {
  verdict: SefariaComplementReviewVerdict;
  score: number;
  issueTags: string[];
  rationale: string;
  suggestedAction?: string | null;
  suggestedRef?: string | null;
};

export function buildSefariaComplementReviewPrompt(input: {
  bookTitle?: string | null;
  chapterRef?: string | null;
  chapterTitle?: string | null;
  paragraphRef: string;
  paragraphText: string;
  previousParagraphRef?: string | null;
  previousParagraphText?: string | null;
  nextParagraphRef?: string | null;
  nextParagraphText?: string | null;
  sefariaRef: string;
  sefariaText?: string;
  topic?: string | null;
  rationale?: string | null;
  confidence?: number | null;
}) {
  return {
    version: SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION,
    task:
      "Review whether this proposed classical Sefaria source is a good complement for the Rabbi Sacks paragraph.",
    reviewUnit:
      "One row links a Rabbi Sacks paragraph to one proposed Sefaria source. Judge the row, not the book as a whole.",
    rubric: {
      score0: "Reject: wrong source, unavailable source text, generic keyword match, or misleading thematic echo.",
      score1: "Weak: some overlap exists, but it is too broad or not useful for teaching/discovery.",
      score2: "Borderline: plausible classroom bridge, but indirect or incomplete.",
      score3: "Good: clear conceptual or textual hook; useful as a source-based discussion entry point.",
      score4: "Excellent: direct quotation/citation, tight legal/moral principle, or unusually strong conceptual match."
    },
    verdictMapping: {
      accept: "Use for score 3 or 4.",
      borderline: "Use for score 2 when a human should decide.",
      reject: "Use for score 0 or 1."
    },
    issueTagsAllowed: [
      "bad_ref",
      "missing_source_text",
      "too_broad",
      "keyword_only",
      "weak_thematic_echo",
      "wrong_corpus",
      "wrong_direction",
      "overused_anchor",
      "good_direct_citation",
      "good_conceptual_match",
      "good_teaching_entry"
    ],
    instructions: [
      "Be stricter than the original recommender.",
      "A good complement should help a reader move from the classical source into the target Rabbi Sacks paragraph.",
      "A source entry point does not need to use the target paragraph's modern terminology.",
      "Accept a source when its exact text supplies the legal, moral, covenantal, anthropological, or theological principle identified in the rationale and that principle supports a central claim in the target paragraph.",
      "Use the previous and next Sacks paragraphs only to understand local argument flow; judge the target paragraph's proposed source, not the neighboring paragraphs.",
      "Reject matches that share only a word, mood, named place, generic theme, or fit only the neighboring context.",
      "Prefer exact source fit over famous or frequently used anchors.",
      "A right book or daf with the wrong segment is a bad_ref: reject it and suggest the exact segment when possible.",
      "Do not reject a source merely for being broad when it directly grounds a central clause in the target paragraph and is useful as a teaching entry point.",
      "If the Sefaria source text is missing, use the ref, topic, and rationale cautiously; mark missing_source_text.",
      "Return only JSON matching outputSchema."
    ],
    outputSchema: {
      verdict: "accept | borderline | reject",
      score: "integer 0 to 4",
      issueTags: "array of strings from issueTagsAllowed",
      rationale: "one concise sentence explaining the judgment",
      suggestedAction: "optional short action, e.g. keep, hide, human_review, replace_ref",
      suggestedRef: "optional tighter replacement Sefaria ref"
    },
    candidate: {
      bookTitle: input.bookTitle ?? null,
      chapterRef: input.chapterRef ?? null,
      chapterTitle: input.chapterTitle ?? null,
      previousParagraph:
        input.previousParagraphRef || input.previousParagraphText
          ? {
              ref: input.previousParagraphRef ?? null,
              text: input.previousParagraphText ?? null
            }
          : null,
      paragraphRef: input.paragraphRef,
      paragraphText: input.paragraphText,
      nextParagraph:
        input.nextParagraphRef || input.nextParagraphText
          ? {
              ref: input.nextParagraphRef ?? null,
              text: input.nextParagraphText ?? null
            }
          : null,
      sefariaRef: input.sefariaRef,
      sefariaText: input.sefariaText ?? null,
      originalTopic: input.topic ?? null,
      originalRationale: input.rationale ?? null,
      originalConfidence: input.confidence ?? null
    }
  } satisfies Prisma.InputJsonObject;
}

export function buildSacksPublicationReviewWhere(): Prisma.SefariaComplementAiReviewWhereInput {
  return {
    deletedAt: null,
    OR: [
      {
        provider: "together",
        promptVersion: { in: [...SEFARIA_COMPLEMENT_ACCEPTED_REVIEW_PROMPT_VERSIONS] }
      },
      {
        provider: SACKS_PUBLICATION_AUDIT_PROVIDER,
        model: SACKS_PUBLICATION_AUDIT_MODEL,
        promptVersion: SACKS_PUBLICATION_AUDIT_PROMPT_VERSION
      }
    ]
  };
}

type PublicationReview = {
  provider: string;
  promptVersion: string;
  completedAt: Date | null;
  createdAt: Date;
};

export function compareSacksPublicationReviews(left: PublicationReview, right: PublicationReview) {
  const precedence = (review: PublicationReview) => {
    if (
      review.provider === SACKS_PUBLICATION_AUDIT_PROVIDER &&
      review.promptVersion === SACKS_PUBLICATION_AUDIT_PROMPT_VERSION
    ) {
      return 100;
    }
    if (review.promptVersion === SEFARIA_COMPLEMENT_REVIEW_PROMPT_VERSION) return 30;
    if (review.promptVersion === "sefaria-complement-review-v2") return 20;
    return 0;
  };

  return (
    precedence(right) - precedence(left) ||
    (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0) ||
    right.createdAt.getTime() - left.createdAt.getTime()
  );
}

export async function recordSefariaComplementAiReview(input: {
  textSefariaComplementId: string;
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
  result?: SefariaComplementReviewResult;
  completedAt?: Date;
}) {
  return prisma.sefariaComplementAiReview.create({
    data: {
      textSefariaComplementId: input.textSefariaComplementId,
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
      verdict: input.result?.verdict,
      score: input.result?.score,
      issueTags: input.result?.issueTags,
      rationale: input.result?.rationale,
      suggestedAction: input.result?.suggestedAction ?? undefined,
      suggestedRef: input.result?.suggestedRef ?? undefined,
      completedAt: input.completedAt ?? new Date()
    }
  });
}
