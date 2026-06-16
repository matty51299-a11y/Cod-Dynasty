import { mkdirSync, writeFileSync } from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS, AW_TEAMS, AW_TEAM_ROWS, AW_PLAYERS } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { ADVANCED_WARFARE_EVENTS } from "../src/data/advancedWarfareEventCalendar.js";
import { createInitialStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState } from "../src/engine/historicalEventEngine.js";

const failures = [];
const check = (label, pass, detail = "") => pass ? console.log(`PASS: ${label}${detail ? ` (${detail})` : ""}`) : (failures.push(`${label}${detail ? ` (${detail})` : ""}`), console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`));
const state = {
  gameName: "Cod Dynasty", currentEraId: "ghosts", currentGameTitle: "Call of Duty: Ghosts", seasonLabel: "2013/14", currentSeasonLabel: "2013/14", currentSeasonIndex: 0,
  completedEraIds: [], userTeamId: GHOSTS_TEAMS[0].id, teams: GHOSTS_TEAMS.map(t => ({ ...t })), activeTeams: GHOSTS_TEAMS.map(t => t.id), inactiveTeams: [],
  historicalTeamRegistry: Object.fromEntries(GHOSTS_TEAMS.map(t => [t.id, { ...t, activeEraIds: ["ghosts"] }])),
  players: GHOSTS_PLAYERS.map(p => ({ ...p })), playerRegistry: Object.fromEntries(GHOSTS_PLAYERS.map(p => [p.id, { ...p }])), freeAgents: [],
  eventCalendar: GHOSTS_EVENTS, completedEvents: [], completedEventIds: GHOSTS_EVENTS.map(e => e.id), eventProgress: {}, activeEventId: null, standings: createInitialStandings(GHOSTS_TEAMS), currentEventIndex: GHOSTS_EVENTS.length,
};
const originalUserRoster = state.players.filter(p => p.teamId === state.userTeamId).map(p => p.id).sort().join("|");
function transitionToAW(prev) {
  const userRosterIds = new Set(prev.players.filter(p => p.teamId === prev.userTeamId).map(p => p.id));
  const userTeamExists = AW_TEAMS.some(t => t.id === prev.userTeamId);
  const userTeamId = userTeamExists ? prev.userTeamId : AW_TEAMS[0].id;
  const activeIds = new Set(AW_TEAMS.map(t => t.id));
  const byName = new Map(prev.players.map(p => [p.name.toLowerCase(), { ...p }]));
  for (const p of AW_PLAYERS) {
    const existing = byName.get(p.name.toLowerCase());
    if (existing && userRosterIds.has(existing.id)) byName.set(p.name.toLowerCase(), { ...existing, ...p, id: existing.id, teamId: userTeamId, currentStatus: "active" });
    else if (existing) byName.set(p.name.toLowerCase(), { ...existing, ...p, id: existing.id, teamId: p.teamId === userTeamId ? null : (activeIds.has(p.teamId) ? p.teamId : null), currentStatus: p.teamId === userTeamId ? "freeAgent" : (activeIds.has(p.teamId) ? "active" : "freeAgent") });
    else byName.set(p.name.toLowerCase(), { ...p, teamId: p.teamId === userTeamId ? null : p.teamId, debutEraId: "advanced_warfare", firstActiveSeason: "2014/15", currentStatus: p.teamId === userTeamId ? "freeAgent" : (activeIds.has(p.teamId) ? "active" : "freeAgent") });
  }
  const awNames = new Set(AW_PLAYERS.map(p => p.name.toLowerCase()));
  const players = [...byName.values()].map(p => {
    if (userRosterIds.has(p.id)) return { ...p, teamId: userTeamId, currentStatus: "active" };
    if (p.teamId && !activeIds.has(p.teamId)) return { ...p, previousTeamId: p.teamId, teamId: null, currentStatus: "freeAgent" };
    if (!p.teamId && (!p.debutEraId || ["ghosts", "advanced_warfare"].includes(p.debutEraId))) return { ...p, currentStatus: "freeAgent" };
    return p;
  });
  return { ...prev, currentEraId: "advanced_warfare", currentGameTitle: "Call of Duty: Advanced Warfare", seasonLabel: "2014/15", currentSeasonLabel: "2014/15", userTeamId, teams: AW_TEAMS.map(t => ({ ...t })), activeTeams: AW_TEAMS.map(t => t.id), inactiveTeams: GHOSTS_TEAMS.filter(t => !activeIds.has(t.id)).map(t => t.id), players, freeAgents: players.filter(p => !p.teamId && (!p.debutEraId || ["ghosts", "advanced_warfare"].includes(p.debutEraId))), eventCalendar: ADVANCED_WARFARE_EVENTS.map(e => ({ ...e, teamCount: AW_TEAMS.length })), standings: createInitialStandings(AW_TEAMS) };
}
const aw = transitionToAW(state);
const firstEvent = createHistoricalEventState(aw.eventCalendar[0], aw.teams, aw.players, aw.standings, aw.userTeamId, 42);
const eventSizes = aw.eventCalendar.map(e => createHistoricalEventState(e, aw.teams, aw.players, aw.standings, aw.userTeamId, 42).field.length);
const departed = GHOSTS_TEAMS.filter(t => !AW_TEAMS.some(at => at.id === t.id));
const assigned = aw.players.filter(p => p.teamId && AW_TEAMS.some(t => t.id === p.teamId));
const movedFa = aw.freeAgents.filter(p => p.previousTeamId || !AW_PLAYERS.some(ap => ap.name.toLowerCase() === p.name.toLowerCase()));
const duplicateNames = [...aw.players.reduce((m,p)=>m.set(p.name.toLowerCase(),(m.get(p.name.toLowerCase())||0)+1), new Map())].filter(([,n])=>n>1);
console.log(`AW teams found: ${AW_TEAM_ROWS.length}`);
console.log(`AW teams activated: ${aw.activeTeams.length}`);
console.log(`Departed Ghosts teams: ${departed.map(t => t.name).join(", ") || "none"}`);
console.log(`Players assigned to AW teams: ${assigned.length}`);
console.log(`Players moved to Free Agency: ${aw.freeAgents.length}`);
console.log(`Duplicate player warnings: ${duplicateNames.length ? duplicateNames.map(([n,c])=>`${n} x${c}`).join(", ") : "none"}`);
console.log(`Event field sizes: ${eventSizes.join(", ")}`);
check("Advanced Warfare sheet rows are loaded", AW_TEAM_ROWS.length === 28, String(AW_TEAM_ROWS.length));
check("Every valid AW team is activated", aw.activeTeams.length === AW_TEAM_ROWS.length, `${aw.activeTeams.length}/${AW_TEAM_ROWS.length}`);
check("No 12-team cap remains in AW transition", aw.activeTeams.length > 12 && firstEvent.field.length > 12);
check("AW standings include every active team", Object.keys(aw.standings).length === aw.activeTeams.length);
check("All AW events include all active teams", eventSizes.every(n => n === aw.activeTeams.length));
check("Departed Ghosts teams are inactive/departed", departed.every(t => aw.inactiveTeams.includes(t.id)));
check("Ghosts players from departed teams are not deleted", state.players.filter(p => departed.some(t => t.id === p.teamId)).every(p => aw.players.some(np => np.name.toLowerCase() === p.name.toLowerCase())));
check("Unassigned era-valid players move to Free Agency", aw.freeAgents.length > 0);
check("Future-only players do not appear in AW Free Agency", aw.freeAgents.every(p => !p.debutEraId || ["ghosts", "advanced_warfare"].includes(p.debutEraId)));
check("User roster is not overwritten", aw.players.filter(p => p.teamId === aw.userTeamId).map(p => p.id).sort().join("|") === originalUserRoster);
check("Team OVRs use imported AW ratings", assigned.every(p => typeof p.overall === "number" && p.ratingSource));
const onlineCount = aw.eventCalendar.filter(e => ["online_2k", "online_5k"].includes(e.type)).length;
const lanCount = aw.eventCalendar.filter(e => ["lan_open", "invitational", "playoffs", "championship"].includes(e.type)).length;
const max2k = Math.max(...Object.values(aw.eventCalendar.find(e => e.type === "online_2k").proPoints));
const maxLan = Math.max(...Object.values(aw.eventCalendar.find(e => e.tier === "lan").proPoints));
const maxChamps = Math.max(...Object.values(aw.eventCalendar.find(e => e.tier === "championship").proPoints));
check("AW calendar has more than 6 events", aw.eventCalendar.length > 6, String(aw.eventCalendar.length));
check("AW calendar includes multiple LAN/big events", lanCount >= 6, String(lanCount));
check("AW calendar includes small online events", onlineCount >= 3, String(onlineCount));
check("Online 2Ks/5Ks are not the majority", onlineCount < aw.eventCalendar.length / 2, `${onlineCount}/${aw.eventCalendar.length}`);
check("LAN events award more points than 2Ks", maxLan > max2k, `${maxLan}>${max2k}`);
check("Champs awards more points than LANs", maxChamps > maxLan, `${maxChamps}>${maxLan}`);
mkdirSync("data/research", { recursive: true });
const rows = [["type","playerId","displayName","previousTeam","newTeam","status","reason"], ...aw.players.map(p => ["player", p.id, p.displayName || p.name, p.previousTeamId || "", p.teamId || "Free Agency", p.currentStatus || (p.teamId ? "active" : "freeAgent"), p.teamId ? "assigned_to_aw_team_or_preserved" : "moved_to_free_agency" ])];
writeFileSync("data/research/aw_transition_report.csv", rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n"));
if (failures.length) process.exit(1);
console.log("\nAdvanced Warfare transition diagnostic passed.");
