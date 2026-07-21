import { PrismaClient } from "@prisma/client";
import {
  buildSacksPublicationReviewWhere,
  compareSacksPublicationReviews
} from "../src/repositories/sefariaComplementReviews.js";
import { getSefariaText } from "../src/sefaria/client.js";
import {
  buildSacksProcessingEligibilityWhere,
  SACKS_TARGET_BOOK_SLUGS
} from "../src/text/sacksProcessingEligibility.js";

const prisma = new PrismaClient();
const verifyLiveRefs = process.argv.includes("--verify-live-refs");
const expected = {
  [SACKS_TARGET_BOOK_SLUGS.notInGodsName]: { chapters: 19, segments: 1183, eligible: 910 },
  [SACKS_TARGET_BOOK_SLUGS.radical]: { chapters: 18, segments: 600, eligible: 552 },
  [SACKS_TARGET_BOOK_SLUGS.home]: { chapters: 23, segments: 1045, eligible: 961 }
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const report = [];
  const activeSefariaRefs = new Set<string>();

  for (const [slug, expectedCounts] of Object.entries(expected)) {
    const book = await prisma.book.findUnique({
      where: { slug },
      include: {
        chapters: {
          where: { deletedAt: null },
          orderBy: { number: "asc" },
          include: {
            textUnits: {
              where: { deletedAt: null, language: "he" },
              orderBy: [{ verse: "asc" }, { paragraph: "asc" }]
            }
          }
        }
      }
    });

    assert(book && !book.deletedAt, `Missing active publication book: ${slug}`);
    assert(book.heTitle?.trim(), `Missing Hebrew title: ${slug}`);
    assert(book.chapters.length === expectedCounts.chapters, `Unexpected chapter count for ${slug}`);
    assert(
      book.chapters.every((chapter) => chapter.heTitle?.trim()),
      `Publication index contains a section without a Hebrew title in ${slug}`
    );
    assert(
      book.chapters.every((chapter) => chapter.textUnits.length > 0),
      `Publication index contains an empty Hebrew section in ${slug}`
    );
    const textUnits = book.chapters.flatMap((chapter) => chapter.textUnits);
    assert(textUnits.length === expectedCounts.segments, `Unexpected Hebrew segment count for ${slug}`);
    assert(textUnits.every((row) => row.text.trim()), `Blank Hebrew segment found in ${slug}`);
    assert(
      book.chapters.every((chapter, index) => chapter.number === index + 1),
      `Non-contiguous publication index in ${slug}`
    );

    const eligibility = buildSacksProcessingEligibilityWhere(slug);
    const eligibleParagraphIds = (
      await prisma.textUnit.findMany({
        where: { ...eligibility, language: "he" },
        select: { paragraphId: true }
      })
    ).map((row) => row.paragraphId);
    assert(eligibleParagraphIds.length === expectedCounts.eligible, `Unexpected eligible count for ${slug}`);

    const complements = await prisma.textSefariaComplement.findMany({
      where: {
        deletedAt: null,
        textUnit: { book: { slug } }
      },
      select: {
        id: true,
        paragraphId: true,
        sefariaReferenceId: true,
        confidence: true,
        sefariaReference: { select: { ref: true, deletedAt: true } },
        aiReviews: {
          where: buildSacksPublicationReviewWhere(),
          select: {
            provider: true,
            promptVersion: true,
            verdict: true,
            status: true,
            completedAt: true,
            createdAt: true
          }
        }
      }
    });
    const eligibleSet = new Set(eligibleParagraphIds);
    const duplicateKeys = new Set<string>();
    const seenKeys = new Set<string>();

    for (const complement of complements) {
      activeSefariaRefs.add(complement.sefariaReference.ref);
      assert(eligibleSet.has(complement.paragraphId), `Ineligible active complement in ${slug}: ${complement.id}`);
      assert(
        complement.confidence !== null && complement.confidence >= 0.65,
        `Sub-threshold active complement in ${slug}: ${complement.id}`
      );
      assert(
        !complement.sefariaReference.deletedAt && complement.sefariaReference.ref.trim(),
        `Invalid active Sefaria reference in ${slug}: ${complement.id}`
      );
      const key = `${complement.paragraphId}:${complement.sefariaReferenceId}`;
      if (seenKeys.has(key)) duplicateKeys.add(key);
      seenKeys.add(key);
    }

    assert(duplicateKeys.size === 0, `Duplicate active paragraph/source pairs in ${slug}: ${duplicateKeys.size}`);
    const latestReviews = complements.map((row) =>
      row.aiReviews.sort(compareSacksPublicationReviews)[0]
    );
    const qaAccepted = latestReviews.filter(
      (review) => review?.status === "completed" && review.verdict === "accept"
    ).length;
    const qaRejected = latestReviews.filter(
      (review) => review?.status === "completed" && review.verdict === "reject"
    ).length;
    const qaBorderline = latestReviews.filter(
      (review) => review?.status === "completed" && review.verdict === "borderline"
    ).length;
    const qaCompleted = latestReviews.filter((review) => review?.status === "completed").length;
    const qaPending = latestReviews.filter((review) => review?.status === "pending").length;
    const qaFailed = latestReviews.filter((review) => review?.status === "failed").length;
    const qaUnreviewed = latestReviews.filter((review) => !review).length;
    const qaByReviewer = Object.fromEntries(
      [...new Set(latestReviews.filter(Boolean).map((review) => `${review.provider}:${review.promptVersion}`))].map(
        (reviewer) => [
          reviewer,
          latestReviews.filter((review) => review && `${review.provider}:${review.promptVersion}` === reviewer).length
        ]
      )
    );

    assert(qaCompleted === complements.length, `Incomplete current QA coverage in ${slug}`);
    assert(qaRejected === 0, `Rejected complements remain active in ${slug}: ${qaRejected}`);
    assert(qaBorderline === 0, `Borderline complements remain active in ${slug}: ${qaBorderline}`);
    assert(qaAccepted === complements.length, `Not every active complement is accepted in ${slug}`);

    report.push({
      slug,
      title: book.title,
      chapters: book.chapters.length,
      HebrewSegments: textUnits.length,
      eligibleParagraphs: eligibleParagraphIds.length,
      activeComplements: complements.length,
      qa: {
        completed: qaCompleted,
        pending: qaPending,
        failed: qaFailed,
        unreviewed: qaUnreviewed,
        accepted: qaAccepted,
        borderline: qaBorderline,
        rejected: qaRejected,
        byReviewer: qaByReviewer
      }
    });
  }

  const liveSefariaReferences = verifyLiveRefs
    ? await verifySefariaReferences([...activeSefariaRefs])
    : { checked: 0, skipped: activeSefariaRefs.size, invalid: [] as string[] };
  assert(liveSefariaReferences.invalid.length === 0, `Invalid live Sefaria refs: ${liveSefariaReferences.invalid.join(", ")}`);

  console.log(JSON.stringify({ publicationReady: true, liveSefariaReferences, books: report }, null, 2));
} finally {
  await prisma.$disconnect();
}

async function verifySefariaReferences(refs: string[]) {
  const invalid: string[] = [];
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(2, refs.length) }, async () => {
    while (nextIndex < refs.length) {
      const ref = refs[nextIndex++];
      if (!(await hasLiveSefariaText(ref))) invalid.push(ref);
    }
  });

  await Promise.all(workers);
  return { checked: refs.length, skipped: 0, invalid };
}

async function hasLiveSefariaText(ref: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await getSefariaText(ref);
      return hasText(response.text) || hasText(response.he);
    } catch {
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }

  return false;
}

function hasText(value: string | string[] | undefined): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  return Array.isArray(value) && value.some((item) => hasText(item as string | string[]));
}
