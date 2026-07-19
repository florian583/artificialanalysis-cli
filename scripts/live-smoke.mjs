import { fetchLeaderboard } from "../src/index.mjs";

const models = await fetchLeaderboard();
const scoresValid = models.every(
  (model) =>
    Number.isFinite(model.aaIntelligenceIndex) &&
    Number.isInteger(model.aaIntelligenceRank) &&
    model.model &&
    model.creator,
);

if (!scoresValid) throw new Error("Live leaderboard returned invalid model records");

console.log(
  JSON.stringify({
    ok: true,
    rowCount: models.length,
    firstModel: models[0].model,
    firstScore: models[0].aaIntelligenceIndex,
    checkedAt: new Date().toISOString(),
  }),
);
