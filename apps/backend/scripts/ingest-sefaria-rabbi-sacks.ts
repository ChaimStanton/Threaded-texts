import { Book, PrismaClient } from "@prisma/client";
import { isNonMainTextSection } from "../src/text/nonMainText.js";

type TocNode = {
  category?: string;
  title?: string;
  heTitle?: string;
  key?: string;
  collectiveTitle?: string;
  nodeType?: string;
  categories?: string[];
  contents?: TocNode[];
  nodes?: TocNode[];
};

type Leaf = {
  title?: string;
  heTitle?: string;
  ref: string;
};

type TextSegment = {
  path: number[];
  text: string;
};

type SefariaTextResponse = {
  ref?: string;
  text?: unknown;
  he?: unknown;
  versionTitle?: string;
  versionSource?: string;
};

type SefariaIndexResponse = {
  title: string;
  heTitle?: string;
  categories?: string[];
  schema?: TocNode;
};

const prisma = new PrismaClient();
const SEFARIA_API_BASE_URL = process.env.SEFARIA_API_BASE_URL || "https://www.sefaria.org/api";
const ONLY_MISSING = process.env.SEFARIA_SACKS_ONLY_MISSING === "1";
const REQUIRE_ENGLISH =
  process.env.SEFARIA_SACKS_REQUIRE_ENGLISH === "1" || process.argv.includes("--require-english");
const REQUEST_DELAY_MS = Number(process.env.SEFARIA_SACKS_DELAY_MS || 25);
const TARGET_WORK_TITLES = new Set(
  [
    ...process.argv
      .slice(2)
      .filter((arg) => arg.startsWith("--work-title="))
      .map((arg) => arg.slice("--work-title=".length).trim()),
    ...(process.env.SEFARIA_SACKS_WORK_TITLES || "")
      .split("|")
      .map((title) => title.trim())
      .filter(Boolean)
  ].filter(Boolean)
);
const RABBI_SACKS_AUTHOR = {
  slug: "rabbi-lord-jonathan-sacks",
  displayName: "Rabbi Lord Jonathan Sacks",
  sortName: "Sacks, Jonathan"
};
const CATEGORY_PATHS = [
  ["Jewish Thought", "Modern", "Rabbi Lord Jonathan Sacks"],
  ["Tanakh", "Modern Commentary on Tanakh", "Jonathan Sacks"],
  ["Liturgy", "Haggadah", "Commentary"]
];
const HAGGADAH_TITLE = "The Jonathan Sacks Haggadah";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}

function findCategory(node: TocNode | TocNode[], targetPath: string[], path: string[] = []): TocNode | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findCategory(item, targetPath, path);
      if (hit) return hit;
    }
    return null;
  }

  const name = node.category || node.title;
  const nextPath = name ? [...path, name] : path;

  if (nextPath.join("/") === targetPath.join("/")) {
    return node;
  }

  for (const child of node.contents || []) {
    const hit = findCategory(child, targetPath, nextPath);
    if (hit) return hit;
  }

  return null;
}

function collectWorks(node: TocNode | null, works = new Map<string, TocNode>()) {
  if (!node) return works;

  if (node.title) {
    if (
      node.categories?.includes("Rabbi Lord Jonathan Sacks") ||
      node.categories?.includes("Jonathan Sacks") ||
      node.title === HAGGADAH_TITLE ||
      node.collectiveTitle === HAGGADAH_TITLE
    ) {
      works.set(node.title, node);
    }
  }

  for (const child of node.contents || []) {
    collectWorks(child, works);
  }

  return works;
}

function collectLeaves(node: TocNode | undefined, prefix: string[] = [], leaves: Leaf[] = []) {
  if (!node) return leaves;

  const title = node.title || node.key;
  const nextPrefix = title ? [...prefix, title] : prefix;

  if (node.nodeType === "JaggedArrayNode") {
    leaves.push({
      title,
      heTitle: node.heTitle,
      ref: nextPrefix.join(", ")
    });
    return leaves;
  }

  for (const child of node.nodes || []) {
    collectLeaves(child, nextPrefix, leaves);
  }

  return leaves;
}

function flattenText(value: unknown, path: number[] = [], out: TextSegment[] = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => flattenText(child, [...path, index + 1], out));
    return out;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (text) {
      out.push({ path, text });
    }
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

async function upsertAuthor() {
  return prisma.author.upsert({
    where: { slug: RABBI_SACKS_AUTHOR.slug },
    create: RABBI_SACKS_AUTHOR,
    update: {
      ...RABBI_SACKS_AUTHOR,
      deletedAt: null
    }
  });
}

async function ingestLeaf({ book, leaf, leafIndex }: { book: Book; leaf: Leaf; leafIndex: number }) {
  const data = await fetchJson<SefariaTextResponse>(`/texts/${encodeURIComponent(leaf.ref)}?context=0`);
  const english = flattenText(data.text);
  const hebrew = flattenText(data.he);

  if (REQUIRE_ENGLISH && english.length === 0) {
    return { imported: 0, skippedReason: "missing_english_text" };
  }

  const language = english.length > 0 ? "en" : "he";
  const segments = english.length > 0 ? english : hebrew;

  const chapter = await prisma.chapter.upsert({
    where: {
      bookId_number: {
        bookId: book.id,
        number: leafIndex
      }
    },
    create: {
      bookId: book.id,
      number: leafIndex,
      ref: data.ref || leaf.ref,
      title: leaf.title,
      heTitle: leaf.heTitle,
      isNonMainText: isNonMainTextSection({ title: leaf.title, ref: data.ref || leaf.ref })
    },
    update: {
      ref: data.ref || leaf.ref,
      title: leaf.title,
      heTitle: leaf.heTitle,
      isNonMainText: isNonMainTextSection({ title: leaf.title, ref: data.ref || leaf.ref }),
      deletedAt: null
    }
  });

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const paragraph = index + 1;
    const segmentPath = segment.path.length > 0 ? segment.path.join(".") : String(paragraph);
    const ref = `${chapter.ref}:${segmentPath}`;

    await prisma.textUnit.upsert({
      where: {
        paragraphId: `sefaria:${book.slug}:${leafIndex}:${segmentPath}:${language}`
      },
      create: {
        paragraphId: `sefaria:${book.slug}:${leafIndex}:${segmentPath}:${language}`,
        bookId: book.id,
        chapterId: chapter.id,
        chapter: leafIndex,
        verse: segment.path[0],
        paragraph,
        ref,
        text: segment.text,
        language,
        version: data.versionTitle || data.versionSource || undefined,
        isAuxiliary: false
      },
      update: {
        bookId: book.id,
        chapterId: chapter.id,
        chapter: leafIndex,
        verse: segment.path[0],
        paragraph,
        ref,
        text: segment.text,
        language,
        version: data.versionTitle || data.versionSource || undefined,
        deletedAt: null
      }
    });
  }

  return { imported: segments.length };
}

async function main() {
  const author = await upsertAuthor();
  const toc = await fetchJson<TocNode[]>("/index/");
  const works = new Map<string, TocNode>();

  for (const categoryPath of CATEGORY_PATHS) {
    collectWorks(findCategory(toc, categoryPath), works);
  }

  const orderedWorks = [...works.values()].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  let importedWorks = 0;
  let importedChapters = 0;
  let importedTextUnits = 0;
  const skippedLeaves: Array<{ work?: string; ref?: string; reason: string }> = [];
  const failures: Array<{ work?: string; ref?: string; error: string }> = [];

  for (const work of orderedWorks) {
    try {
      if (!work.title) continue;
      if (TARGET_WORK_TITLES.size > 0 && !TARGET_WORK_TITLES.has(work.title)) continue;

      const index = await fetchJson<SefariaIndexResponse>(`/index/${encodeURIComponent(work.title)}`);
      const leaves = collectLeaves(index.schema);
      const slug = `sefaria-${slugify(index.title)}`;
      const existingBook = await prisma.book.findUnique({
        where: { slug },
        select: {
          id: true,
          _count: {
            select: { texts: true }
          }
        }
      });

      if (ONLY_MISSING && existingBook && existingBook._count.texts > 0) {
        console.log(`Skipped existing ${index.title}: ${existingBook._count.texts} text units`);
        continue;
      }

      const book = await prisma.book.upsert({
        where: { slug },
        create: {
          slug,
          title: index.title,
          heTitle: index.heTitle,
          category: index.categories?.join(" / "),
          authorId: author.id
        },
        update: {
          title: index.title,
          heTitle: index.heTitle,
          category: index.categories?.join(" / "),
          authorId: author.id,
          deletedAt: null
        }
      });

      importedWorks += 1;

      for (let leafIndex = 0; leafIndex < leaves.length; leafIndex += 1) {
        const leaf = leaves[leafIndex];

        try {
          const result = await ingestLeaf({ book, leaf, leafIndex: leafIndex + 1 });

          if (result.skippedReason) {
            skippedLeaves.push({ work: work.title, ref: leaf.ref, reason: result.skippedReason });
          } else {
            importedTextUnits += result.imported;
            importedChapters += 1;
          }

          await sleep(REQUEST_DELAY_MS);
        } catch (error) {
          failures.push({ work: work.title, ref: leaf.ref, error: error instanceof Error ? error.message : String(error) });
        }
      }

      console.log(`Imported ${index.title}: ${leaves.length} sections`);
    } catch (error) {
      failures.push({ work: work.title, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const counts = {
    authors: await prisma.author.count({ where: { deletedAt: null } }),
    books: await prisma.book.count({ where: { deletedAt: null, authorId: author.id } }),
    chapters: await prisma.chapter.count({ where: { deletedAt: null, book: { authorId: author.id } } }),
    textUnits: await prisma.textUnit.count({ where: { deletedAt: null, book: { authorId: author.id } } })
  };

  console.log(
    JSON.stringify(
      {
        requireEnglish: REQUIRE_ENGLISH,
        targetWorkTitles: [...TARGET_WORK_TITLES],
        importedWorks,
        importedChapters,
        importedTextUnits,
        skippedLeaves,
        failures,
        counts
      },
      null,
      2
    )
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
