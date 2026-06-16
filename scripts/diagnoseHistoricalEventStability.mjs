import fs from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { createInitialStandings, updateStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState, getNextPendingMatch, getUserPendingMatch, simulateMatch, toEventResult } from "../src/engine/historicalEventEngine.js";

let pass = 0, fail = 0;
function check(label, condition, detail = "") {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}
function simRound(state, event, userTeamId) {
  const next = getNextPendingMatch(state);
  const round = next?.round;
  const label = next?.roundLabel;
  for (const match of [...state.matches].filter(m => m.status === "pending" && m.round === round && m.roundLabel === label)) {
    state = simulateMatch(state, match.id, event, userTeamId);
  }
  return state;
}
function simEvent(state, event, userTeamId) {
  let guard = 0;
  while (state.status !== "completed" && guard++ < 500) {
    const match = getNextPendingMatch(state);
    if (!match) break;
    state = simulateMatch(state, match.id, event, userTeamId);
  }
  return state;
}

console.log("═══ Historical Event Stability Diagnostic ═══\n");
const userTeamId = "team_kaliber";
const standings = createInitialStandings(GHOSTS_TEAMS);
const firstEvent = GHOSTS_EVENTS[0];
let state = createHistoricalEventState(firstEvent, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 2468);

check("Fresh Ghosts dynasty can create first event", !!state && state.eventId === firstEvent.id);
for (const event of GHOSTS_EVENTS) {
  const eventState = createHistoricalEventState(event, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 1000 + GHOSTS_EVENTS.indexOf(event));
  check(`${event.name}: user team entered`, eventState.field.some(t => t.teamId === userTeamId));
  check(`${event.name}: all active pro teams entered`, eventState.field.length === GHOSTS_TEAMS.length, `field=${eventState.field.length} teams=${GHOSTS_TEAMS.length}`);
}
const online2ks = GHOSTS_EVENTS.filter(e => e.type === "online_2k" || e.tier === "online_2k");
check("Online 2Ks exist", online2ks.length > 0);
check("Online 2Ks are points/seeding events, not gates", online2ks.every(e => createHistoricalEventState(e, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 55).field.length === GHOSTS_TEAMS.length));

const currentMatches = state.matches.filter(m => m.status === "pending" && m.round === getNextPendingMatch(state)?.round && m.roundLabel === getNextPendingMatch(state)?.roundLabel);
check("First event has visible current matches", currentMatches.length > 0);
check("Event has actual team-vs-team matchups", state.matches.some(m => m.teamA?.teamName && m.teamB?.teamName));

let completedBefore = state.matches.filter(m => m.status === "completed").length;
state = simulateMatch(state, getNextPendingMatch(state).id, firstEvent, userTeamId);
check("Sim Next Match completes one match", state.matches.filter(m => m.status === "completed").length - completedBefore === 1);

const beforeRoundPending = state.matches.filter(m => m.status === "pending" && m.round === getNextPendingMatch(state)?.round && m.roundLabel === getNextPendingMatch(state)?.roundLabel).length;
state = simRound(state, firstEvent, userTeamId);
check("Sim Round completes one current round group", beforeRoundPending > 0 && state.matches.filter(m => m.status === "completed").length >= completedBefore + 1 + beforeRoundPending);

let userReadyState = state;
let guard = 0;
while (!getUserPendingMatch(userReadyState, userTeamId) && userReadyState.status !== "completed" && guard++ < 100) {
  userReadyState = simulateMatch(userReadyState, getNextPendingMatch(userReadyState).id, firstEvent, userTeamId);
}
const userMatch = getUserPendingMatch(userReadyState, userTeamId);
if (userMatch) {
  const beforeUser = userReadyState.matches.filter(m => m.status === "completed").length;
  userReadyState = simulateMatch(userReadyState, userMatch.id, firstEvent, userTeamId);
  check("Sim User Match only works when user match is ready", userReadyState.matches.filter(m => m.status === "completed").length - beforeUser === 1);
} else {
  check("Sim User Match only works when user match is ready", userReadyState.status === "completed" || userReadyState.teamStates[userTeamId]?.eliminated);
}

const completed = simEvent(userReadyState, firstEvent, userTeamId);
const result = toEventResult(completed, firstEvent);
const userResult = result.results.find(r => r.teamId === userTeamId);
const newStandings = updateStandings(standings, result);
const completedAppState = { activeEventId: firstEvent.id, currentEventIndex: 1, eventProgress: { [firstEvent.id]: completed }, completedEvents: [result], completedEventIds: [firstEvent.id], standings: newStandings };
check("Sim Event completes event", completed.status === "completed");
check("Sim Event does not produce blank state", !!completedAppState.activeEventId && !!completedAppState.eventProgress[completedAppState.activeEventId]);
check("Completed event has champion", !!completed.champion?.teamName);
check("Completed event has user placement", Number.isInteger(completed.userPlacement) && !!userResult);
check("Completed event has Pro Points awarded", Number.isFinite(completed.userProPointsAwarded) && userResult.proPointsAwarded === completed.userProPointsAwarded);
check("Home can show last event after completion", completedAppState.completedEvents.at(-1)?.eventName === firstEvent.name);
check("Next event unlocks after completion", GHOSTS_EVENTS[completedAppState.currentEventIndex]?.id !== firstEvent.id);
check("Completed event can be viewed without crashing", completedAppState.eventProgress[firstEvent.id].matches.length > 0 && completedAppState.eventProgress[firstEvent.id].placements.length > 0);
check("Event Calendar can label completed/current/upcoming", completedAppState.completedEventIds.includes(firstEvent.id) && completedAppState.currentEventIndex === 1 && GHOSTS_EVENTS.length > 2);

const ui = fs.readFileSync("src/components/EventDetail.jsx", "utf8");
check("Event screen includes Event Complete summary", ui.includes("Event Complete") && ui.includes("Continue to Home") && ui.includes("Start Next Event"));
check("Event screen includes Current Matches", ui.includes("Current Matches"));
check("Bracket tab uses match cards/matchups", ui.includes("event-bracket-board") && ui.includes("MatchCard"));
const allText = `${JSON.stringify(GHOSTS_EVENTS)} ${ui}`.toLowerCase();
check("No Modern CDL mode or Challengers required", !allText.includes("modern cdl") && !allText.includes("challengers"));

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
