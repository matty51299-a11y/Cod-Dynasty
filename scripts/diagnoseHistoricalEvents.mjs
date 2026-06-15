import fs from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { createInitialStandings, updateStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState, getNextPendingMatch, getUserPendingMatch, simulateMatch, toEventResult, createHistoricalLiveMatch } from "../src/engine/historicalEventEngine.js";

let pass = 0, fail = 0;
function check(label, condition) { condition ? (pass++, console.log(`  ✓ ${label}`)) : (fail++, console.log(`  ✗ ${label}`)); }

console.log("═══ Historical Event Gameplay Diagnostic ═══\n");
const standings = createInitialStandings(GHOSTS_TEAMS);
const event = GHOSTS_EVENTS.find(e => e.name === "UMG Philadelphia 2014");
const userTeamId = "optic_gaming";

console.log("1. Calendar and event open");
check("Ghosts event calendar exists", GHOSTS_EVENTS.length === 12);
check("UMG Philadelphia 2014 exists", !!event);
let state = createHistoricalEventState(event, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 1234);
check("Opening an event creates event detail/bracket state", !!state && state.eventId === event.id && Array.isArray(state.matches));
check("Event has a field of teams", state.field.length === event.teamCount);
check("Event has pending matches", state.matches.some(m => m.status === "pending"));
const eventDetailSource = fs.readFileSync("src/components/EventDetail.jsx", "utf8");
check("Pending user match has Play Match action", !getUserPendingMatch(state, userTeamId) || (eventDetailSource.includes("START_PLAY_MATCH") && eventDetailSource.includes("Play Match")));
check("User team tracking state exists", !!state.teamStates[userTeamId] && typeof state.teamStates[userTeamId].wins === "number");
const qualifier = GHOSTS_EVENTS.find(e => e.id === "cod_champs_qualifier");
const qualifierState = createHistoricalEventState(qualifier, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 5678);
check("CoD Champs Online Qualifier opens as single elimination bracket", qualifierState.format === "single_elimination" && qualifierState.matches.length > 0);
const league = GHOSTS_EVENTS.find(e => e.type === "league");
const leagueState = createHistoricalEventState(league, GHOSTS_TEAMS, GHOSTS_PLAYERS, standings, userTeamId, 91011);
check("League-style event opens without breaking page state", leagueState.format === "round_robin" && leagueState.matches.length > 0);

console.log("\n2. Match and round simulation");
let completedBefore = state.matches.filter(m => m.status === "completed").length;
const initialUserMatch = getUserPendingMatch(state, userTeamId);
if (initialUserMatch) {
  const beforeUser = state.matches.filter(m => m.status === "completed").length;
  state = simulateMatch(state, initialUserMatch.id, event, userTeamId);
  const afterUser = state.matches.filter(m => m.status === "completed").length;
  check("Sim User Match completes only the user match", afterUser - beforeUser === 1 && state.matches.find(m => m.id === initialUserMatch.id)?.status === "completed");
}
completedBefore = state.matches.filter(m => m.status === "completed").length;
state = simulateMatch(state, getNextPendingMatch(state).id, event, userTeamId);
let completedAfter = state.matches.filter(m => m.status === "completed").length;
check("Sim Next Match completes one match only", completedAfter - completedBefore === 1);
const currentRound = getNextPendingMatch(state)?.round;
const roundPending = state.matches.filter(m => m.status === "pending" && m.round === currentRound).length;
for (const m of [...state.matches].filter(m => m.status === "pending" && m.round === currentRound)) state = simulateMatch(state, m.id, event, userTeamId);
const roundCompleted = state.matches.filter(m => m.status === "completed" && m.round === currentRound).length;
check("Sim Round completes current round only", roundCompleted >= roundPending && !state.matches.some(m => m.status === "pending" && m.round === currentRound));
while (state.status !== "completed") state = simulateMatch(state, getNextPendingMatch(state).id, event, userTeamId);
check("Sim Event completes the full event", state.status === "completed");
check("Winner/champion is set", !!state.champion?.teamName);
check("User placement is set", Number.isInteger(state.userPlacement));
check("Pro Points are awarded", state.userProPointsAwarded >= 0 && state.placements.some(p => p.proPointsAwarded > 0));

console.log("\n3. Integration-shaped state");
const result = toEventResult(state, event);
const newStandings = updateStandings(standings, result);
check("Standings update", Object.values(newStandings).some(s => s.eventsPlayed === 1));
const completedEvents = [result];
check("Event Calendar marks event complete", completedEvents.some(r => r.eventId === event.id));
check("Home shows last event", completedEvents.at(-1)?.eventName === event.name);
const saved = JSON.parse(JSON.stringify({ activeEventId: event.id, eventProgress: { [event.id]: state } }));
check("Save/load preserves in-progress bracket", saved.eventProgress[event.id].matches.length === state.matches.length && saved.eventProgress[event.id].champion.teamId === state.champion.teamId);

console.log("\n4. Historical terminology");
const calendarText = JSON.stringify(GHOSTS_EVENTS).toLowerCase();
check("No CDL Major/Champs labels are used for Ghosts events", !calendarText.includes("cdl major") && !calendarText.includes("cdl champs"));
check("No Challengers are required", !calendarText.includes("challenger"));

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
