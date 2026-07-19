# artificialanalysis-cli

Unofficial, zero-dependency CLI for Artificial Analysis public LLM scores. Lists the whole public leaderboard, returns one model, and enriches [`vercel-labs/ai-cli`](https://github.com/vercel-labs/ai-cli) JSON with AA score, rank, benchmark, category, and candidate variants.

## Run

```sh
npx aa-model-index list
npx aa-model-index list --query "GPT-5.6" --format json
npx aa-model-index model gpt-5-6-sol --format json
npx aa-model-index model openai/gpt-5.5 --gateway --format json
```

Output defaults to human table in an interactive terminal and versioned JSON when piped or run by an agent. `--llm` forces machine output; `--compact` emits one-line JSON.

```sh
npx aa-model-index list --llm --compact
npx aa-model-index list --format jsonl
npx aa-model-index schema
```

Machine output uses a stable envelope: `schemaVersion`, `ok`, `command`, `generatedAt`, `sources`, `meta`, and `data`. Errors use JSON on stderr with `ok: false`, stable error code, and non-zero exit status. JSONL emits one complete envelope per line.

`--gateway` fetches the same public Vercel AI Gateway model registry and per-provider endpoint data used by AI CLI. It adds context window, output limits, pricing, tags, release date, provider latency, throughput, and uptime when available.

## Enrich Vercel AI CLI results

AI CLI's machine-readable contract is `ai models --json`. Pipe it directly:

```sh
npx ai-cli models --json \
  | npx aa-model-index enrich --input - --only-matched --llm > models-with-aa.json

npx ai-cli models anthropic/claude-opus-4.6 --json \
  | npx aa-model-index enrich --input - > claude-opus-4.6-with-aa.json
```

File input also works:

```sh
npx ai-cli models --json > gateway-models.json
npx aa-model-index enrich --input gateway-models.json --format jsonl
```

Each enriched result preserves AI CLI fields and adds:

```json
{
  "category": "text",
  "categories": ["text"],
  "artificialAnalysis": {
    "matched": true,
    "matchType": "family",
    "score": 55,
    "rank": 8,
    "benchmark": "Artificial Analysis Intelligence Index",
    "bestMatch": {},
    "candidates": []
  }
}
```

Reasoning-effort variants can map one Gateway ID to multiple AA rows. `bestMatch` selects highest-confidence, then highest AA score. `candidates` retains alternatives; consumers can choose exact effort variant.

## Formats and capture

- `list`: table, JSON, CSV.
- `model`: human card or JSON.
- `enrich`: JSON or JSONL.
- `schema`: bundled JSON Schema for tool/agent validation.
- `--llm`: versioned JSON envelope, independent of terminal detection.
- `--compact`: token-efficient single-line JSON.
- `--har <file>`: records every HTTP request performed by this CLI invocation.

## Public repository setup

1. Set package scope/name if `aa-model-index` is unavailable when publishing.
2. Run `npm test && npm pack --dry-run`.
3. Publish with `npm publish --access public`.

The unscoped npm name `aa-model-index` returned 404 (available) on 2026-07-19. Recheck immediately before publishing; registry state can change.

Requires Node.js 20+. No API key. No browser cookies. Public HTML/API contracts can change; parser failures exit non-zero instead of returning stale data.

## Data sources

- [Artificial Analysis LLM leaderboard](https://artificialanalysis.ai/leaderboards/models)
- [Vercel AI CLI model documentation](https://github.com/vercel-labs/ai-cli/blob/main/apps/web/docs/models.mdx)
- [Vercel AI Gateway models API usage in AI CLI](https://github.com/vercel-labs/ai-cli/blob/main/packages/ai-cli/src/lib/models.ts)

Not affiliated with Artificial Analysis or Vercel.
