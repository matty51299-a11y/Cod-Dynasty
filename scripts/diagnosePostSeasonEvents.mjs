import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { buildSeason, beginChamps, beginEswc, ensureChallengerTeams, buildChallengerRostersForNewGame, simStage, simMajor, simChallengerQualifier, continueFromChallengerQualifier } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { CDL_TEAMS } from "../src/data/teams.js";

function makeState(seed = 31337) {
  const state = {
    userTeamId: "optic",
    season: 1,
    players: buildInitialRoster().map(applyChallengerRatingOverride),
    prospects: generateProspects(seed).map(applyChallengerRatingOverride),
    schedule: buildSeason(1),
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {}, retiredPlayers: [], challengersLog: [], challengerTransactions: [],
  };
  buildChallengerRostersForNewGame(state, seed);
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_postseason_events" });
}

let state = makeState();
for (let i = 0; i < 4; i++) {
  state = simStage(state);
  if (state.schedule.phase !== "challengerQualifier") throw new Error(`Expected qualifier before Major ${i + 1}, got ${state.schedule.phase}`);
  state = simChallengerQualifier(state);
  state = continueFromChallengerQualifier(state);
  if (state.schedule.phase !== "major") throw new Error(`Expected Major ${i + 1}, got ${state.schedule.phase}`);
  state = simMajor(state);
}
if (state.schedule.phase !== "challengerQualifier" || state.schedule.currentChallengerQualifier?.eventType !== "challengersFinals") {
  throw new Error(`Expected Challengers Finals after Major 4, got ${state.schedule.phase}/${state.schedule.currentChallengerQualifier?.eventType}`);
}
state = simChallengerQualifier(state);
const finals = state.schedule.currentChallengerQualifier;
const eswcChallengerRows = finals.results.filter(r => r.qualified).sort((a, b) => a.placement - b.placement);
console.log("Challengers Finals top 4:", eswcChallengerRows.map(r => r.teamName).join(", "));
if (finals.field.length !== 16) throw new Error(`Expected 16 Challengers Finals teams, got ${finals.field.length}`);
if (eswcChallengerRows.length !== 4) throw new Error(`Expected 4 ESWC Challenger qualifiers, got ${eswcChallengerRows.length}`);
state = continueFromChallengerQualifier(state);
if (state.schedule.phase !== "preChamps") throw new Error(`Expected preChamps after Finals, got ${state.schedule.phase}`);
state = beginChamps(state);
state = simMajor(state); // CDL Champs

// NEW ORDER: Champs → ESWC → Season Awards → Offseason.
// ESWC must start immediately after Champs; Season Awards are deferred.
if (state.schedule.phase !== "major" || state.schedule.majorIdx !== 5) {
  throw new Error(`Expected ESWC to start right after Champs, got ${state.schedule.phase}/${state.schedule.majorIdx}`);
}
if (state.pendingSeasonAwards) throw new Error("Season Awards must NOT appear before ESWC.");
const eswc = state.schedule.majors[5];
const seeds = eswc.bracket.seeds || [];
const cdlIds = new Set(CDL_TEAMS.map(t => t.id));
const cdlCount = seeds.filter(id => cdlIds.has(id)).length;
const challengerCount = seeds.length - cdlCount;
console.log("ESWC field:", { total: seeds.length, cdlCount, challengerCount, type: eswc.bracket.type });
if (seeds.length !== 16 || cdlCount !== 12 || challengerCount !== 4) throw new Error("ESWC should be 12 CDL + 4 Challengers Finals teams.");

const pointsBefore = JSON.stringify(state.schedule.standings);
state = simMajor(state); // ESWC
const pointsAfter = JSON.stringify(state.schedule.standings);
if (pointsBefore !== pointsAfter) throw new Error("ESWC changed CDL standings/points.");

// Season Awards gate appears only after ESWC completes.
if (!state.pendingSeasonAwards) throw new Error("Expected Season Awards after ESWC completes.");
if (state.schedule.phase !== "offseason") throw new Error(`Expected offseason phase after ESWC, got ${state.schedule.phase}`);
console.log("Postseason event diagnostic passed.");
