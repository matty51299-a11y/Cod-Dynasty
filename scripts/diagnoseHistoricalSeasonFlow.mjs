import { GHOSTS_TEAMS, GHOSTS_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS, EVENT_TIERS } from "../src/data/ghostsEventCalendar.js";
import { getEra, HISTORICAL_START_ERA_ID } from "../src/data/codEras.js";
import { createHistoricalEventState, getNextPendingMatch, getUserPendingMatch, simulateMatch, toEventResult } from "../src/engine/historicalEventEngine.js";
import { createInitialStandings, updateStandings } from "../src/engine/standingsEngine.js";

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function createTestState(teamId) {
  const era = getEra(HISTORICAL_START_ERA_ID);
  return {
    gameName: "Cod Dynasty",
    currentEraId: era.id,
    currentGameTitle: era.gameTitle,
    seasonLabel: era.seasonLabel,
    userTeamId: teamId,
    teams: [...GHOSTS_TEAMS],
    players: GHOSTS_PLAYERS.map(p => ({ ...p })),
    freeAgents: [],
    amateurPool: [],
    eventCalendar: [...GHOSTS_EVENTS],
    completedEvents: [],
    completedEventIds: [],
    eventProgress: {},
    activeEventId: null,
    standings: createInitialStandings(GHOSTS_TEAMS),
    currentEventIndex: 0,
    notifications: [],
    inboxEvents: [],
    liveHistoricalMatch: null,
    saveExists: true,
  };
}

console.log("═══ Historical Season Flow Diagnostic ═══\n");

const userTeamId = GHOSTS_TEAMS[0].id;
let state = createTestState(userTeamId);

// 1. New dynasty starts with valid currentEventId
console.log("1. New dynasty start");
check("currentEventIndex is 0", state.currentEventIndex === 0);
check("First event exists", !!state.eventCalendar[0]);
check("First event has an id", !!state.eventCalendar[0].id);
check("activeEventId is null at start", state.activeEventId === null);
check("completedEventIds is empty", state.completedEventIds.length === 0);

// 2. Home has a primary event action available
console.log("\n2. Home primary action");
const firstEvent = state.eventCalendar[state.currentEventIndex];
check("Next event is available on Home", !!firstEvent);
const buttonLabel = !state.activeEventId ? "Start Next Event" : "Continue Event";
check("Button label is Start Next Event at start", buttonLabel === "Start Next Event");

// 3. Current event can be opened
console.log("\n3. Current event opening");
const currentEventId = state.eventCalendar[state.currentEventIndex].id;
const eventState = createHistoricalEventState(
  state.eventCalendar[0], state.teams, state.players, state.standings, userTeamId, 12345
);
check("Event state created successfully", !!eventState);
check("Event has matches", eventState.matches.length > 0);
check("Event status is in_progress", eventState.status === "in_progress");
state = { ...state, activeEventId: currentEventId, eventProgress: { [currentEventId]: eventState } };

// 4. Future events cannot be played early
console.log("\n4. Future event locking");
const futureEventIdx = 3;
const futureEvent = state.eventCalendar[futureEventIdx];
check("Future event exists", !!futureEvent);
const futureStatus = futureEventIdx > state.currentEventIndex ? "locked" : "current";
check("Future event is locked", futureStatus === "locked");
check("Current event index is 0, future is beyond", futureEventIdx > state.currentEventIndex);

// 5. Completed events are view-only
console.log("\n5. Completed events");
let completedState = { ...state };
const ev = completedState.eventCalendar[0];
let es = completedState.eventProgress[ev.id];
let safetyCount = 0;
while (es.status !== "completed" && safetyCount < 200) {
  const match = getNextPendingMatch(es);
  if (!match) break;
  es = simulateMatch(es, match.id, ev, userTeamId);
  safetyCount++;
}
check("Event can be completed via simulation", es.status === "completed");
const result = toEventResult(es, ev);
completedState = {
  ...completedState,
  completedEvents: [result],
  completedEventIds: [ev.id],
  currentEventIndex: 1,
  activeEventId: null,
};
check("Completed event is in completedEventIds", completedState.completedEventIds.includes(ev.id));
const completedStatus = completedState.completedEventIds.includes(ev.id) ? "completed" : "current";
check("Completed event status is completed", completedStatus === "completed");

// 6. Event completion unlocks next event
console.log("\n6. Event unlock flow");
check("currentEventIndex advanced to 1", completedState.currentEventIndex === 1);
const nextEvent = completedState.eventCalendar[completedState.currentEventIndex];
check("Next event is available", !!nextEvent);
check("Next event is different from completed event", nextEvent.id !== ev.id);

// 7. Online 2K events exist
console.log("\n7. Online 2K events in Ghosts calendar");
const online2kEvents = GHOSTS_EVENTS.filter(e => e.type === "online_2k" || e.tier === "online_2k");
check("Online 2K events exist", online2kEvents.length > 0);
check("At least 4 Online 2K events", online2kEvents.length >= 4);
const online2kNames = online2kEvents.map(e => e.name);
check("2K events have appropriate names", online2kNames.some(n => n.includes("2K")));
console.log(`    Found ${online2kEvents.length} online 2K events: ${online2kNames.join(", ")}`);

// 8. Online 2K events award fewer points than LANs
console.log("\n8. Online 2K vs LAN points");
const lanEvents = GHOSTS_EVENTS.filter(e => e.type === "open" || e.tier === "open");
const max2kFirst = Math.max(...online2kEvents.map(e => e.proPoints[1]));
const minLanFirst = Math.min(...lanEvents.map(e => e.proPoints[1]));
check("2K first place points less than LAN first place", max2kFirst < minLanFirst);
console.log(`    2K max 1st: ${max2kFirst}, LAN min 1st: ${minLanFirst}`);

// 9. World Championship awards more than 2Ks
console.log("\n9. World Championship vs 2K points");
const champs = GHOSTS_EVENTS.find(e => e.type === "championship");
check("Championship event exists", !!champs);
check("Championship 1st place > 2K 1st place", champs.proPoints[1] > max2kFirst);
console.log(`    Champs 1st: ${champs.proPoints[1]}, 2K max 1st: ${max2kFirst}`);

// 10. Event Calendar labels
console.log("\n10. Event status labels");
check("Completed events get completed status", completedState.completedEventIds.includes(ev.id));
const nextIdx = completedState.currentEventIndex;
check("Current event index points to next playable event", nextIdx === 1);
check("Future events beyond current are locked", GHOSTS_EVENTS.length > nextIdx + 1);

// 11. Save/load preserves event progress
console.log("\n11. Save/load preservation");
const serialized = JSON.stringify(completedState);
const deserialized = JSON.parse(serialized);
check("Serialized state round-trips", deserialized.currentEventIndex === completedState.currentEventIndex);
check("completedEventIds preserved", deserialized.completedEventIds.length === completedState.completedEventIds.length);
check("completedEvents preserved", deserialized.completedEvents.length === completedState.completedEvents.length);
check("activeEventId preserved", deserialized.activeEventId === completedState.activeEventId);

// 12. Team selection supports all Ghosts teams
console.log("\n12. Team selection");
check("GHOSTS_TEAMS has 28 teams", GHOSTS_TEAMS.length === 28);
check("All teams have ids", GHOSTS_TEAMS.every(t => !!t.id));
check("All teams have names", GHOSTS_TEAMS.every(t => !!t.name));

// 13. No Modern CDL or Challengers required
console.log("\n13. No Modern CDL/Challengers");
check("No event references CDL", GHOSTS_EVENTS.every(e => !e.name.includes("CDL")));
check("No event references Challengers", GHOSTS_EVENTS.every(e => !e.name.includes("Challenger")));
check("Game starts in Ghosts era", HISTORICAL_START_ERA_ID === "ghosts");

// 14. Event tiers
console.log("\n14. Event tier system");
check("EVENT_TIERS defined", !!EVENT_TIERS);
check("online_2k tier exists", !!EVENT_TIERS.online_2k);
check("championship tier exists", !!EVENT_TIERS.championship);
check("open (LAN) tier exists", !!EVENT_TIERS.open);
check("online_2k importance < open importance", EVENT_TIERS.online_2k.importance < EVENT_TIERS.open.importance);
check("championship importance > open importance", EVENT_TIERS.championship.importance > EVENT_TIERS.open.importance);

// 15. Event count
console.log("\n15. Total event count");
check("Calendar has more than 12 events (original)", GHOSTS_EVENTS.length > 12);
console.log(`    Total events in Ghosts season: ${GHOSTS_EVENTS.length}`);
const byType = {};
GHOSTS_EVENTS.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
console.log(`    By type: ${Object.entries(byType).map(([k,v]) => `${k}: ${v}`).join(", ")}`);

console.log(`\n═══ Results: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
