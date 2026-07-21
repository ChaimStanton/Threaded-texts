export type Author = {
  id: string;
  slug: string;
  displayName: string;
  sortName?: string;
  bio?: string;
};

export type Book = {
  id: string;
  slug: string;
  title: string;
  heTitle?: string;
  category?: string;
  authorId?: string;
  author?: Author;
};

export type TextUnit = {
  paragraphId: string;
  bookId: string;
  chapterId?: string;
  chapter: number;
  verse?: number;
  paragraph: number;
  ref: string;
  text: string;
  language: string;
  version?: string;
  isAuxiliary: boolean;
};

export type Chapter = {
  id: string;
  bookId: string;
  number: number;
  ref: string;
  title?: string;
  heTitle?: string;
};

export type PublicationChapter = Chapter & {
  isNonMainText: boolean;
  textUnits: TextUnit[];
};

export type PublicationBook = Book & {
  chapters: PublicationChapter[];
};

export type RabbiSacksArticle = {
  id: string;
  authorId: string;
  author?: Author;
  sourceUrl: string;
  title: string;
  body: string;
  excerpt?: string;
  publishedAt?: string;
  scrapedAt: string;
};

export type SourceNote = {
  id: string;
  ref: string;
  title?: string;
  text?: string;
  version?: string;
  language: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ComplementCorpus = "tanach" | "gemara" | "mishna" | "shulchan_aruch" | "rambam";

export type SourceConnectionPassage = {
  id: string;
  paragraphId: string;
  topic?: string;
  rationale?: string;
  confidence?: number;
  rank?: number;
  latestReview: {
    id: string;
    provider: string;
    model: string;
    promptVersion: string;
    providerRequestId?: string;
    status: string;
    verdict?: "accept" | "borderline" | "reject";
    score?: number;
    issueTags?: string[];
    rationale?: string;
    suggestedAction?: string;
    suggestedRef?: string;
    estimatedCostUsd?: number;
    createdAt: string;
    completedAt?: string;
  } | null;
  generatedBy: {
    provider: string;
    model: string;
    promptVersion: string;
    providerRequestId?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
    createdAt: string;
    completedAt?: string;
  } | null;
  rabbiSacksRef: string;
  rabbiSacksUrl: string;
  text: string;
  language: string;
  book: {
    id: string;
    slug: string;
    title: string;
    category?: string;
  };
  chapter: {
    id: string;
    number: number;
    ref: string;
    title?: string;
  } | null;
};

export type SourceConnection = {
  id: string;
  ref: string;
  normalizedRef?: string;
  corpus: ComplementCorpus;
  book?: string;
  category?: string;
  url?: string;
  connectionCount: number;
  passages: SourceConnectionPassage[];
};

export type SefariaText = {
  ref: string;
  heRef?: string;
  text?: string | string[];
  he?: string | string[];
  versions?: Array<{
    title?: string;
    versionTitle?: string;
    language?: string;
  }>;
};

export type ClassificationProgressBook = {
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

const staticDataBase = `${import.meta.env.BASE_URL}data/`;
const staticDataCache = new Map<string, Promise<unknown>>();

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function requestStaticJson<T>(name: string): Promise<T> {
  const cached = staticDataCache.get(name);
  if (cached) {
    return cached as Promise<T>;
  }

  const request = requestJson<T>(`${staticDataBase}${name}`);
  staticDataCache.set(name, request as Promise<unknown>);
  return request;
}

async function fetchStaticPublicationBook(bookId: string): Promise<PublicationBook | undefined> {
  const data = await requestStaticJson<{ book: PublicationBook }>(`publication-books/${encodeURIComponent(bookId)}.json`);
  return data.book;
}

function assertApiWriteAvailable() {
  if (import.meta.env.PROD) {
    throw new Error("This action requires the backend API and is unavailable in the static production site.");
  }
}

function matchesText(value: string | undefined | null, query: string) {
  return Boolean(value?.toLowerCase().includes(query));
}

function getReviewOutcome(review: SourceConnectionPassage["latestReview"]) {
  if (!review) return "unreviewed";
  if (review.status === "pending" || review.status === "failed") return review.status;
  return review.verdict ?? "unreviewed";
}

function filterStaticSources(sources: SourceConnection[], input: {
  query?: string;
  corpus?: ComplementCorpus | "all";
  minConfidence?: number;
  reviewOutcome?: "all" | "accept" | "borderline" | "reject" | "pending" | "failed" | "unreviewed";
  limit?: number;
}) {
  const query = input.query?.trim().toLowerCase();

  return sources
    .filter((source) => !input.corpus || input.corpus === "all" || source.corpus === input.corpus)
    .map((source) => {
      const passages = source.passages.filter((passage) => {
        if (typeof input.minConfidence === "number" && (passage.confidence ?? 0) < input.minConfidence) {
          return false;
        }

        if (input.reviewOutcome && input.reviewOutcome !== "all" && getReviewOutcome(passage.latestReview) !== input.reviewOutcome) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          matchesText(source.ref, query) ||
          matchesText(source.normalizedRef, query) ||
          matchesText(source.book, query) ||
          matchesText(source.category, query) ||
          matchesText(passage.topic, query) ||
          matchesText(passage.rationale, query)
        );
      });

      return { ...source, connectionCount: passages.length, passages };
    })
    .filter((source) => source.passages.length > 0)
    .slice(0, input.limit ?? 50);
}

export async function fetchAuthors(): Promise<Author[]> {
  if (import.meta.env.PROD) {
    const data = await requestStaticJson<{ authors: Author[] }>("authors.json");
    return data.authors;
  }

  const data = await requestJson<{ authors: Author[] }>("/api/authors");
  return data.authors;
}

export async function createAuthor(input: {
  slug: string;
  displayName: string;
  sortName?: string;
  bio?: string;
}): Promise<Author> {
  assertApiWriteAvailable();
  const data = await requestJson<{ author: Author }>("/api/authors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.author;
}

export async function fetchBooks(): Promise<Book[]> {
  if (import.meta.env.PROD) {
    const data = await requestStaticJson<{ books: Book[] }>("books.json");
    return data.books;
  }

  const data = await requestJson<{ books: Book[] }>("/api/texts/books");
  return data.books;
}

export async function createBook(input: {
  slug: string;
  title: string;
  heTitle?: string;
  category?: string;
  authorId?: string;
}): Promise<Book> {
  assertApiWriteAvailable();
  const data = await requestJson<{ book: Book }>("/api/texts/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.book;
}

export async function fetchTextUnits(bookId: string): Promise<TextUnit[]> {
  if (import.meta.env.PROD) {
    const book = await fetchStaticPublicationBook(bookId);
    return book?.chapters.flatMap((chapter) => chapter.textUnits) ?? [];
  }

  const data = await requestJson<{ units: TextUnit[] }>(`/api/texts/books/${bookId}/units`);
  return data.units;
}

export async function fetchChapters(bookId: string): Promise<Chapter[]> {
  if (import.meta.env.PROD) {
    const book = await fetchStaticPublicationBook(bookId);
    return book?.chapters.map(({ textUnits: _textUnits, ...chapter }) => chapter) ?? [];
  }

  const data = await requestJson<{ chapters: Chapter[] }>(`/api/texts/books/${bookId}/chapters`);
  return data.chapters;
}

export async function fetchPublicationBook(bookId: string, language: "all" | "en" | "he" = "all"): Promise<PublicationBook> {
  if (import.meta.env.PROD) {
    const book = await fetchStaticPublicationBook(bookId);

    if (!book) {
      throw new Error("Book not found");
    }

    if (language === "all") {
      return book;
    }

    return {
      ...book,
      chapters: book.chapters.map((chapter) => ({
        ...chapter,
        textUnits: chapter.textUnits.filter((unit) => unit.language === language)
      }))
    };
  }

  const params = new URLSearchParams({ language });
  const data = await requestJson<{ book: PublicationBook }>(`/api/texts/books/${bookId}/publication?${params.toString()}`);
  return data.book;
}

export async function createChapter(input: {
  bookId: string;
  number: number;
  ref: string;
  title?: string;
  heTitle?: string;
}): Promise<Chapter> {
  assertApiWriteAvailable();
  const data = await requestJson<{ chapter: Chapter }>("/api/texts/chapters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.chapter;
}

export async function createTextUnit(input: {
  paragraphId: string;
  bookId: string;
  chapterId?: string;
  chapter: number;
  verse?: number;
  paragraph: number;
  ref: string;
  text: string;
  language?: string;
  version?: string;
}): Promise<TextUnit> {
  assertApiWriteAvailable();
  const data = await requestJson<{ unit: TextUnit }>("/api/texts/units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.unit;
}

export async function fetchRabbiSacksArticles(): Promise<RabbiSacksArticle[]> {
  if (import.meta.env.PROD) {
    const data = await requestStaticJson<{ articles: RabbiSacksArticle[] }>("rabbi-sacks-articles.json");
    return data.articles;
  }

  const data = await requestJson<{ articles: RabbiSacksArticle[] }>("/api/rabbi-sacks/articles");
  return data.articles;
}

export async function scrapeRabbiSacksArticle(sourceUrl: string): Promise<RabbiSacksArticle> {
  assertApiWriteAvailable();
  const data = await requestJson<{ article: RabbiSacksArticle }>("/api/rabbi-sacks/articles/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceUrl })
  });
  return data.article;
}

export async function fetchSourceNotes(): Promise<SourceNote[]> {
  if (import.meta.env.PROD) {
    const data = await requestStaticJson<{ notes: SourceNote[] }>("source-notes.json");
    return data.notes;
  }

  const data = await requestJson<{ notes: SourceNote[] }>("/api/sources");
  return data.notes;
}

export async function createSourceNote(input: {
  ref: string;
  title?: string;
  text?: string;
  tags?: string[];
}): Promise<SourceNote> {
  assertApiWriteAvailable();
  const data = await requestJson<{ note: SourceNote }>("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.note;
}

export async function fetchSourceConnections(input: {
  query?: string;
  corpus?: ComplementCorpus | "all";
  minConfidence?: number;
  reviewOutcome?: "all" | "accept" | "borderline" | "reject" | "pending" | "failed" | "unreviewed";
  limit?: number;
} = {}): Promise<SourceConnection[]> {
  if (import.meta.env.PROD) {
    const data = await requestStaticJson<{ sources: SourceConnection[] }>("source-connections.json");
    return filterStaticSources(data.sources, input);
  }

  const params = new URLSearchParams();

  if (input.query) {
    params.set("q", input.query);
  }

  if (input.corpus && input.corpus !== "all") {
    params.set("corpus", input.corpus);
  }

  if (typeof input.minConfidence === "number") {
    params.set("minConfidence", String(input.minConfidence));
  }

  if (input.reviewOutcome) {
    params.set("reviewOutcome", input.reviewOutcome);
  }

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const query = params.toString();
  const data = await requestJson<{ sources: SourceConnection[] }>(`/api/sources/connections${query ? `?${query}` : ""}`);
  return data.sources;
}

export async function fetchClassificationProgress(): Promise<ClassificationProgressBook[]> {
  if (import.meta.env.PROD) {
    const data = await requestStaticJson<{ books: ClassificationProgressBook[] }>("classification-progress.json");
    return data.books;
  }

  const data = await requestJson<{ books: ClassificationProgressBook[] }>("/api/sources/classification-progress");
  return data.books;
}

export async function fetchSefariaText(ref: string): Promise<SefariaText> {
  if (import.meta.env.PROD) {
    throw new Error("Live Sefaria text lookup requires the backend API. Open the source on Sefaria to view the text.");
  }

  const data = await requestJson<{ text: SefariaText }>(`/api/sources/sefaria/${encodeURIComponent(ref)}`);
  return data.text;
}
