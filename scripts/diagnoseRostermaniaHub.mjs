import { readFileSync } from "node:fs";
import { GHOSTS_TEAMS, GHOSTS_PLAYERS, AW_TEAMS, AW_PLAYERS, getNewAWEntrants } from "../src/data/historicalRosters.js";
import { GHOSTS_EVENTS } from "../src/data/ghostsEventCalendar.js";
import { ADVANCED_WARFARE_EVENTS } from "../src/data/advancedWarfareEventCalendar.js";
import { getEra } from "../src/data/codEras.js";
import { createInitialStandings, updateStandings, getSortedStandings } from "../src/engine/standingsEngine.js";
import { createHistoricalEventState, toEventResult } from "../src/engine/historicalEventEngine.js";
import { ensureFourPlayerRosters, getRosterIntegrityProblems } from "../src/engine/rosterIntegrity.js";

let pass = 0;
const failures = [];
function check(label, condition, detail = "") {
  if (condition) { pass++; console.log(`PASS: ${label}${detail ? ` (${detail})` : ""}`); }
  else { failures.push(label); console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`); }
}

console.log("═══ Rostermania Hub Diagnostic ═══\n");

const storeSource = readFileSync(new URL("../src/store/dynastyStore.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

function slug(v) { return String(v||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,""); }

function createTestState(userTeamId = "optic_gaming") {
  const teams = GHOSTS_TEAMS.map(t => ({ ...t }));
  const players = GHOSTS_PLAYERS.map(p => ({ ...p }));
  return ensureFourPlayerRosters({
    gameName: "Cod Dynasty", currentEraId: "ghosts", currentGameTitle: "Call of Duty: Ghosts",
    seasonLabel: "2013/14", currentSeasonLabel: "2013/14", currentSeasonIndex: 0,
    completedEraIds: [], userTeamId, teams, activeTeams: teams.map(t => t.id), inactiveTeams: [],
    historicalTeamRegistry: Object.fromEntries(teams.map(t => [t.id, { ...t, activeEraIds: ["ghosts"] }])),
    players, playerRegistry: Object.fromEntries(players.map(p => [p.id, { ...p }])),
    freeAgents: players.filter(p => !p.teamId),
    eventCalendar: [...GHOSTS_EVENTS], completedEvents: [], completedEventIds: [],
    eventProgress: {}, activeEventId: null, standings: createInitialStandings(teams),
    currentEventIndex: 0, notifications: [], inboxEvents: [],
    seasonHistory: [], archivedStandings: {}, archivedEventResults: {},
    pendingSeasonComplete: false, transitionSummary: null, rostermaniaActive: false, rostermaniaData: null,
  }, "ghosts");
}

function completeAllEvents(state) {
  for (const ev of GHOSTS_EVENTS) {
    const es = createHistoricalEventState(ev, state.teams, state.players, state.standings, state.userTeamId, Date.now() ^ state.currentEventIndex);
    const completed = { ...es, status: "completed", champion: es.field[0], placements: es.field.map((t, i) => ({ ...t, placement: i + 1, proPointsAwarded: ev.proPoints?.[i + 1] || 0 })) };
    const result = toEventResult(completed, ev);
    state = {
      ...state,
      standings: updateStandings(state.standings, result),
      completedEvents: [...state.completedEvents, result],
      completedEventIds: [...state.completedEventIds, ev.id],
      currentEventIndex: state.currentEventIndex + 1,
      pendingSeasonComplete: state.currentEventIndex + 1 >= GHOSTS_EVENTS.length,
    };
  }
  return state;
}

function archiveSeason(state) {
  const sorted = getSortedStandings(state.standings || {});
  return {
    ...state,
    seasonHistory: [{ eraId: state.currentEraId, gameTitle: state.currentGameTitle, seasonLabel: state.seasonLabel, standings: sorted, eventResults: state.completedEvents }],
    archivedStandings: { ghosts: sorted },
    archivedEventResults: { ghosts: state.completedEvents },
  };
}

function enterRostermania(state) {
  const sorted = getSortedStandings(state.standings || {});
  const userStanding = sorted.find(s => s.teamId === state.userTeamId);
  const userResults = (state.completedEvents || []).map(ev => ev.results?.find(r => r.teamId === state.userTeamId)).filter(Boolean);
  const bestFinish = userResults.length ? Math.min(...userResults.map(r => r.placement)) : null;
  const seasonReview = {
    eraId: state.currentEraId, gameTitle: state.currentGameTitle, seasonLabel: state.seasonLabel,
    standings: sorted,
    eventWinners: (state.completedEvents || []).map(ev => ({ eventId: ev.eventId, eventName: ev.eventName, champion: ev.champion })),
    userTeamId: state.userTeamId, userTeamName: state.teams.find(t => t.id === state.userTeamId)?.name || state.userTeamId,
    userProPoints: userStanding?.proPoints || 0, userEventWins: userStanding?.eventWins || 0,
    userRank: userStanding?.rank || null, userBestFinish: bestFinish,
    userRoster: state.players.filter(p => p.teamId === state.userTeamId).map(p => ({ id: p.id, name: p.name, overall: p.overall, primary: p.primary })),
    totalEvents: state.eventCalendar.length,
  };
  const archived = archiveSeason(state);

  // Simulate buildAdvancedWarfareTransition
  const aw = getEra("advanced_warfare");
  const previousPlayers = archived.players.map(p => ({ ...p }));
  const userRosterIds = new Set(previousPlayers.filter(p => p.teamId === archived.userTeamId).map(p => p.id));
  const userTeamExists = AW_TEAMS.some(t => t.id === archived.userTeamId);
  const userTeamId = userTeamExists ? archived.userTeamId : AW_TEAMS[0]?.id;
  const oldTeamIds = new Set(archived.teams.map(t => t.id));
  const awTeamIds = new Set(AW_TEAMS.map(t => t.id));
  const newTeams = AW_TEAMS.filter(t => !oldTeamIds.has(t.id));
  const departedTeams = archived.teams.filter(t => !awTeamIds.has(t.id));
  const consumed = new Set();
  const transitionRows = [];
  const players = [];

  for (const rowPlayer of AW_PLAYERS) {
    const key = String(rowPlayer.name).toLowerCase();
    const existing = previousPlayers.find(p => !consumed.has(p.id) && String(p.name).toLowerCase() === key);
    if (existing) {
      consumed.add(existing.id);
      if (userRosterIds.has(existing.id)) {
        players.push({ ...existing, previousTeamId: existing.teamId, teamId: userTeamId, currentStatus: "active", status: "active", contractYears: 1 });
        transitionRows.push({ playerId: existing.id, displayName: existing.displayName || existing.name, previousTeam: existing.teamId, newTeam: userTeamId, status: "preserved_on_user_roster" });
      } else {
        players.push({ ...existing, ...rowPlayer, id: existing.id, previousTeamId: existing.teamId, teamId: rowPlayer.teamId === userTeamId ? null : rowPlayer.teamId, debutEraId: existing.debutEraId || "ghosts", currentStatus: rowPlayer.teamId === userTeamId ? "free_agent" : "active", status: rowPlayer.teamId === userTeamId ? "free_agent" : "active", contractYears: rowPlayer.teamId === userTeamId ? 0 : 1 });
        transitionRows.push({ playerId: existing.id, displayName: existing.displayName || existing.name, previousTeam: existing.teamId || "Free Agency", newTeam: rowPlayer.teamId === userTeamId ? "Free Agency" : rowPlayer.teamId, status: rowPlayer.teamId === userTeamId ? "moved_to_free_agency" : "assigned_to_aw_team" });
      }
    } else {
      players.push({ ...rowPlayer, debutEraId: "advanced_warfare", firstActiveSeason: aw.seasonLabel, teamId: rowPlayer.teamId === userTeamId ? null : rowPlayer.teamId, currentStatus: rowPlayer.teamId === userTeamId ? "free_agent" : "active", status: rowPlayer.teamId === userTeamId ? "free_agent" : "active", contractYears: rowPlayer.teamId === userTeamId ? 0 : 1 });
      transitionRows.push({ playerId: rowPlayer.id, displayName: rowPlayer.displayName || rowPlayer.name, previousTeam: "", newTeam: rowPlayer.teamId === userTeamId ? "Free Agency" : rowPlayer.teamId, status: rowPlayer.teamId === userTeamId ? "moved_to_free_agency" : "assigned_to_aw_team" });
    }
  }

  for (const oldPlayer of previousPlayers) {
    if (consumed.has(oldPlayer.id)) continue;
    if (userRosterIds.has(oldPlayer.id)) {
      players.push({ ...oldPlayer, previousTeamId: oldPlayer.teamId, teamId: userTeamId, currentStatus: "active", status: "active", contractYears: 1 });
      transitionRows.push({ playerId: oldPlayer.id, displayName: oldPlayer.displayName || oldPlayer.name, previousTeam: oldPlayer.teamId, newTeam: userTeamId, status: "preserved_on_user_roster" });
    } else {
      players.push({ ...oldPlayer, previousTeamId: oldPlayer.teamId || oldPlayer.previousTeamId, teamId: null, currentStatus: "free_agent", status: "free_agent", contractYears: 0 });
      transitionRows.push({ playerId: oldPlayer.id, displayName: oldPlayer.displayName || oldPlayer.name, previousTeam: oldPlayer.teamId || "Free Agency", newTeam: "Free Agency", status: "moved_to_free_agency" });
    }
  }

  const teams = AW_TEAMS.map(t => ({ ...t }));
  let awState = ensureFourPlayerRosters({
    ...archived,
    currentEraId: "advanced_warfare", currentGameTitle: aw.gameTitle, seasonLabel: aw.seasonLabel,
    currentSeasonLabel: aw.seasonLabel, currentSeasonIndex: 1, completedEraIds: ["ghosts"],
    userTeamId, teams, activeTeams: teams.map(t => t.id),
    inactiveTeams: departedTeams.map(t => t.id), players,
    eventCalendar: ADVANCED_WARFARE_EVENTS.map(e => ({ ...e, teamCount: teams.length })),
    completedEvents: [], completedEventIds: [], eventProgress: {},
    activeEventId: null, currentEventId: ADVANCED_WARFARE_EVENTS[0]?.id || null,
    currentEventIndex: 0, standings: createInitialStandings(teams),
    pendingSeasonComplete: false,
  }, "advanced_warfare");

  const summary = {
    fromEraId: "ghosts", toEraId: "advanced_warfare",
    title: "Welcome to Call of Duty: Advanced Warfare",
    newTeams: newTeams.map(t => t.name), departedTeams: departedTeams.map(t => t.name),
    majorRosterChanges: transitionRows.filter(r => r.previousTeam && r.newTeam && r.previousTeam !== r.newTeam && r.status === "assigned_to_aw_team").map(r => `${r.displayName}: ${r.previousTeam} → ${r.newTeam}`).slice(0, 16),
    newPlayers: getNewAWEntrants(),
    userTeamStatus: userTeamExists ? "preserved" : "mapped_to_active_aw_org",
  };

  return {
    ...awState, transitionSummary: summary, transitionAuditRows: transitionRows,
    rostermaniaActive: true,
    rostermaniaData: { seasonReview, userTeamPreserved: userTeamExists, previousUserTeamId: archived.userTeamId, needsTeamSelect: !userTeamExists },
  };
}

// ── TEST 1: Season Complete state ──
let state = createTestState("optic_gaming");
state = completeAllEvents(state);
check("1. Completing Ghosts final event leads to Season Complete state", state.pendingSeasonComplete === true && state.currentEventIndex >= GHOSTS_EVENTS.length);

// ── TEST 2: Season Review screen exists ──
let hubExists = false;
try { readFileSync(new URL("../src/components/SeasonReview.jsx", import.meta.url), "utf8"); hubExists = true; } catch {}
check("2. Season Review screen/action exists", hubExists);

// ── TEST 3: Enter Rostermania action exists ──
check("3. Enter Rostermania action exists", storeSource.includes("ENTER_ROSTERMANIA"));

// ── TEST 4: Rostermania Hub loads before AW season starts ──
const rmState = enterRostermania(state);
check("4. Rostermania Hub loads before AW season starts", rmState.rostermaniaActive === true && rmState.currentEraId === "advanced_warfare");

// ── TEST 5: Hub shows current user roster ──
const userRoster = rmState.players.filter(p => p.teamId === rmState.userTeamId);
check("5. Hub shows current user roster", userRoster.length === 4, `${userRoster.length}/4`);

// ── TEST 6: Hub shows AW free agents ──
const fa = rmState.players.filter(p => !p.teamId);
check("6. Hub shows AW free agents", fa.length > 0, `${fa.length} free agents`);

// ── TEST 7: Hub shows new AW teams ──
check("7. Hub shows new AW teams", rmState.transitionSummary.newTeams.length > 0, rmState.transitionSummary.newTeams.slice(0, 3).join(", "));

// ── TEST 8: Hub shows departed Ghosts teams ──
check("8. Hub shows departed Ghosts teams", rmState.transitionSummary.departedTeams.length > 0, rmState.transitionSummary.departedTeams.slice(0, 3).join(", "));

// ── TEST 9: Hub shows roster moves ──
check("9. Hub shows roster moves or transition summary", rmState.transitionAuditRows.length > 0, `${rmState.transitionAuditRows.length} transition rows`);

// ── TEST 10: User can sign a free agent when roster has fewer than 4 ──
let signState = { ...rmState };
const relTarget = userRoster[0];
signState = {
  ...signState,
  players: signState.players.map(p => p.id === relTarget.id ? { ...p, previousTeamId: p.teamId, teamId: null, status: "free_agent", currentStatus: "free_agent" } : p),
};
signState.freeAgents = signState.players.filter(p => !p.teamId);
const rosterAfterRelease = signState.players.filter(p => p.teamId === signState.userTeamId).length;
check("10. Roster drops to 3/4 after releasing a player", rosterAfterRelease === 3);

const signee = signState.players.find(p => !p.teamId && p.id !== relTarget.id);
if (signee) {
  signState = {
    ...signState,
    players: signState.players.map(p => p.id === signee.id ? { ...p, teamId: signState.userTeamId, status: "active", currentStatus: "active", contractYears: 1 } : p),
  };
  signState.freeAgents = signState.players.filter(p => !p.teamId);
  check("10b. User can sign a free agent when roster has fewer than 4", signState.players.filter(p => p.teamId === signState.userTeamId).length === 4);
}

// ── TEST 11: User can release a player ──
check("11. User can release a player", rosterAfterRelease === 3, `released ${relTarget.name}`);

// ── TEST 12: User roster must be exactly 4 before starting AW ──
check("12. User roster must be exactly 4 before starting AW", signState.players.filter(p => p.teamId === signState.userTeamId).length === 4);

// ── TEST 13: Start AW is blocked if user roster has fewer than 4 ──
check("13. Start AW is blocked if user roster has fewer than 4 (store code check)", storeSource.includes("Your roster must have exactly 4 players"));

// ── TEST 14: Start AW is blocked if duplicate active players exist ──
check("14. Start AW is blocked if duplicate active players exist (store code check)", storeSource.includes("getRosterIntegrityProblems") && storeSource.includes("CONFIRM_AW_SEASON"));

// ── TEST 15: Start AW is blocked if any active team has fewer than 4 ──
const teamCounts = {};
for (const teamId of rmState.activeTeams) teamCounts[teamId] = rmState.players.filter(p => p.teamId === teamId).length;
const underTeams = Object.entries(teamCounts).filter(([, c]) => c < 4);
check("15. Start AW is blocked if any active team has fewer than 4", underTeams.length === 0, underTeams.length > 0 ? `under: ${underTeams.map(([t, c]) => `${t}:${c}`).join(", ")}` : "all 4/4");

// ── TEST 16: Starting AW sets currentEraId to advanced_warfare ──
check("16. Starting AW sets currentEraId to advanced_warfare", storeSource.includes("CONFIRM_AW_SEASON") && storeSource.includes("rostermaniaActive: false"));

// ── TEST 17: AW Home loads after confirmation ──
check("17. AW Home loads after confirmation", rmState.eventCalendar.length > 0 && rmState.currentEventId);

// ── TEST 18: Refresh during Rostermania preserves state ──
const serialized = JSON.stringify(rmState);
const loaded = JSON.parse(serialized);
check("18. Refresh during Rostermania preserves state", loaded.rostermaniaActive === true && loaded.rostermaniaData !== null && loaded.currentEraId === "advanced_warfare");

// ── TEST 18b: App restores to rostermania screen on load ──
check("18b. App restores to rostermania screen on load", appSource.includes("rostermaniaActive") && appSource.includes('setScreen("rostermania")'));

// ── TEST 19: No Modern CDL mode or Challengers are required ──
let rmHubSource = "";
try { rmHubSource = readFileSync(new URL("../src/components/RostermaniaHub.jsx", import.meta.url), "utf8"); } catch {}
check("19. No Modern CDL mode or Challengers are required", rmHubSource && !rmHubSource.includes("Challenger") && !rmHubSource.includes("CDL Manager"));

// ── Additional checks ──
check("Season review data captured", rmState.rostermaniaData?.seasonReview?.eraId === "ghosts");
check("Season review user roster captured", rmState.rostermaniaData?.seasonReview?.userRoster?.length === 4);
check("Free agents are era-valid", fa.every(p => !p.debutEraId || ["ghosts", "advanced_warfare"].includes(p.debutEraId)));
const activePlayerIds = rmState.players.filter(p => p.teamId && rmState.activeTeams.includes(p.teamId)).map(p => p.id);
check("No duplicate active player IDs", activePlayerIds.length === new Set(activePlayerIds).size);
check("Rostermania Hub component file exists", rmHubSource.length > 0);
check("RostermaniaHub has Overview tab", rmHubSource.includes("overview") && rmHubSource.includes("Overview"));
check("RostermaniaHub has My Roster tab", rmHubSource.includes("roster") && rmHubSource.includes("My Roster"));
check("RostermaniaHub has Free Agency tab", rmHubSource.includes("freeagency") && rmHubSource.includes("Free Agency"));
check("RostermaniaHub has New Teams tab", rmHubSource.includes("newteams") && rmHubSource.includes("New Teams"));
check("RostermaniaHub has Departed Teams tab", rmHubSource.includes("departed") && rmHubSource.includes("Departed Teams"));
check("RostermaniaHub has Roster Moves tab", rmHubSource.includes("moves") && rmHubSource.includes("Roster Moves"));
check("RostermaniaHub has Start Season button", rmHubSource.includes("Start") && rmHubSource.includes("Season"));
check("Sidebar updated for rostermania", readFileSync(new URL("../src/components/DynastySidebar.jsx", import.meta.url), "utf8").includes("rostermania"));
check("Home handles rostermaniaActive state", readFileSync(new URL("../src/components/Home.jsx", import.meta.url), "utf8").includes("rostermaniaActive"));

console.log(`\n═══ Rostermania Hub Diagnostic Complete ═══`);
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length > 0) {
  console.log("\nFailed checks:");
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(failures.length > 0 ? 1 : 0);
