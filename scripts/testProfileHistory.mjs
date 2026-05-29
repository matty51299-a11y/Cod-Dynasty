import { buildInitialRoster } from "../src/data/players.js";
import { CDL_TEAMS } from "../src/data/teams.js";
import { buildSeason } from "../src/engine/seasonEngine.js";
import { buildPlayerHistory, buildTeamHistory, findPlayerEverywhere, findTeamEverywhere, getTeamRoster } from "../src/utils/historyProfiles.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const players = buildInitialRoster();
const team = CDL_TEAMS[0];
const player = players.find(p => p.teamId === team.id && !p.isSub);
const schedule = buildSeason(1);
schedule.matchLog = [{
  season: 1,
  stage: "Stage 1",
  winnerId: team.id,
  loserId: CDL_TEAMS[1].id,
  score: "3-1",
  mapResults: [{ mapNum: 1 }, { mapNum: 2 }, { mapNum: 3 }, { mapNum: 4 }],
  playerStats: {
    [player.id]: { name: player.name, teamId: team.id, kills: 80, deaths: 64, kd: 1.25 },
  },
}];

const challenger = { id: "test_chall", name: "Test Challengers", tag: "TST", region: "NA", playerIds: [] };
const state = {
  season: 1,
  userTeamId: team.id,
  players,
  prospects: [],
  retiredPlayers: [],
  challengerTeams: [challenger],
  challengerTransactions: [],
  schedule,
  playerSeasonStats: {},
};

const foundPlayer = findPlayerEverywhere(state, player.id);
assert(foundPlayer?.name === player.name, "player profile lookup should find CDL player by id");
assert(findTeamEverywhere(state, challenger.id)?.name === challenger.name, "team profile lookup should find challenger team");
assert(getTeamRoster(state, team.id).length >= 4, "CDL team roster should resolve");

const playerHistory = buildPlayerHistory(state, player);
assert(playerHistory.summary.kills === 80, "player history should aggregate kills from match log");
assert(playerHistory.summary.maps === 4, "player history should aggregate maps from match log");
assert(playerHistory.seasons[0].events.length === 1, "player history should include an event row");

const teamHistory = buildTeamHistory(state, team.id);
assert(teamHistory.seasons[0].wins === 1, "team history should aggregate wins from match log");
assert(teamHistory.seasons[0].kills === 80, "team history should aggregate player kills from match log");

console.log("profile history checks passed");
