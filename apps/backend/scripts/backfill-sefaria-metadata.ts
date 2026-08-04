import { PrismaClient } from "@prisma/client";

type TextLanguage = "en" | "he";

type SefariaVersion = {
  language?: string;
  actualLanguage?: string;
  languageFamilyName?: string;
  versionTitle?: string;
  shortVersionTitle?: string;
  versionSource?: string;
  purchaseInformationURL?: string;
  license?: string;
  priority?: number | string;
  isPrimary?: boolean;
};

const prisma = new PrismaClient();
const SEFARIA_API_BASE_URL = process.env.SEFARIA_API_BASE_URL || "https://www.sefaria.org/api";
const REQUEST_DELAY_MS = Number(process.env.SEFARIA_SACKS_DELAY_MS || 25);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getSefariaUrl(ref: string) {
  return `https://www.sefaria.org/${ref.replaceAll(" ", "_").replaceAll(":", ".")}?lang=bi`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${SEFARIA_API_BASE_URL}${path}`);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sefaria request failed ${response.status}: ${path}\n${body.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

function getVersionLanguage(version: SefariaVersion): TextLanguage | null {
  const language = version.actualLanguage || version.language;
  const languageFamily = version.languageFamilyName?.toLowerCase();

  if (language === "en" || languageFamily === "english") return "en";
  if (language === "he" || languageFamily === "hebrew") return "he";
  return null;
}

function getVersionPriority(version: SefariaVersion) {
  const priority = typeof version.priority === "number" ? version.priority : Number(version.priority || 0);
  return Number.isFinite(priority) ? priority : 0;
}

function selectPrimaryVersionsByLanguage(versions: SefariaVersion[]) {
  const selected = new Map<TextLanguage, SefariaVersion>();

  for (const version of versions) {
    const language = getVersionLanguage(version);
    if (!language) continue;

    const existing = selected.get(language);
    if (
      !existing ||
      Number(version.isPrimary) - Number(existing.isPrimary) > 0 ||
      getVersionPriority(version) > getVersionPriority(existing)
    ) {
      selected.set(language, version);
    }
  }

  return selected;
}

function getVersionMetadata(version: SefariaVersion) {
  const versionTitle = version.versionTitle || version.shortVersionTitle;
  const sourceUrl = version.versionSource || version.purchaseInformationURL;

  return {
    version: versionTitle || sourceUrl || undefined,
    attribution: versionTitle ? `Sefaria edition: ${versionTitle}` : "Sefaria",
    license: version.license || undefined,
    sourceUrl: sourceUrl || undefined
  };
}

async function backfillTextUnits() {
  const books = await prisma.book.findMany({
    where: {
      slug: { startsWith: "sefaria-" },
      deletedAt: null,
      texts: { some: { deletedAt: null } }
    },
    select: {
      id: true,
      slug: true,
      title: true
    },
    orderBy: { title: "asc" }
  });

  const results = [];

  for (const book of books) {
    try {
      const versions = await fetchJson<SefariaVersion[]>(`/texts/versions/${encodeURIComponent(book.title)}`);
      const selectedVersions = selectPrimaryVersionsByLanguage(Array.isArray(versions) ? versions : []);
      const languageResults = [];

      for (const [language, version] of selectedVersions.entries()) {
        const metadata = getVersionMetadata(version);
        const updated = await prisma.textUnit.updateMany({
          where: {
            bookId: book.id,
            language,
            deletedAt: null,
            OR: [{ version: null }, { attribution: null }, { license: null }, { sourceUrl: null }]
          },
          data: metadata
        });

        languageResults.push({
          language,
          version: metadata.version,
          license: metadata.license,
          updated: updated.count
        });
      }

      results.push({ slug: book.slug, title: book.title, status: "updated", languages: languageResults });
    } catch (error) {
      results.push({
        slug: book.slug,
        title: book.title,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return results;
}

async function backfillSefariaReferences() {
  const references = await prisma.sefariaReference.findMany({
    where: {
      deletedAt: null,
      OR: [{ url: null }, { attribution: null }]
    },
    select: {
      id: true,
      ref: true,
      url: true,
      attribution: true
    }
  });

  let updated = 0;

  for (const reference of references) {
    await prisma.sefariaReference.update({
      where: { id: reference.id },
      data: {
        url: reference.url || getSefariaUrl(reference.ref),
        attribution: reference.attribution || "Sefaria"
      }
    });
    updated += 1;
  }

  return { checked: references.length, updated };
}

async function main() {
  const before = {
    textUnitsMissingMetadata: await prisma.textUnit.count({
      where: {
        paragraphId: { startsWith: "sefaria:" },
        deletedAt: null,
        OR: [{ version: null }, { attribution: null }, { license: null }, { sourceUrl: null }]
      }
    }),
    referencesMissingMetadata: await prisma.sefariaReference.count({
      where: {
        deletedAt: null,
        OR: [{ url: null }, { attribution: null }]
      }
    })
  };

  const [textUnitResults, referenceResults] = await Promise.all([backfillTextUnits(), backfillSefariaReferences()]);

  const after = {
    textUnitsMissingMetadata: await prisma.textUnit.count({
      where: {
        paragraphId: { startsWith: "sefaria:" },
        deletedAt: null,
        OR: [{ version: null }, { attribution: null }, { license: null }, { sourceUrl: null }]
      }
    }),
    referencesMissingMetadata: await prisma.sefariaReference.count({
      where: {
        deletedAt: null,
        OR: [{ url: null }, { attribution: null }]
      }
    })
  };

  console.log(JSON.stringify({ before, after, textUnitResults, referenceResults }, null, 2));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
