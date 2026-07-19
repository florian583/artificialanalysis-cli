import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_CATALOG,
  enrichAiCliResult,
  fetchLeaderboard,
  findArtificialAnalysisMatches,
  findModelDetails,
  outputEnvelope,
  parseLeaderboardHtml,
} from "../src/index.mjs";

const html = `<table><tbody><tr><td>Unrelated table</td></tr></tbody></table>
<table><thead><tr><th>Model</th><th>Context Window</th><th>Creator</th><th>Artificial Analysis Intelligence Index</th><th>Blended USD/1M Tokens</th><th>Median Tokens/s</th><th>Latency First Chunk (s)</th><th>Total Response (s)</th><th>Further Analysis</th></tr></thead><tbody>
<tr><td>GPT-5.5 (xhigh)</td><td>922k</td><td>OpenAI</td><td>55</td><td>$4.35</td><td>69</td><td>61.57</td><td>68.87</td><td><a href="/models/gpt-5-5">Model</a></td></tr>
<tr><td>GPT-5.5 (high)</td><td>922k</td><td>OpenAI</td><td>53</td><td>$4.35</td><td>68</td><td>30.93</td><td>38.33</td><td><a href="/models/gpt-5-5-high">Model</a></td></tr>
<tr><td>Claude Opus 4.6 (max)</td><td>1M</td><td>Anthropic</td><td>52</td><td>$3.85</td><td>50</td><td>2.1</td><td>20</td><td><a href="/models/claude-opus-4-6">Model</a></td></tr>
</tbody></table>`;

test("parses public leaderboard rows", () => {
  const rows = parseLeaderboardHtml(html);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].aaIntelligenceIndex, 55);
  assert.equal(rows[0].aaIntelligenceRank, 1);
  assert.equal(rows[0].sourceUrl, "https://artificialanalysis.ai/models/gpt-5-5");
});

test("matches an AI Gateway family to AA reasoning variants", () => {
  const rows = parseLeaderboardHtml(html);
  const matches = findArtificialAnalysisMatches(
    { id: "openai/gpt-5.5", creator: "openai" },
    rows,
  );
  assert.deepEqual(matches.map((match) => match.model), ["GPT-5.5 (xhigh)", "GPT-5.5 (high)"]);
});

test("enriches ai models --json output with score, rank, and category", () => {
  const rows = parseLeaderboardHtml(html);
  const [result] = enrichAiCliResult(
    [{ id: "openai/gpt-5.5", creator: "openai", capabilities: ["text"] }],
    rows,
  );
  assert.equal(result.category, "text");
  assert.equal(result.artificialAnalysis.score, 55);
  assert.equal(result.artificialAnalysis.candidates.length, 2);
});

test("gets one model by AA slug", () => {
  const rows = parseLeaderboardHtml(html);
  const result = findModelDetails("gpt-5-5-high", rows);
  assert.equal(result.model.model, "GPT-5.5 (high)");
  assert.equal(result.model.aaIntelligenceIndex, 53);
});

test("creates stable LLM output envelope", () => {
  const result = outputEnvelope("model", { score: 55 }, { query: "gpt-5.5" });
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.ok, true);
  assert.equal(result.command, "model");
  assert.deepEqual(result.data, { score: 55 });
  assert.deepEqual(result.meta, { query: "gpt-5.5" });
  assert.match(result.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("parses reordered columns by header names", () => {
  const reordered = `<table><thead><tr><th>Creator</th><th>Model</th><th>Total Response (s)</th><th>Median Tokens/s</th><th>Context Window</th><th>Artificial Analysis Intelligence Index</th><th>Latency First Chunk (s)</th><th>Blended USD/1M Tokens</th></tr></thead><tbody><tr><td>OpenAI</td><td>GPT-Test</td><td>10</td><td>100</td><td>128k</td><td>42</td><td>1.5</td><td>$2.00</td></tr></tbody></table>`;
  const [result] = parseLeaderboardHtml(reordered);
  assert.equal(result.model, "GPT-Test");
  assert.equal(result.creator, "OpenAI");
  assert.equal(result.aaIntelligenceIndex, 42);
  assert.equal(result.medianTokensPerSecond, 100);
});

test("retries temporary HTTP failures", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? new Response("temporary", { status: 503 })
      : new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  };
  const rows = await fetchLeaderboard({ fetchImpl, minimumRows: 1, retries: 1 });
  assert.equal(calls, 2);
  assert.equal(rows.length, 3);
});

test("benchmark catalog separates integrated and planned adapters", () => {
  assert.equal(BENCHMARK_CATALOG.find((item) => item.id === "artificial-analysis").integration, "available");
  assert.equal(BENCHMARK_CATALOG.find((item) => item.id === "lmarena").integration, "planned");
  assert.ok(BENCHMARK_CATALOG.length >= 6);
});
