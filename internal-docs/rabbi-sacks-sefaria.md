# Rabbi Sacks Sefaria Notes

## Canonical Sefaria Identifier

Use this Sefaria topic/author slug for Rabbi Lord Jonathan Sacks:

```text
jonathan-sacks
```

Canonical topic page:

```text
https://www.sefaria.org/topics/jonathan-sacks
```

Author works tab:

```text
https://www.sefaria.org/topics/jonathan-sacks?tab=author-works-on-sefaria
```

Rabbi Sacks library category:

```text
https://www.sefaria.org/texts/Jewish%20Thought/Modern/Rabbi%20Lord%20Jonathan%20Sacks
```

Do not use `rabbi-jonathan-sacks` as the main identifier. It exists as a topic slug, but it appears to be a thin duplicate with no sources. Use `jonathan-sacks`.

## Sefaria MCP Commands

When Sefaria MCP tools are available in Codex, prefer them over ad hoc web scraping.

Useful MCP calls:

```ts
// Topic/author details for Rabbi Sacks.
mcp__codex_apps__sefaria_texts._get_topic_details({
  topic_slug: "jonathan-sacks",
  with_links: true,
  with_refs: true
});

// Get text content for a Sefaria ref.
mcp__codex_apps__sefaria_texts._get_text({
  reference: "Genesis 1:1",
  version_language: "both"
});

// Get all English translations for a Sefaria ref.
mcp__codex_apps__sefaria_texts._get_english_translations({
  reference: "Genesis 1:1"
});

// Get index/catalogue metadata for a work.
mcp__codex_apps__sefaria_texts._get_text_catalogue_info({
  title: "Genesis"
});

// Get text or category structure.
mcp__codex_apps__sefaria_texts._get_text_or_category_shape({
  name: "Rabbi Lord Jonathan Sacks"
});

// Find links/cross-references for a ref.
mcp__codex_apps__sefaria_texts._get_links_between_texts({
  reference: "Genesis 1:1",
  with_text: "1"
});
```

Confirmed MCP topic details for `jonathan-sacks` include:

- Primary English title: `Jonathan Sacks`
- Primary Hebrew title exists in the Sefaria record.
- English aliases include `Rabbi Sacks` and `Rabbi Lord Jonothan Sacks`.
- Hebrew aliases also exist in the Sefaria record.

## Sefaria REST API Notes

The backend is configured with:

```text
SEFARIA_API_BASE_URL="https://www.sefaria.org/api"
```

Current backend client:

```text
apps/backend/src/sefaria/client.ts
```

Current helper:

```ts
getSefariaText(ref: string)
```

It calls:

```text
GET https://www.sefaria.org/api/texts/{encodedRef}?context=0
```

Example:

```text
GET https://www.sefaria.org/api/texts/Genesis%201%3A1?context=0
```

Project route:

```text
GET /api/sources/sefaria/:ref
```

When adding Rabbi Sacks-specific Sefaria support, prefer storing `jonathan-sacks` as a stable topic slug and fetching through backend code so frontend callers do not depend directly on Sefaria API shape.

## English Body Availability Checked 2026-06-12

For the current LLM complement tuning goal, English-only means actual English body text returned by Sefaria, not merely English catalogue titles.

Checked with Sefaria MCP/API:

- `Not in God's Name; Confronting Religious Violence`
- `Radical Then, Radical Now`
- `The Home We Build Together; Recreating Society`

All three expose English section titles, but their body text versions currently report only Hebrew available versions. English-only ingestion should skip them unless Sefaria later exposes an English body version.

Use the guarded importer form to avoid accidentally ingesting Hebrew for an English-only run:

```sh
SEFARIA_SACKS_REQUIRE_ENGLISH=1 \
SEFARIA_SACKS_WORK_TITLES="Not in God's Name; Confronting Religious Violence|Radical Then, Radical Now|The Home We Build Together; Recreating Society" \
npm --workspace @lsjs-sacks/backend run ingest:sefaria:sacks -- --require-english
```

Before spending OpenAI budget on the English-only tuning loop, run:

```sh
npm --workspace @lsjs-sacks/backend run check:sefaria:sacks-english
```

Only classify when `englishOnlyTargetsReady` contains one or more target works. If it is empty, Sefaria still has no English body text for the requested books and the loop should make no OpenAI calls.

## Hebrew Publication Corpus Checked 2026-07-13

The complete local Hebrew publication corpus was rechecked against Sefaria for the three target books:

| Sefaria work | Sections | Hebrew segments | Model-eligible Sacks paragraphs |
| --- | ---: | ---: | ---: |
| `Not in God's Name; Confronting Religious Violence` | 19 | 1,183 | 910 |
| `Radical Then, Radical Now` | 18 | 600 | 552 |
| `The Home We Build Together; Recreating Society` | 23 | 1,045 | 961 |

The publication reader intentionally includes every ordered section and segment, including front matter and back matter. Model processing uses `src/text/sacksProcessingEligibility.ts` and has narrower authorship rules:

- Include the three Sacks paragraphs in `Introduction to Hebrew Edition` for *Not in God's Name*.
- Exclude the exact duplicate segments `Dualism:74` and `The Scapegoat:13` from processing.
- Include substantive Sacks preface prose through `Preface:22` for *Radical Then, Radical Now*.
- Exclude the complete *Radical Then, Radical Now* epilogue because it is by Micah Goodman.
- Continue excluding auxiliary rows and generic non-main sections from recommendation generation.

Run the reproducible integrity checks with:

```sh
npm --workspace @lsjs-sacks/backend run prune:sefaria:sacks-complements
npm --workspace @lsjs-sacks/backend run check:publication:sacks
```
