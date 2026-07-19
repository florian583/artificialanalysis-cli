import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichAiCliResult,
  findArtificialAnalysisMatches,
  findModelDetails,
  outputEnvelope,
  parseLeaderboardHtml,
} from "../src/index.mjs";

const html = `<table><tbody>
<tr><td>Model</td><td>Context</td><td>Creator</td><td>Score</td><td>Price</td><td>Speed</td><td>Latency</td><td>Total</td></tr>
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
