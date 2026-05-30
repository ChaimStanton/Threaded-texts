# Agentic One-Shot Prompt

You are working in `C:\Users\chaim\Documents\code\lsjsSacks`.

Goal: build LSJS Sacks as a source-ingestion and study-text platform with a Node/Express backend, React/MUI frontend, Prisma, and SQLite for now.

Current architecture:
- Root npm workspace with `apps/backend` and `apps/frontend`.
- Proto pins Node/npm in `.prototools`; run `proto install` before dependency work.
- Moon owns repo tasks; run `npm run build` for full verification.
- Backend keeps all external text access server-side.
- Frontend calls the backend through Vite proxy `/api`.
- Sefaria access should stay behind `apps/backend/src/sefaria/`.
- Rabbi Sacks scraping should stay behind `apps/backend/src/scrapers/`.
- Repo-owned backend scripts should be TypeScript and run through `tsx`.

Database rules:
- Every table must have `createdAt`, `updatedAt`, and nullable `deletedAt`.
- Application queries should filter out `deletedAt != null` through repository helpers.
- Prefer normalized tables and real foreign keys.
- `Author` is the canonical author table.
- `Book.authorId` is optional for general source texts.
- `RabbiSacksArticle.authorId` is required and should link to `rabbi-lord-jonathan-sacks`.
- `TextUnit` maps to table name `text` and stores granular text chunks by `paragraphId`, `bookId`, `chapter`, `verse`, and `paragraph`.

Important local caveat:
- In this environment, Prisma `migrate dev`, `migrate deploy`, and `db push` can fail with an empty schema-engine error.
- `prisma validate` and `prisma generate` work.
- Use `npm --workspace @lsjs-sacks/backend run db:reset` to rebuild the local SQLite dev database from the checked-in SQL migration while this issue exists.

Useful commands:

```sh
proto install
npm install
npm run prisma:generate
npm --workspace @lsjs-sacks/backend run db:reset
npm --workspace @lsjs-sacks/backend run ingest:sefaria:sacks
npm run build
```

Next high-value work:
- Replace the initial direct Rabbi Sacks scraper with a crawl queue and deduped article ingestion.
- Add source citation joins between source notes, text units, and Rabbi Sacks articles.
- Add generated Sefaria SDK if an OpenAPI JSON spec is provided.
- Add tests around repository soft-delete behavior and route validation.
- Add pagination/search before scraping at scale.
