ALTER TABLE "Chapter" ADD COLUMN "isNonMainText" BOOLEAN NOT NULL DEFAULT false;

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

CREATE INDEX "Chapter_isNonMainText_idx" ON "Chapter"("isNonMainText");

DROP VIEW IF EXISTS "AuxiliaryTextReview";
DROP VIEW IF EXISTS "NonMainTextReview";
DROP VIEW IF EXISTS "PrimaryEnglishText";
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
