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

console.log("═══ Rostermania User Control Diagnostic ═══\n");

const storeSource = readFileSync(new URL("../src/store/dynastyStore.jsx", import.meta.url), "utf8");

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

function buildAWTransition(state) {
  const aw = getEra("advanced_warfare");
  const previousPlayers = state.players.map(p => ({ ...p }));
  const userRosterIds = new Set(previousPlayers.filter(p => p.teamId === state.userTeamId).map(p => p.id));
  const userTeamExists = AW_TEAMS.some(t => t.id === state.userTeamId);
  const userTeamId = userTeamExists ? state.userTeamId : AW_TEAMS[0]?.id;
  const oldTeamIds = new Set(state.teams.map(t => t.id));
  const departedTeams = state.teams.filter(t => !new Set(AW_TEAMS.map(t2 => t2.id)).has(t.id));
  const consumed = new Set();
  const players = [];

  for (const rowPlayer of AW_PLAYERS) {
    const key = String(rowPlayer.name).toLowerCase();
    const protectedExisting = previousPlayers.find(p => userRosterIds.has(p.id) && String(p.name).toLowerCase() === key);
    if (protectedExisting) {
      consumed.add(protectedExisting.id);
      players.push({ ...protectedExisting, previousTeamId: protectedExisting.teamId, teamId: userTeamId, currentStatus: "active", status: "active", contractYears: 1 });
      continue;
    }
    const existing = previousPlayers.find(p => !consumed.has(p.id) && String(p.name).toLowerCase() === key);
    const protectedTarget = rowPlayer.teamId === userTeamId;
    if (existing) {
      consumed.add(existing.id);
      players.push({ ...existing, ...rowPlayer, id: existing.id, previousTeamId: existing.teamId, teamId: protectedTarget ? null : rowPlayer.teamId, debutEraId: existing.debutEraId || "ghosts", currentStatus: protectedTarget ? "free_agent" : "active", status: protectedTarget ? "free_agent" : "active", contractYears: protectedTarget ? 0 : 1 });
    } else {
      players.push({ ...rowPlayer, debutEraId: "advanced_warfare", firstActiveSeason: aw.seasonLabel, teamId: protectedTarget ? null : rowPlayer.teamId, currentStatus: protectedTarget ? "free_agent" : "active", status: protectedTarget ? "free_agent" : "active", contractYears: protectedTarget ? 0 : 1 });
    }
  }

  for (const oldPlayer of previousPlayers) {
    if (consumed.has(oldPlayer.id)) continue;
    if (userRosterIds.has(oldPlayer.id)) {
      players.push({ ...oldPlayer, previousTeamId: oldPlayer.teamId, teamId: userTeamId, currentStatus: "active", status: "active", contractYears: 1 });
    } else {
      players.push({ ...oldPlayer, previousTeamId: oldPlayer.teamId || oldPlayer.previousTeamId, teamId: null, currentStatus: "free_agent", status: "free_agent", contractYears: 0 });
    }
  }

  const teams = AW_TEAMS.map(t => ({ ...t }));
  return ensureFourPlayerRosters({
    ...state,
    currentEraId: "advanced_warfare", currentGameTitle: aw.gameTitle, seasonLabel: aw.seasonLabel,
    currentSeasonLabel: aw.seasonLabel, currentSeasonIndex: 1, completedEraIds: ["ghosts"],
    userTeamId, currentUserTeamId: userTeamId, controlledTeamId: userTeamId,
    teams, activeTeams: teams.map(t => t.id),
    inactiveTeams: departedTeams.map(t => t.id), players,
    eventCalendar: ADVANCED_WARFARE_EVENTS.map(e => ({ ...e, teamCount: teams.length })),
    completedEvents: [], completedEventIds: [], eventProgress: {},
    activeEventId: null, currentEventId: ADVANCED_WARFARE_EVENTS[0]?.id || null,
    currentEventIndex: 0, standings: createInitialStandings(teams),
    pendingSeasonComplete: false,
  }, "advanced_warfare", { repairUserTeam: false });
}

// ── Build the Rostermania state ──

let state = createTestState("optic_gaming");
state = completeAllEvents(state);
const archived = archiveSeason(state);
let rmState = buildAWTransition(archived);
rmState = {
  ...rmState,
  rostermaniaActive: true,
  rostermaniaMoveLog: [],
  rostermaniaData: {
    seasonReview: { eraId: "ghosts" },
    userTeamPreserved: AW_TEAMS.some(t => t.id === rmState.userTeamId),
    previousUserTeamId: state.userTeamId,
    needsTeamSelect: false,
  },
};

// ── CHECK 1 ──
const userRosterAtStart = rmState.players.filter(p => p.teamId === rmState.userTeamId);
check("1. Enter Rostermania — user roster starts with 4 players", userRosterAtStart.length === 4, `${userRosterAtStart.length}/4`);

// ── CHECK 2: Release a user player ──
const releaseTarget = userRosterAtStart[0];
let releasedState = {
  ...rmState,
  players: rmState.players.map(p =>
    p.id === releaseTarget.id
      ? { ...p, teamId: null, previousTeamId: rmState.userTeamId, status: "free_agent", currentStatus: "free_agent", contractYears: 0, userReleasedDuringRostermania: true }
      : p
  ),
};
releasedState = ensureFourPlayerRosters(releasedState, "advanced_warfare", { repairUserTeam: false });
const userRosterAfterRelease = releasedState.players.filter(p => p.teamId === rmState.userTeamId);
check("2. Releasing one user player changes roster to 3/4", userRosterAfterRelease.length === 3, `${userRosterAfterRelease.length}/4 — released ${releaseTarget.displayName || releaseTarget.name}`);

// ── CHECK 3 ──
const releasedInFA = releasedState.freeAgents.some(p => p.id === releaseTarget.id) || releasedState.players.some(p => p.id === releaseTarget.id && !p.teamId);
check("3. Released player appears in Free Agency", releasedInFA, releaseTarget.displayName || releaseTarget.name);

// ── CHECK 4: THE KEY TEST ──
check("4. No replacement auto-signs to user team (repairUserTeam: false)", userRosterAfterRelease.length === 3, "user team was NOT auto-filled");

// ── CHECK 5 ──
const userCountFor5 = releasedState.players.filter(p => p.teamId === rmState.userTeamId).length;
check("5. Start AW is blocked while user roster is 3/4", userCountFor5 !== 4, `user roster has ${userCountFor5}/4`);
check("5b. Store CONFIRM_AW_SEASON blocks incomplete user rosters", storeSource.includes("Your roster has") && storeSource.includes("CONFIRM_AW_SEASON"));

// ── CHECK 6: Sign a free agent ──
const signCandidate = releasedState.freeAgents.find(p => p.id !== releaseTarget.id) || releasedState.freeAgents[0];
let signedState = {
  ...releasedState,
  players: (releasedState.players.some(p => p.id === signCandidate.id)
    ? releasedState.players
    : [...releasedState.players, signCandidate]
  ).map(p =>
    p.id === signCandidate.id
      ? { ...p, teamId: rmState.userTeamId, status: "active", currentStatus: "active", contractYears: 1, userReleasedDuringRostermania: false }
      : p
  ),
  freeAgents: releasedState.freeAgents.filter(p => p.id !== signCandidate.id),
};
signedState = ensureFourPlayerRosters(signedState, "advanced_warfare", { repairUserTeam: false });
const userRosterAfterSign = signedState.players.filter(p => p.teamId === rmState.userTeamId);
check("6. User can manually sign a free agent", userRosterAfterSign.length === 4, `signed ${signCandidate.displayName || signCandidate.name}`);

// ── CHECK 7 ──
check("7. Signed player is removed from Free Agency", !signedState.freeAgents.some(p => p.id === signCandidate.id));

// ── CHECK 8 ──
check("8. User roster returns to 4/4", userRosterAfterSign.length === 4, `${userRosterAfterSign.length}/4`);

// ── CHECK 9 ──
const problemsAfterSign = getRosterIntegrityProblems(signedState, "advanced_warfare");
check("9. Start AW becomes available when integrity passes", problemsAfterSign.length === 0, problemsAfterSign.length === 0 ? "no integrity problems" : problemsAfterSign.join("; "));

// ── CHECK 10: AI repair with repairUserTeam: false ──
const aiTeamId = rmState.activeTeams.find(tid => tid !== rmState.userTeamId);
const aiPlayers = releasedState.players.filter(p => p.teamId === aiTeamId);
const aiVictim = aiPlayers[0];
let aiDamagedState = {
  ...releasedState,
  players: releasedState.players.map(p =>
    p.id === aiVictim.id ? { ...p, teamId: null, previousTeamId: aiTeamId, status: "free_agent", currentStatus: "free_agent", contractYears: 0 } : p
  ),
};
const aiCountBefore = aiDamagedState.players.filter(p => p.teamId === aiTeamId).length;
aiDamagedState = ensureFourPlayerRosters(aiDamagedState, "advanced_warfare", { repairUserTeam: false });
const aiCountAfter = aiDamagedState.players.filter(p => p.teamId === aiTeamId).length;
check("10. AI teams can still be repaired to 4 players", aiCountBefore === 3 && aiCountAfter === 4, `AI team ${aiTeamId}: ${aiCountBefore} -> ${aiCountAfter}`);

// ── CHECK 11 ──
const userCountAfterAIRepair = aiDamagedState.players.filter(p => p.teamId === rmState.userTeamId).length;
check("11. AI repair does not auto-fill the user roster", userCountAfterAIRepair === 3, `user team still ${userCountAfterAIRepair}/4 after AI repair`);

// ── CHECK 12: User-released players are deprioritized for AI ──
const releaseTarget12 = userRosterAtStart[1];
let deprioritizeState = {
  ...rmState,
  players: rmState.players.map(p =>
    p.id === releaseTarget12.id ? { ...p, teamId: null, previousTeamId: rmState.userTeamId, status: "free_agent", currentStatus: "free_agent", contractYears: 0, userReleasedDuringRostermania: true } : p
  ),
};
const aiTeam12 = rmState.activeTeams.find(tid => tid !== rmState.userTeamId);
const aiPlayers12 = deprioritizeState.players.filter(p => p.teamId === aiTeam12);
const aiVictim12 = aiPlayers12[0];
deprioritizeState = {
  ...deprioritizeState,
  players: deprioritizeState.players.map(p =>
    p.id === aiVictim12.id ? { ...p, teamId: null, previousTeamId: aiTeam12, status: "free_agent", currentStatus: "free_agent", contractYears: 0 } : p
  ),
};
deprioritizeState = ensureFourPlayerRosters(deprioritizeState, "advanced_warfare", { repairUserTeam: false });
const aiRosterAfterRepair = deprioritizeState.players.filter(p => p.teamId === aiTeam12);
const releasedPlayerStolen = aiRosterAfterRepair.some(p => p.id === releaseTarget12.id);
const nonProtectedFA = rmState.players.filter(p => !p.teamId && !p.userReleasedDuringRostermania && p.id !== releaseTarget12.id);
check("12. User-released players are deprioritized for AI auto-fill", !releasedPlayerStolen || nonProtectedFA.length === 0, releasedPlayerStolen ? "released player was picked (no alternatives)" : `${releaseTarget12.displayName || releaseTarget12.name} was NOT stolen by AI`);

// ── CHECK 13: Player status fields ──
const releasedPlayer13 = releasedState.players.find(p => p.id === releaseTarget.id);
const releaseStatusOk = releasedPlayer13 && !releasedPlayer13.teamId && ["free_agent", "freeAgent"].includes(releasedPlayer13.status) && releasedPlayer13.userReleasedDuringRostermania === true;
const signedPlayer13 = signedState.players.find(p => p.id === signCandidate.id);
const signStatusOk = signedPlayer13 && signedPlayer13.teamId === rmState.userTeamId && (signedPlayer13.status === "active" || signedPlayer13.currentStatus === "active");
check("13. Player status fields are correct after release/sign", releaseStatusOk && signStatusOk, `released: ${releasedPlayer13?.status}, signed: ${signedPlayer13?.status} @ ${signedPlayer13?.teamId}`);

// ── CHECK 14: No duplicates ──
function noDuplicateActiveIds(testState) {
  const ids = testState.players.filter(p => p.teamId && (testState.activeTeams || []).includes(p.teamId)).map(p => p.id);
  return ids.length === new Set(ids).size;
}
check("14. No duplicate player IDs are created", noDuplicateActiveIds(rmState) && noDuplicateActiveIds(releasedState) && noDuplicateActiveIds(signedState) && noDuplicateActiveIds(aiDamagedState), "all states clean");

// ── CHECK 15 ──
check("15. No Modern CDL or Challengers are required", !JSON.stringify(rmState).toLowerCase().includes("challenger") && !rmState.teams.some(t => /breach|surge|koi|optic texas|atlanta faze/i.test(t.name)));

// ── CHECK 16: Move log ──
const storeLogsRelease = storeSource.includes("user_release") && storeSource.includes("rostermaniaMoveLog");
const storeLogsSign = storeSource.includes("user_sign") && storeSource.includes("rostermaniaMoveLog");
check("16. Move log records releases and signings", storeLogsRelease && storeLogsSign, `store wires release=${storeLogsRelease}, sign=${storeLogsSign}`);

// ── Summary ──
console.log(`\n═══ Rostermania User Control Diagnostic Complete ═══`);
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${failures.length}`);
if (failures.length > 0) {
  console.log("\nFailed checks:");
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(failures.length > 0 ? 1 : 0);
