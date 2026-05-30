-- CreateTable
CREATE TABLE "SourceNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "version" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sortName" TEXT,
    "bio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "heTitle" TEXT,
    "category" TEXT,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Book_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    -- Dense ordinal for the imported Sefaria leaf/section within a book.
    "number" INTEGER NOT NULL,
    -- Sefaria section ref without the final segment suffix.
    "ref" TEXT NOT NULL,
    "title" TEXT,
    "heTitle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Chapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "text" (
    "paragraphId" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    -- Optional FK to Chapter.id for grouping text units by imported Sefaria section.
    "chapterId" TEXT,
    -- Mirrors Chapter.number for simple ordering/filtering without joining Chapter.
    "chapter" INTEGER NOT NULL,
    -- Actual Sefaria segment number from the ref suffix, e.g. ":10".
    "verse" INTEGER,
    -- Dense local paragraph ordering after filtering blank/empty text segments.
    "paragraph" INTEGER NOT NULL,
    -- Full Sefaria segment ref, including the final segment suffix.
    "ref" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" TEXT,
    -- Heuristic flag for headings, datelines, credits, bibliography, prompts, or other auxiliary/non-body content.
    "isAuxiliary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "text_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "text_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SefariaReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ref" TEXT NOT NULL,
    "normalizedRef" TEXT,
    "corpus" TEXT NOT NULL DEFAULT 'tanach',
    "book" TEXT,
    "category" TEXT,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SefariaReference_corpus_check" CHECK ("corpus" IN ('tanach', 'gemara', 'mishna', 'shulchan_aruch', 'rambam'))
);

-- CreateTable
CREATE TABLE "LlmTextClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "prompt" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "responseText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "LlmTextClassification_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "text" ("paragraphId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TextSefariaComplement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphId" TEXT NOT NULL,
    "sefariaReferenceId" TEXT NOT NULL,
    "classificationRunId" TEXT,
    "topic" TEXT,
    "rationale" TEXT,
    "confidence" REAL,
    "rank" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "TextSefariaComplement_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "text" ("paragraphId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TextSefariaComplement_sefariaReferenceId_fkey" FOREIGN KEY ("sefariaReferenceId") REFERENCES "SefariaReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TextSefariaComplement_classificationRunId_fkey" FOREIGN KEY ("classificationRunId") REFERENCES "LlmTextClassification" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RabbiSacksArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "excerpt" TEXT,
    "publishedAt" DATETIME,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "RabbiSacksArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SourceNote_ref_idx" ON "SourceNote"("ref");

-- CreateIndex
CREATE INDEX "SourceNote_deletedAt_idx" ON "SourceNote"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Author_slug_key" ON "Author"("slug");

-- CreateIndex
CREATE INDEX "Author_deletedAt_idx" ON "Author"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Book_slug_key" ON "Book"("slug");

-- CreateIndex
CREATE INDEX "Book_authorId_idx" ON "Book"("authorId");

-- CreateIndex
CREATE INDEX "Book_deletedAt_idx" ON "Book"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_bookId_number_key" ON "Chapter"("bookId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_bookId_ref_key" ON "Chapter"("bookId", "ref");

-- CreateIndex
CREATE INDEX "Chapter_bookId_idx" ON "Chapter"("bookId");

-- CreateIndex
CREATE INDEX "Chapter_deletedAt_idx" ON "Chapter"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "text_ref_key" ON "text"("ref");

-- CreateIndex
CREATE INDEX "text_bookId_idx" ON "text"("bookId");

-- CreateIndex
CREATE INDEX "text_chapterId_idx" ON "text"("chapterId");

-- CreateIndex
CREATE INDEX "text_bookId_chapter_verse_paragraph_idx" ON "text"("bookId", "chapter", "verse", "paragraph");

-- CreateIndex
CREATE INDEX "text_isAuxiliary_idx" ON "text"("isAuxiliary");

-- CreateIndex
CREATE INDEX "text_deletedAt_idx" ON "text"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SefariaReference_ref_key" ON "SefariaReference"("ref");

-- CreateIndex
CREATE INDEX "SefariaReference_corpus_idx" ON "SefariaReference"("corpus");

-- CreateIndex
CREATE INDEX "SefariaReference_book_idx" ON "SefariaReference"("book");

-- CreateIndex
CREATE INDEX "SefariaReference_category_idx" ON "SefariaReference"("category");

-- CreateIndex
CREATE INDEX "SefariaReference_deletedAt_idx" ON "SefariaReference"("deletedAt");

-- CreateIndex
CREATE INDEX "LlmTextClassification_paragraphId_idx" ON "LlmTextClassification"("paragraphId");

-- CreateIndex
CREATE INDEX "LlmTextClassification_provider_model_idx" ON "LlmTextClassification"("provider", "model");

-- CreateIndex
CREATE INDEX "LlmTextClassification_status_idx" ON "LlmTextClassification"("status");

-- CreateIndex
CREATE INDEX "LlmTextClassification_deletedAt_idx" ON "LlmTextClassification"("deletedAt");

-- CreateIndex
CREATE INDEX "TextSefariaComplement_paragraphId_idx" ON "TextSefariaComplement"("paragraphId");

-- CreateIndex
CREATE INDEX "TextSefariaComplement_sefariaReferenceId_idx" ON "TextSefariaComplement"("sefariaReferenceId");

-- CreateIndex
CREATE INDEX "TextSefariaComplement_classificationRunId_idx" ON "TextSefariaComplement"("classificationRunId");

-- CreateIndex
CREATE INDEX "TextSefariaComplement_deletedAt_idx" ON "TextSefariaComplement"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TextSefariaComplement_paragraphId_sefariaReferenceId_classificationRunId_key" ON "TextSefariaComplement"("paragraphId", "sefariaReferenceId", "classificationRunId");

-- CreateView
CREATE VIEW "AuxiliaryTextReview" AS
SELECT
    t."paragraphId",
    t."ref",
    t."bookId",
    b."title" AS "bookTitle",
    t."chapterId",
    c."number" AS "chapterNumber",
    c."ref" AS "chapterRef",
    t."chapter",
    t."verse",
    t."paragraph",
    t."language",
    'https://www.sefaria.org/' || replace(replace(t."ref", ' ', '_'), ':', '.') || '?lang=bi' AS "sefariaUrl",
    length(t."text") AS "textLength",
    substr(replace(replace(replace(t."text", char(10), ' '), char(13), ' '), char(9), ' '), 1, 240) AS "preview",
    t."text",
    t."createdAt",
    t."updatedAt"
FROM "text" t
JOIN "Book" b ON b."id" = t."bookId"
LEFT JOIN "Chapter" c ON c."id" = t."chapterId"
WHERE t."isAuxiliary" = true
  AND t."deletedAt" IS NULL;

-- CreateView
CREATE VIEW "PrimaryEnglishText" AS
SELECT
    t."paragraphId",
    t."ref",
    t."bookId",
    b."title" AS "bookTitle",
    b."slug" AS "bookSlug",
    t."chapterId",
    c."number" AS "chapterNumber",
    c."ref" AS "chapterRef",
    t."chapter",
    t."verse",
    t."paragraph",
    t."language",
    'https://www.sefaria.org/' || replace(replace(t."ref", ' ', '_'), ':', '.') || '?lang=bi' AS "sefariaUrl",
    length(t."text") AS "textLength",
    t."text",
    t."createdAt",
    t."updatedAt"
FROM "text" t
JOIN "Book" b ON b."id" = t."bookId"
LEFT JOIN "Chapter" c ON c."id" = t."chapterId"
WHERE t."isAuxiliary" = false
  AND t."deletedAt" IS NULL
  AND t."language" = 'en'
  AND b."deletedAt" IS NULL
  AND (c."id" IS NULL OR c."deletedAt" IS NULL);

-- CreateView
CREATE VIEW "TextSefariaComplementReview" AS
SELECT
    tc."id",
    tc."paragraphId",
    t."ref" AS "paragraphRef",
    b."title" AS "bookTitle",
    t."chapter",
    t."verse",
    t."paragraph",
    tc."classificationRunId",
    lc."provider",
    lc."model",
    lc."promptVersion",
    sr."id" AS "sefariaReferenceId",
    sr."ref" AS "sefariaRef",
    sr."corpus" AS "sefariaCorpus",
    sr."book" AS "sefariaBook",
    sr."category" AS "sefariaCategory",
    sr."url" AS "sefariaUrl",
    tc."topic",
    tc."rationale",
    tc."confidence",
    tc."rank",
    substr(replace(replace(replace(t."text", char(10), ' '), char(13), ' '), char(9), ' '), 1, 240) AS "paragraphPreview",
    tc."createdAt",
    tc."updatedAt"
FROM "TextSefariaComplement" tc
JOIN "text" t ON t."paragraphId" = tc."paragraphId"
JOIN "Book" b ON b."id" = t."bookId"
JOIN "SefariaReference" sr ON sr."id" = tc."sefariaReferenceId"
LEFT JOIN "LlmTextClassification" lc ON lc."id" = tc."classificationRunId"
WHERE tc."deletedAt" IS NULL
  AND t."deletedAt" IS NULL
  AND sr."deletedAt" IS NULL
  AND (lc."id" IS NULL OR lc."deletedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "RabbiSacksArticle_sourceUrl_key" ON "RabbiSacksArticle"("sourceUrl");

-- CreateIndex
CREATE INDEX "RabbiSacksArticle_authorId_idx" ON "RabbiSacksArticle"("authorId");

-- CreateIndex
CREATE INDEX "RabbiSacksArticle_sourceUrl_idx" ON "RabbiSacksArticle"("sourceUrl");

-- CreateIndex
CREATE INDEX "RabbiSacksArticle_deletedAt_idx" ON "RabbiSacksArticle"("deletedAt");
