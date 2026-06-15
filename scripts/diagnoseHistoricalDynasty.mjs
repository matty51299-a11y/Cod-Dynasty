import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { buildSeason } from "../src/engine/seasonEngine.js";
import { getEra } from "../src/data/codEras.js";
import { createHistoricalStateFields, advanceHistoricalEraIfNeeded, migrateHistoricalDynastyState, introduceHistoricalRookieClass } from "../src/engine/historicalDynasty.js";

let failures = 0;
function check(label, ok, detail = "") { console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
function newState(careerMode = "modern") { return { userTeamId: "lat", userTeamType: "cdl", season: 1, players: buildInitialRoster(), prospects: generateProspects(1234).slice(0, 30), schedule: buildSeason(1), ...createHistoricalStateFields(careerMode) }; }

const modern = newState("modern");
check("Modern mode starts normally", modern?.careerMode === "modern" && modern?.currentEraId === "modern_2026", `${modern?.careerMode}/${modern?.currentEraId}`);

let hist = introduceHistoricalRookieClass(newState("historical"), "ghosts");
check("Historical mode starts in Ghosts", hist?.careerMode === "historical" && hist?.currentEraId === "ghosts", hist?.currentEraId);
check("Current game title is Call of Duty: Ghosts", hist?.currentGameTitle === "Call of Duty: Ghosts", hist?.currentGameTitle);
const ghosts = getEra("ghosts");
check("Ghosts map/mode data is available", ghosts?.modes?.includes("Blitz") && ghosts?.mapPool?.Hardpoint?.includes("Freight"));

const aw = advanceHistoricalEraIfNeeded({ ...hist, season: 1, schedule: { ...(hist.schedule || {}), season: 1 } });
check("End of season advances to Advanced Warfare", aw.currentEraId === "advanced_warfare", aw.currentEraId);
check("Era transition is recorded", aw.eraHistory?.length === 1 && aw.pendingEraTransition?.newEraId === "advanced_warfare");
const awCount = (aw.prospects || []).filter(p => p.debutEraId === "advanced_warfare").length;
check("Advanced Warfare rookie class is introduced once", awCount === 3, `${awCount} AW prospects`);
const reloaded = introduceHistoricalRookieClass(migrateHistoricalDynastyState(JSON.parse(JSON.stringify(aw))), "advanced_warfare");
const awCountReload = (reloaded.prospects || []).filter(p => p.debutEraId === "advanced_warfare").length;
check("Reloading/hydrating does not duplicate rookie class", awCountReload === awCount, `${awCountReload} after reload`);
const bo3 = advanceHistoricalEraIfNeeded({ ...reloaded, pendingEraTransition: null });
check("Advancing again moves to Black Ops 3", bo3.currentEraId === "black_ops_3", bo3.currentEraId);
const old = migrateHistoricalDynastyState({ season: 4, players: [], prospects: [], schedule: { season: 4 } });
check("Existing modern saves hydrate as modern_2026", old.careerMode === "modern" && old.currentEraId === "modern_2026", `${old.careerMode}/${old.currentEraId}`);
check("Current full-season flow compatibility smoke", !!modern.schedule?.stages?.length && !!modern.players?.length && Array.isArray(modern.prospects));

if (failures) { console.error(`\nHistorical Dynasty diagnostic failed: ${failures}`); process.exit(1); }
console.log("\nHistorical Dynasty diagnostic passed.");
