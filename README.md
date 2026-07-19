# artificialanalysis-cli

Unofficial, zero-dependency CLI for Artificial Analysis public LLM scores. Lists the whole public leaderboard, returns one model, and enriches [`vercel-labs/ai-cli`](https://github.com/vercel-labs/ai-cli) JSON with AA score, rank, benchmark, category, and candidate variants.

## Run

Package is GitHub-only. Commands resolve the public repository directly; no npm publication required.

```sh
npx --yes github:florian583/artificialanalysis-cli list
npx --yes github:florian583/artificialanalysis-cli list --query "GPT-5.6" --format json
npx --yes github:florian583/artificialanalysis-cli model gpt-5-6-sol --format json
npx --yes github:florian583/artificialanalysis-cli model openai/gpt-5.5 --gateway --format json
```

Bun works through the same repository:

```sh
bunx github:florian583/artificialanalysis-cli list
bunx github:florian583/artificialanalysis-cli model gpt-5-6-sol --llm --compact
```

Output defaults to human table in an interactive terminal and versioned JSON when piped or run by an agent. `--llm` forces machine output; `--compact` emits one-line JSON.

```sh
npx --yes github:florian583/artificialanalysis-cli list --llm --compact
npx --yes github:florian583/artificialanalysis-cli list --format jsonl
npx --yes github:florian583/artificialanalysis-cli schema
```

Machine output uses a stable envelope: `schemaVersion`, `ok`, `command`, `generatedAt`, `sources`, `meta`, and `data`. Errors use JSON on stderr with `ok: false`, stable error code, and non-zero exit status. JSONL emits one complete envelope per line.

`--gateway` fetches the same public Vercel AI Gateway model registry and per-provider endpoint data used by AI CLI. It adds context window, output limits, pricing, tags, release date, provider latency, throughput, and uptime when available.

## Enrich Vercel AI CLI results

AI CLI's machine-readable contract is `ai models --json`. Pipe it directly:

```sh
npx ai-cli models --json \
  | npx --yes github:florian583/artificialanalysis-cli enrich --input - --only-matched --llm > models-with-aa.json

npx ai-cli models anthropic/claude-opus-4.6 --json \
  | npx --yes github:florian583/artificialanalysis-cli enrich --input - > claude-opus-4.6-with-aa.json
```

File input also works:

```sh
npx ai-cli models --json > gateway-models.json
npx --yes github:florian583/artificialanalysis-cli enrich --input gateway-models.json --format jsonl
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

## Reliability

AA exposes benchmark rows in server-rendered leaderboard HTML; capture found no public benchmark JSON API. Parser therefore treats HTML as an external contract.

Current protections:

- Finds leaderboard table by required semantic headers instead of page position.
- Resolves columns by header names instead of fixed cell indexes.
- Requires at least 50 valid rows, preventing silent partial/gated results.
- Retries rate limits and temporary server failures with bounded exponential backoff.
- Uses a 15-second request timeout and explicit client user-agent.
- Returns non-zero machine-readable errors instead of stale or partial data.
- Runs daily live-source GitHub Actions smoke test plus fixture-based parser tests.

Remaining limitation: AA can rename headers or redesign markup. Daily smoke detects breakage; adapter still needs a code update. No last-known-good cache is returned automatically because fresh provenance matters more than silent stale success.

## Other benchmark sources

Discover integrated and planned adapters:

```sh
npx --yes github:florian583/artificialanalysis-cli benchmarks
npx --yes github:florian583/artificialanalysis-cli benchmarks --llm --compact
```

| Benchmark | Signal | Best use | Integration |
| --- | --- | --- | --- |
| Artificial Analysis Intelligence Index | Composite objective evaluation | General model comparison with cost/speed | Available |
| [LMArena](https://lmarena.ai/leaderboard) | Blind human preference | Real-user response preference | Planned |
| [LiveBench](https://github.com/LiveBench/LiveBench) | Frequently refreshed objective tasks | Contamination-resistant capability tracking | Planned |
| [Stanford HELM](https://crfm.stanford.edu/helm) | Multi-scenario, multi-metric evaluation | Transparent holistic comparison | Planned |
| [SWE-bench Verified](https://www.swebench.com) | Real repository issue resolution | Coding agents | Planned |
| [ARC-AGI-2](https://arcprize.org/arc-agi/2/) | Novel abstract reasoning tasks | Generalization/reasoning | Planned |

AA remains only fetched benchmark. Planned entries are catalog metadata, not synthetic scores. Adapter priority: LMArena for human preference, LiveBench for refreshed objective scores, then specialized coding/reasoning sources.

Requires Node.js 20+. No API key. No browser cookies. Public HTML/API contracts can change; parser failures exit non-zero instead of returning stale data.

## Data sources

- [Artificial Analysis LLM leaderboard](https://artificialanalysis.ai/leaderboards/models)
- [Vercel AI CLI model documentation](https://github.com/vercel-labs/ai-cli/blob/main/apps/web/docs/models.mdx)
- [Vercel AI Gateway models API usage in AI CLI](https://github.com/vercel-labs/ai-cli/blob/main/packages/ai-cli/src/lib/models.ts)
- [LiveBench](https://github.com/LiveBench/LiveBench)
- [Stanford HELM](https://github.com/stanford-crfm/helm)
- [SWE-bench](https://github.com/SWE-bench/SWE-bench)
- [ARC-AGI-2](https://github.com/arcprize/ARC-AGI-2)

Not affiliated with Artificial Analysis or Vercel.
