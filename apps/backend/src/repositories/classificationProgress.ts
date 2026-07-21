import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { buildSacksProcessingEligibilityWhere } from "../text/sacksProcessingEligibility.js";

const trackedBookSlugs = [
  "sefaria-not-in-gods-name-confronting-religious-violence",
  "sefaria-arguments-for-the-sake-of-heaven",
  "sefaria-radical-then-radical-now",
  "sefaria-the-home-we-build-together-recreating-society"
];

export type ClassificationProgressRow = {
  bookId: string;
  slug: string;
  title: string;
  eligibleParas: number;
  completedClassification: number;
  pendingClassification: number;
  stillNeedsClassification: number;
  suggestedLinks: number;
  qaReviewedLinks: number;
  linksNeedingQa: number;
};

export async function getClassificationProgress() {
  const books = await prisma.book.findMany({
    where: {
      deletedAt: null,
      slug: { in: trackedBookSlugs }
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true
    }
  });

  const rows = await Promise.all(
    books.map(async (book) => {
      const eligibleWhere = buildSacksProcessingEligibilityWhere(book.slug);
      const textUnitWhere = {
        ...eligibleWhere,
        bookId: book.id
      } satisfies Prisma.TextUnitWhereInput;

      const [
        eligibleParas,
        completedClassification,
        pendingClassification,
        suggestedLinks,
        qaReviewedLinks
      ] = await Promise.all([
        prisma.textUnit.count({ where: textUnitWhere }),
        prisma.textUnit.count({
          where: {
            ...textUnitWhere,
            classificationRuns: {
              some: {
                deletedAt: null,
                promptVersion: "complementary-sefaria-refs-v1",
                status: "completed"
              }
            }
          }
        }),
        prisma.textUnit.count({
          where: {
            ...textUnitWhere,
            classificationRuns: {
              some: {
                deletedAt: null,
                promptVersion: "complementary-sefaria-refs-v1",
                status: "pending"
              }
            }
          }
        }),
        prisma.textSefariaComplement.count({
          where: {
            deletedAt: null,
            textUnit: textUnitWhere
          }
        }),
        prisma.textSefariaComplement.count({
          where: {
            deletedAt: null,
            textUnit: textUnitWhere,
            aiReviews: {
              some: {
                deletedAt: null
              }
            }
          }
        })
      ]);

      return {
        bookId: book.id,
        slug: book.slug,
        title: book.title,
        eligibleParas,
        completedClassification,
        pendingClassification,
        stillNeedsClassification: Math.max(eligibleParas - completedClassification - pendingClassification, 0),
        suggestedLinks,
        qaReviewedLinks,
        linksNeedingQa: Math.max(suggestedLinks - qaReviewedLinks, 0)
      } satisfies ClassificationProgressRow;
    })
  );

  return rows.sort((left, right) => {
    const leftNeedsWork = left.stillNeedsClassification + left.linksNeedingQa;
    const rightNeedsWork = right.stillNeedsClassification + right.linksNeedingQa;
    return rightNeedsWork - leftNeedsWork || left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}
