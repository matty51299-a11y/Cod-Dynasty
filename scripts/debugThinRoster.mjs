// Debug why fillMinimumRoster doesn't reach 4 starters for some teams.
import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { normalizePlayerName, buildCdlRosterNameSet, isInactivePlayer } from "../src/utils/playerIdentity.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import {
  buildSeason,
  ensureChallengerTeams,
  simMajor,
  simStage,
  simChallengerQualifier,
  continueFromChallengerQualifier,
  advanceOffseason,
  enterContractPhase,
  beginChamps,
} from "../src/engine/seasonEngine.js";
import { getSigningCost, getTeamCap } from "../src/engine/rosterAI.js";

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

let state = newGame("boston");

while (state.schedule.phase !== "offseason") {
  if (state.schedule.phase === "stage") state = simStage(state);
  else if (state.schedule.phase === "challengerQualifier") {
    state = simChallengerQualifier(state);
    state = continueFromChallengerQualifier(state);
  } else if (state.schedule.phase === "major") state = simMajor(state);
  else if (state.schedule.phase === "preChamps") state = beginChamps(state);
}

state = enterContractPhase(state);
state = advanceOffseason(state);

// Inspect what fill found for cloud9
function dumpFillForTeam(teamId) {
  const starters = state.players.filter(p => p.teamId === teamId && !p.isSub);
  console.log(`\n=== ${teamId} ===`);
  console.log(`starters: ${starters.length}`);
  const committed = starters.reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
  const cap = getTeamCap(teamId);
  console.log(`committed: $${committed/1000}k / cap $${cap/1000}k = remaining $${(cap-committed)/1000}k`);

  const cdlNames = buildCdlRosterNameSet(state.players);
  const fa = state.players.filter(p => !p.teamId && !p.isProspect);
  const pros = state.prospects.filter(p => !p.teamId);

  const faActive = fa.filter(c => !isInactivePlayer(c));
  const prosActive = pros.filter(c => !isInactivePlayer(c));
  console.log(`pool: FA=${fa.length} (active=${faActive.length}), prospects=${pros.length} (active=${prosActive.length})`);

  const faUnique = faActive.filter(c => !cdlNames.has(normalizePlayerName(c.name)));
  const prosUnique = prosActive.filter(c => !cdlNames.has(normalizePlayerName(c.name)));
  console.log(`pool after dup filter: FA=${faUnique.length}, prospects=${prosUnique.length}`);

  const allPool = [...faUnique, ...prosUnique]
    .sort((a, b) => getSigningCost(a) - getSigningCost(b));
  console.log(`cheapest 3 in pool:`);
  for (const c of allPool.slice(0, 3)) {
    console.log(`  ${c.name} (OVR ${c.overall}, cost $${getSigningCost(c)/1000}k, isProspect=${!!c.isProspect}, status=${c.status})`);
  }
}

for (const teamId of ["cloud9", "paris", "toronto", "boston"]) {
  dumpFillForTeam(teamId);
}
