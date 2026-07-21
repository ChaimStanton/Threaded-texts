import { PrismaClient } from "@prisma/client";
import {
  buildSacksPublicationReviewWhere,
  compareSacksPublicationReviews
} from "../src/repositories/sefariaComplementReviews.js";
import {
  buildSacksProcessingEligibilityWhere,
  SACKS_TARGET_BOOK_SLUGS
} from "../src/text/sacksProcessingEligibility.js";

const prisma = new PrismaClient();
const targetBookSlugs = Object.values(SACKS_TARGET_BOOK_SLUGS);

try {
  const eligibleParagraphIds = (
    await Promise.all(
      targetBookSlugs.map((slug) =>
        prisma.textUnit.findMany({
          where: buildSacksProcessingEligibilityWhere(slug),
          select: { paragraphId: true }
        })
      )
    )
  ).flatMap((rows) => rows.map((row) => row.paragraphId));

  const ineligibleComplements = await prisma.textSefariaComplement.findMany({
    where: {
      deletedAt: null,
      textUnit: {
        book: { slug: { in: targetBookSlugs } },
        paragraphId: { notIn: eligibleParagraphIds }
      }
    },
    select: { id: true }
  });
  const reviewedComplements = await prisma.textSefariaComplement.findMany({
    where: {
      deletedAt: null,
      textUnit: { book: { slug: { in: targetBookSlugs } } }
    },
    select: { id: true }
  });
  const reviewedComplementIds = reviewedComplements.map((complement) => complement.id);
  const reviews = await prisma.sefariaComplementAiReview.findMany({
    where: {
      ...buildSacksPublicationReviewWhere(),
      textSefariaComplement: {
        deletedAt: null,
        textUnit: { book: { slug: { in: targetBookSlugs } } }
      }
    },
    select: {
      textSefariaComplementId: true,
      provider: true,
      promptVersion: true,
      status: true,
      verdict: true,
      completedAt: true,
      createdAt: true
    }
  });
  reviews.sort(compareSacksPublicationReviews);
  const currentReviewByComplement = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    if (!currentReviewByComplement.has(review.textSefariaComplementId)) {
      currentReviewByComplement.set(review.textSefariaComplementId, review);
    }
  }
  const rejectedIds = reviewedComplementIds.filter(
    (complementId) => {
      const review = currentReviewByComplement.get(complementId);
      return review?.status === "completed" && review.verdict === "reject";
    }
  );
  const complementIds = [...new Set([...ineligibleComplements.map((complement) => complement.id), ...rejectedIds])];
  const deletedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const reviews = await tx.sefariaComplementAiReview.updateMany({
      where: {
        deletedAt: null,
        textSefariaComplementId: { in: complementIds }
      },
      data: { deletedAt }
    });
    const complements = await tx.textSefariaComplement.updateMany({
      where: { id: { in: complementIds }, deletedAt: null },
      data: { deletedAt }
    });

    return {
      complements: complements.count,
      reviews: reviews.count
    };
  });

  console.log(
    JSON.stringify(
      {
        selected: {
          ineligible: ineligibleComplements.length,
          rejected: rejectedIds.length,
          unique: complementIds.length
        },
        pruned: result
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
