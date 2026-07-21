DROP INDEX IF EXISTS "text_ref_key";

CREATE UNIQUE INDEX IF NOT EXISTS "text_ref_language_key" ON "text"("ref", "language");
