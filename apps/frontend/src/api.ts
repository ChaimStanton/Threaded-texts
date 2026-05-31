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
  rabbiSacksRef: string;
  rabbiSacksUrl: string;
  text: string;
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchAuthors(): Promise<Author[]> {
  const data = await requestJson<{ authors: Author[] }>("/api/authors");
  return data.authors;
}

export async function createAuthor(input: {
  slug: string;
  displayName: string;
  sortName?: string;
  bio?: string;
}): Promise<Author> {
  const data = await requestJson<{ author: Author }>("/api/authors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.author;
}

export async function fetchBooks(): Promise<Book[]> {
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
  const data = await requestJson<{ book: Book }>("/api/texts/books", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.book;
}

export async function fetchTextUnits(bookId: string): Promise<TextUnit[]> {
  const data = await requestJson<{ units: TextUnit[] }>(`/api/texts/books/${bookId}/units`);
  return data.units;
}

export async function fetchChapters(bookId: string): Promise<Chapter[]> {
  const data = await requestJson<{ chapters: Chapter[] }>(`/api/texts/books/${bookId}/chapters`);
  return data.chapters;
}

export async function createChapter(input: {
  bookId: string;
  number: number;
  ref: string;
  title?: string;
  heTitle?: string;
}): Promise<Chapter> {
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
  const data = await requestJson<{ unit: TextUnit }>("/api/texts/units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return data.unit;
}

export async function fetchRabbiSacksArticles(): Promise<RabbiSacksArticle[]> {
  const data = await requestJson<{ articles: RabbiSacksArticle[] }>("/api/rabbi-sacks/articles");
  return data.articles;
}

export async function scrapeRabbiSacksArticle(sourceUrl: string): Promise<RabbiSacksArticle> {
  const data = await requestJson<{ article: RabbiSacksArticle }>("/api/rabbi-sacks/articles/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceUrl })
  });
  return data.article;
}

export async function fetchSourceNotes(): Promise<SourceNote[]> {
  const data = await requestJson<{ notes: SourceNote[] }>("/api/sources");
  return data.notes;
}

export async function createSourceNote(input: {
  ref: string;
  title?: string;
  text?: string;
  tags?: string[];
}): Promise<SourceNote> {
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
  limit?: number;
} = {}): Promise<SourceConnection[]> {
  const params = new URLSearchParams();

  if (input.query) {
    params.set("q", input.query);
  }

  if (input.corpus && input.corpus !== "all") {
    params.set("corpus", input.corpus);
  }

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const query = params.toString();
  const data = await requestJson<{ sources: SourceConnection[] }>(`/api/sources/connections${query ? `?${query}` : ""}`);
  return data.sources;
}
