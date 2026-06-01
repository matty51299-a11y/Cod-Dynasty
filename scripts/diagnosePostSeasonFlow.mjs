// Post-season flow diagnostic — verifies the corrected calendar:
//   CDL Champs → ESWC → Season Awards → Offseason → Contract Review.
//
// Drives a full season with the engine, then walks the post-Champs state
// machine asserting each gate fires in the right order and never loops/skips.
//
// Run: node --loader ./scripts/asset-loader.mjs scripts/diagnosePostSeasonFlow.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import {
  buildSeason, beginChamps, beginEswc, ensureChallengerTeams,
  buildChallengerRostersForNewGame, simStage, simMajor,
  simChallengerQualifier, continueFromChallengerQualifier, enterContractPhase,
} from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";

const ESWC_IDX = 5;
const failures = [];
const ok = (cond, msg) => { if (cond) { console.log("  ✓ " + msg); } else { failures.push(msg); console.error("  ✗ " + msg); } };

function makeState(seed = 555) {
  const state = {
    userTeamId: "optic",
    season: 1,
    players: buildInitialRoster().map(applyChallengerRatingOverride),
    prospects: generateProspects(seed).map(applyChallengerRatingOverride),
    schedule: buildSeason(1),
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [],
    seenAwardsSeasons: [],
  };
  buildChallengerRostersForNewGame(state, seed);
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_postseason_flow" });
}

// Mirror the reducer's CONTINUE_FROM_SEASON_AWARDS routing (engine-only slice).
function continueFromAwards(state) {
  const season = Number(state.pendingSeasonAwards?.season ?? state.season);
  const seenAwardsSeasons = [...new Set([...(state.seenAwardsSeasons || []).map(Number), season])];
  const base = { ...state, pendingSeasonAwards: null, seenAwardsSeasons };
  // If a legacy save still has ESWC pending here, the reducer would start it.
  return base.schedule?.pendingPostChampsEswc ? beginEswc(base) : base;
}

let state = makeState();

// Drive to Champs.
for (let i = 0; i < 4; i++) {
  state = simStage(state);
  state = simChallengerQualifier(state);
  state = continueFromChallengerQualifier(state);
  state = simMajor(state);
}
// Major 4 → Challengers Finals → preChamps.
state = simChallengerQualifier(state);
state = continueFromChallengerQualifier(state);
ok(state.schedule.phase === "preChamps", "reached Pre-Champs after Challengers Finals");

state = beginChamps(state);
ok(state.schedule.phase === "major" && state.schedule.majorIdx === 4, "Champs started (major idx 4)");

console.log("\n[1] Champs completes →");
state = simMajor(state); // CDL Champs
ok(!!state.schedule.majors[4]?.completed, "Champs is marked completed");

console.log("\n[2] ESWC must start next (NOT Season Awards) →");
ok(state.schedule.phase === "major", "phase is 'major' after Champs (ESWC live)");
ok(state.schedule.majorIdx === ESWC_IDX, "majorIdx is ESWC (5) immediately after Champs");
ok(!state.pendingSeasonAwards, "Season Awards are NOT shown before ESWC");
// ESWC is now LIVE (not merely pending), so the pending flag is cleared — this
// is what stops CONTINUE_FROM_SEASON_AWARDS from restarting ESWC later.
ok(state.schedule.pendingPostChampsEswc === false, "pendingPostChampsEswc cleared once ESWC is live");
ok(!!state.schedule.majors[ESWC_IDX]?.bracket && !state.schedule.majors[ESWC_IDX]?.completed, "ESWC bracket built and not yet completed");

console.log("\n[3] ESWC completes →");
const standingsBefore = JSON.stringify(state.schedule.standings);
state = simMajor(state); // ESWC
ok(!!state.schedule.majors[ESWC_IDX]?.completed, "ESWC is marked completed");
ok(JSON.stringify(state.schedule.standings) === standingsBefore, "ESWC did not change CDL standings/points");

console.log("\n[4] Season Awards show after ESWC →");
ok(!!state.pendingSeasonAwards, "Season Awards gate appears after ESWC");
ok(state.schedule.phase === "offseason", "phase is 'offseason' (awards overlay sits on top)");
ok(state.schedule.pendingPostChampsEswc === false, "pendingPostChampsEswc cleared once ESWC done");

console.log("\n[5] Offseason starts after Awards (no ESWC repeat, no double awards) →");
state = continueFromAwards(state);
ok(!state.pendingSeasonAwards, "no pending awards after continue");
ok(state.schedule.phase === "offseason", "stays in offseason after continuing from awards");
ok(state.schedule.majorIdx !== ESWC_IDX, "ESWC does NOT restart after awards");
ok((state.seenAwardsSeasons || []).includes(state.season), "season recorded as awards-seen (prevents duplicate awards)");

console.log("\n[6] Contract Review still works →");
const contracted = enterContractPhase({ ...state });
ok(contracted.schedule.phase === "contracts", "contract review phase entered from offseason");

console.log("\n────────────────────────────────────────");
if (failures.length) {
  console.error(`Post-season flow diagnostic FAILED with ${failures.length} problem(s).`);
  process.exit(1);
}
console.log("Post-season flow diagnostic passed (Champs → ESWC → Awards → Offseason → Contracts).");
