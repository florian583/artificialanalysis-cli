export const AA_SOURCE = "https://artificialanalysis.ai/leaderboards/models";
export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
export const BENCHMARK = "Artificial Analysis Intelligence Index";
export const OUTPUT_SCHEMA_VERSION = "1.0.0";
export const BENCHMARK_CATALOG = [
  {
    id: "artificial-analysis",
    name: "Artificial Analysis Intelligence Index",
    category: "general-intelligence",
    evaluationStyle: "composite-objective",
    url: AA_SOURCE,
    integration: "available",
  },
  {
    id: "lmarena",
    name: "LMArena Leaderboard",
    category: "human-preference",
    evaluationStyle: "blind-pairwise-voting",
    url: "https://lmarena.ai/leaderboard",
    integration: "planned",
  },
  {
    id: "livebench",
    name: "LiveBench",
    category: "general-capabilities",
    evaluationStyle: "frequently-updated-objective",
    url: "https://github.com/LiveBench/LiveBench",
    integration: "planned",
  },
  {
    id: "helm",
    name: "Stanford HELM",
    category: "holistic-evaluation",
    evaluationStyle: "multi-scenario-multi-metric",
    url: "https://crfm.stanford.edu/helm",
    integration: "planned",
  },
  {
    id: "swe-bench-verified",
    name: "SWE-bench Verified",
    category: "software-engineering",
    evaluationStyle: "real-repository-issue-resolution",
    url: "https://www.swebench.com",
    integration: "planned",
  },
  {
    id: "arc-agi-2",
    name: "ARC-AGI-2",
    category: "abstract-reasoning",
    evaluationStyle: "novel-task-generalization",
    url: "https://arcprize.org/arc-agi/2/",
    integration: "planned",
  },
];

export function outputEnvelope(command, data, meta = {}, sources = [AA_SOURCE]) {
  return {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    ok: true,
    command,
    generatedAt: new Date().toISOString(),
    sources,
    meta,
    data,
  };
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlText(value) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function number(value) {
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned || cleaned === "—") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function modelUrl(row) {
  const match = row.match(/href=["'](\/models\/[^"'#?]+)["']/i);
  return match ? new URL(match[1], AA_SOURCE).href : null;
}

export function parseLeaderboardHtml(html) {
  const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  const table = tables.find((candidate) => {
    const value = htmlText(candidate).toLowerCase();
    return (
      value.includes("model") &&
      value.includes("creator") &&
      value.includes("artificial analysis intelligence index")
    );
  });
  if (!table) {
    throw new Error(
      "Leaderboard table missing. Artificial Analysis markup changed or response was gated.",
    );
  }

  const rows = table.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  let columns;
  for (const row of rows) {
    const headerCells = [...row.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
      (match) => htmlText(match[1]),
    );
    const find = (pattern) => headerCells.findIndex((value) => pattern.test(value));
    const candidate = {
      model: find(/^Model$/i),
      contextWindow: find(/Context Window/i),
      creator: find(/^Creator$/i),
      intelligence: find(/Artificial Analysis Intelligence Index/i),
      price: find(/USD\/1M Tokens/i),
      speed: find(/Tokens\/s/i),
      latency: find(/First Chunk/i),
      total: find(/Total Response/i),
    };
    if (Object.values(candidate).every((index) => index >= 0)) {
      columns = candidate;
      break;
    }
  }
  if (!columns) throw new Error("Leaderboard columns changed. Expected benchmark headers not found.");

  const parsed = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (match) => match[1],
    );
    if (!/<td\b/i.test(row) || cells.length <= Math.max(...Object.values(columns))) continue;
    const values = cells.map(htmlText);
    const aaIntelligenceIndex = number(values[columns.intelligence]);
    if (!values[columns.model] || aaIntelligenceIndex === null) continue;
    parsed.push({
      model: values[columns.model],
      creator: values[columns.creator],
      category: "language-model",
      benchmark: BENCHMARK,
      aaIntelligenceIndex,
      contextWindow: values[columns.contextWindow],
      blendedUsdPerMillionTokens: number(values[columns.price]),
      medianTokensPerSecond: number(values[columns.speed]),
      latencyFirstChunkSeconds: number(values[columns.latency]),
      totalResponseSeconds: number(values[columns.total]),
      sourceUrl: modelUrl(row),
    });
  }

  if (!parsed.length) throw new Error("No model rows parsed. Artificial Analysis markup changed.");
  return parsed.map((model, index) => ({ ...model, aaIntelligenceRank: index + 1 }));
}

export async function fetchLeaderboard({
  fetchImpl = fetch,
  minimumRows = 50,
  retries = 2,
  timeoutMs = 15_000,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(AA_SOURCE, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "aa-model-index/0.1 (+https://github.com/florian583/artificialanalysis-cli)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          throw new Error(
            `Artificial Analysis request failed: ${response.status} ${response.statusText}`,
          );
        }
        throw new Error(`Artificial Analysis temporary failure: HTTP ${response.status}`);
      }
      const rows = parseLeaderboardHtml(await response.text());
      if (rows.length < minimumRows) {
        throw new Error(
          `Leaderboard integrity check failed: ${rows.length} rows; expected at least ${minimumRows}`,
        );
      }
      return rows;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

const CREATOR_ALIASES = new Map([
  ["xai", "spacexai"],
  ["space xai", "spacexai"],
  ["zai", "zai"],
  ["z ai", "zai"],
]);

function words(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function creatorKey(value) {
  const key = words(value);
  return CREATOR_ALIASES.get(key) ?? key.replaceAll(" ", "");
}

function unqualified(value) {
  return words(value)
    .split(" ")
    .filter(
      (token) =>
        ![
          "max",
          "xhigh",
          "high",
          "medium",
          "low",
          "minimal",
          "reasoning",
          "nonreasoning",
          "non",
        ].includes(token),
    )
    .join("");
}

function fullKey(value) {
  return words(value).replaceAll(" ", "");
}

function gatewayNames(model) {
  const id = String(model.id ?? "");
  const shortId = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return [...new Set([model.name, shortId, id].filter(Boolean))];
}

function rowSlug(row) {
  if (!row.sourceUrl) return "";
  return new URL(row.sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
}

export function findArtificialAnalysisMatches(gatewayModel, rows, { limit = 10 } = {}) {
  const names = gatewayNames(gatewayModel);
  const provider = String(gatewayModel.id ?? "").split("/")[0];
  const gatewayCreator = creatorKey(gatewayModel.creator ?? gatewayModel.owned_by ?? provider);
  const candidates = [];

  for (const row of rows) {
    const aaCreator = creatorKey(row.creator);
    const creatorMatches = !gatewayCreator || !aaCreator || gatewayCreator === aaCreator;
    let matchScore = 0;
    let matchType = "none";
    for (const name of names) {
      if (rowSlug(row) && fullKey(name) === fullKey(rowSlug(row))) {
        matchScore = Math.max(matchScore, 130);
        matchType = "slug";
      } else if (fullKey(name) === fullKey(row.model)) {
        matchScore = Math.max(matchScore, 120);
        matchType = "exact";
      } else if (unqualified(name) && unqualified(name) === unqualified(row.model)) {
        matchScore = Math.max(matchScore, 100);
        matchType = "family";
      }
    }
    if (!creatorMatches) matchScore -= 60;
    if (matchScore >= 70) candidates.push({ matchScore, matchType, ...row });
  }

  return candidates
    .sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        b.aaIntelligenceIndex - a.aaIntelligenceIndex ||
        a.model.localeCompare(b.model),
    )
    .slice(0, limit);
}

export function enrichGatewayModel(gatewayModel, rows) {
  const matches = findArtificialAnalysisMatches(gatewayModel, rows);
  const capabilities = gatewayModel.capabilities ?? inferCapabilities(gatewayModel);
  return {
    ...gatewayModel,
    category: capabilities[0] ?? gatewayModel.type ?? "unknown",
    categories: capabilities,
    artificialAnalysis: matches.length
      ? {
          matched: true,
          matchType: matches[0].matchType,
          score: matches[0].aaIntelligenceIndex,
          rank: matches[0].aaIntelligenceRank,
          benchmark: BENCHMARK,
          bestMatch: matches[0],
          candidates: matches,
        }
      : {
          matched: false,
          reason: "No compatible public LLM leaderboard row found",
          benchmark: BENCHMARK,
          candidates: [],
        },
  };
}

export function enrichAiCliResult(payload, rows) {
  if (Array.isArray(payload)) return payload.map((model) => enrichGatewayModel(model, rows));
  if (payload && typeof payload === "object") return enrichGatewayModel(payload, rows);
  throw new Error("AI CLI JSON must be a model object or array of model objects.");
}

export function findModelDetails(query, rows) {
  const gatewayLike = {
    id: query,
    creator: query.includes("/") ? query.split("/")[0] : undefined,
  };
  const exactSlug = rows.find((row) => rowSlug(row) === query || row.sourceUrl === query);
  const exactName = rows.find((row) => row.model.toLowerCase() === query.toLowerCase());
  if (exactSlug || exactName) {
    return {
      query,
      matchType: exactSlug ? "slug" : "exact",
      model: exactSlug ?? exactName,
      alternatives: [],
    };
  }
  const matches = findArtificialAnalysisMatches(gatewayLike, rows);
  if (!matches.length) throw new Error(`Artificial Analysis model not found: ${query}`);
  return { query, matchType: matches[0].matchType, model: matches[0], alternatives: matches.slice(1) };
}

export function inferCapabilities(model) {
  if (Array.isArray(model.capabilities)) return model.capabilities;
  const tags = model.tags ?? [];
  switch (model.type) {
    case "language":
      return tags.includes("image-generation") ? ["text", "image"] : ["text"];
    case "image":
    case "video":
    case "speech":
    case "transcription":
      return [model.type];
    default:
      return [];
  }
}

export function normalizeGatewayModel(model) {
  const provider = String(model.id ?? "").split("/")[0];
  return {
    id: model.id,
    ...(model.name ? { name: model.name } : {}),
    ...(model.description ? { description: model.description } : {}),
    creator: model.creator ?? model.owned_by ?? provider,
    capabilities: inferCapabilities(model),
    ...(model.tags ? { tags: model.tags } : {}),
    ...(model.contextWindow != null || model.context_window != null
      ? { contextWindow: model.contextWindow ?? model.context_window }
      : {}),
    ...(model.maxTokens != null || model.max_tokens != null
      ? { maxTokens: model.maxTokens ?? model.max_tokens }
      : {}),
    ...(model.released != null ? { released: model.released } : {}),
    ...(model.pricing ? { pricing: model.pricing } : {}),
    ...(model.endpoints ? { endpoints: model.endpoints } : {}),
  };
}

export async function fetchGatewayModel(query, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(GATEWAY_MODELS_URL);
  if (!response.ok) throw new Error(`Vercel AI Gateway request failed: ${response.status}`);
  const payload = await response.json();
  const models = payload.data ?? [];
  const fullId = query.includes("/")
    ? query
    : models.find((model) => String(model.id).split("/").at(-1) === query)?.id;
  const raw = models.find((model) => model.id === fullId);
  if (!raw) throw new Error(`Vercel AI Gateway model not found: ${query}`);

  const normalized = normalizeGatewayModel(raw);
  const endpointResponse = await fetchImpl(`${GATEWAY_MODELS_URL}/${normalized.id}/endpoints`);
  if (endpointResponse.ok) {
    const endpointPayload = await endpointResponse.json();
    if (endpointPayload.data) {
      Object.assign(normalized, {
        ...(endpointPayload.data.name ? { name: endpointPayload.data.name } : {}),
        ...(endpointPayload.data.description
          ? { description: endpointPayload.data.description }
          : {}),
        ...(endpointPayload.data.released != null
          ? { released: endpointPayload.data.released }
          : {}),
        endpoints: endpointPayload.data.endpoints ?? [],
      });
    }
  }
  return normalized;
}
