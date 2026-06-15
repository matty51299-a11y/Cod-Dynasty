import { getEra, getNextEra } from "../src/data/codEras.js";
import { createHistoricalStateFields, advanceHistoricalEraIfNeeded, migrateHistoricalDynastyState } from "../src/engine/historicalDynasty.js";

const failures = [];
function check(label, pass, detail = "") {
  if (pass) console.log(`PASS: ${label}`);
  else { failures.push(`${label}${detail ? ` (${detail})` : ""}`); console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`); }
}

const fresh = createHistoricalStateFields();
check("Fresh Cod Dynasty state is historical", fresh.careerMode === "historical", fresh.careerMode);
check("Fresh Cod Dynasty state starts in Ghosts", fresh.currentEraId === "ghosts", fresh.currentEraId);
check("Current game title is Call of Duty: Ghosts", fresh.currentGameTitle === "Call of Duty: Ghosts", fresh.currentGameTitle);
const ghosts = getEra("ghosts");
check("Ghosts mode data excludes Hardpoint", !ghosts.modes.includes("Hardpoint"), ghosts.modes.join(", "));
check("Ghosts mode data includes Blitz and Domination", ghosts.modes.includes("Blitz") && ghosts.modes.includes("Domination"), ghosts.modes.join(", "));
const aw = advanceHistoricalEraIfNeeded({ ...fresh, season: 1, players: [], prospects: [] });
check("End of season advances to Advanced Warfare", aw.currentEraId === "advanced_warfare", aw.currentEraId);
const bo3 = advanceHistoricalEraIfNeeded({ ...aw, pendingEraTransition: null });
check("Advancing again moves to Black Ops 3", bo3.currentEraId === "black_ops_3", bo3.currentEraId);
const old = migrateHistoricalDynastyState({ userTeamId: "boston" });
check("Copied saves hydrate into historical Ghosts mode", old.careerMode === "historical" && old.currentEraId === "ghosts", `${old.careerMode}/${old.currentEraId}`);
check("Historical era chain includes Advanced Warfare next", getNextEra("ghosts")?.id === "advanced_warfare");

if (failures.length) {
  console.error(`Historical dynasty diagnostic FAILED with ${failures.length} problem(s).`);
  process.exit(1);
}
console.log("Historical dynasty diagnostic passed.");
