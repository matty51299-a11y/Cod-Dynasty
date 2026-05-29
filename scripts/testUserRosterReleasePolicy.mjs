import { buildInitialRoster } from "../src/data/players.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { findPhaseInvariantViolations } from "../src/store/gameValidation.js";
import { getRosterIncompleteMessage, getTeamRosterStatus } from "../src/utils/rosterValidation.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const userTeamId = "lat";
const aiTeamId = CDL_TEAMS.find(t => t.id !== userTeamId)?.id;
const players = buildInitialRoster();

const userStarterIds = players.filter(p => p.teamId === userTeamId && !p.isSub).slice(0, 1).map(p => p.id);
const aiStarterIds = players.filter(p => p.teamId === aiTeamId && !p.isSub).slice(0, 1).map(p => p.id);

const thinState = {
  userTeamId,
  season: 1,
  players: players.filter(p => !userStarterIds.includes(p.id) && !aiStarterIds.includes(p.id)),
  prospects: [],
  challengerTeams: [],
  challengerTransactions: [],
  rosterMovesLog: [],
  schedule: buildSeason(1),
};

assert(getTeamRosterStatus(thinState.players, userTeamId).count === 3, "fixture should make user team thin");
assert(getTeamRosterStatus(thinState.players, aiTeamId).count === 3, "fixture should make AI team thin");

const repaired = ensureCdlRosterIntegrity(thinState, { windowType: "test_user_release_policy" });
const userStatus = getTeamRosterStatus(repaired.players, userTeamId);
const aiStatus = getTeamRosterStatus(repaired.players, aiTeamId);

assert(userStatus.count === 3, `user team should stay temporarily thin, got ${userStatus.count}`);
assert(aiStatus.count >= 4, `AI team should be auto-repaired to 4+, got ${aiStatus.count}`);

const message = getRosterIncompleteMessage(repaired);
assert(message?.includes("3/4 starters"), `expected clear 3/4 roster message, got ${message}`);

const problems = findPhaseInvariantViolations(repaired);
assert(!problems.some(p => p.includes(`team ${userTeamId} has only`)), "user thin roster should not be a phase invariant violation");
assert(!problems.some(p => p.includes(`team ${aiTeamId} has only`)), "AI thin roster should have been repaired before validation");

console.log("user roster release policy checks passed");
