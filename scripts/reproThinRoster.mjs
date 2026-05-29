// Reproduces the simMap "Cannot read properties of undefined (reading 'id')"
// crash. Runs Season 1 → offseason → Season 2 Stage 1 with team=boston.
// Adds an instrumented buildTeamObj-equivalent that logs roster sizes.
import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { normalizePlayerName } from "../src/utils/playerIdentity.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import {
  buildSeason,
  beginChamps,
  ensureChallengerTeams,
  simMajor,
  simStage,
  simMatchday,
  simChallengerQualifier,
  continueFromChallengerQualifier,
  advanceOffseason,
  enterContractPhase,
} from "../src/engine/seasonEngine.js";

function newGame(teamId) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const rawProspects = generateProspects(12345).map(applyChallengerRatingOverride);
  const seen = new Set();
  const prospects = rawProspects.filter((p) => {
    const key = normalizePlayerName(p.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const state = {
    userTeamId: teamId,
    season: 1,
    players,
    prospects,
    schedule: buildSeason(1),
    notifications: [],
    feed: [],
    saveExists: true,
    enteredMajorIdx: null,
    playerSeasonStats: {},
    playerOvrHistory: {},
    challengersLog: [],
    challengerTransactions: [],
  };
  ensureChallengerTeams(state);
  return state;
}

function rosterReport(state, label) {
  const counts = CDL_TEAMS.map(t => {
    const starters = state.players.filter(p => p.teamId === t.id && !p.isSub);
    const subs = state.players.filter(p => p.teamId === t.id && p.isSub);
    return { id: t.id, starters: starters.length, subs: subs.length };
  });
  const thin = counts.filter(c => c.starters < 4);
  console.log(`[${label}] thin rosters:`, thin.length ? thin : "(all 4+)");
  if (thin.length) {
    for (const t of thin) {
      const team = CDL_TEAMS.find(x => x.id === t.id);
      console.log(`  ${t.id} (${team.name}): ${t.starters} starters, ${t.subs} subs`);
    }
  }
}

let state = newGame("boston");
rosterReport(state, "season 1 start");

while (state.schedule.phase !== "offseason" && state.schedule.phase !== "contracts") {
  if (state.schedule.phase === "stage") state = simStage(state);
  else if (state.schedule.phase === "challengerQualifier") {
    state = simChallengerQualifier(state);
    state = continueFromChallengerQualifier(state);
  } else if (state.schedule.phase === "major") state = simMajor(state);
  else if (state.schedule.phase === "preChamps") state = beginChamps(state);
}

rosterReport(state, "season 1 end (offseason)");
state = enterContractPhase(state);
state = advanceOffseason(state);
rosterReport(state, "season 2 start (post-offseason)");

// Now sim into Stage 1 of Season 2 — if simMatchday crashes, we know
// at least one team has <4 starters.
try {
  state = simMatchday(state);
  console.log("simMatchday season 2 stage 1 succeeded");
  rosterReport(state, "season 2 after first matchday");
} catch (e) {
  console.error("simMatchday CRASH:", e.message);
  console.error(e.stack);
}
