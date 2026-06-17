import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { getEra } from "../src/data/codEras.js";
import { createInitialStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState, getNextPendingMatch, getUserPendingMatch, simulateMatch, createHistoricalLiveMatch, playHistoricalLiveMap, advanceHistoricalLiveMap, applyPlayedMatchResult } from "../src/engine/historicalEventEngine.js";

let pass = 0;
function check(name, condition, detail = "") { assert.ok(condition, `${name}${detail ? ` — ${detail}` : ""}`); pass++; console.log(`✓ ${name}${detail ? ` (${detail})` : ""}`); }

console.log("═══ Event Readability Diagnostic ═══\n");
const eventUi = readFileSync(new URL("../src/components/EventDetail.jsx", import.meta.url), "utf8");
const homeUi = readFileSync(new URL("../src/components/Home.jsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/store/dynastyStore.jsx", import.meta.url), "utf8");
const userTeamId = "optic_gaming";
const event = GHOSTS_EVENTS.find(e => e.name.includes("Philadelphia")) || GHOSTS_EVENTS[0];
let ev = createHistoricalEventState(event, GHOSTS_TEAMS, GHOSTS_PLAYERS, createInitialStandings(GHOSTS_TEAMS), userTeamId, 4242);

check("1. Event hub has a clear user match state", eventUi.includes("Your Match") && eventUi.includes("Status: Ready"));
check("2. Event hub shows current matches", eventUi.includes("Current Matches") && eventUi.includes("currentMatches"));
check("3. Current matches are actual team vs team matchups", ev.matches.every(m => m.teamA?.teamName && m.teamB?.teamName), ev.matches[0] && `${ev.matches[0].teamA.teamName} vs ${ev.matches[0].teamB.teamName}`);
check("4. Bracket tab shows rounds and matchups", eventUi.includes("event-bracket-board") && eventUi.includes("roundLabel") && eventUi.includes("MatchCard"));
check("5. User team is highlighted in event views", eventUi.includes("user-team") && eventUi.includes("user-match") && eventUi.includes("user-row"));
check("6. Play Match appears only for user team match", store.includes("getUserPendingMatch(eventState, controlledTeamId)") && eventUi.includes("userMatch &&"));
check("7. Play Match opens matchday flow", store.includes("START_PLAY_MATCH") && store.includes("createHistoricalLiveMatch") && eventUi.includes("LiveMatchModal"));
let userMatch = getUserPendingMatch(ev, userTeamId);
while (!userMatch && getNextPendingMatch(ev)) { ev = simulateMatch(ev, getNextPendingMatch(ev).id, event, userTeamId); userMatch = getUserPendingMatch(ev, userTeamId); }
let live = createHistoricalLiveMatch(ev, userMatch.id, GHOSTS_PLAYERS, getEra("ghosts"), 5150);
live = playHistoricalLiveMap(live, GHOSTS_PLAYERS, getEra("ghosts"));
check("8. Matchday flow progresses map by map", live.mapResults.length === 1 && live.scoreA + live.scoreB === 1 && live.currentMapIndex === 0);
check("9. Player K/Ds are generated", live.mapResults[0].playerStats.teamA.length === 4 && live.mapResults[0].playerStats.teamA.every(p => p.kd > 0));
live = advanceHistoricalLiveMap(live);
while (live.status !== "completed") live = playHistoricalLiveMap(live, GHOSTS_PLAYERS, getEra("ghosts"));
const afterPlayed = applyPlayedMatchResult(ev, live, event, userTeamId);
check("10. Post-match summary is created", !!afterPlayed.lastPostMatchSummary?.result && afterPlayed.lastPostMatchSummary.mapResults.length > 0);
check("11. Returning to event updates bracket", afterPlayed.matches.find(m => m.id === userMatch.id)?.status === "completed");
check("12. Latest results update after a played match", afterPlayed.latestResults.length > ev.latestResults.length);
let simBase = createHistoricalEventState(event, GHOSTS_TEAMS, GHOSTS_PLAYERS, createInitialStandings(GHOSTS_TEAMS), userTeamId, 6161);
const simAfter = simulateMatch(simBase, getNextPendingMatch(simBase).id, event, userTeamId);
check("13. Latest results update after sim controls", simAfter.latestResults.length === 1);
check("14. User event path updates", afterPlayed.userEventPath.length > ev.userEventPath.length);
check("15. Home shows current or last event summary", homeUi.includes("User status") && homeUi.includes("Top performer") && homeUi.includes("Last Event"));
let full = simAfter;
let guard = 0;
while (full.status !== "completed" && guard++ < 200) full = simulateMatch(full, getNextPendingMatch(full).id, event, userTeamId);
check("16. Sim Event does not create a blank screen", full.status === "completed" && full.matches.length > 0 && full.placements.length > 0);
const allText = `${eventUi} ${homeUi} ${JSON.stringify(GHOSTS_EVENTS)}`.toLowerCase();
check("17. No Modern CDL or Challengers are required", !allText.includes("modern cdl") && !allText.includes("challengers"));
console.log(`\nEvent readability diagnostic passed (${pass} checks).`);
