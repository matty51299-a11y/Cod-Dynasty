// scripts/diagnoseEventCentre.mjs
// Verifies the Inbox / Event Centre system end to end.
//
// Run with:
//   node --loader ./scripts/asset-loader.mjs scripts/diagnoseEventCentre.mjs

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { buildSeason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { migratePlayerMorale } from "../src/engine/moraleEngine.js";
import {
  migrateEventCentre, pushEvents, markEventRead, markAllRead, dismissEvent,
  getActiveEvents, getActionRequiredEvents, getUnreadCount, getActionRequiredCount,
  getSortedEvents, getEventsByCategory, convertFeedToEvents, resetNextId,
  makeTransferOfferEvent, makeChallengerBuyoutEvent, makeTransferDoneEvent,
  makeMoraleMeetingEvent, makePromiseAtRiskEvent, makeBoardWarningEvent,
  makeBoardConfidenceUpEvent, makeBoardObjectiveEvent, makeScoutReportEvent,
  makeContractReviewEvent, makeFreeAgencyOpenEvent, makePlayerWantsOutEvent,
  makeBlockedMoveEvent, makeMajorDrawEvent, makeTournamentChampionEvent,
  makeUserEliminatedEvent, makeAwardEvent, makeUserAwardEvent,
  makeStageSimSummaryEvent, makeUserMatchResultEvent, makeOffseasonStartEvent,
  makeStandoutPerformanceEvent, makeAssistantGmRecommendation, makeRivalSigningEvent,
  makeMatchSummaryEvent, makePerformanceStoryEvent, makePromiseKeptEvent,
  makeSquadMoraleWarningEvent, makeRosterIncompleteEvent, makeContractExpiringEvent,
  makeRivalEliminatedEvent, makeChallengerQualifiesEvent, makeCoachConcernEvent,
  makeSeasonStartEvent, generateMatchInboxEvents,
  makeEvent, makeLeagueNewsEvent,
  EVENT_CATEGORIES, CATEGORY_LIST, SEVERITY, SEVERITY_ORDER,
  severityColor, severityBg, CATEGORY_ICON,
} from "../src/engine/eventCentreEngine.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

function baseState(userTeamId = "lat") {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = {
    userTeamId, userTeamType: "cdl", season: 1, players, prospects,
    schedule: { ...buildSeason(1), phase: "stage", stageIdx: 0 },
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [], seasonHistory: [],
    eventCentre: migrateEventCentre(null),
    playerMorale: {},
  };
  ensureChallengerTeams(state);
  const cleaned = ensureCdlRosterIntegrity(state, { windowType: "diagnose_ec" });
  cleaned.playerMorale = migratePlayerMorale(cleaned);
  return cleaned;
}

// ── 1. Migration / hydration ─────────────────────────────────────────────────
console.log("\n1. Migration / Hydration");
{
  resetNextId(1);
  const ec = migrateEventCentre(null);
  check("null → empty eventCentre", ec && Array.isArray(ec.events) && ec.events.length === 0);

  const ec2 = migrateEventCentre({ events: [{ id: "evt_1", type: "test" }], nextId: 2 });
  check("existing eventCentre preserved", ec2.events.length === 1 && ec2.events[0].id === "evt_1");

  const ec3 = migrateEventCentre(undefined);
  check("undefined → empty eventCentre", ec3 && Array.isArray(ec3.events) && ec3.events.length === 0);
}

// ── 2. Push events with deduplication ────────────────────────────────────────
console.log("\n2. Push events / deduplication");
{
  resetNextId(1);
  let ec = migrateEventCentre(null);
  const ev1 = makeEvent({ type: "test", category: "Transfers", title: "Test 1", dedupKey: "dk_1" });
  const ev2 = makeEvent({ type: "test", category: "Transfers", title: "Test 2", dedupKey: "dk_2" });
  ec = pushEvents(ec, [ev1, ev2]);
  check("two events pushed", ec.events.length === 2);

  const ev3 = makeEvent({ type: "test", category: "Transfers", title: "Test 3", dedupKey: "dk_1" });
  ec = pushEvents(ec, [ev3]);
  check("duplicate dedupKey blocked", ec.events.length === 2);

  const ev4 = makeEvent({ type: "test", category: "Transfers", title: "Test 4" });
  ec = pushEvents(ec, [ev4]);
  check("event without dedupKey accepted", ec.events.length === 3);
}

// ── 3. Mark read / dismiss ───────────────────────────────────────────────────
console.log("\n3. Mark read / dismiss");
{
  resetNextId(1);
  let ec = migrateEventCentre(null);
  const ev1 = makeEvent({ type: "test", category: "Transfers", title: "Test", severity: "high", actionRequired: true });
  const ev2 = makeEvent({ type: "test2", category: "Morale", title: "Test2" });
  ec = pushEvents(ec, [ev1, ev2]);
  check("2 unread", getUnreadCount(ec) === 2);
  check("1 action required", getActionRequiredCount(ec) === 1);

  ec = markEventRead(ec, ev1.id);
  check("mark read works", ec.events.find(e => e.id === ev1.id).read === true);
  check("action required count updates after read", getActionRequiredCount(ec) === 0);

  ec = markAllRead(ec);
  check("mark all read works", getUnreadCount(ec) === 0);

  ec = dismissEvent(ec, ev1.id);
  check("dismiss works", ec.events.find(e => e.id === ev1.id).dismissed === true);
  check("active events excludes dismissed", getActiveEvents(ec).length === 1);
}

// ── 4. Sorting ───────────────────────────────────────────────────────────────
console.log("\n4. Sorting");
{
  resetNextId(1);
  let ec = migrateEventCentre(null);
  const evInfo = makeEvent({ type: "t1", category: "League News", title: "Info", severity: "info" });
  const evHigh = makeEvent({ type: "t2", category: "Transfers", title: "High", severity: "high", actionRequired: true });
  const evMed = makeEvent({ type: "t3", category: "Morale", title: "Med", severity: "medium" });
  ec = pushEvents(ec, [evInfo, evHigh, evMed]);
  const sorted = getSortedEvents(ec);
  check("action-required first", sorted[0].id === evHigh.id);
  check("unread higher severity next", sorted[1].severity === "medium" || sorted[1].severity === "high");
}

// ── 5. Category filtering ────────────────────────────────────────────────────
console.log("\n5. Category filtering");
{
  resetNextId(1);
  let ec = migrateEventCentre(null);
  ec = pushEvents(ec, [
    makeEvent({ type: "t1", category: "Transfers", title: "A" }),
    makeEvent({ type: "t2", category: "Morale", title: "B" }),
    makeEvent({ type: "t3", category: "Transfers", title: "C" }),
  ]);
  const transfers = getEventsByCategory(ec, "Transfers");
  check("filter by category works", transfers.length === 2);
  check("all categories defined", CATEGORY_LIST.length >= 12);
}

// ── 6. Event generators ─────────────────────────────────────────────────────
console.log("\n6. Event generators");
{
  resetNextId(1);
  const state = baseState();
  const player = state.players.find(p => p.teamId === "lat");

  const trEvent = makeTransferOfferEvent({ id: "tr_1", fromTeamId: "atl", fee: 290000 }, player, state);
  check("transfer offer event has correct type", trEvent.type === "transfer_offer");
  check("transfer offer is action-required", trEvent.actionRequired === true);
  check("transfer offer severity is high", trEvent.severity === "high");
  check("transfer offer has actions", trEvent.actions.length >= 2);
  check("transfer offer has dedupKey", !!trEvent.dedupKey);

  const moraleEvent = makeMoraleMeetingEvent(player, "playing_time", "medium", state);
  check("morale meeting event generated", moraleEvent.type === "morale_meeting");
  check("morale meeting is action-required", moraleEvent.actionRequired === true);
  check("morale meeting targets dynamics", moraleEvent.targetScreen === "dynamics");

  const boardEvent = makeBoardWarningEvent(25, "At Risk", state);
  check("board warning generated", boardEvent.type === "board_warning");
  check("board warning severity matches", boardEvent.severity === "high");

  const scoutEvent = makeScoutReportEvent(player, state);
  check("scout report generated", scoutEvent.type === "scout_report");
  check("scout report targets scouting", scoutEvent.targetScreen === "scouting");

  const contractEvent = makeContractReviewEvent(3, state);
  check("contract review generated", contractEvent.type === "contract_review");
  check("contract review action-required", contractEvent.actionRequired === true);

  const majorEvent = makeMajorDrawEvent("Major 1", 0, state);
  check("major draw event generated", majorEvent.type === "major_draw");

  const champEvent = makeTournamentChampionEvent("Major 1", "FaZe Vegas", false, state);
  check("tournament champion event generated", champEvent.type === "tournament_champion");

  const elimEvent = makeUserEliminatedEvent("Major 1", state);
  check("user eliminated event generated", elimEvent.type === "user_eliminated");

  const awardEvent = makeAwardEvent("Season MVP", "Sib", state);
  check("award event generated", awardEvent.type === "award_winner");

  const offseasonEvent = makeOffseasonStartEvent(1, state);
  check("offseason start event generated", offseasonEvent.type === "offseason_start");
  check("offseason start is action-required", offseasonEvent.actionRequired === true);

  const gmRec = makeAssistantGmRecommendation("Counter above $350k", "The player is worth more.", "transfers", state);
  check("GM recommendation generated", gmRec.type === "gm_recommendation");

  const rivalEvent = makeRivalSigningEvent("atl", "TestPlayer", 1, "stage");
  check("rival signing event generated", rivalEvent.type === "rival_signing");

  const standoutEvent = makeStandoutPerformanceEvent("Sib", "1.45", state);
  check("standout performance event generated", standoutEvent.type === "standout_performance");

  const wantsOutEvent = makePlayerWantsOutEvent(player, state);
  check("player wants out event generated", wantsOutEvent.type === "player_wants_out");
  check("player wants out is critical", wantsOutEvent.severity === "critical");

  const blockedEvent = makeBlockedMoveEvent(player, state);
  check("blocked move event generated", blockedEvent.type === "blocked_move");

  const promiseRisk = makePromiseAtRiskEvent({ id: "p1", label: "starter_role" }, player, state);
  check("promise at risk event generated", promiseRisk.type === "promise_at_risk");

  const faEvent = makeFreeAgencyOpenEvent(state);
  check("free agency open event generated", faEvent.type === "free_agency_open");
}

// ── 7. Convert old feed items to events ──────────────────────────────────────
console.log("\n7. Feed → Events conversion");
{
  resetNextId(1);
  const feedItems = [
    { id: "f_0", type: "major_champ", message: "FaZe win Major 1", title: "FaZe win Major 1", season: 1, phase: "major", read: false, importance: "high" },
    { id: "f_1", type: "signing", message: "LAT sign Sib", season: 1, phase: "stage", read: true },
    { id: "f_2", type: "board_mandate", message: "Owner sets mandate", season: 1, phase: "stage", read: false },
  ];
  const events = convertFeedToEvents(feedItems);
  check("feed items converted to events", events.length === 3);
  check("major_champ → Tournament category", events[0].category === "Tournament");
  check("signing → Transfers category", events[1].category === "Transfers");
  check("board_mandate → Board category", events[2].category === "Board");
  check("read status preserved from feed", events[0].read === false && events[1].read === true);
  check("unread feed → unread event", events[2].read === false);
}

// ── 8. Old save hydrates safely ──────────────────────────────────────────────
console.log("\n8. Old save hydration");
{
  resetNextId(1);
  const state = baseState();
  delete state.eventCentre;
  const ec = migrateEventCentre(state.eventCentre);
  check("missing eventCentre → empty", ec.events.length === 0);

  // Simulate old save with feed items
  state.feed = [
    { id: "f_0", type: "signing", message: "Test signing", season: 1, phase: "stage", read: false },
    { id: "f_1", type: "major_champ", message: "FaZe win", season: 1, phase: "major", read: true, importance: "high" },
  ];
  let ec2 = migrateEventCentre(null);
  ec2 = pushEvents(ec2, convertFeedToEvents(state.feed));
  check("old feed converted to events on load", ec2.events.length === 2);
  check("events have IDs", ec2.events.every(e => !!e.id));
  check("events have categories", ec2.events.every(e => !!e.category));
}

// ── 9. Deduplication prevents spam ───────────────────────────────────────────
console.log("\n9. Deduplication / spam prevention");
{
  resetNextId(1);
  const state = baseState();
  const player = state.players.find(p => p.teamId === "lat");
  let ec = migrateEventCentre(null);

  // Same transfer offer twice
  const offer = { id: "tr_1", fromTeamId: "atl", fee: 290000 };
  ec = pushEvents(ec, [makeTransferOfferEvent(offer, player, state)]);
  ec = pushEvents(ec, [makeTransferOfferEvent(offer, player, state)]);
  check("duplicate transfer offer blocked", ec.events.filter(e => e.type === "transfer_offer").length === 1);

  // Same board warning twice in same stage
  ec = pushEvents(ec, [makeBoardWarningEvent(25, "At Risk", state)]);
  ec = pushEvents(ec, [makeBoardWarningEvent(25, "At Risk", state)]);
  check("duplicate board warning blocked", ec.events.filter(e => e.type === "board_warning").length === 1);

  // Same morale meeting in same stage
  ec = pushEvents(ec, [makeMoraleMeetingEvent(player, "playing_time", "medium", state)]);
  ec = pushEvents(ec, [makeMoraleMeetingEvent(player, "playing_time", "medium", state)]);
  check("duplicate morale meeting blocked", ec.events.filter(e => e.type === "morale_meeting").length === 1);
}

// ── 10. Sidebar / home counts ────────────────────────────────────────────────
console.log("\n10. Count helpers");
{
  resetNextId(1);
  let ec = migrateEventCentre(null);
  ec = pushEvents(ec, [
    makeEvent({ type: "t1", category: "Transfers", title: "A", severity: "high", actionRequired: true }),
    makeEvent({ type: "t2", category: "Morale", title: "B", severity: "medium" }),
    makeEvent({ type: "t3", category: "Board", title: "C", severity: "info" }),
  ]);
  check("unread count = 3", getUnreadCount(ec) === 3);
  check("action required count = 1", getActionRequiredCount(ec) === 1);

  ec = markEventRead(ec, ec.events[0].id);
  check("after marking read: unread = 2", getUnreadCount(ec) === 2);
  check("after marking action-required read: action count = 0", getActionRequiredCount(ec) === 0);
}

// ── 11. Constants and metadata ───────────────────────────────────────────────
console.log("\n11. Constants and metadata");
{
  check("EVENT_CATEGORIES has 12+ categories", Object.keys(EVENT_CATEGORIES).length >= 12);
  check("CATEGORY_LIST matches", CATEGORY_LIST.length === Object.keys(EVENT_CATEGORIES).length);
  check("SEVERITY has 5 levels", Object.keys(SEVERITY).length === 5);
  check("SEVERITY_ORDER covers all levels", Object.keys(SEVERITY_ORDER).length === 5);
  check("all categories have icons", CATEGORY_LIST.every(c => CATEGORY_ICON[c]));
  check("severityColor returns strings", typeof severityColor("high") === "string");
  check("severityBg returns strings", typeof severityBg("critical") === "string");
}

// ── 12. Event cap ────────────────────────────────────────────────────────────
console.log("\n12. Event cap");
{
  resetNextId(1);
  let ec = migrateEventCentre(null);
  const events = [];
  for (let i = 0; i < 350; i++) {
    events.push(makeEvent({ type: `type_${i}`, category: "League News", title: `Event ${i}` }));
  }
  ec = pushEvents(ec, events);
  check("event cap enforced (≤ 300)", ec.events.length <= 300);
}

// ── 13. Match summary events ────────────────────────────────────────────
console.log("\n13. Match summary events");
{
  resetNextId(1);
  const state = baseState();
  const matchResult = {
    teamA: "lat", teamB: "atl", scoreA: 3, scoreB: 1, played: true,
    season: 1, matchday: 1,
    standouts: [{ name: "Sib", kd: 1.35, playerId: "p1" }, { name: "Kenny", kd: 0.78, playerId: "p2" }],
    maps: [
      { mode: "HP", mapName: "Sake", teamAScore: 250, teamBScore: 180 },
      { mode: "S&D", mapName: "Den", teamAScore: 6, teamBScore: 4 },
      { mode: "OVR", mapName: "Den", teamAScore: 3, teamBScore: 1 },
      { mode: "HP", mapName: "Scar", teamAScore: 250, teamBScore: 220 },
    ],
  };

  const ev = makeMatchSummaryEvent(matchResult, "lat", state);
  check("match summary type correct", ev.type === "match_summary");
  check("match summary category", ev.category === "Match Results");
  check("match summary has title", ev.title.length > 5);
  check("match summary has scoreline in title", ev.title.includes("3-1"));
  check("match summary has matchData", !!ev.matchData);
  check("match summary matchData.won", ev.matchData.won === true);
  check("match summary has best performer", !!ev.matchData.bestPerformer);
  check("match summary best performer is Sib", ev.matchData.bestPerformer.name === "Sib");
  check("match summary has dedupKey", !!ev.dedupKey);
  check("match summary targets match log", ev.targetScreen === "log");

  const lossResult = { ...matchResult, scoreA: 1, scoreB: 3, standouts: [] };
  const evLoss = makeMatchSummaryEvent(lossResult, "lat", state);
  check("loss match summary severity is low", evLoss.severity === "low");
  check("loss title has tone word", /loss|defeat|fall|heavy/i.test(evLoss.title));

  let ec = migrateEventCentre(null);
  ec = pushEvents(ec, [ev]);
  const ev2 = makeMatchSummaryEvent(matchResult, "lat", state);
  ec = pushEvents(ec, [ev2]);
  check("duplicate match summary blocked", ec.events.filter(e => e.type === "match_summary").length === 1);
}

// ── 14. Performance story events ────────────────────────────────────────
console.log("\n14. Performance story events");
{
  resetNextId(1);
  const state = baseState();
  const player = { name: "Sib", id: "test_p1" };

  const standout = makePerformanceStoryEvent(player, 1.40, "standout", state);
  check("standout performance type", standout.type === "performance_story");
  check("standout has player name in title", standout.title.includes("Sib"));
  check("standout severity medium", standout.severity === "medium");

  const poor = makePerformanceStoryEvent(player, 0.65, "poor", state);
  check("poor performance generated", poor.type === "performance_story");
  check("poor has KD in title", poor.title.includes("0.65"));

  const mvp = makePerformanceStoryEvent(player, 1.50, "mvp", state);
  check("mvp event category is Awards", mvp.category === "Awards");
}

// ── 15. New event generators ────────────────────────────────────────────
console.log("\n15. New event generators");
{
  resetNextId(1);
  const state = baseState();
  const player = state.players.find(p => p.teamId === "lat");

  const promiseKept = makePromiseKeptEvent({ id: "pk1", label: "starter_role" }, player, state);
  check("promise kept event generated", promiseKept.type === "promise_kept");
  check("promise kept is info severity", promiseKept.severity === "info");

  const squadMorale = makeSquadMoraleWarningEvent(35, state);
  check("squad morale warning generated", squadMorale.type === "squad_morale_warning");
  check("squad morale warning is action-required at < 40", squadMorale.actionRequired === true);

  const rosterIncomplete = makeRosterIncompleteEvent(state);
  check("roster incomplete event generated", rosterIncomplete.type === "roster_incomplete");
  check("roster incomplete is critical", rosterIncomplete.severity === "critical");

  const contractExpiring = makeContractExpiringEvent(player, state);
  check("contract expiring event generated", contractExpiring.type === "contract_expiring");

  const rivalElim = makeRivalEliminatedEvent("atl", "Major 1", "WB R2", state);
  check("rival eliminated event generated", rivalElim.type === "rival_eliminated");

  const challQual = makeChallengerQualifiesEvent("Omit Noir", state);
  check("challenger qualifies event generated", challQual.type === "challenger_qualifies");

  const coachConcern = makeCoachConcernEvent("Chemistry declining", state);
  check("coach concern event generated", coachConcern.type === "coach_concern");

  const seasonStart = makeSeasonStartEvent(2, state);
  check("season start event generated", seasonStart.type === "season_start");
}

// ── 16. generateMatchInboxEvents ────────────────────────────────────────
console.log("\n16. generateMatchInboxEvents helper");
{
  resetNextId(1);
  const state = baseState();
  const prevState = { ...state, schedule: { ...state.schedule, matchLog: [] } };
  const newState = {
    ...state,
    schedule: {
      ...state.schedule,
      matchLog: [
        {
          teamA: "lat", teamB: "atl", scoreA: 3, scoreB: 1, played: true,
          winnerId: "lat", loserId: "atl", season: 1, matchday: 1,
          standouts: [{ name: "Sib", kd: 1.35, playerId: "p1" }],
        },
        {
          teamA: "faze", teamB: "optic", scoreA: 2, scoreB: 3, played: true,
          winnerId: "optic", loserId: "faze", season: 1, matchday: 1,
          standouts: [],
        },
      ],
    },
  };

  const events = generateMatchInboxEvents(prevState, newState);
  check("generateMatchInboxEvents returns events", events.length >= 1);
  check("match summary created for user match", events.some(e => e.type === "match_summary"));
  check("standout performance created for Sib", events.some(e => e.type === "performance_story" && e.title.includes("Sib")));
  check("non-user match excluded", !events.some(e => e.title?.includes("faze") || e.title?.includes("optic")));

  const noNew = generateMatchInboxEvents(newState, newState);
  check("no new matches → empty events", noNew.length === 0);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`Event Centre diagnostic: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
