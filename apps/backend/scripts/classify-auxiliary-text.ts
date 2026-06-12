import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

type TextRow = {
  paragraphId: string;
  ref: string;
  text: string;
  paragraph: number;
  book: {
    title: string;
  };
};

type Candidate = {
  paragraphId: string;
  bookTitle: string;
  ref: string;
  reasons: string[];
  preview: string;
};

const prisma = new PrismaClient();
const outputPath = "../../internal-docs/auxiliary-text-candidates.json";

const stripTags = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const exactAuxiliaryText = new Set([
  "Jonathan Sacks",
  "Matthew Miller",
  "Koren Jerusalem",
  "London",
  "Jerusalem",
  "New York"
]);

const hebrewMonths =
  "Tishrei|Cheshvan|Kislev|Tevet|Shevat|Adar|Nisan|Iyar|Sivan|Tammuz|Av|Elul";
const gregorianMonths =
  "January|February|March|April|May|June|July|August|September|October|November|December";

function classify(row: TextRow) {
  const reasons: string[] = [];
  const plain = stripTags(row.text);
  const wordCount = plain.split(/\s+/).filter(Boolean).length;
  const isHtmlOnlyHeading =
    /^<(b|strong|big|h[1-6])[\s>]/i.test(row.text.trim()) &&
    row.text.replace(/<[^>]+>/g, "").trim() === plain &&
    plain.length <= 140;

  if (/Suggestions for Further Reading|Bibliography|Index|Glossary|Notes\b/i.test(row.ref)) {
    reasons.push("reference_or_back_matter_section");
  }

  if (isHtmlOnlyHeading) {
    reasons.push("heading_markup");
  }

  if (/^\s*(☛\s*)?<b>REFLECT<\/b>/i.test(row.text) || /QUESTIONS TO ASK/i.test(plain)) {
    reasons.push("study_prompt");
  }

  if (exactAuxiliaryText.has(plain)) {
    reasons.push("credit_or_place_line");
  }

  if (
    new RegExp(`^\\d{1,2}\\s+(${gregorianMonths})\\s+\\d{4}$`, "i").test(plain) ||
    new RegExp(`^\\d{1,2}\\s+(${hebrewMonths})\\s+\\d{4}$`, "i").test(plain)
  ) {
    reasons.push("date_line");
  }

  if (/^(ISBN|©|Copyright|Published by|All rights reserved)\b/i.test(plain)) {
    reasons.push("publication_metadata");
  }

  if (
    row.paragraph === 1 &&
    /\b(Blaise Pascal|Pascal|Pens(?:e|\u00e9)es)\b|\u05d1\u05dc\u05d6 \u05e4\u05e1\u05e7\u05dc/i.test(plain) &&
    /\btrans\.|\u05ea\u05e8\u05d2\u05d5\u05de|\u05d4\u05e2\u05e8\u05ea \u05d4\u05de\u05ea\u05e8\u05d2\u05dd/i.test(plain)
  ) {
    reasons.push("epigraph_or_external_quote");
  }

  if (wordCount <= 8 && /^[\p{L}\p{M}\d ,;:'"()?\-.]+$/u.test(plain) && !/[.!?]$/.test(plain)) {
    if (/Preface|Publisher|Introduction|Further Reading|Haggadah|Essays/i.test(row.ref)) {
      reasons.push("short_title_or_metadata_line");
    }
  }

  return [...new Set(reasons)];
}

async function main() {
  const rows = await prisma.textUnit.findMany({
    select: {
      paragraphId: true,
      ref: true,
      text: true,
      paragraph: true,
      book: {
        select: { title: true }
      }
    }
  });

  const candidates: Candidate[] = rows
    .map((row) => {
      const reasons = classify(row);
      return reasons.length > 0
        ? {
            paragraphId: row.paragraphId,
            bookTitle: row.book.title,
            ref: row.ref,
            reasons,
            preview: stripTags(row.text).slice(0, 180)
          }
        : null;
    })
    .filter((candidate): candidate is Candidate => Boolean(candidate));

  await prisma.textUnit.updateMany({
    data: { isAuxiliary: false }
  });

  for (let index = 0; index < candidates.length; index += 500) {
    const chunk = candidates.slice(index, index + 500);
    await prisma.textUnit.updateMany({
      where: {
        paragraphId: {
          in: chunk.map((candidate) => candidate.paragraphId)
        }
      },
      data: { isAuxiliary: true }
    });
  }

  const byReason = candidates.reduce<Record<string, number>>((accumulator, candidate) => {
    for (const reason of candidate.reasons) {
      accumulator[reason] = (accumulator[reason] || 0) + 1;
    }
    return accumulator;
  }, {});

  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        heuristicName: "isAuxiliary",
        totalCandidates: candidates.length,
        byReason,
        candidates
      },
      null,
      2
    )}\n`
  );

  console.log(JSON.stringify({ totalRows: rows.length, auxiliaryRows: candidates.length, byReason, outputPath }, null, 2));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
