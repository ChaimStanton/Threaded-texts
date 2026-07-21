import { DatabaseSync } from "node:sqlite";

type TableInfoRow = {
  name: string;
};

type ForeignKeyRow = {
  from: string;
  table: string;
  to: string;
};

const db = new DatabaseSync("prisma/dev.db");

const hasTable = (table: string) =>
  db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).all(table).length > 0;

const tableSql = (table: string) =>
  (
    db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table) as { sql?: string } | undefined
  )?.sql ?? "";

const hasColumn = (table: string, column: string) =>
  db.prepare(`PRAGMA table_info("${table}")`).all().some((row) => (row as TableInfoRow).name === column);

const hasForeignKey = (table: string, from: string, toTable: string, to: string) =>
  db
    .prepare(`PRAGMA foreign_key_list("${table}")`)
    .all()
    .some((row) => {
      const foreignKey = row as ForeignKeyRow;
      return foreignKey.from === from && foreignKey.table === toTable && foreignKey.to === to;
    });

db.exec(`
  CREATE TABLE IF NOT EXISTS "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT,
    "heTitle" TEXT,
    "isNonMainText" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Chapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  );
`);

if (!hasColumn("text", "chapterId")) {
  db.exec(`ALTER TABLE "text" ADD COLUMN "chapterId" TEXT;`);
}

if (!hasColumn("text", "isAuxiliary")) {
  db.exec(`ALTER TABLE "text" ADD COLUMN "isAuxiliary" BOOLEAN NOT NULL DEFAULT false;`);
}

if (!hasColumn("Chapter", "isNonMainText")) {
  db.exec(`ALTER TABLE "Chapter" ADD COLUMN "isNonMainText" BOOLEAN NOT NULL DEFAULT false;`);
}

if (!hasForeignKey("text", "chapterId", "Chapter", "id")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE IF NOT EXISTS "text_next" (
      "paragraphId" TEXT NOT NULL PRIMARY KEY,
      "bookId" TEXT NOT NULL,
      "chapterId" TEXT,
      "chapter" INTEGER NOT NULL,
      "verse" INTEGER,
      "paragraph" INTEGER NOT NULL,
      "ref" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "language" TEXT NOT NULL DEFAULT 'en',
      "version" TEXT,
      "isAuxiliary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "deletedAt" DATETIME,
      CONSTRAINT "text_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "text_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );

    INSERT INTO "text_next" (
      "paragraphId",
      "bookId",
      "chapterId",
      "chapter",
      "verse",
      "paragraph",
      "ref",
      "text",
      "language",
      "version",
      "isAuxiliary",
      "createdAt",
      "updatedAt",
      "deletedAt"
    )
    SELECT
      "paragraphId",
      "bookId",
      "chapterId",
      "chapter",
      "verse",
      "paragraph",
      "ref",
      "text",
      "language",
      "version",
      "isAuxiliary",
      "createdAt",
      "updatedAt",
      "deletedAt"
    FROM "text";

    DROP TABLE "text";
    ALTER TABLE "text_next" RENAME TO "text";

    PRAGMA foreign_keys = ON;
  `);
}

if (hasTable("TextTanachComplement") && !hasTable("TextSefariaComplement")) {
  db.exec(`ALTER TABLE "TextTanachComplement" RENAME TO "TextSefariaComplement";`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS "SefariaReference" (
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

  CREATE TABLE IF NOT EXISTS "LlmTextClassification" (
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

  CREATE TABLE IF NOT EXISTS "TextSefariaComplement" (
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

  CREATE TABLE IF NOT EXISTS "SefariaComplementAiReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textSefariaComplementId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "prompt" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "responseText" TEXT,
    "providerRequestId" TEXT,
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "verdict" TEXT,
    "score" INTEGER,
    "issueTags" JSONB,
    "rationale" TEXT,
    "suggestedAction" TEXT,
    "suggestedRef" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SefariaComplementAiReview_textSefariaComplementId_fkey" FOREIGN KEY ("textSefariaComplementId") REFERENCES "TextSefariaComplement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  );
`);

if (!hasColumn("SefariaReference", "corpus")) {
  db.exec(`ALTER TABLE "SefariaReference" ADD COLUMN "corpus" TEXT NOT NULL DEFAULT 'tanach';`);
}

if (!tableSql("SefariaReference").includes("SefariaReference_corpus_check")) {
  db.exec(`
    DROP VIEW IF EXISTS "TextTanachComplementReview";
    DROP VIEW IF EXISTS "TextSefariaComplementReview";

    PRAGMA foreign_keys = OFF;

    CREATE TABLE "SefariaReference_next" (
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

    INSERT INTO "SefariaReference_next" (
      "id",
      "ref",
      "normalizedRef",
      "corpus",
      "book",
      "category",
      "url",
      "createdAt",
      "updatedAt",
      "deletedAt"
    )
    SELECT
      "id",
      "ref",
      "normalizedRef",
      CASE
        WHEN "corpus" IN ('tanach', 'gemara', 'mishna', 'shulchan_aruch', 'rambam') THEN "corpus"
        ELSE 'tanach'
      END,
      "book",
      "category",
      "url",
      "createdAt",
      "updatedAt",
      "deletedAt"
    FROM "SefariaReference";

    DROP TABLE "SefariaReference";
    ALTER TABLE "SefariaReference_next" RENAME TO "SefariaReference";

    PRAGMA foreign_keys = ON;
  `);
}

const llmUsageColumns = [
  ["providerRequestId", "TEXT"],
  ["inputTokens", "INTEGER"],
  ["cachedInputTokens", "INTEGER"],
  ["outputTokens", "INTEGER"],
  ["reasoningTokens", "INTEGER"],
  ["totalTokens", "INTEGER"],
  ["estimatedCostUsd", "REAL"]
] as const;

for (const [column, type] of llmUsageColumns) {
  if (!hasColumn("LlmTextClassification", column)) {
    db.exec(`ALTER TABLE "LlmTextClassification" ADD COLUMN "${column}" ${type};`);
  }
}

db.exec(`
  UPDATE "Chapter"
  SET "isNonMainText" = CASE
    WHEN lower(coalesce("title", "ref", '')) LIKE 'chapter %' THEN false
    WHEN lower(coalesce("title", "ref", '')) LIKE 'preface%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'publisher''s preface%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'publishers preface%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'author''s preface%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'authors preface%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'introduction%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'acknowledg%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'dedication%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'contents%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'appendix%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'note%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'bibliography%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'suggestion% for further reading%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'further reading%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'glossary%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'index%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'a quick quiz%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'quick quiz%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'top ten%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'educational companion%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'hanukka challenge%' THEN true
    WHEN lower(coalesce("title", "ref", '')) LIKE 'fun fact%' THEN true
    ELSE false
  END
  WHERE "deletedAt" IS NULL;

  DROP INDEX IF EXISTS "text_ref_key";
  CREATE UNIQUE INDEX IF NOT EXISTS "text_ref_language_key" ON "text"("ref", "language");
  CREATE INDEX IF NOT EXISTS "text_bookId_idx" ON "text"("bookId");
  CREATE UNIQUE INDEX IF NOT EXISTS "Chapter_bookId_number_key" ON "Chapter"("bookId", "number");
  CREATE UNIQUE INDEX IF NOT EXISTS "Chapter_bookId_ref_key" ON "Chapter"("bookId", "ref");
  CREATE INDEX IF NOT EXISTS "Chapter_bookId_idx" ON "Chapter"("bookId");
  CREATE INDEX IF NOT EXISTS "Chapter_isNonMainText_idx" ON "Chapter"("isNonMainText");
  CREATE INDEX IF NOT EXISTS "Chapter_deletedAt_idx" ON "Chapter"("deletedAt");
  CREATE INDEX IF NOT EXISTS "text_bookId_chapter_verse_paragraph_idx" ON "text"("bookId", "chapter", "verse", "paragraph");
  CREATE INDEX IF NOT EXISTS "text_isAuxiliary_idx" ON "text"("isAuxiliary");
  CREATE INDEX IF NOT EXISTS "text_deletedAt_idx" ON "text"("deletedAt");
  CREATE INDEX IF NOT EXISTS "text_chapterId_idx" ON "text"("chapterId");
  CREATE UNIQUE INDEX IF NOT EXISTS "SefariaReference_ref_key" ON "SefariaReference"("ref");
  CREATE INDEX IF NOT EXISTS "SefariaReference_corpus_idx" ON "SefariaReference"("corpus");
  CREATE INDEX IF NOT EXISTS "SefariaReference_book_idx" ON "SefariaReference"("book");
  CREATE INDEX IF NOT EXISTS "SefariaReference_category_idx" ON "SefariaReference"("category");
  CREATE INDEX IF NOT EXISTS "SefariaReference_deletedAt_idx" ON "SefariaReference"("deletedAt");
  CREATE INDEX IF NOT EXISTS "LlmTextClassification_paragraphId_idx" ON "LlmTextClassification"("paragraphId");
  CREATE INDEX IF NOT EXISTS "LlmTextClassification_paragraphId_promptVersion_provider_model_status_idx" ON "LlmTextClassification"("paragraphId", "promptVersion", "provider", "model", "status");
  CREATE UNIQUE INDEX IF NOT EXISTS "LlmTextClassification_active_completed_once_key" ON "LlmTextClassification"("paragraphId", "promptVersion", "provider", "model") WHERE "deletedAt" IS NULL AND "status" = 'completed';
  CREATE UNIQUE INDEX IF NOT EXISTS "LlmTextClassification_active_pending_once_key" ON "LlmTextClassification"("paragraphId", "promptVersion", "provider", "model") WHERE "deletedAt" IS NULL AND "status" = 'pending';
  CREATE INDEX IF NOT EXISTS "LlmTextClassification_provider_model_idx" ON "LlmTextClassification"("provider", "model");
  CREATE INDEX IF NOT EXISTS "LlmTextClassification_status_idx" ON "LlmTextClassification"("status");
  CREATE INDEX IF NOT EXISTS "LlmTextClassification_deletedAt_idx" ON "LlmTextClassification"("deletedAt");
  CREATE INDEX IF NOT EXISTS "TextSefariaComplement_paragraphId_idx" ON "TextSefariaComplement"("paragraphId");
  CREATE INDEX IF NOT EXISTS "TextSefariaComplement_sefariaReferenceId_idx" ON "TextSefariaComplement"("sefariaReferenceId");
  CREATE INDEX IF NOT EXISTS "TextSefariaComplement_classificationRunId_idx" ON "TextSefariaComplement"("classificationRunId");
  CREATE INDEX IF NOT EXISTS "TextSefariaComplement_deletedAt_idx" ON "TextSefariaComplement"("deletedAt");
  CREATE UNIQUE INDEX IF NOT EXISTS "TextSefariaComplement_paragraphId_sefariaReferenceId_classificationRunId_key" ON "TextSefariaComplement"("paragraphId", "sefariaReferenceId", "classificationRunId");
  CREATE INDEX IF NOT EXISTS "SefariaComplementAiReview_textSefariaComplementId_idx" ON "SefariaComplementAiReview"("textSefariaComplementId");
  CREATE INDEX IF NOT EXISTS "SefariaComplementAiReview_provider_model_idx" ON "SefariaComplementAiReview"("provider", "model");
  CREATE INDEX IF NOT EXISTS "SefariaComplementAiReview_promptVersion_status_idx" ON "SefariaComplementAiReview"("promptVersion", "status");
  CREATE INDEX IF NOT EXISTS "SefariaComplementAiReview_verdict_idx" ON "SefariaComplementAiReview"("verdict");
  CREATE INDEX IF NOT EXISTS "SefariaComplementAiReview_score_idx" ON "SefariaComplementAiReview"("score");
  CREATE INDEX IF NOT EXISTS "SefariaComplementAiReview_deletedAt_idx" ON "SefariaComplementAiReview"("deletedAt");
`);

db.exec(`
  DROP VIEW IF EXISTS "AuxiliaryTextReview";
  DROP VIEW IF EXISTS "NonMainTextReview";
  DROP VIEW IF EXISTS "PrimaryEnglishText";
  DROP VIEW IF EXISTS "TextTanachComplementReview";
  DROP VIEW IF EXISTS "TextSefariaComplementReview";

  CREATE VIEW "AuxiliaryTextReview" AS
  SELECT
      t."paragraphId",
      t."ref",
      t."bookId",
      b."title" AS "bookTitle",
      t."chapterId",
      c."number" AS "chapterNumber",
      c."ref" AS "chapterRef",
      c."title" AS "chapterTitle",
      c."isNonMainText",
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

  CREATE VIEW "NonMainTextReview" AS
  SELECT
      t."paragraphId",
      t."ref",
      t."bookId",
      b."title" AS "bookTitle",
      t."chapterId",
      c."number" AS "chapterNumber",
      c."ref" AS "chapterRef",
      c."title" AS "chapterTitle",
      c."isNonMainText",
      t."isAuxiliary",
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
  JOIN "Chapter" c ON c."id" = t."chapterId"
  WHERE c."isNonMainText" = true
    AND t."deletedAt" IS NULL
    AND c."deletedAt" IS NULL
    AND b."deletedAt" IS NULL;

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
      c."title" AS "chapterTitle",
      c."isNonMainText",
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
    AND (c."id" IS NULL OR (c."deletedAt" IS NULL AND c."isNonMainText" = false));

  CREATE VIEW "TextSefariaComplementReview" AS
  SELECT
      tc."id",
      tc."paragraphId",
      t."ref" AS "paragraphRef",
      b."title" AS "bookTitle",
      c."title" AS "chapterTitle",
      c."isNonMainText",
      t."chapter",
      t."verse",
      t."paragraph",
      tc."classificationRunId",
      lc."provider",
      lc."model",
      lc."promptVersion",
      lc."providerRequestId",
      lc."inputTokens",
      lc."cachedInputTokens",
      lc."outputTokens",
      lc."reasoningTokens",
      lc."totalTokens",
      lc."estimatedCostUsd",
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
  LEFT JOIN "Chapter" c ON c."id" = t."chapterId"
  JOIN "SefariaReference" sr ON sr."id" = tc."sefariaReferenceId"
  LEFT JOIN "LlmTextClassification" lc ON lc."id" = tc."classificationRunId"
  WHERE tc."deletedAt" IS NULL
    AND t."deletedAt" IS NULL
    AND sr."deletedAt" IS NULL
    AND (lc."id" IS NULL OR lc."deletedAt" IS NULL);
`);

db.close();
