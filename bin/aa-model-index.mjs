#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import {
  AA_SOURCE,
  BENCHMARK,
  enrichAiCliResult,
  enrichGatewayModel,
  fetchGatewayModel,
  fetchLeaderboard,
  findModelDetails,
  outputEnvelope,
} from "../src/index.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "list";

function usage(exitCode = 0) {
  const message = `Usage:
  aa-model-index list [--query <text>] [--creator <name>] [--limit <n>] [--format auto|table|json|jsonl|csv]
  aa-model-index model <name|slug|gateway-id> [--gateway] [--format table|json]
  aa-model-index enrich [--input <file|->] [--only-matched] [--format json|jsonl]
  aa-model-index schema

Common: --llm  --compact  --har <path>

Examples:
  aa-model-index list --query GPT-5.6 --format json
  aa-model-index model openai/gpt-5.5 --gateway --format json
  ai models --json | aa-model-index enrich --input - --only-matched --llm
  ai models anthropic/claude-opus-4.6 --json | aa-model-index enrich --input -`;
  if (exitCode && machineRequested()) {
    console.error(
      JSON.stringify({
        schemaVersion: "1.0.0",
        ok: false,
        command,
        error: { code: "AA_MODEL_INDEX_USAGE", message: "Invalid command or missing argument" },
      }),
    );
  } else {
    console[exitCode ? "error" : "log"](message);
  }
  process.exit(exitCode);
}

function machineRequested() {
  return (
    args.includes("--llm") ||
    args.includes("--compact") ||
    args.some(
      (value, index) =>
        value === "--format" && ["json", "jsonl"].includes(args[index + 1]),
    ) ||
    !process.stdout.isTTY
  );
}

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (index === args.length - 1) throw new Error(`${name} needs a value`);
  return args[index + 1];
}

function flag(name) {
  return args.includes(name);
}

function csv(rows) {
  const keys = Object.keys(rows[0] ?? {});
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [keys.join(","), ...rows.map((row) => keys.map((key) => quote(row[key])).join(","))].join("\n");
}

function listTable(rows) {
  const header = ["Rank", "Model", "Creator", "AA", "$/1M", "tok/s", "TTFT", "Total"];
  const body = rows.map((row) => [
    row.aaIntelligenceRank,
    row.model,
    row.creator,
    row.aaIntelligenceIndex,
    row.blendedUsdPerMillionTokens ?? "—",
    row.medianTokensPerSecond ?? "—",
    row.latencyFirstChunkSeconds ?? "—",
    row.totalResponseSeconds ?? "—",
  ].map(String));
  const widths = header.map((label, index) => Math.max(label.length, ...body.map((row) => row[index].length)));
  const line = (values) => values.map((value, index) => value.padEnd(widths[index])).join("  ");
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...body.map(line)].join("\n");
}

function modelCard(result) {
  const model = result.model;
  const lines = [
    `${model.model}  #${model.aaIntelligenceRank}`,
    `${model.creator} · ${model.category}`,
    "",
    `AA Intelligence Index  ${model.aaIntelligenceIndex}`,
    `Context                ${model.contextWindow}`,
    `Blended price          $${model.blendedUsdPerMillionTokens ?? "—"}/1M tokens`,
    `Median speed           ${model.medianTokensPerSecond ?? "—"} tokens/s`,
    `First chunk latency    ${model.latencyFirstChunkSeconds ?? "—"}s`,
    `Total response         ${model.totalResponseSeconds ?? "—"}s`,
    `Source                 ${model.sourceUrl ?? AA_SOURCE}`,
  ];
  if (result.alternatives?.length) lines.push("", `Related variants       ${result.alternatives.length}`);
  return lines.join("\n");
}

function gatewayModelCard(model) {
  const aa = model.artificialAnalysis;
  const lines = [
    `${model.name ?? model.id}  ${model.id}`,
    `${model.creator} · ${model.categories.join(", ") || "unknown"}`,
  ];
  if (model.contextWindow != null) lines.push(`Context                ${model.contextWindow}`);
  if (model.maxTokens != null) lines.push(`Max output             ${model.maxTokens}`);
  if (aa.matched) {
    lines.push(
      "",
      `AA Intelligence Index  ${aa.score}`,
      `AA rank                #${aa.rank}`,
      `AA match               ${aa.bestMatch.model} (${aa.matchType})`,
      `AA variants            ${aa.candidates.length}`,
    );
  } else {
    lines.push("", "AA Intelligence Index  no public match");
  }
  if (model.endpoints?.length) lines.push(`Gateway endpoints      ${model.endpoints.length}`);
  return lines.join("\n");
}

function json(value) {
  return JSON.stringify(value, null, flag("--compact") ? 0 : 2);
}

function defaultFormat(human = "table") {
  if (flag("--llm")) return "json";
  const requested = option("--format", "auto");
  return requested === "auto" ? (process.stdout.isTTY ? human : "json") : requested;
}

function jsonl(commandName, records) {
  return records
    .filter((record) => record != null)
    .map((record, index) =>
      JSON.stringify(outputEnvelope(commandName, record, { recordIndex: index })),
    )
    .join("\n");
}

function createRecorder() {
  const entries = [];
  const trackedFetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const startedDateTime = new Date().toISOString();
    const started = performance.now();
    const response = await fetch(input, init);
    const duration = Math.round(performance.now() - started);
    const bodySize = Number(response.headers.get("content-length")) || (await response.clone().arrayBuffer()).byteLength;
    entries.push({
      startedDateTime,
      time: duration,
      request: {
        method: init.method ?? "GET",
        url,
        httpVersion: "HTTP/1.1",
        headers: [],
        queryString: [...new URL(url).searchParams].map(([name, value]) => ({ name, value })),
        cookies: [],
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        httpVersion: "HTTP/1.1",
        headers: [...response.headers].map(([name, value]) => ({ name, value })),
        cookies: [],
        content: { size: bodySize, mimeType: response.headers.get("content-type") ?? "" },
        redirectURL: response.headers.get("location") ?? "",
        headersSize: -1,
        bodySize,
      },
      cache: {},
      timings: { blocked: -1, dns: -1, connect: -1, send: 0, wait: duration, receive: 0 },
    });
    return response;
  };
  return {
    entries,
    fetch: trackedFetch,
    har: () => ({ log: { version: "1.2", creator: { name: "aa-model-index", version: "0.1.0" }, entries } }),
  };
}

async function stdin() {
  if (process.stdin.isTTY) throw new Error("--input - requires piped AI CLI JSON");
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

async function main() {
  if (flag("--help") || flag("-h")) usage();
  if (command === "schema") {
    const schemaUrl = new URL("../schema/llm-output.schema.json", import.meta.url);
    console.log(await readFile(schemaUrl, "utf8"));
    return;
  }
  const recorder = createRecorder();
  const rows = await fetchLeaderboard({ fetchImpl: recorder.fetch });
  let output;

  if (["list", "models"].includes(command)) {
    const query = option("--query", "").toLowerCase();
    const creator = option("--creator", "").toLowerCase();
    const limit = Number(option("--limit", "500"));
    const format = defaultFormat();
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
    const selected = rows
      .filter((row) => !query || row.model.toLowerCase().includes(query) || row.creator.toLowerCase().includes(query))
      .filter((row) => !creator || row.creator.toLowerCase() === creator)
      .slice(0, limit);
    const payload = { benchmark: BENCHMARK, count: selected.length, models: selected };
    if (format === "json") output = json(outputEnvelope("list", payload, { query: query || null, creator: creator || null, limit }));
    else if (format === "jsonl") output = jsonl("list", selected);
    else if (format === "csv") output = csv(selected);
    else if (format === "table") output = listTable(selected);
    else throw new Error("--format must be auto, table, json, jsonl, or csv");
  } else if (command === "model") {
    const query = args[1];
    if (!query || query.startsWith("-")) usage(1);
    const format = defaultFormat();
    if (flag("--gateway")) {
      const gateway = await fetchGatewayModel(query, { fetchImpl: recorder.fetch });
      const enriched = enrichGatewayModel(gateway, rows);
      output = format === "json"
        ? json(outputEnvelope("model", enriched, { query, gateway: true }))
        : gatewayModelCard(enriched);
    } else {
      const details = findModelDetails(query, rows);
      output = format === "json"
        ? json(outputEnvelope("model", details, { query, gateway: false }))
        : modelCard(details);
    }
  } else if (command === "enrich") {
    const input = option("--input", "-");
    const format = defaultFormat("json");
    const raw = input === "-" ? await stdin() : await readFile(input, "utf8");
    let enriched = enrichAiCliResult(JSON.parse(raw), rows);
    if (flag("--only-matched")) {
      if (Array.isArray(enriched)) enriched = enriched.filter((model) => model.artificialAnalysis.matched);
      else if (!enriched.artificialAnalysis.matched) enriched = null;
    }
    const records = Array.isArray(enriched) ? enriched : [enriched];
    if (format === "json") {
      output = json(
        outputEnvelope("enrich", enriched, {
          input,
          count: records.filter(Boolean).length,
          onlyMatched: flag("--only-matched"),
        }),
      );
    } else if (format === "jsonl") output = jsonl("enrich", records);
    else throw new Error("enrich --format must be json or jsonl");
  } else {
    usage(1);
  }

  console.log(output);
  const harPath = option("--har");
  if (harPath) await writeFile(harPath, json(recorder.har()));
}

main().catch((error) => {
  if (machineRequested()) {
    console.error(
      JSON.stringify({
        schemaVersion: "1.0.0",
        ok: false,
        command,
        error: { code: "AA_MODEL_INDEX_ERROR", message: error.message },
      }),
    );
  } else {
    console.error(`aa-model-index: ${error.message}`);
  }
  process.exit(1);
});
