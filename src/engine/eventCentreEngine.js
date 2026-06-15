// src/engine/eventCentreEngine.js
// Pure functions for the Inbox / Event Centre system.
// Generates, deduplicates, and manages rich actionable events.

import { CDL_TEAMS } from "../data/teams.js";

// ── Categories ───────────────────────────────────────────────────────────────
export const EVENT_CATEGORIES = {
  ACTION_REQUIRED: "Action Required",
  TRANSFERS:       "Transfers",
  MORALE:          "Morale",
  BOARD:           "Board",
  SCOUTING:        "Scouting",
  CONTRACTS:       "Contracts",
  MATCH_RESULTS:   "Match Results",
  TOURNAMENT:      "Tournament",
  AWARDS:          "Awards",
  STAFF:           "Staff",
  LEAGUE_NEWS:     "League News",
  RIVAL_MOVES:     "Rival Moves",
};

export const CATEGORY_LIST = Object.values(EVENT_CATEGORIES);

// ── Severity levels ──────────────────────────────────────────────────────────
export const SEVERITY = { INFO: "info", LOW: "low", MEDIUM: "medium", HIGH: "high", CRITICAL: "critical" };
export const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// ── Severity colours ─────────────────────────────────────────────────────────
export function severityColor(sev) {
  if (sev === "critical") return "#ef4444";
  if (sev === "high")     return "#f59e0b";
  if (sev === "medium")   return "#60a5fa";
  if (sev === "low")      return "#9db0d0";
  return "#64748b";
}

export function severityBg(sev) {
  if (sev === "critical") return "rgba(239,68,68,0.10)";
  if (sev === "high")     return "rgba(245,158,11,0.08)";
  if (sev === "medium")   return "rgba(96,165,250,0.06)";
  return "transparent";
}

// ── Category icons ───────────────────────────────────────────────────────────
export const CATEGORY_ICON = {
  "Action Required": "⚡",
  "Transfers":       "⇄",
  "Morale":          "♥",
  "Board":           "⚖",
  "Scouting":        "◎",
  "Contracts":       "✎",
  "Match Results":   "◆",
  "Tournament":      "★",
  "Awards":          "🏆",
  "Staff":           "✦",
  "League News":     "◈",
  "Rival Moves":     "↔",
};

// ── Event Centre cap ─────────────────────────────────────────────────────────
const EVENT_CAP = 300;

// ── Helpers ──────────────────────────────────────────────────────────────────
function teamTag(id) { return CDL_TEAMS.find(t => t.id === id)?.tag ?? id; }
function teamName(id) { return CDL_TEAMS.find(t => t.id === id)?.name ?? id; }
function fmtFee(n) { return `$${Math.round((n || 0) / 1000)}k`; }

let _nextId = 1;
export function resetNextId(n) { _nextId = n || 1; }

export function makeEvent({
  type, category, severity = "info", title, summary = "",
  season, stage, phase, read = false, actionRequired = false,
  expiresAtStage, relatedPlayerId, relatedTeamId, opponentTeamId, relatedMatchId,
  targetScreen, targetTab, actions = [], dedupKey, matchData,
}) {
  const id = `evt_${_nextId++}`;
  const ev = {
    id, type, category, severity, title, summary,
    season: season ?? 1, stage: stage ?? 0, phase: phase ?? "stage",
    createdAt: Date.now(), read, actionRequired,
    dismissed: false,
    expiresAtStage: expiresAtStage ?? null,
    relatedPlayerId: relatedPlayerId ?? null,
    relatedTeamId: relatedTeamId ?? null,
    opponentTeamId: opponentTeamId ?? null,
    relatedMatchId: relatedMatchId ?? null,
    targetScreen: targetScreen ?? null,
    targetTab: targetTab ?? null,
    actions: actions || [],
    dedupKey: dedupKey ?? null,
  };
  if (matchData) ev.matchData = matchData;
  return ev;
}

// ── Migration / hydration ────────────────────────────────────────────────────
export function migrateEventCentre(ec) {
  if (ec && Array.isArray(ec.events)) {
    _nextId = (ec.nextId || ec.events.length) + 1;
    return { events: ec.events, nextId: _nextId };
  }
  _nextId = 1;
  return { events: [], nextId: 1 };
}

// ── Push events (with dedup + cap) ───────────────────────────────────────────
export function addInboxEvent(state, event) {
  if (!state || !event) return state;
  return { ...state, eventCentre: pushEvents(state.eventCentre ?? migrateEventCentre(null), [event]) };
}

export function pushEvents(ec, newEvents) {
  if (!newEvents || !newEvents.length) return ec;
  const existing = ec?.events ?? [];
  const existingKeys = new Set(existing.filter(e => e.dedupKey).map(e => e.dedupKey));
  const deduped = newEvents.filter(e => !e.dedupKey || !existingKeys.has(e.dedupKey));
  if (!deduped.length) return ec;
  const combined = [...existing, ...deduped];
  const events = combined.length > EVENT_CAP ? combined.slice(combined.length - EVENT_CAP) : combined;
  return { ...ec, events, nextId: _nextId };
}

// ── Mark read / dismiss ──────────────────────────────────────────────────────
export function markEventRead(ec, eventId) {
  return { ...ec, events: ec.events.map(e => e.id === eventId ? { ...e, read: true } : e) };
}

export function markAllRead(ec) {
  return { ...ec, events: ec.events.map(e => e.read ? e : { ...e, read: true }) };
}

export function dismissEvent(ec, eventId) {
  return { ...ec, events: ec.events.map(e => e.id === eventId ? { ...e, dismissed: true, read: true } : e) };
}

// ── Query helpers ────────────────────────────────────────────────────────────
export function getActiveEvents(ec) {
  return (ec?.events ?? []).filter(e => !e.dismissed);
}

export function getActionRequiredEvents(ec) {
  return getActiveEvents(ec).filter(e => e.actionRequired && !e.read);
}

export function getUnreadCount(ec) {
  return getActiveEvents(ec).filter(e => !e.read).length;
}

export function getActionRequiredCount(ec) {
  return getActionRequiredEvents(ec).length;
}

export function getEventsByCategory(ec, category) {
  return getActiveEvents(ec).filter(e => e.category === category);
}

export function getSortedEvents(ec) {
  const active = getActiveEvents(ec);
  return active.sort((a, b) => {
    if (a.actionRequired !== b.actionRequired) return a.actionRequired ? -1 : 1;
    if (!a.read !== !b.read) return !a.read ? -1 : 1;
    const sa = SEVERITY_ORDER[a.severity] ?? 4;
    const sb = SEVERITY_ORDER[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

// ── Convert old feed items to events (one-time migration) ────────────────────
const FEED_TO_CATEGORY = {
  major_champ:    "Tournament",
  champs_champ:   "Tournament",
  major_result:   "Match Results",
  major_upset:    "Tournament",
  major_elim:     "Tournament",
  major_points:   "League News",
  qual_win:       "Tournament",
  qual_top4:      "Tournament",
  qual_debut:     "Tournament",
  signing:        "Transfers",
  release:        "Transfers",
  retirement:     "League News",
  roster_move:    "Rival Moves",
  prospect_class: "League News",
  transfer_offer: "Transfers",
  transfer_done:  "Transfers",
  kd_leader:      "League News",
  standout_perf:  "Awards",
  win_streak:     "Match Results",
  lose_streak:    "Match Results",
  top4_climb:     "League News",
  out_top8:       "League News",
  board_mandate:  "Board",
  challengers_finals: "Tournament",
  eswc_field:     "Tournament",
};

const FEED_TO_SEVERITY = {
  major_champ:    "high",
  champs_champ:   "high",
  major_upset:    "high",
  qual_win:       "medium",
  qual_debut:     "medium",
  transfer_offer: "high",
  transfer_done:  "medium",
  board_mandate:  "medium",
  lose_streak:    "low",
  standout_perf:  "medium",
};

export function convertFeedToEvents(feedItems) {
  if (!feedItems?.length) return [];
  return feedItems.map(f => makeEvent({
    type: f.type ?? "league_news",
    category: FEED_TO_CATEGORY[f.type] ?? "League News",
    severity: FEED_TO_SEVERITY[f.type] ?? (f.importance === "high" ? "medium" : "info"),
    title: f.title || f.message || "League update",
    summary: f.body || "",
    season: f.season,
    phase: f.phase,
    read: f.read ?? true,
    actionRequired: false,
  }));
}

// ── Event generators ─────────────────────────────────────────────────────────

// Transfer offer received (incoming)
export function makeTransferOfferEvent(offer, player, state) {
  const buyer = CDL_TEAMS.find(t => t.id === offer.fromTeamId);
  return makeEvent({
    type: "transfer_offer",
    category: "Transfers",
    severity: "high",
    title: `${buyer?.tag ?? "A team"} bid ${fmtFee(offer.fee)} for ${player?.name ?? "your player"}`,
    summary: `${buyer?.name ?? "A CDL team"} have submitted a buyout offer for ${player?.name ?? "your player"}.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    actionRequired: true,
    relatedPlayerId: player?.id,
    relatedTeamId: offer.fromTeamId,
    targetScreen: "transfers",
    targetTab: "incoming",
    actions: ["review_offer", "open_player", "dismiss"],
    dedupKey: `transfer_offer:${offer.id}`,
  });
}

// Challenger buyout offer
export function makeChallengerBuyoutEvent(offer, state) {
  const buyer = CDL_TEAMS.find(t => t.id === offer.fromCdlTeamId);
  return makeEvent({
    type: "challenger_buyout",
    category: "Transfers",
    severity: "high",
    title: `${buyer?.tag ?? "A CDL team"} bid ${fmtFee(offer.fee)} for ${offer.playerName}`,
    summary: `${buyer?.name ?? "A CDL team"} want to sign ${offer.playerName} from your Challenger roster.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    actionRequired: true,
    relatedPlayerId: offer.playerId,
    relatedTeamId: offer.fromCdlTeamId,
    targetScreen: "home",
    actions: ["review_offer", "dismiss"],
    dedupKey: `ch_buyout:${offer.id}`,
  });
}

// Transfer completed
export function makeTransferDoneEvent(player, buyerTeamId, fee, state) {
  return makeEvent({
    type: "transfer_done",
    category: "Transfers",
    severity: "medium",
    title: `${teamTag(buyerTeamId)} complete ${fmtFee(fee)} buyout for ${player?.name}`,
    summary: `${player?.name} has joined ${teamName(buyerTeamId)}.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    relatedPlayerId: player?.id,
    relatedTeamId: buyerTeamId,
    targetScreen: "transfers",
    actions: ["open_player", "dismiss"],
    dedupKey: `transfer_done:${player?.id}:${state.season}:${buyerTeamId}`,
  });
}

// Rival signing
export function makeRivalSigningEvent(teamId, playerName, season, phase) {
  return makeEvent({
    type: "rival_signing",
    category: "Rival Moves",
    severity: "low",
    title: `${teamTag(teamId)} sign ${playerName}`,
    summary: `${teamName(teamId)} have completed a roster move.`,
    season,
    phase,
    targetScreen: "standings",
    actions: ["dismiss"],
    dedupKey: `rival:${teamId}:${playerName}:${season}`,
  });
}

// Player morale meeting requested
export function makeMoraleMeetingEvent(player, concern, severity, state) {
  return makeEvent({
    type: "morale_meeting",
    category: "Morale",
    severity: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
    title: `${player.name} wants to talk`,
    summary: concern ? `${player.name} is concerned about ${concern.replaceAll("_", " ")}.` : `${player.name} has requested a meeting.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    actionRequired: true,
    relatedPlayerId: player.id,
    targetScreen: "dynamics",
    actions: ["talk_now", "open_player", "delay", "dismiss"],
    dedupKey: `morale_meeting:${player.id}:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// Promise at risk
export function makePromiseAtRiskEvent(promise, player, state) {
  return makeEvent({
    type: "promise_at_risk",
    category: "Morale",
    severity: "high",
    title: `Promise to ${player.name} at risk`,
    summary: `Your promise of "${promise.label}" may not be fulfilled before the deadline.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    actionRequired: true,
    relatedPlayerId: player.id,
    targetScreen: "dynamics",
    actions: ["open_player", "go_dynamics", "dismiss"],
    dedupKey: `promise_risk:${promise.id}:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// Promise broken
export function makePromiseBrokenEvent(promise, player, state) {
  return makeEvent({
    type: "promise_broken",
    category: "Morale",
    severity: "critical",
    title: `Promise to ${player.name} broken`,
    summary: `You failed to keep your promise of "${promise.label}". Morale and trust may suffer.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    relatedPlayerId: player.id,
    targetScreen: "dynamics",
    actions: ["talk_now", "open_player", "dismiss"],
    dedupKey: `promise_broken:${promise.id}`,
  });
}

// Board warning
export function makeBoardWarningEvent(confidence, band, state) {
  const sev = confidence < 20 ? "critical" : confidence < 40 ? "high" : "medium";
  return makeEvent({
    type: "board_warning",
    category: "Board",
    severity: sev,
    title: sev === "critical" ? "Board issues final warning" : `Board confidence: ${band}`,
    summary: sev === "critical"
      ? "The board is extremely unhappy. Your position is at serious risk."
      : `Board confidence has dropped to ${confidence}%. Improve results to secure your position.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    actionRequired: sev === "critical",
    targetScreen: "board",
    actions: ["view_board", "dismiss"],
    dedupKey: `board_warning:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// Board confidence improved
export function makeBoardConfidenceUpEvent(confidence, band, state) {
  return makeEvent({
    type: "board_confidence_up",
    category: "Board",
    severity: "info",
    title: `Board confidence improved: ${band}`,
    summary: `The board is pleased with recent results. Confidence now at ${confidence}%.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    targetScreen: "board",
    actions: ["view_board", "dismiss"],
    dedupKey: `board_up:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// Board objective update
export function makeBoardObjectiveEvent(state) {
  return makeEvent({
    type: "board_objectives",
    category: "Board",
    severity: "medium",
    title: "Season objectives set",
    summary: "The board has set objectives for this season. Review them to understand expectations.",
    season: state.season,
    phase: "stage",
    targetScreen: "board",
    actions: ["view_board", "dismiss"],
    dedupKey: `board_obj:${state.season}`,
  });
}

// Scout report ready
export function makeScoutReportEvent(player, state) {
  return makeEvent({
    type: "scout_report",
    category: "Scouting",
    severity: "medium",
    title: `Scout report ready: ${player.name}`,
    summary: `Your scouts have completed a detailed report on ${player.name}.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    relatedPlayerId: player.id,
    targetScreen: "scouting",
    actions: ["view_report", "shortlist", "dismiss"],
    dedupKey: `scout:${player.id}:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// Contract review needed
export function makeContractReviewEvent(expiringCount, state) {
  return makeEvent({
    type: "contract_review",
    category: "Contracts",
    severity: "high",
    title: `${expiringCount} contract${expiringCount !== 1 ? "s" : ""} expiring`,
    summary: `You have ${expiringCount} player${expiringCount !== 1 ? "s" : ""} with expiring contracts. Review them before they become free agents.`,
    season: state.season,
    phase: "contracts",
    actionRequired: true,
    targetScreen: "home",
    actions: ["review_contracts", "dismiss"],
    dedupKey: `contract_review:${state.season}`,
  });
}

// Free agency open
export function makeFreeAgencyOpenEvent(state) {
  return makeEvent({
    type: "free_agency_open",
    category: "Contracts",
    severity: "medium",
    title: "Free agency window open",
    summary: "You can now sign free agents before AI teams bid. Scout the market for bargains.",
    season: state.season,
    phase: "contracts",
    targetScreen: "fa",
    actions: ["open_fa", "dismiss"],
    dedupKey: `fa_open:${state.season}`,
  });
}

// Player wants out
export function makePlayerWantsOutEvent(player, state) {
  return makeEvent({
    type: "player_wants_out",
    category: "Morale",
    severity: "critical",
    title: `${player.name} wants out`,
    summary: `${player.name}'s morale has dropped to critical levels. They want to leave the team.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    actionRequired: true,
    relatedPlayerId: player.id,
    targetScreen: "dynamics",
    actions: ["talk_now", "open_player", "dismiss"],
    dedupKey: `wants_out:${player.id}:${state.season}`,
  });
}

// Player blocked move (unhappy)
export function makeBlockedMoveEvent(player, state) {
  return makeEvent({
    type: "blocked_move",
    category: "Morale",
    severity: "high",
    title: `${player.name} unhappy after blocked move`,
    summary: `${player.name} is unsettled after their transfer was blocked.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    relatedPlayerId: player.id,
    targetScreen: "dynamics",
    actions: ["talk_now", "open_player", "dismiss"],
    dedupKey: `blocked:${player.id}:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// Major bracket drawn
export function makeMajorDrawEvent(majorName, majorIdx, state) {
  return makeEvent({
    type: "major_draw",
    category: "Tournament",
    severity: "high",
    title: `${majorName} bracket drawn`,
    summary: `The ${majorName} bracket has been set. Check your draw and prepare for the event.`,
    season: state.season,
    phase: "major",
    targetScreen: "home",
    actions: ["view_bracket", "dismiss"],
    dedupKey: `major_draw:${state.season}:${majorIdx}`,
  });
}

// User qualifies for Champs
export function makeQualifyForChampsEvent(state) {
  return makeEvent({
    type: "qualify_champs",
    category: "Tournament",
    severity: "high",
    title: "Champs qualification clinched!",
    summary: "Your team has qualified for the CDL Championship. Prepare for the biggest event of the season.",
    season: state.season,
    phase: state.schedule?.phase ?? "preChamps",
    targetScreen: "standings",
    actions: ["view_standings", "dismiss"],
    dedupKey: `champs_qual:${state.season}`,
  });
}

// Major/Champs champion
export function makeTournamentChampionEvent(eventName, champion, isUser, state) {
  return makeEvent({
    type: "tournament_champion",
    category: "Tournament",
    severity: "high",
    title: isUser ? `You won ${eventName}!` : `${champion} win ${eventName}`,
    summary: isUser
      ? `Congratulations! Your team are the ${eventName} champions.`
      : `${champion} have been crowned ${eventName} champions.`,
    season: state.season,
    phase: "major",
    targetScreen: "home",
    actions: ["dismiss"],
    dedupKey: `champion:${state.season}:${eventName}`,
  });
}

// User eliminated from tournament
export function makeUserEliminatedEvent(eventName, state) {
  return makeEvent({
    type: "user_eliminated",
    category: "Tournament",
    severity: "medium",
    title: `Eliminated from ${eventName}`,
    summary: `Your team has been eliminated from ${eventName}.`,
    season: state.season,
    phase: "major",
    targetScreen: "home",
    actions: ["dismiss"],
    dedupKey: `eliminated:${state.season}:${eventName}`,
  });
}

// Award winner
export function makeAwardEvent(awardLabel, playerName, state) {
  return makeEvent({
    type: "award_winner",
    category: "Awards",
    severity: "medium",
    title: `${awardLabel}: ${playerName}`,
    summary: `${playerName} has won the ${awardLabel} award.`,
    season: state.season,
    phase: "offseason",
    actions: ["dismiss"],
    dedupKey: `award:${awardLabel}:${state.season}`,
  });
}

// User player wins award
export function makeUserAwardEvent(awardLabel, playerName, state) {
  return makeEvent({
    type: "user_award",
    category: "Awards",
    severity: "high",
    title: `Your player wins ${awardLabel}!`,
    summary: `${playerName} has been named ${awardLabel}. A proud moment for the franchise.`,
    season: state.season,
    phase: "offseason",
    actionRequired: false,
    actions: ["open_player", "dismiss"],
    dedupKey: `user_award:${awardLabel}:${state.season}`,
  });
}

// Stage sim complete summary
export function makeStageSimSummaryEvent(matchesPlayed, headlines, state) {
  const stageIdx = state.schedule?.stageIdx ?? 0;
  const stageName = state.schedule?.stages?.[stageIdx]?.name ?? `Stage ${stageIdx + 1}`;
  const headlineText = headlines.length > 0 ? ` ${headlines.length} headline${headlines.length !== 1 ? "s" : ""}.` : "";
  return makeEvent({
    type: "stage_summary",
    category: "Match Results",
    severity: "info",
    title: `${stageName} matchday complete`,
    summary: `${matchesPlayed} match${matchesPlayed !== 1 ? "es" : ""} played.${headlineText}`,
    season: state.season,
    stage: stageIdx,
    phase: "stage",
    targetScreen: "schedule",
    actions: ["view_schedule", "dismiss"],
    dedupKey: `stage_summary:${state.season}:${stageIdx}:${Date.now()}`,
  });
}

// Match result for user team
export function makeUserMatchResultEvent(won, opponent, score, state) {
  const stageIdx = state.schedule?.stageIdx ?? 0;
  return makeEvent({
    type: "user_match_result",
    category: "Match Results",
    severity: "info",
    title: won ? `Victory vs ${opponent}` : `Defeat to ${opponent}`,
    summary: `${score} — ${won ? "Well played." : "Regroup and prepare for the next match."}`,
    season: state.season,
    stage: stageIdx,
    phase: state.schedule?.phase ?? "stage",
    targetScreen: "log",
    actions: ["view_details", "dismiss"],
    dedupKey: `match:${state.season}:${stageIdx}:${opponent}:${Date.now()}`,
  });
}

// Offseason start
export function makeOffseasonStartEvent(season, state) {
  return makeEvent({
    type: "offseason_start",
    category: "Contracts",
    severity: "high",
    title: `Season ${season} complete — Offseason begins`,
    summary: "Review expiring contracts, sign free agents, and prepare for next season.",
    season,
    phase: "offseason",
    actionRequired: true,
    targetScreen: "home",
    actions: ["review_contracts", "dismiss"],
    dedupKey: `offseason:${season}`,
  });
}

// Standout performance
export function makeStandoutPerformanceEvent(playerName, kd, state) {
  return makeEvent({
    type: "standout_performance",
    category: "Awards",
    severity: "medium",
    title: `Standout: ${playerName} (${kd} K/D)`,
    summary: `${playerName} delivered an outstanding performance.`,
    season: state.season,
    phase: state.schedule?.phase ?? "stage",
    actions: ["dismiss"],
    dedupKey: `standout:${playerName}:${state.season}:${Date.now()}`,
  });
}

// Assistant GM recommendation
export function makeAssistantGmRecommendation(title, summary, targetScreen, state) {
  return makeEvent({
    type: "gm_recommendation",
    category: "Staff",
    severity: "low",
    title: `GM Recommends: ${title}`,
    summary: `Assistant GM: "${summary}"`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    targetScreen,
    actions: ["dismiss"],
    dedupKey: `gm_rec:${title}:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// Generic league news from feed conversion
export function makeLeagueNewsEvent(title, summary, season, phase) {
  return makeEvent({
    type: "league_news",
    category: "League News",
    severity: "info",
    title,
    summary,
    season,
    phase,
    actions: ["dismiss"],
  });
}

// ── Enhanced match summary ──────────────────────────────────────────────────
export function makeMatchSummaryEvent(matchResult, userTeamId, state) {
  const teamA = matchResult.teamA ?? matchResult.teamAId;
  const teamB = matchResult.teamB ?? matchResult.teamBId;
  const scoreA = matchResult.scoreA ?? matchResult.winsA ?? (matchResult.winnerId === teamA ? matchResult.scoreWinner : matchResult.scoreLoser);
  const scoreB = matchResult.scoreB ?? matchResult.winsB ?? (matchResult.winnerId === teamB ? matchResult.scoreWinner : matchResult.scoreLoser);
  const matchSeason = matchResult.season ?? state.season;
  if (!teamA || !teamB || scoreA == null || scoreB == null) return null;

  const isTeamA = teamA === userTeamId;
  const userScore = isTeamA ? scoreA : scoreB;
  const oppScore = isTeamA ? scoreB : scoreA;
  const oppId = isTeamA ? teamB : teamA;
  const won = userScore > oppScore;
  const diff = Math.abs(userScore - oppScore);
  const totalMaps = userScore + oppScore;
  const context = matchResult.stage || state.schedule?.majors?.[state.schedule?.majorIdx]?.name || `Stage ${(state.schedule?.stageIdx ?? 0) + 1}`;

  let titlePrefix;
  if (won) {
    if (userScore === 3 && oppScore === 0) titlePrefix = "Statement Win";
    else titlePrefix = diff === 1 && totalMaps >= 5 ? "Clutch Win" : "Match Report";
  } else {
    titlePrefix = diff === 1 && totalMaps >= 5 ? "Close Loss" : "Match Report";
  }

  const playerStats = matchResult.standouts?.length
    ? matchResult.standouts
    : Array.isArray(matchResult.playerStats)
      ? matchResult.playerStats
      : Object.values(matchResult.playerStats || {});
  const statWithIdentity = playerStats.map(ps => ({
    ...ps,
    playerId: ps.playerId ?? ps.id,
    name: ps.name ?? ps.playerName,
    kd: Number.isFinite(ps.kd) ? ps.kd : ((ps.deaths ?? 0) > 0 ? (ps.kills ?? 0) / ps.deaths : (ps.kills ?? 0)),
  }));
  const bestOverall = statWithIdentity.length
    ? statWithIdentity.reduce((a, b) => (Number(b.kd ?? 0) > Number(a.kd ?? 0) ? b : a), statWithIdentity[0])
    : (matchResult.standoutName ? { playerId: matchResult.standoutId, name: matchResult.standoutName, kd: matchResult.standoutKD } : null);
  const userPlayerIds = new Set((state.players || []).filter(p => p.teamId === userTeamId).map(p => p.id));
  const userStats = statWithIdentity.filter(ps => userPlayerIds.has(ps.playerId));
  const bestUser = userStats.length ? userStats.reduce((a, b) => (Number(b.kd ?? 0) > Number(a.kd ?? 0) ? b : a), userStats[0]) : null;
  const related = bestUser || bestOverall;
  const kdLine = related?.name ? ` Best ${bestUser ? "user" : "overall"} performer: ${related.name}${Number.isFinite(Number(related.kd)) ? ` (${Number(related.kd).toFixed(2)} K/D)` : ""}.` : "";

  const scoreline = `${userScore}-${oppScore}`;
  const verb = won ? "beat" : "fall to";
  const summary = `${context}: ${teamTag(userTeamId)} ${won ? "won" : "lost"} ${scoreline} against ${teamName(oppId)}.${kdLine}`;
  const maps = (matchResult.mapResults || matchResult.maps || []).map((m, i) => ({
    mapName: m.mapName ?? m.map ?? m.mode ?? `Map ${i + 1}`,
    scoreA: isTeamA ? (m.scoreA ?? m.teamAScore) : (m.scoreB ?? m.teamBScore),
    scoreB: isTeamA ? (m.scoreB ?? m.teamBScore) : (m.scoreA ?? m.teamAScore),
  }));
  const relatedMatchId = matchResult.id ?? matchResult.matchId ?? `${matchSeason}:${context}:${teamA}:${teamB}:${scoreA}:${scoreB}`;

  return makeEvent({
    type: "match_summary",
    category: "Match Results",
    severity: won ? "info" : "medium",
    title: `${titlePrefix}: ${teamTag(userTeamId)} ${verb} ${teamTag(oppId)} ${scoreline}`,
    summary,
    season: matchSeason,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    relatedMatchId,
    relatedTeamId: userTeamId,
    opponentTeamId: oppId,
    relatedPlayerId: related?.playerId ?? null,
    targetScreen: "matchLog",
    actions: related?.playerId ? ["open_match_log", "open_player", "view_schedule"] : ["open_match_log", "view_schedule"],
    dedupKey: `match_summary:${relatedMatchId}`,
    matchData: {
      won,
      context,
      teamATag: teamTag(userTeamId),
      teamBTag: teamTag(oppId),
      scoreA: userScore,
      scoreB: oppScore,
      maps,
      bestUser: bestUser ? { name: bestUser.name, kd: Number(bestUser.kd).toFixed(2) } : null,
      bestPerformer: bestOverall ? { name: bestOverall.name, kd: Number(bestOverall.kd).toFixed(2) } : null,
    },
  });
}

// ── Performance story ───────────────────────────────────────────────────────
export function makePerformanceStoryEvent(player, kd, context, state) {
  const kdStr = typeof kd === "number" ? kd.toFixed(2) : kd;
  const stageIdx = state.schedule?.stageIdx ?? 0;

  const titles = {
    standout:    `${player.name} dominates (${kdStr} K/D)`,
    poor:        `${player.name} struggles (${kdStr} K/D)`,
    leaderboard: `${player.name} enters K/D leaderboard`,
    mvp:         `${player.name} named MVP`,
    debut:       `${player.name} impresses on debut`,
  };
  const summaries = {
    standout:    `${player.name} delivered an outstanding performance with a ${kdStr} K/D.`,
    poor:        `${player.name} had a difficult series, posting a ${kdStr} K/D.`,
    leaderboard: `${player.name} is now among the top 5 in K/D this season (${kdStr}).`,
    mvp:         `${player.name} has been named Match MVP after a stellar performance.`,
    debut:       `${player.name} made an impressive debut with a ${kdStr} K/D.`,
  };

  const category = (context === "mvp" || context === "leaderboard") ? "Awards" : "Match Results";

  return makeEvent({
    type: "performance_story",
    category,
    severity: "medium",
    title: titles[context] || `${player.name}: ${kdStr} K/D`,
    summary: summaries[context] || `${player.name} posted a ${kdStr} K/D.`,
    season: state.season,
    stage: stageIdx,
    phase: state.schedule?.phase ?? "stage",
    relatedPlayerId: player.id ?? player.playerId ?? null,
    actions: ["open_player", "dismiss"],
    dedupKey: `perf_story:${player.name}:${context}:${state.season}:${stageIdx}`,
  });
}

// ── Promise kept ────────────────────────────────────────────────────────────
export function makePromiseKeptEvent(promise, player, state) {
  return makeEvent({
    type: "promise_kept",
    category: "Morale",
    severity: "info",
    title: `Promise to ${player.name} fulfilled`,
    summary: `You kept your promise of "${promise.label}". ${player.name} is grateful.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    relatedPlayerId: player.id,
    targetScreen: "dynamics",
    actions: ["open_player", "dismiss"],
    dedupKey: `promise_kept:${promise.id}:${state.season}`,
  });
}

// ── Squad morale warning ────────────────────────────────────────────────────
export function makeSquadMoraleWarningEvent(avgMorale, state) {
  const stageIdx = state.schedule?.stageIdx ?? 0;
  return makeEvent({
    type: "squad_morale_warning",
    category: "Morale",
    severity: "high",
    title: "Squad morale is low",
    summary: `Average squad morale has dropped to ${Math.round(avgMorale)}%. Consider addressing player concerns.`,
    season: state.season,
    stage: stageIdx,
    phase: state.schedule?.phase ?? "stage",
    actionRequired: avgMorale < 40,
    targetScreen: "dynamics",
    actions: ["go_dynamics", "dismiss"],
    dedupKey: `squad_morale:${state.season}:${stageIdx}`,
  });
}

// ── Roster incomplete ───────────────────────────────────────────────────────
export function makeRosterIncompleteEvent(state) {
  return makeEvent({
    type: "roster_incomplete",
    category: "Contracts",
    severity: "critical",
    actionRequired: true,
    title: "Roster incomplete",
    summary: "Your active roster does not have enough players. Sign or promote players before the next match.",
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    targetScreen: "home",
    actions: ["open_roster", "open_fa", "dismiss"],
    dedupKey: `roster_incomplete:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// ── Contract expiring warning ───────────────────────────────────────────────
export function makeContractExpiringEvent(player, state) {
  return makeEvent({
    type: "contract_expiring",
    category: "Contracts",
    severity: "medium",
    title: `${player.name}'s deal expires this offseason`,
    summary: `${player.name}'s contract is set to expire. Decide whether to extend or let them walk.`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    relatedPlayerId: player.id,
    targetScreen: "home",
    actions: ["review_contracts", "open_player", "dismiss"],
    dedupKey: `contract_expiring:${player.id}:${state.season}`,
  });
}

// ── Rival eliminated ────────────────────────────────────────────────────────
export function makeRivalEliminatedEvent(teamId, eventName, round, state) {
  return makeEvent({
    type: "rival_eliminated",
    category: "League News",
    severity: "info",
    title: `${teamTag(teamId)} eliminated from ${eventName}`,
    summary: `${teamName(teamId)} have been knocked out of ${eventName} in ${round}.`,
    season: state.season,
    phase: state.schedule?.phase ?? "stage",
    relatedTeamId: teamId,
    actions: ["dismiss"],
    dedupKey: `rival_elim:${teamId}:${eventName}:${state.season}`,
  });
}

// ── Challenger qualifies ────────────────────────────────────────────────────
export function makeChallengerQualifiesEvent(teamName_, state) {
  return makeEvent({
    type: "challenger_qualifies",
    category: "Tournament",
    severity: "info",
    title: `${teamName_} qualify through Challengers`,
    summary: `${teamName_} have earned their spot through the Challengers bracket.`,
    season: state.season,
    phase: state.schedule?.phase ?? "stage",
    actions: ["dismiss"],
    dedupKey: `ch_qualify:${teamName_}:${state.season}`,
  });
}

// ── Coach concern ───────────────────────────────────────────────────────────
export function makeCoachConcernEvent(concern, state) {
  return makeEvent({
    type: "coach_concern",
    category: "Staff",
    severity: "low",
    title: `Head Coach: ${concern}`,
    summary: `Your head coach has flagged a concern: "${concern}".`,
    season: state.season,
    stage: state.schedule?.stageIdx ?? 0,
    phase: state.schedule?.phase ?? "stage",
    targetScreen: "dynamics",
    actions: ["dismiss"],
    dedupKey: `coach:${concern}:${state.season}:${state.schedule?.stageIdx ?? 0}`,
  });
}

// ── Season start ────────────────────────────────────────────────────────────
export function makeSeasonStartEvent(season, state) {
  return makeEvent({
    type: "season_start",
    category: "League News",
    severity: "medium",
    title: `Season ${season} begins`,
    summary: `A new season is underway. Review your objectives, check the schedule, and prepare for the opening matches.`,
    season,
    phase: "stage",
    targetScreen: "home",
    actions: ["view_board", "view_schedule", "dismiss"],
    dedupKey: `season_start:${season}`,
  });
}

// ── Generate match inbox events (compare prev vs new state) ─────────────────
export function generateMatchInboxEvents(prevState, newState) {
  const prevLen = prevState?.schedule?.matchLog?.length ?? 0;
  const newLog = newState?.schedule?.matchLog ?? [];
  if (newLog.length <= prevLen) return [];

  const userTeamId = newState.userTeamId;
  const events = [];
  const dedupKeys = new Set();

  for (let i = prevLen; i < newLog.length; i++) {
    const entry = newLog[i];
    if (entry.played === false) continue;

    const entryTeamA = entry.teamA ?? entry.teamAId;
    const entryTeamB = entry.teamB ?? entry.teamBId;
    const isUserMatch = entryTeamA === userTeamId || entryTeamB === userTeamId;
    if (!isUserMatch) continue;

    // Match summary
    const summaryEvt = makeMatchSummaryEvent(entry, userTeamId, newState);
    if (summaryEvt && !dedupKeys.has(summaryEvt.dedupKey)) {
      dedupKeys.add(summaryEvt.dedupKey);
      events.push(summaryEvt);
    }

    // Performance stories from standouts
    if (entry.standouts?.length) {
      for (const s of entry.standouts) {
        if (s.kd >= 1.25) {
          const perfEvt = makePerformanceStoryEvent(
            { name: s.name, id: s.playerId ?? null },
            s.kd,
            "standout",
            newState,
          );
          if (!dedupKeys.has(perfEvt.dedupKey)) {
            dedupKeys.add(perfEvt.dedupKey);
            events.push(perfEvt);
          }
        }
        if (s.kd <= 0.80) {
          const perfEvt = makePerformanceStoryEvent(
            { name: s.name, id: s.playerId ?? null },
            s.kd,
            "poor",
            newState,
          );
          if (!dedupKeys.has(perfEvt.dedupKey)) {
            dedupKeys.add(perfEvt.dedupKey);
            events.push(perfEvt);
          }
        }
      }
    }
  }

  return events;
}
