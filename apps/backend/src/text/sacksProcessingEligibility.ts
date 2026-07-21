import { Prisma } from "@prisma/client";

export const SACKS_TARGET_BOOK_SLUGS = {
  home: "sefaria-the-home-we-build-together-recreating-society",
  notInGodsName: "sefaria-not-in-gods-name-confronting-religious-violence",
  radical: "sefaria-radical-then-radical-now"
} as const;

const targetBookSlugs = Object.values(SACKS_TARGET_BOOK_SLUGS);
const duplicateNotInGodsNameRefs = [
  "Not in God's Name; Confronting Religious Violence, I; Bad Faith, 3; Dualism:74",
  "Not in God's Name; Confronting Religious Violence, I; Bad Faith, 4; The Scapegoat:13"
];
const notInGodsNameHebrewIntroductionRef =
  "Not in God's Name; Confronting Religious Violence, Introduction to Hebrew Edition";
const radicalEpilogueRef = "Radical Then, Radical Now, Epilogue";
const radicalPrefaceRef = "Radical Then, Radical Now, Preface";

const activeProse = {
  deletedAt: null,
  isAuxiliary: false
} satisfies Prisma.TextUnitWhereInput;

function eligibleForBook(slug: string): Prisma.TextUnitWhereInput {
  if (slug === SACKS_TARGET_BOOK_SLUGS.radical) {
    return {
      ...activeProse,
      book: { deletedAt: null, slug },
      OR: [
        {
          chapterRef: {
            deletedAt: null,
            isNonMainText: false,
            ref: { not: radicalEpilogueRef }
          }
        },
        {
          chapterRef: { deletedAt: null, ref: radicalPrefaceRef },
          verse: { lte: 22 }
        }
      ]
    };
  }

  if (slug === SACKS_TARGET_BOOK_SLUGS.notInGodsName) {
    return {
      ...activeProse,
      book: { deletedAt: null, slug },
      ref: { notIn: duplicateNotInGodsNameRefs },
      OR: [
        { chapterRef: { deletedAt: null, isNonMainText: false } },
        {
          chapterRef: {
            deletedAt: null,
            ref: notInGodsNameHebrewIntroductionRef
          }
        }
      ]
    };
  }

  return {
    ...activeProse,
    book: { deletedAt: null, slug },
    chapterRef: { deletedAt: null, isNonMainText: false }
  };
}

/**
 * Selects prose authored by Rabbi Sacks rather than generic "main section" rows.
 * Publication readers intentionally do not use this filter: they display the full index.
 */
export function buildSacksProcessingEligibilityWhere(bookSlug?: string): Prisma.TextUnitWhereInput {
  if (bookSlug) {
    return eligibleForBook(bookSlug);
  }

  return {
    OR: [
      ...targetBookSlugs.map((slug) => eligibleForBook(slug)),
      {
        ...activeProse,
        book: {
          deletedAt: null,
          slug: { notIn: targetBookSlugs }
        },
        chapterRef: { deletedAt: null, isNonMainText: false }
      }
    ]
  };
}
