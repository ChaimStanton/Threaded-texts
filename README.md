# LSJS Sacks

Node backend and React/MUI frontend for LSJS Sacks source work.

## Stack

- Backend: Node, Express, TypeScript
- Frontend: React, Vite, Material UI
- Data: Prisma with SQLite
- Tooling: npm workspaces, Moon, Proto
- Sefaria: typed fetch client placeholder in `apps/backend/src/sefaria/client.ts`
- Rabbi Sacks: initial scraper endpoint at `POST /rabbi-sacks/articles/scrape`
- LLM classification: official OpenAI Node client for structured Sefaria complement refs

## Setup

```sh
proto install
npm install
cp apps/backend/.env.example apps/backend/.env
npm run prisma:migrate -- --name init
npm run dev
```

If Prisma's schema engine is blocked locally, bootstrap the SQLite dev database with:

```sh
npm --workspace @lsjs-sacks/backend run db:bootstrap
```

During early schema churn, reset the local SQLite dev database with:

```sh
npm --workspace @lsjs-sacks/backend run db:reset
```

Backend scripts are TypeScript and run through `tsx`.

The frontend runs on `http://localhost:5173` and proxies `/api` to the backend on `http://localhost:4000`.

## Sefaria complement classification

Set `OPENAI_API_KEY` in `apps/backend/.env`. The default model is `gpt-5.2`; override with `OPENAI_COMPLEMENT_MODEL`.

Preview the request without calling the model:

```sh
npm --workspace @lsjs-sacks/backend run classify:sefaria-complements -- --dry-run --limit=1
```

Classify and persist rows:

```sh
npm --workspace @lsjs-sacks/backend run classify:sefaria-complements -- --limit=10
```

The classifier only accepts complements from `tanach`, `gemara`, `mishna`, `shulchan_aruch`, and `rambam`.
