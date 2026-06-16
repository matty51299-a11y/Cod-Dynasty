import assert from "node:assert/strict";
import fs from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { getEra } from "../src/data/codEras.js";
import { createInitialStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState, getNextPendingMatch, getUserPendingMatch, simulateMatch, createHistoricalLiveMatch, playHistoricalLiveMap, advanceHistoricalLiveMap, applyPlayedMatchResult } from "../src/engine/historicalEventEngine.js";

let pass = 0;
function check(name, condition, detail = "") { assert.ok(condition, `${name}${detail ? ` — ${detail}` : ""}`); pass++; console.log(`✓ ${name}${detail ? ` (${detail})` : ""}`); }

console.log("═══ Historical Play Match Diagnostic ═══\n");
const era = getEra("ghosts");
const standings = createInitialStandings(GHOSTS_TEAMS);
const event = GHOSTS_EVENTS.find(e => e.name === "UMG Philadelphia 2014") || GHOSTS_EVENTS[0];
const userTeamId = "optic_gaming";
let state = createHistoricalEventState(event, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 2468);
const eventUi = fs.readFileSync("src/components/EventDetail.jsx", "utf8");

check("Start Ghosts dynasty", era.id === "ghosts" && era.gameTitle === "Call of Duty: Ghosts");
check("Open first bracket event", !!state && state.format !== "round_robin" && state.matches.length > 0, event.name);
let userMatch = getUserPendingMatch(state, userTeamId);
while (!userMatch && getNextPendingMatch(state)) {
  state = simulateMatch(state, getNextPendingMatch(state).id, event, userTeamId);
  userMatch = getUserPendingMatch(state, userTeamId);
}
check("User team has or can reach a pending match", !!userMatch, userMatch?.roundLabel);
check("Event screen exposes Play Match when user match is pending", eventUi.includes("START_PLAY_MATCH") && eventUi.includes("▶ Play Match"));
const completedBeforeLive = state.matches.filter(m => m.status === "completed").length;
let live = createHistoricalLiveMatch(state, userMatch.id, GHOSTS_PLAYERS, era, 1111);
check("Play Match creates an interactive live match state", !!live && live.status === "in_progress" && live.scoreA === 0 && live.scoreB === 0);
check("Play Match does not instantly resolve the full event", state.status === "in_progress" && state.matches.filter(m => m.status === "completed").length === completedBeforeLive);
check("Live match uses Ghosts modes", live.mapSet.every(m => ["Domination", "Search and Destroy", "Blitz"].includes(m.mode)), live.mapSet.map(m => m.mode).join(" / "));
check("Live match does not use Hardpoint", live.mapSet.every(m => m.mode !== "Hardpoint"));
live = playHistoricalLiveMap(live, GHOSTS_PLAYERS, era);
check("One Play Map action completes only one map", live.mapResults.length === 1 && live.scoreA + live.scoreB === 1);
check("Map index stays for review after Play Map", live.currentMapIndex === 0 && live.mapResults.length === 1);
check("Player K/Ds are generated for both teams", live.mapResults[0].playerStats.teamA.length === 4 && live.mapResults[0].playerStats.teamB.length === 4 && live.mapResults[0].playerStats.teamA.every(p => p.kills > 0 && p.deaths > 0 && p.kd > 0));
live = advanceHistoricalLiveMap(live);
check("Advance moves to next map", live.currentMapIndex === 1);
while (live.status !== "completed") live = playHistoricalLiveMap(live, GHOSTS_PLAYERS, era);
check("Series ends when a team reaches 3 maps", live.status === "completed" && (live.scoreA === 3 || live.scoreB === 3));
const applied = applyPlayedMatchResult(state, live, event, userTeamId);
const playedMatch = applied.matches.find(m => m.id === userMatch.id);
check("Finish Match applies result to the event bracket", playedMatch.status === "completed" && playedMatch.scoreA + playedMatch.scoreB === live.scoreA + live.scoreB);
check("Results tab includes the played match", applied.latestResults.length > 0 && applied.matches.some(m => m.id === userMatch.id && m.mapResults?.length));
check("User route/status updates", applied.teamStates[userTeamId].wins + applied.teamStates[userTeamId].losses > state.teamStates[userTeamId].wins + state.teamStates[userTeamId].losses);
const quickBase = createHistoricalEventState(event, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 1357);
const quickUserMatch = getUserPendingMatch(quickBase, userTeamId);
const quickAfter = simulateMatch(quickBase, quickUserMatch.id, event, userTeamId);
check("Sim User Match still quick-sims only the user match", quickAfter.matches.filter(m => m.status === "completed").length - quickBase.matches.filter(m => m.status === "completed").length === 1);
let full = quickAfter;
while (full.status !== "completed") full = simulateMatch(full, getNextPendingMatch(full).id, event, userTeamId);
check("Sim Event still completes the event", full.status === "completed" && !!full.champion);
const allText = `${eventUi} ${JSON.stringify(GHOSTS_EVENTS)}`.toLowerCase();
check("No Modern CDL mode or Challengers are required", !allText.includes("challenger") && !allText.includes("modern cdl"));
console.log(`\nHistorical Play Match diagnostic passed (${pass} checks).`);
