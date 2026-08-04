ALTER TABLE "SourceNote" ADD COLUMN "attribution" TEXT;
ALTER TABLE "SourceNote" ADD COLUMN "license" TEXT;
ALTER TABLE "SourceNote" ADD COLUMN "sourceUrl" TEXT;

ALTER TABLE "text" ADD COLUMN "attribution" TEXT;
ALTER TABLE "text" ADD COLUMN "license" TEXT;
ALTER TABLE "text" ADD COLUMN "sourceUrl" TEXT;

ALTER TABLE "SefariaReference" ADD COLUMN "attribution" TEXT;
ALTER TABLE "SefariaReference" ADD COLUMN "license" TEXT;

UPDATE "text"
SET "attribution" = CASE
  WHEN "version" IS NOT NULL AND trim("version") <> '' THEN 'Sefaria: ' || "version"
  ELSE 'Sefaria'
END
WHERE "paragraphId" LIKE 'sefaria:%'
  AND "attribution" IS NULL;

UPDATE "text"
SET "license" = 'CC-BY-NC'
WHERE "paragraphId" LIKE 'sefaria:%'
  AND "license" IS NULL
  AND "bookId" IN (
    SELECT "id"
    FROM "Book"
    WHERE coalesce("category", '') LIKE '%Rabbi Lord Jonathan Sacks%'
       OR coalesce("category", '') LIKE '%Jonathan Sacks%'
       OR "title" = 'The Jonathan Sacks Haggadah'
  );

UPDATE "SefariaReference"
SET "attribution" = 'Sefaria'
WHERE "attribution" IS NULL;
