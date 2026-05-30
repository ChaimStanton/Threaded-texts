# Agent Instructions

This repo uses `internal-docs/` for project-specific context that should persist across agent sessions.

Before changing Sefaria, Rabbi Sacks, source-ingestion, or text-reference behavior, check the relevant note in `internal-docs/`.

## Internal Docs

- `internal-docs/rabbi-sacks-sefaria.md`: Sefaria identifiers, Rabbi Sacks topic details, and useful MCP/API access commands.
- `internal-docs/agentic-one-shot-prompt.md`: compact continuation prompt for future coding agents.

## Project Notes

- Keep Sefaria access behind backend modules rather than calling Sefaria directly from the frontend.
- Preserve exact Sefaria refs when storing or passing them through the system.
- Prefer stable Sefaria slugs/refs over display titles in code and persisted data.
