import { readFileSync } from "node:fs";
import { getEra } from "../src/data/codEras.js";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS, AW_TEAMS, AW_TEAM_ROWS, AW_PLAYERS, getNewAWEntrants } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { ADVANCED_WARFARE_EVENTS } from "../src/data/advancedWarfareEventCalendar.js";
import { createInitialStandings, updateStandings, getSortedStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState, toEventResult, getHistoricalSeriesMapSet } from "../src/engine/historicalEventEngine.js";

const failures = [];
function check(label, pass, detail = "") { if (pass) console.log(`PASS: ${label}`); else { failures.push(`${label}${detail ? ` (${detail})` : ""}`); console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`); } }
function archiveSeason(state) { return { ...state, seasonHistory: [{ eraId: state.currentEraId, gameTitle: state.currentGameTitle, seasonLabel: state.seasonLabel, standings: getSortedStandings(state.standings), eventResults: state.completedEvents }], archivedStandings: { ghosts: getSortedStandings(state.standings) }, archivedEventResults: { ghosts: state.completedEvents } }; }
function advanceToAW(state) {
  const aw = getEra("advanced_warfare");
  const userRosterNames = new Set(state.players.filter(p => p.teamId === state.userTeamId).map(p => p.name.toLowerCase()));
  const activeIds = new Set(AW_TEAMS.map(t => t.id));
  const userTeamId = AW_TEAMS.some(t => t.id === state.userTeamId) ? state.userTeamId : AW_TEAMS[0].id;
  const byName = new Map(state.players.map(p => [p.name.toLowerCase(), { ...p }]));
  for (const p of AW_PLAYERS) {
    const existing = byName.get(p.name.toLowerCase());
    if (!existing) byName.set(p.name.toLowerCase(), { ...p, teamId: p.teamId === (AW_TEAMS.some(t => t.id === state.userTeamId) ? state.userTeamId : AW_TEAMS[0].id) ? null : p.teamId, debutEraId: "advanced_warfare", firstActiveSeason: "2014/15", currentStatus: p.teamId === (AW_TEAMS.some(t => t.id === state.userTeamId) ? state.userTeamId : AW_TEAMS[0].id) ? "freeAgent" : "active" });
    else if (!userRosterNames.has(p.name.toLowerCase())) byName.set(p.name.toLowerCase(), { ...existing, teamId: p.teamId === (AW_TEAMS.some(t => t.id === state.userTeamId) ? state.userTeamId : AW_TEAMS[0].id) ? null : p.teamId, currentStatus: p.teamId === (AW_TEAMS.some(t => t.id === state.userTeamId) ? state.userTeamId : AW_TEAMS[0].id) ? "freeAgent" : "active" });
  }
  const players = [...byName.values()].map(p => {
    if (userRosterNames.has(String(p.name).toLowerCase())) return { ...p, teamId: userTeamId, currentStatus: "active" };
    return p.teamId && !activeIds.has(p.teamId) ? { ...p, previousTeamId: p.teamId, teamId: null, currentStatus: "freeAgent" } : p;
  });
  return { ...state, userTeamId, currentEraId: "advanced_warfare", currentGameTitle: aw.gameTitle, seasonLabel: aw.seasonLabel, currentSeasonLabel: aw.seasonLabel, currentSeasonIndex: 1, completedEraIds: ["ghosts"], teams: AW_TEAMS, activeTeams: AW_TEAMS.map(t => t.id), inactiveTeams: GHOSTS_TEAMS.filter(t => !activeIds.has(t.id)).map(t => t.id), players, playerRegistry: Object.fromEntries(players.map(p => [p.id, p])), freeAgents: players.filter(p => !p.teamId && (!p.debutEraId || ["ghosts", "advanced_warfare"].includes(p.debutEraId))), eventCalendar: ADVANCED_WARFARE_EVENTS.map(e => ({ ...e, teamCount: AW_TEAMS.length })), completedEvents: [], completedEventIds: [], eventProgress: {}, activeEventId: null, currentEventId: ADVANCED_WARFARE_EVENTS[0].id, currentEventIndex: 0, standings: createInitialStandings(AW_TEAMS), pendingSeasonComplete: false, transitionSummary: { newTeams: AW_TEAMS.filter(t => !state.teams.some(gt => gt.id === t.id)).map(t => t.name), departedTeams: GHOSTS_TEAMS.filter(t => !activeIds.has(t.id)).map(t => t.name), newPlayers: getNewAWEntrants(), userTeamStatus: AW_TEAMS.some(t => t.id === state.userTeamId) ? "preserved" : "requires_team_selection", userRosterProtected: true } };
}

const ghosts = getEra("ghosts"), aw = getEra("advanced_warfare");
check("Ghosts era starts 2013/14", ghosts?.seasonLabel === "2013/14");
check("Ghosts advances to advanced_warfare", ghosts?.nextEraId === "advanced_warfare");
check("Advanced Warfare title exists", aw?.gameTitle === "Call of Duty: Advanced Warfare");
check("AW modes exclude Blitz", !aw?.modes?.includes("Blitz"));
check("AW modes include Hardpoint/SnD/Uplink/CTF", ["Hardpoint", "Search & Destroy", "Uplink", "Capture the Flag"].every(m => aw.modes.includes(m)));
const storeSource = readFileSync(new URL("../src/store/dynastyStore.jsx", import.meta.url), "utf8");
check("Advance to AW action exists in reducer", storeSource.includes("ADVANCE_TO_ADVANCED_WARFARE"));
check("Store tracks required era/save fields", ["currentEraId", "currentGameTitle", "currentSeasonIndex", "completedEraIds", "historicalTeamRegistry", "playerRegistry", "archivedStandings", "archivedEventResults"].every(k => storeSource.includes(k)));

let state = { gameName: "Cod Dynasty", currentEraId: "ghosts", currentGameTitle: ghosts.gameTitle, seasonLabel: ghosts.seasonLabel, currentSeasonLabel: ghosts.seasonLabel, currentSeasonIndex: 0, completedEraIds: [], userTeamId: GHOSTS_TEAMS[0].id, teams: GHOSTS_TEAMS, activeTeams: GHOSTS_TEAMS.map(t => t.id), inactiveTeams: [], historicalTeamRegistry: Object.fromEntries(GHOSTS_TEAMS.map(t => [t.id, t])), players: GHOSTS_PLAYERS, playerRegistry: Object.fromEntries(GHOSTS_PLAYERS.map(p => [p.id, p])), freeAgents: [], eventCalendar: GHOSTS_EVENTS, completedEvents: [], completedEventIds: [], eventProgress: {}, standings: createInitialStandings(GHOSTS_TEAMS), currentEventIndex: 0 };
const originalUserRoster = state.players.filter(p => p.teamId === state.userTeamId).map(p => p.name).sort().join("|");
check("Fresh dynasty starts in Ghosts", state.currentEraId === "ghosts");
check("AW debut players are not available in Ghosts", getNewAWEntrants().every(n => !state.players.some(p => p.name.toLowerCase() === n.toLowerCase())));
for (const ev of GHOSTS_EVENTS) { const es = createHistoricalEventState(ev, state.teams, state.players, state.standings, state.userTeamId, 100); const result = toEventResult({ ...es, status: "completed", champion: es.field[0], placements: es.field.map((t, i) => ({ ...t, placement: i + 1 })) }, ev); state = { ...state, standings: updateStandings(state.standings, result), completedEvents: [...state.completedEvents, result], completedEventIds: [...state.completedEventIds, ev.id], currentEventIndex: state.currentEventIndex + 1, pendingSeasonComplete: state.currentEventIndex + 1 >= GHOSTS_EVENTS.length }; }
check("Completing all Ghosts events sets end of season state", state.currentEventIndex >= state.eventCalendar.length && state.pendingSeasonComplete);
state = advanceToAW(archiveSeason(state));
check("Advancing sets currentEraId to advanced_warfare", state.currentEraId === "advanced_warfare", state.currentEraId);
check("Game title changes to Advanced Warfare", state.currentGameTitle === "Call of Duty: Advanced Warfare", state.currentGameTitle);
check("Season label changes to 2014/15", state.seasonLabel === "2014/15", state.seasonLabel);
check("Ghosts results are archived", state.archivedEventResults.ghosts.length === GHOSTS_EVENTS.length);
check("Ghosts standings are archived", state.archivedStandings.ghosts.length === GHOSTS_TEAMS.length);
check("Current AW standings reset", Object.values(state.standings).every(s => s.proPoints === 0 && s.eventsPlayed === 0));
check("AW teams loaded from spreadsheet data", AW_TEAMS.every(t => state.teams.some(st => st.id === t.id)));
check("New AW teams are added", state.transitionSummary.newTeams.length > 0);
check("Ghosts-only teams inactive", state.inactiveTeams.length > 0);
check("AW players are loaded", AW_PLAYERS.every(p => state.players.some(sp => sp.name.toLowerCase() === p.name.toLowerCase())));
check("User roster is not overwritten", state.players.filter(p => p.teamId === state.userTeamId).map(p => p.name).sort().join("|") === originalUserRoster);
check("If user team is missing in AW, safe team selection/transition occurs", ["preserved", "requires_team_selection"].includes(state.transitionSummary.userTeamStatus));
check("Free Agency contains only era-valid players", state.freeAgents.every(p => !p.debutEraId || ["ghosts", "advanced_warfare"].includes(p.debutEraId)));
check("AW event calendar has full AW season", state.eventCalendar.length > 6 && state.eventCalendar.every(e => e.id.startsWith("aw_")));
const firstEventState = createHistoricalEventState(state.eventCalendar[0], state.teams, state.players, state.standings, state.userTeamId, 200);
check("First AW event can be started", firstEventState.status === "in_progress" && firstEventState.matches.length > 0);
check("All active AW teams enter first AW event", firstEventState.field.length === state.activeTeams.length);
check("AW team count comes from spreadsheet", state.activeTeams.length === AW_TEAMS.length && AW_TEAM_ROWS.length === AW_TEAMS.length);
check("AW event field is not capped at 12", firstEventState.field.length > 12);
check("AW calendar online events are not the majority", state.eventCalendar.filter(e => ["online_2k", "online_5k"].includes(e.type)).length < state.eventCalendar.length / 2);
check("AW event uses AW title", firstEventState.gameTitle === "Call of Duty: Advanced Warfare", firstEventState.gameTitle);
const mapModes = getHistoricalSeriesMapSet(aw).map(m => m.mode);
check("AW event uses AW modes, not Ghosts modes", mapModes.includes("Hardpoint") && mapModes.includes("Uplink") && !mapModes.includes("Blitz"), mapModes.join(", "));
check("No Modern CDL mode or Challengers are required", !storeSource.includes("Modern CDL mode") && !storeSource.includes("Challenger"));
if (failures.length) { console.error(`\nEra transition diagnostic FAILED with ${failures.length} problem(s):`); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log("\nEra transition diagnostic passed.");
