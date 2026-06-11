import { PrismaClient } from "@prisma/client";

type TocNode = {
  title?: string;
  key?: string;
  nodeType?: string;
  nodes?: TocNode[];
};

type Leaf = {
  ref: string;
};

type SefariaIndexResponse = {
  title: string;
  schema?: TocNode;
};

type SefariaTextResponse = {
  text?: unknown;
  he?: unknown;
  available_versions?: Array<{
    languageFamilyName?: string;
    versionTitle?: string;
  }>;
};

const prisma = new PrismaClient();
const SEFARIA_API_BASE_URL = process.env.SEFARIA_API_BASE_URL || "https://www.sefaria.org/api";
const REQUEST_DELAY_MS = Number(process.env.SEFARIA_SACKS_DELAY_MS || 25);

const targets = [
  {
    title: "Not in God's Name; Confronting Religious Violence",
    localSlugs: [
      "sefaria-not-in-gods-name-confronting-religious-violence",
      "sefaria-not-in-gods-name-confronting-religious-violence-hebrew"
    ]
  },
  {
    title: "Radical Then, Radical Now",
    localSlugs: ["sefaria-radical-then-radical-now"]
  },
  {
    title: "The Home We Build Together; Recreating Society",
    localSlugs: ["sefaria-the-home-we-build-together-recreating-society"]
  }
] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function collectLeaves(node: TocNode | undefined, prefix: string[] = [], leaves: Leaf[] = []) {
  if (!node) return leaves;

  const title = node.title || node.key;
  const nextPrefix = title ? [...prefix, title] : prefix;

  if (node.nodeType === "JaggedArrayNode") {
    leaves.push({ ref: nextPrefix.join(", ") });
    return leaves;
  }

  for (const child of node.nodes || []) {
    collectLeaves(child, nextPrefix, leaves);
  }

  return leaves;
}

function flattenText(value: unknown, out: string[] = []) {
  if (Array.isArray(value)) {
    for (const child of value) {
      flattenText(child, out);
    }

    return out;
  }

  if (typeof value === "string" && value.trim()) {
    out.push(value.trim());
  }

  return out;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${SEFARIA_API_BASE_URL}${path}`);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sefaria request failed ${response.status}: ${path}\n${body.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

async function getLocalCounts(localSlugs: readonly string[]) {
  const books = await prisma.book.findMany({
    where: {
      slug: { in: [...localSlugs] },
      deletedAt: null
    },
    select: {
      id: true,
      slug: true,
      title: true
    }
  });

  const counts = [];

  for (const book of books) {
    counts.push({
      slug: book.slug,
      title: book.title,
      eligibleEnglishRows: await prisma.textUnit.count({
        where: {
          bookId: book.id,
          language: "en",
          deletedAt: null,
          isAuxiliary: false,
          chapterRef: { deletedAt: null, isNonMainText: false }
        }
      }),
      eligibleHebrewRows: await prisma.textUnit.count({
        where: {
          bookId: book.id,
          language: "he",
          deletedAt: null,
          isAuxiliary: false,
          chapterRef: { deletedAt: null, isNonMainText: false }
        }
      }),
      completedEnglishRuns: await prisma.llmTextClassification.count({
        where: {
          deletedAt: null,
          status: "completed",
          textUnit: {
            bookId: book.id,
            language: "en"
          }
        }
      })
    });
  }

  return counts;
}

async function inspectTarget(target: (typeof targets)[number]) {
  const index = await fetchJson<SefariaIndexResponse>(`/index/${encodeURIComponent(target.title)}`);
  const leaves = collectLeaves(index.schema);
  let englishLeaves = 0;
  let hebrewLeaves = 0;
  let englishSegments = 0;
  let hebrewSegments = 0;
  const englishSampleRefs: string[] = [];
  const availableVersionLanguages = new Set<string>();

  for (const leaf of leaves) {
    const data = await fetchJson<SefariaTextResponse>(`/texts/${encodeURIComponent(leaf.ref)}?context=0`);
    const english = flattenText(data.text);
    const hebrew = flattenText(data.he);

    for (const version of data.available_versions || []) {
      if (version.languageFamilyName) {
        availableVersionLanguages.add(version.languageFamilyName);
      }
    }

    if (english.length > 0) {
      englishLeaves += 1;
      englishSegments += english.length;
      if (englishSampleRefs.length < 3) {
        englishSampleRefs.push(leaf.ref);
      }
    }

    if (hebrew.length > 0) {
      hebrewLeaves += 1;
      hebrewSegments += hebrew.length;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return {
    title: target.title,
    sefariaIndexTitle: index.title,
    leafCount: leaves.length,
    englishLeaves,
    englishSegments,
    hebrewLeaves,
    hebrewSegments,
    availableVersionLanguages: [...availableVersionLanguages].sort(),
    englishSampleRefs,
    localCounts: await getLocalCounts(target.localSlugs),
    shouldClassifyEnglish: englishSegments > 0
  };
}

async function main() {
  const results = [];

  for (const target of targets) {
    results.push(await inspectTarget(target));
  }

  const pendingBatches = await prisma.llmTextClassification.findMany({
    where: {
      deletedAt: null,
      status: "pending",
      providerRequestId: { startsWith: "batch_" }
    },
    select: {
      id: true,
      paragraphId: true,
      providerRequestId: true,
      createdAt: true
    },
    orderBy: { createdAt: "asc" }
  });

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        englishOnlyTargetsReady: results.filter((result) => result.shouldClassifyEnglish).map((result) => result.title),
        pendingBatches,
        results
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
