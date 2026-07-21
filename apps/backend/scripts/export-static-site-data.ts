import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/db.js";
import { getClassificationProgress } from "../src/repositories/classificationProgress.js";
import { listAuthors } from "../src/repositories/authors.js";
import { listBooks, getPublicationBook } from "../src/repositories/texts.js";
import { listRabbiSacksArticles } from "../src/repositories/rabbiSacksArticles.js";
import { listSefariaReferenceConnections } from "../src/repositories/textClassifications.js";
import { listSourceNotes, serializeSourceNote } from "../src/repositories/sourceNotes.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const dataDir = path.join(repoRoot, "apps/frontend/public/data");

async function writeJson(name: string, data: unknown) {
  await writeFile(path.join(dataDir, name), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const [authors, books, articles, notes, sources, classificationProgress] = await Promise.all([
    listAuthors(),
    listBooks(),
    listRabbiSacksArticles(),
    listSourceNotes(),
    listSefariaReferenceConnections({ reviewOutcome: "all", limit: 10000 }),
    getClassificationProgress()
  ]);

  const publicationBooks = await Promise.all(
    books.map(async (book) => ({
      bookId: book.id,
      book: await getPublicationBook(book.id, "all")
    }))
  );

  await Promise.all([
    writeJson("authors.json", { authors }),
    writeJson("books.json", { books }),
    writeJson("rabbi-sacks-articles.json", { articles }),
    writeJson("source-notes.json", { notes: notes.map(serializeSourceNote) }),
    writeJson("source-connections.json", { sources: sources.map(serializeSourceConnection) }),
    writeJson("classification-progress.json", { books: classificationProgress }),
    writeJson("publication-books.json", {
      books: Object.fromEntries(publicationBooks.flatMap(({ bookId, book }) => (book ? [[bookId, book]] : [])))
    })
  ]);

  await writeFile(path.join(repoRoot, "apps/frontend/public/.nojekyll"), "", "utf8");
}

function serializeSourceConnection(source: Awaited<ReturnType<typeof listSefariaReferenceConnections>>[number]) {
  return {
    id: source.id,
    ref: source.ref,
    normalizedRef: source.normalizedRef,
    corpus: source.corpus,
    book: source.book,
    category: source.category,
    url: source.url,
    connectionCount: source._count.textComplements,
    passages: source.textComplements.map((connection) => ({
      id: connection.id,
      paragraphId: connection.paragraphId,
      topic: connection.topic,
      rationale: connection.rationale,
      confidence: connection.confidence,
      rank: connection.rank,
      latestReview: connection.aiReviews[0]
        ? {
                id: connection.aiReviews[0].id,
                provider: connection.aiReviews[0].provider,
                model: connection.aiReviews[0].model,
                promptVersion: connection.aiReviews[0].promptVersion,
                status: connection.aiReviews[0].status,
                verdict: connection.aiReviews[0].verdict,
                score: connection.aiReviews[0].score,
                issueTags: connection.aiReviews[0].issueTags,
                rationale: connection.aiReviews[0].rationale,
                suggestedAction: connection.aiReviews[0].suggestedAction,
                suggestedRef: connection.aiReviews[0].suggestedRef,
                createdAt: connection.aiReviews[0].createdAt,
                completedAt: connection.aiReviews[0].completedAt
              }
            : null,
      generatedBy: connection.classificationRun
        ? {
                provider: connection.classificationRun.provider,
                model: connection.classificationRun.model,
                promptVersion: connection.classificationRun.promptVersion,
                createdAt: connection.classificationRun.createdAt,
                completedAt: connection.classificationRun.completedAt
              }
            : null,
      rabbiSacksRef: connection.textUnit.ref,
      rabbiSacksUrl: `https://www.sefaria.org/${connection.textUnit.ref.replaceAll(" ", "_").replaceAll(":", ".")}?lang=bi`,
      text: connection.textUnit.text,
      language: connection.textUnit.language,
      book: {
        id: connection.textUnit.book.id,
        slug: connection.textUnit.book.slug,
        title: connection.textUnit.book.title,
        category: connection.textUnit.book.category
      },
      chapter: connection.textUnit.chapterRef
        ? {
            id: connection.textUnit.chapterRef.id,
            number: connection.textUnit.chapterRef.number,
            ref: connection.textUnit.chapterRef.ref,
            title: connection.textUnit.chapterRef.title
          }
        : null
    }))
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
