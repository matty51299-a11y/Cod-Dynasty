// src/engine/seasonEngine.js
// Drives the CDL season structure:
//   Stage 1 → Major 1 → Stage 2 → Major 2 → Stage 3 → Major 3 →
//   Stage 4 → Major 4 → Pre-Champs Window → Champs → Offseason
//
// schedule.stageIdx  — index into stages[] (0–3), meaningful during phase "stage"
// schedule.majorIdx  — index into majors[] (0–4), meaningful during phase "major"
// schedule.standings      — cumulative season W/L/pts (never reset mid-season)
// schedule.stageStandings — per-stage W/L/pts; snapshot kept during active Major,
//                           reset when transitioning Major → next Stage
//
// Regular Majors (1–4) seeded by stageStandings.points
// Champs seeded by standings.points (cumulative season total)

import { simMatch } from "./matchSim.js";
import { CDL_TEAMS } from "../data/teams.js";
import omitBrooklynLogo from "../assets/logos/challengers/omit-brooklyn.png";
import omitNoirLogo from "../assets/logos/challengers/Omit_Noir_logo.png";
import projectNotoriousLogo from "../assets/logos/challengers/Project_Notorious_lightmode.png";
import deathByCabalLogo from "../assets/logos/challengers/DeathByCabal_logo.png";
import huntsmenLogo from "../assets/logos/challengers/Huntsmen.png";
import stallionsLogo from "../assets/logos/challengers/Stallionslogo.png";
import tellurideBushLogo from "../assets/logos/challengers/Telluride_Bush_Gaming_lightmode.png";
import fiveFearsLogo from "../assets/logos/challengers/FiveFears_logo.png";
import fazeFalconsLogo from "../assets/logos/challengers/FazeFalconslogo.png";
import forFunEsportsLogo from "../assets/logos/challengers/ForFunEsports.png";

const CHALLENGER_QUALIFIER_TEAMS = 4;
const CHALLENGER_REGIONS = {
  omit_brooklyn: "NA", omit_noir: "NA", project_notorious: "NA", project_7: "EU",
  death_by_cabal: "EU", huntsmen: "NA", stallions: "NA", telluride_bush: "NA",
  next_threat_black: "NA", stallions_x_bush: "NA", omnia_ggs: "EU", five_fears: "EU",
  faze_falcons: "MENA", for_fun_esports: "EU", high_treason: "NA", for_fun_black: "EU",
};
const CHALLENGER_TEAM_POOL = [
  { id: "omit_brooklyn", name: "Omit Brooklyn", tag: "OBK", color: "#c084fc", logo: omitBrooklynLogo },
  { id: "omit_noir", name: "Omit Noir", tag: "ONR", color: "#a78bfa", logo: omitNoirLogo },
  { id: "project_notorious", name: "Project Notorious", tag: "PNT", color: "#8b5cf6", logo: projectNotoriousLogo },
  { id: "project_7", name: "Project 7", tag: "P7", color: "#7c3aed" },
  { id: "death_by_cabal", name: "Death by Cabal", tag: "DBC", color: "#9333ea", logo: deathByCabalLogo },
  { id: "huntsmen", name: "Huntsmen", tag: "HNT", color: "#f43f5e", logo: huntsmenLogo },
  { id: "stallions", name: "Stallions", tag: "STL", color: "#fb7185", logo: stallionsLogo },
  { id: "telluride_bush", name: "Telluride Bush", tag: "TB", color: "#22c55e", logo: tellurideBushLogo },
  { id: "next_threat_black", name: "Next Threat Black", tag: "NTB", color: "#0ea5e9" },
  { id: "stallions_x_bush", name: "Stallions x Bush", tag: "SXB", color: "#14b8a6" },
  { id: "omnia_ggs", name: "Omnia GGs", tag: "OMG", color: "#06b6d4" },
  { id: "five_fears", name: "Five Fears", tag: "5FR", color: "#f59e0b", logo: fiveFearsLogo },
  { id: "faze_falcons", name: "Faze Falcons", tag: "FF", color: "#ef4444", logo: fazeFalconsLogo },
  { id: "for_fun_esports", name: "For Fun Esports", tag: "FFE", color: "#38bdf8", logo: forFunEsportsLogo },
  { id: "high_treason", name: "High Treason", tag: "HT", color: "#7f1d1d" },
  { id: "for_fun_black", name: "For Fun Black", tag: "FFB", color: "#334155" },
];
import { runProgression } from "./progression.js";
import { runAIMajorRosterWindow, runAIOffseasonRosterWindow, getResignDemand, ensureCdlRosterIntegrity } from "./rosterAI.js";
import { buildCdlRosterNameSet, isInactivePlayer, normalizePlayerName, shouldExcludeFromChallengers } from "../utils/playerIdentity.js";

// ── PRNG / helpers ────────────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRoundRobin(teamIds) {
  const pairs = [];
  for (let i = 0; i < teamIds.length; i++)
    for (let j = i + 1; j < teamIds.length; j++)
      pairs.push([teamIds[i], teamIds[j]]);
  return pairs;
}

function withCdlRosterIntegrity(gameState, windowType) {
  return ensureCdlRosterIntegrity(gameState, { windowType });
}

// Deterministic seed for a specific major match (no seed collisions)
function majorSeed(season, majorIdx, roundIdx, matchIdx) {
  return season * 1_000_000 + majorIdx * 100_000 + (roundIdx + 1) * 10_000 + (matchIdx + 1) * 100 + 7;
}

function challengerQualifierSeed(season, majorIdx, roundIdx, matchIdx, matchNumber = 0) {
  return season * 2_000_000 + (majorIdx + 1) * 200_000 + (roundIdx + 1) * 2_000 + (matchIdx + 1) * 37 + matchNumber * 17 + 97;
}

// ── Initial standings ─────────────────────────────────────────────────────────
export function initStandings(teamIds) {
  return Object.fromEntries(teamIds.map(id => [id, { wins: 0, losses: 0, points: 0 }]));
}

// ── Build season schedule ─────────────────────────────────────────────────────
export const MAJOR_PLACEMENT_POINTS = {
  1: 100,
  2: 75,
  3: 60,
  4: 45,
  5: 30,
  6: 30,
  7: 15,
  8: 15,
  9: 0,
  10: 0,
  11: 0,
  12: 0,
};

function computeDE16Placements(bracket) {
  if (!bracket?.rounds?.length) return {};
  const placements = {};
  const claimed = new Set();
  const place = (teamId, p) => {
    if (!teamId || claimed.has(teamId)) return;
    placements[teamId] = p;
    claimed.add(teamId);
  };

  // Anchor top 4 explicitly from bracket structure. The bug we're fixing:
  // when the LB Final winner wins the Grand Final, the WB Champion only ever
  // accrues a single loss, so they never entered the generic "2-losses-elim"
  // list and 2nd place was being skipped.
  const gfRound = bracket.rounds.find(r => r.type === "GF") ?? bracket.rounds[bracket.rounds.length - 1];
  const gfMatch = gfRound?.matches?.[0];
  if (gfMatch?.played && gfMatch.result) {
    place(gfMatch.result.winnerId, 1);
    place(gfMatch.result.loserId, 2);
  } else if (bracket.champion) {
    place(bracket.champion, 1);
  }

  const lbFinalRound = bracket.rounds.find(r => r.name === "LB Final");
  const lbFinalMatch = lbFinalRound?.matches?.[0];
  if (lbFinalMatch?.played && lbFinalMatch.result) place(lbFinalMatch.result.loserId, 3);

  const lbR5Round = bracket.rounds.find(r => r.name === "LB Round 5");
  const lbR5Match = lbR5Round?.matches?.[0];
  if (lbR5Match?.played && lbR5Match.result) place(lbR5Match.result.loserId, 4);

  // 5–6: LB Round 4 losers; 7–8: LB Round 3 losers; 9–12: LB Round 2 losers; 13–16: LB Round 1 losers
  const bucketize = (roundName, places) => {
    const round = bracket.rounds.find(r => r.name === roundName);
    const losers = (round?.matches ?? [])
      .filter(m => m.played && m.result?.loserId)
      .map(m => m.result.loserId);
    losers.forEach((id, i) => place(id, places[Math.min(i, places.length - 1)]));
  };
  bucketize("LB Round 4", [5, 6]);
  bucketize("LB Round 3", [7, 8]);
  bucketize("LB Round 2", [9, 10, 11, 12]);
  bucketize("LB Round 1", [13, 14, 15, 16]);

  return placements;
}

function awardMajorPlacementPoints(schedule, majorIdx) {
  if (majorIdx < 0 || majorIdx > 3) return;
  const major = schedule.majors?.[majorIdx];
  const bracket = major?.bracket;
  if (!major?.completed || bracket?.type !== "DE16" || major.pointsAwarded) return;

  const placements = computeDE16Placements(bracket);
  const cdlIds = new Set(CDL_TEAMS.map(t => t.id));
  const awards = [];

  for (const [teamId, place] of Object.entries(placements)) {
    if (!cdlIds.has(teamId)) continue;
    const pts = MAJOR_PLACEMENT_POINTS[place] ?? 0;
    if (!schedule.standings?.[teamId]) continue;
    schedule.standings[teamId].points += pts;
    awards.push({ teamId, place, points: pts });
  }

  major.pointsAwards = awards.sort((a, b) => a.place - b.place);
  major.pointsAwarded = true;
}

export function buildSeason(season) {
  const teamIds = CDL_TEAMS.map(t => t.id);
  const rng = seededRng(season * 9999 + 1);
  const mkStage = name => ({
    name,
    matches: shuffle(buildRoundRobin(teamIds), rng)
      .map(([a, b]) => ({ a, b, played: false, result: null })),
  });

  return {
    season,
    stages: [
      mkStage("Stage 1"),
      mkStage("Stage 2"),
      mkStage("Stage 3"),
      mkStage("Stage 4"),
    ],
    majors: [
      { name: "Major 1", bracket: null, completed: false },
      { name: "Major 2", bracket: null, completed: false },
      { name: "Major 3", bracket: null, completed: false },
      { name: "Major 4", bracket: null, completed: false },
      { name: "Champs",  bracket: null, completed: false },
    ],
    standings:      initStandings(teamIds),  // cumulative season W/L/pts
    stageStandings: initStandings(teamIds),  // per-stage; kept as bracket snapshot, reset on Major→Stage
    stageIdx:        0,     // current stage index (0–3)
    majorIdx:        null,  // current major index (0–4); null when not in major phase
    phase:           "stage",  // "stage" | "major" | "preChamps" | "offseason"
    currentMatchday: 0,
    matchLog:        [],
    challengerQualifierResults: [],
    currentChallengerQualifier: null,
    currentMajorEventTeams: null,
  };
}

// ── Build major bracket ───────────────────────────────────────────────────────
// Accepts any standings object with { [teamId]: { points, ... } }.
// Regular Majors pass stageStandings; Champs passes cumulative standings.
// userTeamId: if provided, user's QF match is moved to first so "Play Match" always triggers.
function buildMajorBracket(standings, userTeamId) {
  const sorted = Object.entries(standings)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 8)
    .map(([id]) => id);

  const matches = [
    { a: sorted[0], b: sorted[7], seedA: 1, seedB: 8, played: false, result: null },
    { a: sorted[1], b: sorted[6], seedA: 2, seedB: 7, played: false, result: null },
    { a: sorted[2], b: sorted[5], seedA: 3, seedB: 6, played: false, result: null },
    { a: sorted[3], b: sorted[4], seedA: 4, seedB: 5, played: false, result: null },
  ];

  // Move user's match to the front so their "Play Match" is always the next to sim
  if (userTeamId) {
    const userIdx = matches.findIndex(m => m.a === userTeamId || m.b === userTeamId);
    if (userIdx > 0) {
      const [userMatch] = matches.splice(userIdx, 1);
      matches.unshift(userMatch);
    }
  }

  return {
    seeds: sorted,
    rounds: [
      { name: "Quarterfinals", matches },
      { name: "Semifinals",    matches: [] },
      { name: "Grand Final",   matches: [] },
    ],
    completed: false,
    champion:  null,
  };
}


function buildMajorBracketDE16(majorSeeds) {
  const s = majorSeeds;
  const wbR1Matches = [
    { a: s[0], b: s[15], seedA: 1, seedB: 16, played: false, result: null },
    { a: s[7], b: s[8],  seedA: 8, seedB: 9,  played: false, result: null },
    { a: s[3], b: s[12], seedA: 4, seedB: 13, played: false, result: null },
    { a: s[4], b: s[11], seedA: 5, seedB: 12, played: false, result: null },
    { a: s[1], b: s[14], seedA: 2, seedB: 15, played: false, result: null },
    { a: s[6], b: s[9],  seedA: 7, seedB: 10, played: false, result: null },
    { a: s[2], b: s[13], seedA: 3, seedB: 14, played: false, result: null },
    { a: s[5], b: s[10], seedA: 6, seedB: 11, played: false, result: null },
  ];
  return {
    seeds: majorSeeds,
    type: "DE16",
    rounds: [
      { name: "WB Round 1", type: "WB", matches: wbR1Matches },
      { name: "LB Round 1", type: "LB", matches: [] },
      { name: "WB Round 2", type: "WB", matches: [] },
      { name: "LB Round 2", type: "LB", matches: [] },
      { name: "LB Round 3", type: "LB", matches: [] },
      { name: "WB Semifinals", type: "WB", matches: [] },
      { name: "LB Round 4", type: "LB", matches: [] },
      { name: "WB Final", type: "WB", matches: [] },
      { name: "LB Round 5", type: "LB", matches: [] },
      { name: "LB Final", type: "LB", matches: [] },
      { name: "Grand Final", type: "GF", matches: [] },
    ],
    completed: false,
    champion: null,
    _wbChampion: null,
    _wbFLoser: null,
    _lbr3Winners: null,
  };
}

const CHALLENGER_QUALIFIER_POINTS = {
  1: 25,
  2: 20,
  3: 15,
  4: 10,
  5: 5,
  6: 5,
  7: 5,
  8: 5,
};

function challengerPointsForPlacement(placement) {
  return CHALLENGER_QUALIFIER_POINTS[placement] ?? 0;
}

function getChallengerRoster(team, gameState, cdlNames = buildCdlRosterNameSet(gameState.players || [])) {
  return (team?.playerIds || [])
    .map(pid => gameState.prospects.find(p => p.id === pid) || gameState.players.find(p => p.id === pid))
    .filter(p => p && !isInactivePlayer(p) && !cdlNames.has(normalizePlayerName(p.name)));
}

function calcChallengerTeamOvr(team, gameState, cdlNames) {
  const roster = getChallengerRoster(team, gameState, cdlNames);
  const ovr = Math.round(roster.reduce((s, p) => s + (p.overall ?? 65), 0) / Math.max(1, roster.length));
  return { roster, ovr };
}

function placementLabel(placement) {
  return placement === 1 ? "Qualifier Winner"
    : placement === 2 ? "Qualifier Runner-up"
    : placement === 3 ? "Qualifier 3rd"
    : placement === 4 ? "Qualifier 4th"
    : `Qualifier ${placement}th`;
}

function buildChallengerQualifierField(gameState, schedule) {
  ensureChallengerTeams(gameState);
  const rng = seededRng(schedule.season * 8191 + ((schedule.majorIdx ?? schedule.stageIdx ?? 0) + 1) * 131 + 23);
  const cdlNames = buildCdlRosterNameSet(gameState.players || []);
  const rows = (gameState.challengerTeams || []).map((team) => {
    const { roster, ovr } = calcChallengerTeamOvr(team, gameState, cdlNames);
    const prevPlacement = team.lastQualifierPlacement ?? 9;
    const prevBonus = Math.max(0, 9 - prevPlacement) * 1.25;
    const seedScore = (team.circuitPoints ?? 0)
      + (ovr - 65) * 1.35
      + (team.form ?? 0) * 2.2
      + prevBonus
      + (rng() * 4 - 2);
    return {
      seed: 0,
      teamId: team.id,
      teamName: team.name,
      tag: team.tag,
      color: team.color,
      logo: team.logo,
      region: team.region ?? CHALLENGER_REGIONS[team.id] ?? "NA",
      teamOvr: ovr,
      rosterIds: roster.map(p => p.id),
      circuitPointsBefore: team.circuitPoints ?? 0,
      formBefore: team.form ?? 0,
      previousQualifierPlacement: team.lastQualifierPlacement ?? null,
      seedScore: Number(seedScore.toFixed(2)),
    };
  }).sort((a, b) => b.seedScore - a.seedScore);

  return rows.map((row, idx) => ({ ...row, seed: idx + 1 }));
}

function getExistingQualifierForMajor(schedule, majorIdx = schedule?.majorIdx) {
  return (schedule?.challengerQualifierResults || []).find(r =>
    r?.season === schedule?.season &&
    r?.majorIdx === majorIdx &&
    r?.source === "visibleQualifier"
  );
}

function buildChallengerQualifierBracket(field) {
  return buildMajorBracketDE16((field || []).slice().sort((a, b) => a.seed - b.seed).map(row => row.teamId));
}

function createChallengerQualifierEvent(gameState, schedule) {
  const majorIdx = schedule.stageIdx ?? schedule.majorIdx ?? 0;
  const existing = schedule.currentChallengerQualifier;
  if (existing?.season === schedule.season && existing?.majorIdx === majorIdx) {
    if (!existing.bracket && !existing.completed) {
      const field = existing.field?.length ? existing.field : buildChallengerQualifierField(gameState, { ...schedule, majorIdx });
      return { ...existing, field, bracket: buildChallengerQualifierBracket(field), matchLog: existing.matchLog || [] };
    }
    return existing;
  }
  const field = buildChallengerQualifierField(gameState, { ...schedule, majorIdx });
  return {
    season: schedule.season,
    majorIdx,
    name: `Major ${majorIdx + 1} Qualifier`,
    completed: false,
    field,
    bracket: buildChallengerQualifierBracket(field),
    matchLog: [],
    results: [],
  };
}

function enterChallengerQualifierPhase(gameState, schedule) {
  const majorIdx = schedule.stageIdx ?? 0;
  schedule.phase = "challengerQualifier";
  schedule.majorIdx = majorIdx;
  schedule.currentChallengerQualifier = createChallengerQualifierEvent(gameState, schedule);
  return { ...gameState, schedule: { ...schedule } };
}

function challengerTeamObj(teamId, gameState, field = []) {
  const row = field.find(r => r.teamId === teamId);
  const base = (gameState.challengerTeams || []).find(t => t.id === teamId) || row || { id: teamId, name: teamId };
  const cdlNames = buildCdlRosterNameSet(gameState.players || []);
  const roster = getChallengerRoster({ ...base, playerIds: row?.rosterIds || base.playerIds || [] }, gameState, cdlNames);
  return { id: teamId, name: row?.teamName || base.name || teamId, players: roster };
}

function findNextBracketMatch(bracket) {
  for (let r = 0; r < (bracket?.rounds || []).length; r++) {
    const round = bracket.rounds[r];
    const idx = (round.matches || []).findIndex(m => !m.played && m.a && m.b);
    if (idx !== -1) return { roundIdx: r, round, matchIdx: idx, match: round.matches[idx] };
  }
  return null;
}

function _advanceQualifierBracket(bracket, roundIdx) {
  const round = bracket.rounds[roundIdx];
  if (!round.matches.every(m => m.played)) return false;
  const winners = round.matches.map(m => m.result.winnerId);
  const losers = round.matches.map(m => m.result.loserId);
  switch (roundIdx) {
    case 0:
      bracket.rounds[1].matches = [{ a: losers[0], b: losers[1], played:false,result:null},{ a: losers[2], b: losers[3], played:false,result:null},{ a: losers[4], b: losers[5], played:false,result:null},{ a: losers[6], b: losers[7], played:false,result:null}];
      bracket.rounds[2].matches = [{ a:winners[0], b:winners[1], played:false,result:null},{ a:winners[2], b:winners[3], played:false,result:null},{ a:winners[4], b:winners[5], played:false,result:null},{ a:winners[6], b:winners[7], played:false,result:null}];
      break;
    case 1: break;
    case 2: {
      bracket.rounds[5].matches = [{ a:winners[0], b:winners[1], played:false,result:null},{ a:winners[2], b:winners[3], played:false,result:null}];
      const lb1w = bracket.rounds[1].matches.map(m=>m.result.winnerId);
      bracket.rounds[3].matches = [{a:lb1w[0], b:losers[0], played:false,result:null},{a:lb1w[1], b:losers[1], played:false,result:null},{a:lb1w[2], b:losers[2], played:false,result:null},{a:lb1w[3], b:losers[3], played:false,result:null}];
      break;
    }
    case 3: bracket.rounds[4].matches = [{a:winners[0],b:winners[1],played:false,result:null},{a:winners[2],b:winners[3],played:false,result:null}]; break;
    case 4: bracket._lbr3Winners = winners; break;
    case 5:
      bracket.rounds[7].matches = [{ a:winners[0], b:winners[1], played:false,result:null }];
      bracket.rounds[6].matches = [{ a: bracket._lbr3Winners[0], b: losers[0], played:false,result:null},{ a: bracket._lbr3Winners[1], b: losers[1], played:false,result:null}];
      break;
    case 6: bracket.rounds[8].matches = [{ a:winners[0], b:winners[1], played:false,result:null }]; break;
    case 7: bracket._wbChampion=winners[0]; bracket._wbFLoser=losers[0]; _tryPopulateLBFinal(bracket); break;
    case 8: _tryPopulateLBFinal(bracket); break;
    case 9: bracket.rounds[10].matches = [{ a:bracket._wbChampion, b:winners[0], played:false,result:null }]; break;
    case 10: bracket.champion=winners[0]; return true;
  }
  return false;
}

function _simOneChallengerQualifierMatch(current, gameState, schedule) {
  const bracket = current.bracket ?? buildChallengerQualifierBracket(current.field || []);
  current.bracket = bracket;
  const next = findNextBracketMatch(bracket);
  if (!next) return { allComplete: !!bracket.champion, roundIdx: -1 };
  const { roundIdx, round, matchIdx, match } = next;
  const result = simMatch(
    challengerTeamObj(match.a, gameState, current.field || []),
    challengerTeamObj(match.b, gameState, current.field || []),
    challengerQualifierSeed(schedule.season, current.majorIdx ?? schedule.majorIdx ?? 0, roundIdx, matchIdx, (current.matchLog || []).length)
  );
  match.played = true;
  match.result = result;
  // Store the full result (mapResults + playerStats) so the qualifier overlay
  // can render the same per-map / per-player breakdown as Match Center / MajorBracket.
  current.matchLog = [...(current.matchLog || []), {
    roundIdx,
    roundName: round.name,
    matchIdx,
    teamAId: result.teamAId,
    teamAName: result.teamAName,
    teamBId: result.teamBId,
    teamBName: result.teamBName,
    winnerId: result.winnerId,
    winnerName: result.winnerName,
    loserId: result.loserId,
    loserName: result.loserName,
    score: result.score,
    result,
  }];
  const complete = _advanceQualifierBracket(bracket, roundIdx);
  return { allComplete: complete, roundIdx };
}

function finalizeChallengerQualifier(gameState, schedule, current) {
  if (current.completed && current.results?.length) return current;
  const majorIdx = current.majorIdx ?? schedule.majorIdx ?? schedule.stageIdx ?? 0;
  const placements = computeDE16Placements(current.bracket);
  const records = {};
  for (const match of current.matchLog || []) {
    records[match.winnerId] = records[match.winnerId] || { wins: 0, losses: 0 };
    records[match.loserId] = records[match.loserId] || { wins: 0, losses: 0 };
    records[match.winnerId].wins += 1;
    records[match.loserId].losses += 1;
  }
  const results = (current.field || []).map(row => {
    const placement = placements[row.teamId] ?? 16;
    const circuitPointsAwarded = challengerPointsForPlacement(placement);
    const qualified = placement <= CHALLENGER_QUALIFIER_TEAMS;
    const rec = records[row.teamId] || { wins: 0, losses: 0 };
    const formAfter = Math.max(-10, Math.min(10, (row.formBefore ?? 0) + (qualified ? 2 : placement <= 8 ? 0 : -1)));
    return {
      ...row,
      placement,
      qualified,
      placementLabel: placementLabel(placement),
      circuitPointsAwarded,
      circuitPointsAfter: (row.circuitPointsBefore ?? 0) + circuitPointsAwarded,
      formAfter,
      matchRecord: rec,
      bracketResult: `${rec.wins}-${rec.losses}`,
      performanceScore: `${rec.wins}-${rec.losses}`,
    };
  }).sort((a, b) => a.placement - b.placement || a.seed - b.seed);

  const completed = { ...current, results, completed: true };
  const historyEntry = {
    season: schedule.season,
    majorIdx,
    source: "visibleQualifier",
    completed: true,
    bracketType: "DE16",
    matchLog: completed.matchLog || [],
    teams: results.map(r => ({
      season: schedule.season,
      majorIdx,
      seed: r.seed,
      placement: r.placement,
      teamId: r.teamId,
      teamName: r.teamName,
      teamOvr: r.teamOvr,
      region: r.region,
      circuitPointsBefore: r.circuitPointsBefore,
      circuitPointsAwarded: r.circuitPointsAwarded,
      circuitPointsAfter: r.circuitPointsAfter,
      formBefore: r.formBefore,
      formAfter: r.formAfter,
      qualified: r.qualified,
      matchRecord: r.matchRecord,
      bracketResult: r.bracketResult,
      score: r.performanceScore,
    })),
  };
  const alreadyStored = getExistingQualifierForMajor(schedule, majorIdx);
  schedule.challengerQualifierResults = alreadyStored
    ? (schedule.challengerQualifierResults || []).map(r => (r === alreadyStored ? historyEntry : r))
    : [...(schedule.challengerQualifierResults || []), historyEntry];
  gameState.challengerTeams = (gameState.challengerTeams || []).map(t => {
    const row = results.find(x => x.teamId === t.id);
    return row ? {
      ...t,
      circuitPoints: row.circuitPointsAfter,
      form: row.formAfter,
      lastQualifierPlacement: row.placement,
      qualifiedMajorIdxs: row.qualified ? [...new Set([...(t.qualifiedMajorIdxs || []), majorIdx])] : (t.qualifiedMajorIdxs || []),
    } : t;
  });
  return completed;
}

export function simNextChallengerQualifierMatch(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "challengerQualifier") return gameState;
  const current = schedule.currentChallengerQualifier ?? createChallengerQualifierEvent(gameState, schedule);
  if (current.completed) return { ...gameState, schedule: { ...schedule, currentChallengerQualifier: current } };
  const working = { ...current, bracket: current.bracket ?? buildChallengerQualifierBracket(current.field || []), matchLog: [...(current.matchLog || [])] };
  const { allComplete } = _simOneChallengerQualifierMatch(working, gameState, schedule);
  schedule.currentChallengerQualifier = allComplete ? finalizeChallengerQualifier(gameState, schedule, working) : working;
  return { ...gameState, schedule: { ...schedule } };
}

export function simChallengerQualifierRound(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "challengerQualifier") return gameState;
  let current = schedule.currentChallengerQualifier ?? createChallengerQualifierEvent(gameState, schedule);
  if (current.completed) return { ...gameState, schedule: { ...schedule, currentChallengerQualifier: current } };
  current = { ...current, bracket: current.bracket ?? buildChallengerQualifierBracket(current.field || []), matchLog: [...(current.matchLog || [])] };
  const next = findNextBracketMatch(current.bracket);
  if (!next) return { ...gameState, schedule: { ...schedule, currentChallengerQualifier: finalizeChallengerQualifier(gameState, schedule, current) } };
  const startRound = next.roundIdx;
  let safety = 0;
  while (safety++ < 20) {
    const still = findNextBracketMatch(current.bracket);
    if (!still || still.roundIdx !== startRound) break;
    const { allComplete } = _simOneChallengerQualifierMatch(current, gameState, schedule);
    if (allComplete) break;
  }
  schedule.currentChallengerQualifier = current.bracket?.champion ? finalizeChallengerQualifier(gameState, schedule, current) : current;
  return { ...gameState, schedule: { ...schedule } };
}

export function simChallengerQualifier(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "challengerQualifier") return gameState;
  let current = schedule.currentChallengerQualifier ?? createChallengerQualifierEvent(gameState, schedule);
  if (current.completed) return { ...gameState, schedule: { ...schedule, currentChallengerQualifier: current } };
  current = { ...current, bracket: current.bracket ?? buildChallengerQualifierBracket(current.field || []), matchLog: [...(current.matchLog || [])] };
  let safety = 0;
  while (!current.bracket?.champion && safety++ < 80) _simOneChallengerQualifierMatch(current, gameState, schedule);
  schedule.currentChallengerQualifier = finalizeChallengerQualifier(gameState, schedule, current);
  return { ...gameState, schedule: { ...schedule } };
}

function qualifierRowsToEventTeams(rows, gameState, schedule, eventKey = "major") {
  const cdlNames = buildCdlRosterNameSet(gameState.players || []);
  return rows.slice(0, CHALLENGER_QUALIFIER_TEAMS).map((row, i) => {
    const base = (gameState.challengerTeams || []).find(t => t.id === row.teamId) || row;
    const roster = getChallengerRoster({ ...base, playerIds: row.rosterIds || base.playerIds || [] }, gameState, cdlNames);
    return {
      id: `${eventKey}_qual_${schedule.season}_${(schedule.majorIdx ?? 0) + 1}_${i + 1}`,
      ...base,
      name: row.teamName ?? base.name,
      region: row.region ?? base.region,
      ovr: row.teamOvr,
      qualifierPlacement: row.placement,
      qualifierSeed: row.seed,
      qualifierLabel: row.placementLabel ?? placementLabel(row.placement),
      players: roster,
      playerIds: roster.map(p => p.id),
    };
  });
}

export function continueFromChallengerQualifier(gameState) {
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "challengerQualifier") return gameState;
  const majorIdx = schedule.majorIdx ?? schedule.stageIdx ?? 0;
  const qualifier = schedule.currentChallengerQualifier;
  if (!qualifier?.completed || !qualifier?.results?.length) return gameState;

  const cdlSeeds = Object.entries(schedule.stageStandings)
    .sort((a,b)=>b[1].points-a[1].points)
    .map(([id])=>id);
  const qualifiedRows = qualifier.results.filter(r => r.qualified).sort((a, b) => a.placement - b.placement);
  const eventTeams = qualifierRowsToEventTeams(qualifiedRows, gameState, { ...schedule, majorIdx });
  const majorSeeds = [...cdlSeeds, ...eventTeams.map(t=>t.id)];
  schedule.currentMajorEventTeams = Object.fromEntries(eventTeams.map(t => [t.id, t]));
  schedule.majors[majorIdx].bracket = schedule.majors[majorIdx].bracket ?? buildMajorBracketDE16(majorSeeds);
  schedule.phase = "major";
  schedule.majorIdx = majorIdx;
  return { ...gameState, schedule: { ...schedule } };
}

function simulateChallengerQualifier(gameState, schedule, eventKey = "major") {
  // Legacy/Champs-only hidden qualifier path. Regular Majors now use the visible
  // challengerQualifier phase and continueFromChallengerQualifier() so seeds 13–16
  // come from the player's completed event.
  ensureChallengerTeams(gameState);
  const rng = seededRng(schedule.season * 9991 + ((schedule.majorIdx ?? 0) + 1) * 71 + (eventKey === "champs" ? 17 : 0));
  const field = buildChallengerQualifierField(gameState, schedule);
  const results = field.map((row) => ({
    ...row,
    performanceScore: Number(((row.teamOvr ?? 65) + (row.formBefore ?? 0) * 0.9 + (17 - row.seed) * 0.25 + (rng() * 10 - 5)).toFixed(2)),
  })).sort((a, b) => b.performanceScore - a.performanceScore || a.seed - b.seed)
    .map((r, i) => ({ ...r, placement: i + 1, qualified: i < CHALLENGER_QUALIFIER_TEAMS, circuitPointsAwarded: challengerPointsForPlacement(i + 1), formAfter: Math.max(-10, Math.min(10, (r.formBefore ?? 0) + (i < 4 ? 2 : i < 8 ? 0 : -1))) }));

  const resObj = { season: schedule.season, majorIdx: schedule.majorIdx, source: eventKey === "champs" ? "hiddenChampsQualifier" : "legacyHiddenQualifier", teams: results.map(r => ({ teamId: r.teamId, teamName: r.teamName, seed: r.seed, placement: r.placement, teamOvr: r.teamOvr, region: r.region, score: r.performanceScore, qualified: r.qualified, circuitPointsBefore: r.circuitPointsBefore, circuitPointsAwarded: r.circuitPointsAwarded, circuitPointsAfter: r.circuitPointsBefore + r.circuitPointsAwarded, formBefore: r.formBefore, formAfter: r.formAfter })) };
  schedule.challengerQualifierResults = [...(schedule.challengerQualifierResults || []), resObj];
  gameState.challengerTeams = (gameState.challengerTeams || []).map(t => {
    const row = resObj.teams.find(x => x.teamId === t.id);
    return row ? { ...t, circuitPoints: row.circuitPointsAfter, form: row.formAfter, lastQualifierPlacement: row.placement, qualifiedMajorIdxs: row.qualified ? [...(t.qualifiedMajorIdxs || []), schedule.majorIdx] : (t.qualifiedMajorIdxs || []) } : t;
  });
  return qualifierRowsToEventTeams(results.filter(r => r.qualified), gameState, schedule, eventKey);
}

export function ensureChallengerTeams(gameState) {
  const existing = gameState.challengerTeams || [];
  const byId = new Map(existing.map(t => [t.id, t]));
  const mkTeam = (base) => ({
    ...base,
    region: CHALLENGER_REGIONS[base.id] ?? "NA",
    playerIds: [],
    circuitPoints: 0,
    form: 0,
    lastQualifierPlacement: null,
    qualifiedMajorIdxs: [],
  });
  const merged = CHALLENGER_TEAM_POOL.map(base => {
    const cur = byId.get(base.id);
    return cur ? { ...mkTeam(base), ...cur, ...base, region: cur.region ?? CHALLENGER_REGIONS[base.id] ?? "NA" } : mkTeam(base);
  });

  const cdlNames = buildCdlRosterNameSet(gameState.players || []);
  const byPlayerId = new Map([...(gameState.players || []), ...(gameState.prospects || [])].map(p => [p.id, p]));
  const used = new Set();
  const usedNames = new Set();
  for (const team of merged) {
    const current = [];
    for (const pid of team.playerIds || []) {
      const player = byPlayerId.get(pid);
      const key = normalizePlayerName(player?.name);
      if (!player || shouldExcludeFromChallengers(player, cdlNames, used, usedNames)) continue;
      current.push(pid);
      used.add(pid);
      usedNames.add(key);
      if (player.challengerTeamId == null) player.challengerTeamId = team.id;
    }
    team.playerIds = current.slice(0, 4);
  }

  const free = (gameState.prospects || [])
    .filter(p => !p.teamId && !isInactivePlayer(p))
    .sort((a,b)=>(b.overall??0)-(a.overall??0));
  for (const team of merged) {
    if (team.playerIds.length >= 4) continue;
    const need = 4 - team.playerIds.length;
    const same = free.filter(p => !shouldExcludeFromChallengers(p, cdlNames, used, usedNames) && ((p.region || team.region) === team.region)).slice(0, need);
    let picks = same;
    if (picks.length < need) picks = [...picks, ...free.filter(p => !shouldExcludeFromChallengers(p, cdlNames, used, usedNames) && !picks.find(x => x.id === p.id)).slice(0, need - picks.length)];
    team.playerIds = [...team.playerIds, ...picks.map(p => p.id)];
    for (const p of picks) {
      used.add(p.id);
      usedNames.add(normalizePlayerName(p.name));
      p.challengerTeamId = team.id;
      if (!p.region) p.region = team.region;
    }
  }
  gameState.challengerTeams = merged;
}

// ── Build 12-team Double-Elimination bracket (Majors 1–4) ────────────────────
// Seeds 1–4 get a WB Round 1 bye; seeds 5–12 play WB Round 1.
// rounds[] order defines simulation order (each round's inputs are always ready).
function buildMajorBracketDE(standings) {
  const sorted = Object.entries(standings)
    .sort((a, b) => b[1].points - a[1].points)
    .map(([id]) => id); // all 12 teams, seed 1 = index 0

  const s = sorted;
  // WB Round 1: 5v12, 6v11, 7v10, 8v9
  const wbR1Matches = [
    { a: s[4], b: s[11], seedA: 5, seedB: 12, played: false, result: null },
    { a: s[5], b: s[10], seedA: 6, seedB: 11, played: false, result: null },
    { a: s[6], b: s[9],  seedA: 7, seedB: 10, played: false, result: null },
    { a: s[7], b: s[8],  seedA: 8, seedB:  9, played: false, result: null },
  ];

  return {
    seeds: sorted,
    type: "DE",
    rounds: [
      { name: "WB Round 1",    type: "WB", matches: wbR1Matches },
      { name: "LB Round 1",    type: "LB", matches: [] },
      { name: "WB Round 2",    type: "WB", matches: [] },
      { name: "LB Round 2",    type: "LB", matches: [] },
      { name: "LB Round 3",    type: "LB", matches: [] },
      { name: "WB Semifinals", type: "WB", matches: [] },
      { name: "LB Round 4",    type: "LB", matches: [] },
      { name: "WB Final",      type: "WB", matches: [] },
      { name: "LB Round 5",    type: "LB", matches: [] },
      { name: "LB Final",      type: "LB", matches: [] },
      { name: "Grand Final",   type: "GF", matches: [] },
    ],
    completed: false,
    champion: null,
    _wbr2LosersHigh: null,
    _lbr3Winners: null,
    _wbFLoser: null,
    _wbChampion: null,
  };
}

// ── Build 8-team Double-Elimination bracket (Champs) ─────────────────────────
// All 8 teams enter WB Round 1 — no byes. Seeded 1–8 from cumulative standings.
// Round order:  0=WBR1  1=LBR1  2=WBSemis  3=LBR2  4=WBFinal  5=LBSemis  6=LBFinal  7=GF
function buildChampsDE(standings, userTeamId) {
  const sorted = Object.entries(standings)
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 8)
    .map(([id]) => id);

  const s = sorted;
  const wbR1 = [
    { a: s[0], b: s[7], seedA: 1, seedB: 8, played: false, result: null },
    { a: s[1], b: s[6], seedA: 2, seedB: 7, played: false, result: null },
    { a: s[2], b: s[5], seedA: 3, seedB: 6, played: false, result: null },
    { a: s[3], b: s[4], seedA: 4, seedB: 5, played: false, result: null },
  ];

  if (userTeamId) {
    const ui = wbR1.findIndex(m => m.a === userTeamId || m.b === userTeamId);
    if (ui > 0) { const [um] = wbR1.splice(ui, 1); wbR1.unshift(um); }
  }

  return {
    seeds: sorted,
    type: "DE",
    rounds: [
      { name: "WB Round 1",    type: "WB", _tbd: 4, matches: wbR1 },
      { name: "LB Round 1",    type: "LB", _tbd: 2, matches: [] },
      { name: "WB Semifinals", type: "WB", _tbd: 2, matches: [] },
      { name: "LB Round 2",    type: "LB", _tbd: 2, matches: [] },
      { name: "WB Final",      type: "WB", _tbd: 1, matches: [] },
      { name: "LB Semifinals", type: "LB", _tbd: 1, matches: [] },
      { name: "LB Final",      type: "LB", _tbd: 1, matches: [] },
      { name: "Grand Final",   type: "GF", _tbd: 1, matches: [] },
    ],
    completed: false,
    champion:    null,
    _wbFLoser:   null,
    _wbChampion: null,
  };
}

// ── Internal: try to populate LB Final once both prerequisites are ready ──────
function _tryPopulateLBFinal(bracket) {
  const lbR5 = bracket.rounds[8];
  if (!lbR5.matches.length || !lbR5.matches[0]?.played) return;
  if (!bracket._wbFLoser) return;
  const lbR5Winner = lbR5.matches[0].result.winnerId;
  bracket.rounds[9].matches = [
    { a: bracket._wbFLoser, b: lbR5Winner, played: false, result: null },
  ];
}

// Same helper for the 8-team Champs bracket (LB Semis at idx 5, LB Final at idx 6)
function _tryPopulateChampsLBFinal(bracket) {
  const lbSemis = bracket.rounds[5];
  if (!lbSemis.matches.length || !lbSemis.matches[0]?.played) return;
  if (!bracket._wbFLoser) return;
  bracket.rounds[6].matches = [
    { a: bracket._wbFLoser, b: lbSemis.matches[0].result.winnerId, played: false, result: null },
  ];
}

// ── Internal: play one match in the 8-team Champs DE bracket ─────────────────
function _simOneChampsMatchDE(schedule, gameState, precomputedResult = null) {
  const major   = schedule.majors[4];
  const bracket = major.bracket;

  let roundIdx = -1;
  for (let r = 0; r < bracket.rounds.length; r++) {
    const rnd = bracket.rounds[r];
    if (rnd.matches.length > 0 && rnd.matches.some(m => !m.played)) { roundIdx = r; break; }
  }
  if (roundIdx === -1) return { roundIdx: -1, allComplete: true };

  const round    = bracket.rounds[roundIdx];
  const matchIdx = round.matches.findIndex(m => !m.played);
  const match    = round.matches[matchIdx];

  const result = precomputedResult ?? (() => {
    const seed  = majorSeed(schedule.season, 4, roundIdx, matchIdx);
    const teamA = buildTeamObj(match.a, gameState);
    const teamB = buildTeamObj(match.b, gameState);
    return simMatch(teamA, teamB, seed);
  })();

  match.played = true;
  match.result = result;
  schedule.matchLog.push({ ...result, stage: `${major.name} – ${round.name}` });

  const roundDone = round.matches.every(m => m.played);
  if (!roundDone) return { roundIdx, allComplete: false };

  const winners = round.matches.map(m => m.result.winnerId);
  const losers  = round.matches.map(m => m.result.loserId);

  switch (roundIdx) {
    case 0: { // WB R1 → LB R1 + WB Semis
      bracket.rounds[1].matches = [
        { a: losers[0], b: losers[3], played: false, result: null },
        { a: losers[1], b: losers[2], played: false, result: null },
      ];
      bracket.rounds[2].matches = [
        { a: winners[0], b: winners[1], played: false, result: null },
        { a: winners[2], b: winners[3], played: false, result: null },
      ];
      break;
    }
    case 1: break; // LB R1 done — LB R2 populated when WB Semis finishes

    case 2: { // WB Semis → WB Final + LB R2 (using stored LB R1 winners)
      bracket.rounds[4].matches = [
        { a: winners[0], b: winners[1], played: false, result: null },
      ];
      const lbR1W = bracket.rounds[1].matches.map(m => m.result.winnerId);
      bracket.rounds[3].matches = [
        { a: lbR1W[0], b: losers[0], played: false, result: null },
        { a: lbR1W[1], b: losers[1], played: false, result: null },
      ];
      break;
    }
    case 3: { // LB R2 → LB Semis
      bracket.rounds[5].matches = [
        { a: winners[0], b: winners[1], played: false, result: null },
      ];
      break;
    }
    case 4: { // WB Final → store champ + loser; try LB Final
      bracket._wbChampion = winners[0];
      bracket._wbFLoser   = losers[0];
      _tryPopulateChampsLBFinal(bracket);
      break;
    }
    case 5: { // LB Semis → try LB Final
      _tryPopulateChampsLBFinal(bracket);
      break;
    }
    case 6: { // LB Final → Grand Final
      bracket.rounds[7].matches = [
        { a: bracket._wbChampion, b: winners[0], played: false, result: null },
      ];
      break;
    }
    case 7: { // Grand Final → champion
      bracket.champion = winners[0];
      major.completed  = true;
      return { roundIdx, allComplete: true };
    }
  }

  return { roundIdx, allComplete: false };
}


function _resolveMajorCompletion(major) {
  const bracket = major?.bracket;
  if (!major || !bracket) return false;
  if (major.completed) return true;

  const rounds = bracket.rounds || [];
  const gfRound = rounds.find(r => r.type === "GF") || rounds[rounds.length - 1];
  const gfMatch = gfRound?.matches?.[0] || null;

  if (gfMatch?.played && gfMatch.result?.winnerId) {
    bracket.champion = bracket.champion || gfMatch.result.winnerId;
    major.completed = true;
    return true;
  }

  const hasUnplayed = rounds.some(r => (r.matches || []).some(m => !m.played));
  if (!hasUnplayed && bracket.champion) {
    major.completed = true;
    return true;
  }

  return false;
}

export function debugMajorBracketState(major, gameState = null) {
  const bracket = major?.bracket;
  const cdlIds = new Set(CDL_TEAMS.map(t => t.id));
  const eventIds = new Set(Object.keys(gameState?.schedule?.currentMajorEventTeams || {}));
  const playerTeamIds = new Set((gameState?.players || []).map(p => p.teamId).filter(Boolean));
  const prospectTeamIds = new Set((gameState?.prospects || []).map(p => p.teamId || p.challengerTeamId).filter(Boolean));
  const knownIds = new Set([...cdlIds, ...eventIds, ...playerTeamIds, ...prospectTeamIds, ...(bracket?.seeds || [])]);
  const rounds = bracket?.rounds || [];
  const matchRows = rounds.flatMap((round, roundIdx) => (round.matches || []).map((match, matchIdx) => ({ roundIdx, roundName: round.name, matchIdx, match })));
  const nextSimmable = matchRows.find(({ match }) => !match.played && match.a && match.b) || null;
  const blockedMatches = matchRows
    .filter(({ match }) => !match.played && (!match.a || !match.b))
    .map(({ roundIdx, roundName, matchIdx, match }) => ({ roundIdx, roundName, matchIdx, a: match.a ?? null, b: match.b ?? null }));
  const invalidTeamMatches = gameState ? matchRows
    .filter(({ match }) => [match.a, match.b].some(id => id && !knownIds.has(id)))
    .map(({ roundIdx, roundName, matchIdx, match }) => ({ roundIdx, roundName, matchIdx, a: match.a ?? null, b: match.b ?? null })) : [];

  return {
    bracketType: bracket?.type ?? null,
    majorCompleted: !!major?.completed,
    bracketCompleted: !!bracket?.completed,
    champion: major?.champion ?? bracket?.champion ?? null,
    totalMatches: matchRows.length,
    completedMatches: matchRows.filter(({ match }) => match.played).length,
    pendingMatches: matchRows.filter(({ match }) => !match.played).length,
    pendingMatchesWithBothTeams: matchRows
      .filter(({ match }) => !match.played && match.a && match.b)
      .map(({ roundIdx, roundName, matchIdx, match }) => ({ roundIdx, roundName, matchIdx, a: match.a, b: match.b })),
    blockedMatches,
    invalidTeamMatches,
    nextSimmableMatch: nextSimmable ? {
      roundIdx: nextSimmable.roundIdx,
      roundName: nextSimmable.roundName,
      matchIdx: nextSimmable.matchIdx,
      a: nextSimmable.match.a,
      b: nextSimmable.match.b,
    } : null,
    unresolvedRounds: rounds
      .map((round, roundIdx) => ({
        roundIdx,
        roundName: round.name,
        matchCount: round.matches?.length || 0,
        unresolvedSlots: (round.matches || []).filter(m => !m.played && (!m.a || !m.b)).length,
        unplayedReady: (round.matches || []).filter(m => !m.played && m.a && m.b).length,
      }))
      .filter(round => round.unresolvedSlots > 0 || round.unplayedReady > 0),
  };
}

function _simOneMajorMatchDE16(schedule, gameState, precomputedResult = null) {
  const majorIdx = schedule.majorIdx;
  const major = schedule.majors[majorIdx];
  const bracket = major.bracket;
  let roundIdx = -1;
  for (let r = 0; r < bracket.rounds.length; r++) {
    const round = bracket.rounds[r];
    if (round.matches.length > 0 && round.matches.some(m => !m.played)) { roundIdx = r; break; }
  }
  if (roundIdx === -1) return { roundIdx: -1, allComplete: true };
  const round = bracket.rounds[roundIdx];
  const matchIdx = round.matches.findIndex(m => !m.played);
  const match = round.matches[matchIdx];
  const result = precomputedResult ?? (() => {
    const seed = majorSeed(schedule.season, majorIdx, roundIdx, matchIdx);
    return simMatch(buildTeamObj(match.a, gameState), buildTeamObj(match.b, gameState), seed);
  })();
  match.played = true; match.result = result;
  schedule.matchLog.push({ ...result, stage: `${major.name} – ${round.name}` });
  if (!round.matches.every(m => m.played)) return { roundIdx, allComplete: false };
  const winners = round.matches.map(m => m.result.winnerId);
  const losers = round.matches.map(m => m.result.loserId);
  switch (roundIdx) {
    case 0:
      bracket.rounds[1].matches = [{ a: losers[0], b: losers[1], played:false,result:null},{ a: losers[2], b: losers[3], played:false,result:null},{ a: losers[4], b: losers[5], played:false,result:null},{ a: losers[6], b: losers[7], played:false,result:null}];
      bracket.rounds[2].matches = [{ a:winners[0], b:winners[1], played:false,result:null},{ a:winners[2], b:winners[3], played:false,result:null},{ a:winners[4], b:winners[5], played:false,result:null},{ a:winners[6], b:winners[7], played:false,result:null}];
      break;
    case 1: break;
    case 2: {
      bracket.rounds[5].matches = [{ a:winners[0], b:winners[1], played:false,result:null},{ a:winners[2], b:winners[3], played:false,result:null}];
      const lb1w = bracket.rounds[1].matches.map(m=>m.result.winnerId);
      bracket.rounds[3].matches = [{a:lb1w[0], b:losers[0], played:false,result:null},{a:lb1w[1], b:losers[1], played:false,result:null},{a:lb1w[2], b:losers[2], played:false,result:null},{a:lb1w[3], b:losers[3], played:false,result:null}];
      break;
    }
    case 3: bracket.rounds[4].matches = [{a:winners[0],b:winners[1],played:false,result:null},{a:winners[2],b:winners[3],played:false,result:null}]; break;
    case 4: bracket._lbr3Winners = winners; break;
    case 5:
      bracket.rounds[7].matches = [{ a:winners[0], b:winners[1], played:false,result:null }];
      bracket.rounds[6].matches = [{ a: bracket._lbr3Winners[0], b: losers[0], played:false,result:null},{ a: bracket._lbr3Winners[1], b: losers[1], played:false,result:null}];
      break;
    case 6: bracket.rounds[8].matches = [{ a:winners[0], b:winners[1], played:false,result:null }]; break;
    case 7: bracket._wbChampion=winners[0]; bracket._wbFLoser=losers[0]; _tryPopulateLBFinal(bracket); break;
    case 8: _tryPopulateLBFinal(bracket); break;
    case 9: bracket.rounds[10].matches = [{ a:bracket._wbChampion, b:winners[0], played:false,result:null }]; break;
    case 10: bracket.champion=winners[0]; major.completed=true; return { roundIdx, allComplete:true };
  }
  return { roundIdx, allComplete:false };
}

// ── Internal: play one DE major match ─────────────────────────────────────────
// precomputedResult: if provided, skips simMatch and uses it directly (interactive play).
function _simOneMajorMatchDE(schedule, gameState, precomputedResult = null) {
  const majorIdx = schedule.majorIdx;
  const major    = schedule.majors[majorIdx];
  const bracket  = major.bracket;

  let roundIdx = -1;
  for (let r = 0; r < bracket.rounds.length; r++) {
    const round = bracket.rounds[r];
    if (round.matches.length > 0 && round.matches.some(m => !m.played)) {
      roundIdx = r;
      break;
    }
  }
  if (roundIdx === -1) return { roundIdx: -1, allComplete: true };

  const round    = bracket.rounds[roundIdx];
  const matchIdx = round.matches.findIndex(m => !m.played);
  const match    = round.matches[matchIdx];

  const result = precomputedResult ?? (() => {
    const seed  = majorSeed(schedule.season, majorIdx, roundIdx, matchIdx);
    const teamA = buildTeamObj(match.a, gameState);
    const teamB = buildTeamObj(match.b, gameState);
    return simMatch(teamA, teamB, seed);
  })();

  match.played = true;
  match.result = result;
  schedule.matchLog.push({ ...result, stage: `${major.name} – ${round.name}` });

  const roundDone = round.matches.every(m => m.played);
  if (!roundDone) return { roundIdx, allComplete: false };

  const winners = round.matches.map(m => m.result.winnerId);
  const losers  = round.matches.map(m => m.result.loserId);
  const seeds   = bracket.seeds;

  switch (roundIdx) {
    case 0: { // WB Round 1 → populate LB R1 + WB R2
      bracket.rounds[1].matches = [
        { a: losers[0], b: losers[3], played: false, result: null },
        { a: losers[1], b: losers[2], played: false, result: null },
      ];
      bracket.rounds[2].matches = [
        { a: seeds[0], b: winners[3], seedA: 1, played: false, result: null },
        { a: seeds[1], b: winners[2], seedA: 2, played: false, result: null },
        { a: seeds[2], b: winners[1], seedA: 3, played: false, result: null },
        { a: seeds[3], b: winners[0], seedA: 4, played: false, result: null },
      ];
      break;
    }
    case 1: break; // LB R1 done — LB R2 populated after WB R2

    case 2: { // WB Round 2 → populate WB SF + LB R2; store high losers
      bracket.rounds[5].matches = [
        { a: winners[0], b: winners[1], played: false, result: null },
        { a: winners[2], b: winners[3], played: false, result: null },
      ];
      const lbR1W = bracket.rounds[1].matches.map(m => m.result.winnerId);
      bracket.rounds[3].matches = [
        { a: lbR1W[0], b: losers[2], played: false, result: null },
        { a: lbR1W[1], b: losers[3], played: false, result: null },
      ];
      bracket._wbr2LosersHigh = [losers[0], losers[1]];
      break;
    }
    case 3: { // LB R2 → populate LB R3
      const hl = bracket._wbr2LosersHigh;
      bracket.rounds[4].matches = [
        { a: winners[0], b: hl[0], played: false, result: null },
        { a: winners[1], b: hl[1], played: false, result: null },
      ];
      break;
    }
    case 4: { // LB R3 done — store for LB R4 (populated after WB SF)
      bracket._lbr3Winners = winners;
      break;
    }
    case 5: { // WB Semifinals → populate WB Final + LB R4
      bracket.rounds[7].matches = [
        { a: winners[0], b: winners[1], played: false, result: null },
      ];
      const lbR3W = bracket._lbr3Winners;
      bracket.rounds[6].matches = [
        { a: lbR3W[0], b: losers[0], played: false, result: null },
        { a: lbR3W[1], b: losers[1], played: false, result: null },
      ];
      break;
    }
    case 6: { // LB R4 → populate LB R5
      bracket.rounds[8].matches = [
        { a: winners[0], b: winners[1], played: false, result: null },
      ];
      break;
    }
    case 7: { // WB Final → store WB champ + loser; try GF
      bracket._wbChampion = winners[0];
      bracket._wbFLoser   = losers[0];
      _tryPopulateLBFinal(bracket);
      break;
    }
    case 8: { // LB R5 → try LB Final
      _tryPopulateLBFinal(bracket);
      break;
    }
    case 9: { // LB Final → populate Grand Final
      bracket.rounds[10].matches = [
        { a: bracket._wbChampion, b: winners[0], played: false, result: null },
      ];
      break;
    }
    case 10: { // Grand Final → champion
      bracket.champion  = winners[0];
      major.completed   = true;
      return { roundIdx, allComplete: true };
    }
  }

  return { roundIdx, allComplete: false };
}

// ── Internal: play exactly ONE unplayed major match ───────────────────────────
// Mutates schedule in place. Returns { roundIdx, allComplete }.
// precomputedResult: if provided, skips simMatch and uses it directly (interactive play).
function _simOneMajorMatch(schedule, gameState, precomputedResult = null) {
  const majorIdx = schedule.majorIdx;
  const major    = schedule.majors[majorIdx];
  const bracket  = major.bracket;

  // Find the first round that still has unplayed matches
  let roundIdx = -1;
  for (let r = 0; r < bracket.rounds.length; r++) {
    const round = bracket.rounds[r];
    if (round.matches.length > 0 && round.matches.some(m => !m.played)) {
      roundIdx = r;
      break;
    }
  }
  if (roundIdx === -1) return { roundIdx: -1, allComplete: true };

  const round    = bracket.rounds[roundIdx];
  const matchIdx = round.matches.findIndex(m => !m.played);
  const match    = round.matches[matchIdx];

  const result = precomputedResult ?? (() => {
    const seed  = majorSeed(schedule.season, majorIdx, roundIdx, matchIdx);
    const teamA = buildTeamObj(match.a, gameState);
    const teamB = buildTeamObj(match.b, gameState);
    return simMatch(teamA, teamB, seed);
  })();

  match.played = true;
  match.result = result;

  schedule.matchLog.push({
    ...result,
    stage: `${major.name} – ${round.name}`,
  });

  // If this round is fully played, wire up the next round
  const roundDone = round.matches.every(m => m.played);
  if (roundDone) {
    const winners = round.matches.map(m => m.result.winnerId);
    if (roundIdx + 1 < bracket.rounds.length) {
      const nextMatches = [];
      for (let w = 0; w < winners.length; w += 2) {
        if (w + 1 < winners.length)
          nextMatches.push({ a: winners[w], b: winners[w + 1], played: false, result: null });
      }
      bracket.rounds[roundIdx + 1].matches = nextMatches;
    } else {
      // Grand Final done → major complete
      bracket.champion = winners[0];
      major.completed  = true;
      return { roundIdx, allComplete: true };
    }
  }

  return { roundIdx, allComplete: false };
}

// ── Internal: advance season phase after a major completes ────────────────────
function _advanceMajorPhase(schedule, gameState) {
  const majorIdx = schedule.majorIdx;
  let nextState = gameState;

  // Award Major placement points to CDL teams only (regular majors).
  awardMajorPlacementPoints(schedule, majorIdx);

  const teamIds = CDL_TEAMS.map(t => t.id);

  // Event-team metadata is scoped to a single event. Clear it for every
  // major (regular AND Champs) so a stale entry can never leak into the
  // next phase's rendering or seeding.
  schedule.currentMajorEventTeams = null;
  // Same for the visible qualifier event — once we leave a Major, the
  // qualifier that fed it is done. Keep the historical record in
  // `challengerQualifierResults`.
  schedule.currentChallengerQualifier = null;

  if (majorIdx <= 2) {
    // Major 1/2/3 → next Stage
    // Reset stageStandings now (entering new stage, not when building the bracket)
    schedule.stageStandings = initStandings(teamIds);
    schedule.phase    = "stage";
    schedule.stageIdx = majorIdx + 1;
    schedule.majorIdx = null;
    schedule.currentMatchday = 0;
  } else if (majorIdx === 3) {
    // Major 4 → Pre-Champs roster window
    schedule.stageStandings = initStandings(teamIds);
    schedule.phase    = "preChamps";
    schedule.majorIdx = null;
  } else {
    // Champs → Offseason
    schedule.phase    = "offseason";
    schedule.majorIdx = null;
  }

  // AI roster window after each regular major (not after Champs), once the
  // schedule has safely left the Major phase.
  if (majorIdx <= 3) nextState = runAIMajorRosterWindow(nextState, majorIdx);

  return withCdlRosterIntegrity(nextState, majorIdx <= 3 ? "post_major_transition" : "post_champs_transition");
}

// ── PUBLIC: Begin Championship (triggered by user from preChamps window) ───────
export function beginChamps(gameState) {
  gameState = withCdlRosterIntegrity(gameState, "before_champs_generation");
  const schedule = gameState.schedule;
  if (schedule.phase !== "preChamps") return gameState;

  // Champs bracket seeded by cumulative season standings.points.
  // IMPORTANT: build the bracket BEFORE flipping phase/majorIdx so the UI
  // never sees a `phase === "major"` window with a missing or partial
  // bracket — that path used to crash MajorTournamentOverlay/MatchCenter.
  const cdlSeeds = Object.entries(schedule.standings ?? {})
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 12)
    .map(([id]) => id);

  // Defensive: every CDL team must have a standings entry so we end up with
  // exactly 12 CDL seeds. If the save is missing any (legacy/corrupted),
  // fill in zero-record placeholders so seeding doesn't fall short.
  if (cdlSeeds.length < 12) {
    for (const team of CDL_TEAMS) {
      if (!cdlSeeds.includes(team.id) && cdlSeeds.length < 12) cdlSeeds.push(team.id);
    }
  }

  const eventTeams = simulateChallengerQualifier(gameState, schedule, "champs") ?? [];
  schedule.currentMajorEventTeams = Object.fromEntries(eventTeams.map(t => [t.id, t]));
  const challengerSeedIds = eventTeams.map(t => t.id);
  const champsSeeds = [...cdlSeeds, ...challengerSeedIds];

  // If the qualifier produced fewer than 4 entrants (shouldn't happen, but
  // we've now seen one save where it did), pad with CDL teams so the bracket
  // builder still gets 16 slots and `buildMajorBracketDE16` doesn't index
  // into undefined. Padding with CDL teams is harmless because those seeds
  // simply get a second appearance — far better than a blank screen.
  while (champsSeeds.length < 16) {
    const padId = cdlSeeds[champsSeeds.length - cdlSeeds.length] ?? cdlSeeds[0];
    if (!padId) break;
    champsSeeds.push(padId);
  }

  schedule.majors[4].bracket = buildMajorBracketDE16(champsSeeds);
  schedule.majors[4].completed = false;
  schedule.phase    = "major";
  schedule.majorIdx = 4;
  return { ...gameState, schedule: { ...schedule } };
}

// ── Internal: unified one-match dispatcher ────────────────────────────────────
function _dispatchOneMajorMatch(schedule, gameState) {
  const majorIdx = schedule.majorIdx;
  const bracket = schedule.majors[majorIdx]?.bracket;
  if (bracket?.type === "DE16") return _simOneMajorMatchDE16(schedule, gameState);
  return bracket?.type === "DE"
    ? _simOneMajorMatchDE(schedule, gameState)
    : _simOneMajorMatch(schedule, gameState);
}

// ── PUBLIC: Simulate one major match ──────────────────────────────────────────
export function simNextMajorMatch(gameState) {
  gameState = withCdlRosterIntegrity(gameState, "before_sim_major_match");
  const schedule = gameState.schedule;
  if (schedule.phase !== "major") return gameState;

  const major = schedule.majors[schedule.majorIdx];
  if (!major) return gameState;
  if (major.completed) {
    const nextState = _advanceMajorPhase(schedule, gameState);
    return { ...nextState, schedule: { ...schedule } };
  }

  const { allComplete } = _dispatchOneMajorMatch(schedule, gameState);
  let nextState = gameState;
  if (allComplete || _resolveMajorCompletion(major)) nextState = _advanceMajorPhase(schedule, gameState);

  return { ...nextState, schedule: { ...schedule } };
}

// ── PUBLIC: Simulate all remaining matches in the current round ───────────────
export function simMajorRound(gameState) {
  gameState = withCdlRosterIntegrity(gameState, "before_sim_major_round");
  const schedule = gameState.schedule;
  if (schedule.phase !== "major") return gameState;

  const major = schedule.majors[schedule.majorIdx];
  if (!major) return gameState;
  if (major.completed) {
    const nextState = _advanceMajorPhase(schedule, gameState);
    return { ...nextState, schedule: { ...schedule } };
  }

  // Snapshot which round we're starting in so we stop after it finishes
  let startRound = -1;
  for (let r = 0; r < major.bracket.rounds.length; r++) {
    const rnd = major.bracket.rounds[r];
    if (rnd.matches.length > 0 && rnd.matches.some(m => !m.played)) {
      startRound = r;
      break;
    }
  }
  if (startRound === -1) return gameState;

  let safety = 0;
  while (safety++ < 50) {
    const bracket = schedule.majors[schedule.majorIdx].bracket;
    const rnd     = bracket.rounds[startRound];
    if (!rnd || rnd.matches.every(m => m.played)) break;

    const { allComplete } = _dispatchOneMajorMatch(schedule, gameState);
    if (allComplete || _resolveMajorCompletion(schedule.majors[schedule.majorIdx])) {
      gameState = _advanceMajorPhase(schedule, gameState);
      break;
    }
  }

  return { ...gameState, schedule: { ...schedule } };
}

// ── PUBLIC: Simulate the entire remaining bracket ─────────────────────────────
export function simMajor(gameState) {
  gameState = withCdlRosterIntegrity(gameState, "before_sim_major");
  const schedule  = gameState.schedule;
  if (schedule.phase !== "major") return gameState;

  const targetIdx = schedule.majorIdx;
  const major     = schedule.majors[targetIdx];
  if (!major) return gameState;
  if (major.completed) {
    const nextState = _advanceMajorPhase(schedule, gameState);
    return { ...nextState, schedule: { ...schedule } };
  }

  let safety = 0;
  while (!schedule.majors[targetIdx].completed && safety++ < 200) {
    const before = debugMajorBracketState(schedule.majors[targetIdx], gameState);
    const { allComplete } = _dispatchOneMajorMatch(schedule, gameState);
    const after = debugMajorBracketState(schedule.majors[targetIdx], gameState);
    if (after.completedMatches === before.completedMatches && !allComplete) {
      console.warn("Major simulation stopped without progress", after);
      break;
    }
    if (allComplete || _resolveMajorCompletion(schedule.majors[schedule.majorIdx])) {
      gameState = _advanceMajorPhase(schedule, gameState);
      break;
    }
  }

  if (safety >= 200 && !schedule.majors[targetIdx].completed) {
    console.warn("Major simulation hit safety limit", debugMajorBracketState(schedule.majors[targetIdx], gameState));
  }

  return { ...gameState, schedule: { ...schedule } };
}

// ── Stage simulation ───────────────────────────────────────────────────────────
export function simNextMatch(gameState) {
  gameState = withCdlRosterIntegrity(gameState, "before_sim_next_match");
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "stage") return gameState;

  const stage    = schedule.stages[schedule.stageIdx];
  const unplayed = stage.matches.findIndex(m => !m.played);

  if (unplayed === -1) {
    // Stage done → visible Challenger Qualifier before Major bracket entry.
    return enterChallengerQualifierPhase(gameState, schedule);
  }

  const match = stage.matches[unplayed];
  const seed  = schedule.season * 100_000 + schedule.stageIdx * 10_000 + unplayed;
  const teamA = buildTeamObj(match.a, gameState);
  const teamB = buildTeamObj(match.b, gameState);
  const result = simMatch(teamA, teamB, seed);

  match.played = true;
  match.result = result;

  // Update cumulative season standings
  schedule.standings[result.winnerId].wins++;
  schedule.standings[result.winnerId].points += 10;
  schedule.standings[result.loserId].losses++;

  // Update per-stage standings
  schedule.stageStandings[result.winnerId].wins++;
  schedule.stageStandings[result.winnerId].points += 10;
  schedule.stageStandings[result.loserId].losses++;

  schedule.matchLog.push({ ...result, stage: stage.name });
  schedule.currentMatchday++;

  return { ...gameState, schedule: { ...schedule } };
}

export function simMatchday(gameState) {
  gameState = withCdlRosterIntegrity(gameState, "before_sim_matchday");
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "stage") return gameState;

  const stage           = schedule.stages[schedule.stageIdx];
  const unplayedIndices = stage.matches.map((m, i) => !m.played ? i : -1).filter(i => i !== -1);

  if (unplayedIndices.length === 0) return simNextMatch(gameState);

  const usedTeams    = new Set();
  const todayIndices = [];
  for (const idx of unplayedIndices) {
    const { a, b } = stage.matches[idx];
    if (!usedTeams.has(a) && !usedTeams.has(b)) {
      todayIndices.push(idx);
      usedTeams.add(a);
      usedTeams.add(b);
    }
    if (todayIndices.length === 6) break;
  }

  if (todayIndices.length === 0) return simNextMatch(gameState);

  for (const idx of todayIndices) {
    const match  = stage.matches[idx];
    if (match.played) continue;
    const seed   = schedule.season * 100_000 + schedule.stageIdx * 10_000 + idx;
    const teamA  = buildTeamObj(match.a, gameState);
    const teamB  = buildTeamObj(match.b, gameState);
    const result = simMatch(teamA, teamB, seed);

    match.played = true;
    match.result = result;

    // Cumulative season standings
    schedule.standings[result.winnerId].wins++;
    schedule.standings[result.winnerId].points += 10;
    schedule.standings[result.loserId].losses++;

    // Per-stage standings
    schedule.stageStandings[result.winnerId].wins++;
    schedule.stageStandings[result.winnerId].points += 10;
    schedule.stageStandings[result.loserId].losses++;

    schedule.matchLog.push({ ...result, stage: stage.name });
  }

  if (stage.matches.every(m => m.played)) {
    // Stage done → visible Challenger Qualifier before Major bracket entry.
    enterChallengerQualifierPhase(gameState, schedule);
  }

  schedule.currentMatchday++;
  return { ...gameState, schedule: { ...schedule } };
}

export function simStage(gameState) {
  let state = gameState;
  let safety = 0;
  while (state.schedule.phase === "stage" && safety++ < 500)
    state = simMatchday(state);
  return state;
}

// ── Simulate a matchday that always includes the user's next match ─────────────
// Used by the "Play Matchday" overlay so the user's result is guaranteed.
// Fills remaining slots with non-overlapping league matches.
export function simUserMatchday(gameState) {
  gameState = withCdlRosterIntegrity(gameState, "before_sim_user_matchday");
  const schedule = gameState.schedule;
  if (!schedule || schedule.phase !== "stage") return gameState;

  const { userTeamId } = gameState;
  const stage      = schedule.stages[schedule.stageIdx];
  const allUnplayed = stage.matches
    .map((m, i) => (!m.played ? i : -1))
    .filter(i => i !== -1);

  if (allUnplayed.length === 0) return gameState;

  // Find the user's next unplayed match index
  const userMatchIdx = allUnplayed.find(
    i => stage.matches[i].a === userTeamId || stage.matches[i].b === userTeamId
  ) ?? -1;

  if (userMatchIdx < 0) {
    // User has no remaining matches — fall back to a normal matchday
    return simMatchday(gameState);
  }

  // Build today's batch: user's match first, then fill up to 6 with
  // non-overlapping matches from the rest of the unplayed list.
  const { a: ua, b: ub } = stage.matches[userMatchIdx];
  const usedTeams   = new Set([ua, ub]);
  const todayIndices = [userMatchIdx];

  for (const idx of allUnplayed) {
    if (idx === userMatchIdx) continue;
    const { a, b } = stage.matches[idx];
    if (!usedTeams.has(a) && !usedTeams.has(b)) {
      todayIndices.push(idx);
      usedTeams.add(a);
      usedTeams.add(b);
    }
    if (todayIndices.length === 6) break;
  }

  // Simulate each match in the batch
  for (const idx of todayIndices) {
    const match  = stage.matches[idx];
    if (match.played) continue;
    const seed   = schedule.season * 100_000 + schedule.stageIdx * 10_000 + idx;
    const teamA  = buildTeamObj(match.a, gameState);
    const teamB  = buildTeamObj(match.b, gameState);
    const result = simMatch(teamA, teamB, seed);

    match.played = true;
    match.result = result;

    schedule.standings[result.winnerId].wins++;
    schedule.standings[result.winnerId].points += 10;
    schedule.standings[result.loserId].losses++;

    schedule.stageStandings[result.winnerId].wins++;
    schedule.stageStandings[result.winnerId].points += 10;
    schedule.stageStandings[result.loserId].losses++;

    schedule.matchLog.push({ ...result, stage: stage.name });
  }

  // If stage is now complete, advance to major phase
  if (stage.matches.every(m => m.played)) {
    enterChallengerQualifierPhase(gameState, schedule);
  }

  schedule.currentMatchday++;
  return { ...gameState, schedule: { ...schedule } };
}

// ── Retirement ────────────────────────────────────────────────────────────────
// Called after players are aged but before progression runs.
// Returns the filtered player/prospect arrays and a list of retirees.
//
// Age curves (probability of retiring at that age):
//   < 27:  0     — too young to consider retirement
//   27:    3 %
//   28:    8 %
//   29:   20 %
//   30:   35 %
//   31:   50 %
//   32:   65 %
//   33+:  80 %
//
// Modifiers:
//   Elite (90+ OVR)    → ×0.25  (stars play longer)
//   Strong  (87–89)    → ×0.45
//   Solid   (83–86)    → ×0.65
//   Heavy decline      → ×1.5   (well below potential accelerates exit)
//
// Uses Math.random() intentionally so retirements vary between saves (genuine
// career uncertainty), unlike the seeded roster AI decisions.
function runRetirements(players, prospects, season) {
  const retired = [];

  const activePlayers = players.filter(p => {
    const age     = p.age || 22;
    const overall = p.overall || 70;

    if (age < 27) return true;

    let prob = age >= 33 ? 0.80
             : age >= 32 ? 0.65
             : age >= 31 ? 0.50
             : age >= 30 ? 0.35
             : age >= 29 ? 0.20
             : age >= 28 ? 0.08
             :              0.03; // 27

    // Elite players can sustain longer careers
    if      (overall >= 90) prob *= 0.25;
    else if (overall >= 87) prob *= 0.45;
    else if (overall >= 83) prob *= 0.65;

    // Players far below their potential are already declining — they go sooner
    const pot = p.potential || overall;
    if (overall < pot - 12) prob = Math.min(0.95, prob * 1.5);

    if (Math.random() < prob) {
      retired.push({ ...p, retiredSeason: season });
      return false;
    }
    return true;
  });

  // Old unsigned challengers can also age out.
  // Threshold raised to 30 so decent 29-year-olds stay visible.
  // Strong players (75+ OVR) resist retirement — they are still attractive signings.
  const activeProspects = prospects.filter(p => {
    const age = p.age || 20;
    const ovr = p.overall || 70;
    if (age < 30) return true;
    if (ovr >= 75) return Math.random() > 0.35; // strong veterans: ~35 % retire
    return Math.random() > 0.55;                // weak old prospects: ~55 % retire
  });

  return { activePlayers, activeProspects, retired };
}

// ── Contract phase entry ──────────────────────────────────────────────────────
// Transitions from "offseason" → "contracts" so the user can review expiring
// contracts before the offseason actually advances.
// Also migrates any legacy players that were saved without contractYears.
export function enterContractPhase(gameState) {
  const schedule = gameState.schedule;
  if (schedule.phase !== "offseason") return gameState;

  // Migrate legacy saves: assign contractYears to players who don't have it yet
  const players = (gameState.players || []).map(p => {
    if (p.contractYears != null) return p;
    const id = p.id || p.name || "";
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return { ...p, contractYears: (h % 3) + 1 };
  });

  return withCdlRosterIntegrity({
    ...gameState,
    players,
    schedule: { ...schedule, phase: "contracts" },
  }, "enter_contract_phase");
}

// ── Offseason ─────────────────────────────────────────────────────────────────
export function advanceOffseason(gameState) {
  const standings      = gameState.schedule?.standings ?? {};
  const newSeason      = (gameState.schedule?.season ?? 1) + 1;
  const outgoingSeason = gameState.schedule?.season ?? 1;
  const matchLog       = gameState.schedule?.matchLog ?? [];

  // Accumulate this season's matchLog into per-player season stats before wiping
  const playerSeasonStats = { ...(gameState.playerSeasonStats ?? {}) };
  for (const result of matchLog) {
    if (!result.playerStats) continue;
    for (const [playerId, stats] of Object.entries(result.playerStats)) {
      if (!playerSeasonStats[playerId]) playerSeasonStats[playerId] = [];
      let entry = playerSeasonStats[playerId].find(e => e.season === outgoingSeason);
      if (!entry) {
        entry = { season: outgoingSeason, kills: 0, deaths: 0, matches: 0 };
        playerSeasonStats[playerId].push(entry);
      }
      entry.kills   += stats.kills  ?? 0;
      entry.deaths  += stats.deaths ?? 0;
      entry.matches += 1;
    }
  }

  // ── Contract processing ────────────────────────────────────────────────────
  // AI teams auto-renew any player on a 1-year contract (contractYears === 1)
  // before the decrement so stars don't flood free agency every offseason.
  // User's expiring players were already handled in the contracts phase.
  const withAIRenewals = (gameState.players || []).map(p => {
    if (!p.teamId || p.teamId === gameState.userTeamId) return p;
    const years = p.contractYears ?? 2;
    if (years === 1) {
      const demand = getResignDemand(p, 1, gameState.playerSeasonStats, outgoingSeason);
      return { ...p, contractYears: 2, salary: demand };  // AI auto-renew with market salary
    }
    return p;
  });

  // Decrement contractYears by 1 for every signed player
  const withDecrement = withAIRenewals.map(p => {
    if (!p.teamId) return p;
    return { ...p, contractYears: Math.max(0, (p.contractYears ?? 2) - 1) };
  });

  // Snapshot teamHistory: record each signed player's team for the outgoing season.
  // Captured pre-expiry so players whose contracts just hit 0 still get their
  // last season's team recorded. Deduplicates if SIGN_PLAYER already wrote it.
  const withTeamHistorySnapshot = withDecrement.map(p => {
    if (!p.teamId) return p;
    const history = p.teamHistory || [];
    if (history.some(e => e.season === outgoingSeason)) return p;
    return { ...p, teamHistory: [...history, { season: outgoingSeason, teamId: p.teamId }] };
  });

  // Release players whose contracts hit 0 — they become free agents
  const withExpiry = withTeamHistorySnapshot.map(p => {
    if (p.teamId && (p.contractYears ?? 1) === 0) {
      return { ...p, teamId: null, isSub: false };
    }
    return p;
  });

  // Age up all players and prospects, reset form
  const agedPlayers = withExpiry.map(p => ({
    ...p,
    age:        (p.age || 18) + 1,
    experience: (p.experience || 0) + 1,
    form:       70,
  }));

  const agedProspects = (gameState.prospects || []).map(p => ({
    ...p,
    age:        (p.age || 18) + 1,
    experience: (p.experience || 0),
    form:       65,
  }));

  // Retire players who have aged out before running progression on survivors.
  // Retirees are removed from rosters and free agency; teams will fill vacated
  // slots through the AI offseason roster window that runs after this.
  const { activePlayers, activeProspects, retired } =
    runRetirements(agedPlayers, agedProspects, outgoingSeason);

  // Run progression/regression on the aged survivors
  const { updatedPlayers, updatedProspects, progressionLog } =
    runProgression(activePlayers, activeProspects, standings, newSeason);

  // ── Build playerOvrHistory from this season's progression ────────────────
  // Records the OVR each player *played at* during the outgoing season
  // (oldOverall = pre-progression OVR = what they were rated all season).
  const playerOvrHistory = { ...(gameState.playerOvrHistory ?? {}) };
  for (const entry of progressionLog) {
    if (!playerOvrHistory[entry.id]) playerOvrHistory[entry.id] = [];
    playerOvrHistory[entry.id] = [
      ...playerOvrHistory[entry.id],
      { season: outgoingSeason, overall: entry.oldOverall },
    ];
  }

  // ── Refresh prospect pool for the incoming season ─────────────────────────
  // Runs after progression so newly-aged prospects are evaluated with their
  // updated overalls. Only touches unsigned challengers (updatedProspects).
  // Signed former-prospects are in updatedPlayers and are never affected.
  const { prospects: refreshedProspects, metrics: poolMetrics } =
    refreshProspectPool(updatedProspects, newSeason);

  // ── Build a per-season challengers ecosystem snapshot ────────────────────
  // Stored in state.challengersLog for the Pool Health report panel.
  const retiredProspectCount = retired.filter(r => r.isProspect).length;
  const rp = refreshedProspects; // shorthand
  const challengersEntry = {
    season:              newSeason,
    poolSize:            rp.length,
    avgAge:              rp.length ? +(rp.reduce((s, p) => s + (p.age || 20), 0) / rp.length).toFixed(1) : 0,
    avgOvr:              rp.length ? +(rp.reduce((s, p) => s + (p.overall || 70), 0) / rp.length).toFixed(1) : 0,
    removedByRetirement: retiredProspectCount,
    removedByCleanup:    poolMetrics.removedByCleanup,
    annualIntake:        poolMetrics.annualIntake,
    topUpCount:          poolMetrics.topUpCount,
    removedByCap:        poolMetrics.removedByCap,
  };

  const withProgression = {
    ...gameState,
    players:          updatedPlayers,
    prospects:        refreshedProspects,
    progressionLog,
    playerSeasonStats,
    playerOvrHistory,
    retiredPlayers:   [...(gameState.retiredPlayers || []), ...retired],
    challengersLog:   [...(gameState.challengersLog || []), challengersEntry],
    schedule:         buildSeason(newSeason),
    season:           newSeason,
  };

  return withCdlRosterIntegrity(runAIOffseasonRosterWindow(withProgression), "post_offseason");
}

// ── Prospect Pool Refresh ─────────────────────────────────────────────────────
// Called each offseason after progression to:
//   1. Remove old/weak unsigned challengers so the pool doesn't bloat
//   2. Inject ~20 fresh young prospects for the coming season
//
// Tier breakdown per class (total ~20):
//   elite — 2–4 players: age 18–20, OVR 75–83, POT 87–95  (rare; 2–4 per year)
//   mid   — 4–6 players: age 18–21, OVR 65–74, POT 75–88
//   low   — remainder:   age 18–21, OVR 56–68, POT 65–80
//
// Cleanup rules:
//   • age 26+ AND overall < 70  → always removed
//   • age 25+ AND overall < 67  → 70 % chance to remove
//   • age 24+ AND overall < 62  → 80 % chance to remove
//   Pool hard-capped at 60 total after additions.

// CDL-style gamertag name pool for generated prospects
const FRESH_PROSPECT_NAMES = [
  "Ace","Akro","Alch","Ambit","Anvil","Apex","Arc","Arcen","Ardyn","Arkz",
  "Arrow","Ash","Astro","Atlas","Attax","Axen","Azek","Bane","Baron","Bash",
  "Beam","Blade","Blitz","Bloom","Bolt","Boxer","Brand","Brash","Briar","Brisk",
  "Calix","Calyx","Capo","Caste","Caven","Chalk","Chaos","Char","Chase","Cipher",
  "Clash","Clef","Clone","Cobal","Colt","Cruz","Cutt","Daven","Decim","Delta",
  "Demon","Derex","Devox","Dexon","Drake","Drive","Dusk","Echo","Edge","Eikon",
  "Elan","Ember","Emile","Enkil","Epoch","Ethos","Exile","Falco","Fang","Fate",
  "Faze","Felix","Fenix","Fiero","Final","Flare","Flex","Flint","Forge","Frost",
  "Ghost","Gild","Glaze","Glyph","Grind","Grit","Gust","Haze","Heft","Helm",
  "Hilt","Hydra","Jace","Jax","Jaxon","Jinx","Jolt","Kael","Kane","Kaos",
  "Lance","Laser","Leon","Locus","Logan","Lotus","Lumen","Mach","Macro","Mako",
  "Mars","Mave","Merge","Midas","Morph","Nash","Navex","Nexus","Nito","Onyx",
  "Optic","Orbit","Parse","Payne","Penta","Phase","Pivot","Pixel","Plax","Prime",
  "Probe","Proxy","Raze","Realm","Reflex","Reign","Renzo","Revo","Rimax","Rivet",
  "Rome","Rouse","Sabre","Saxon","Scale","Scope","Scout","Shade","Shift","Sigil",
  "Siren","Skill","Slash","Slade","Solar","Sonic","Spark","Spawn","Spike","Sprint",
  "Steel","Storm","Strike","Surge","Talon","Tempo","Thorn","Titan","Token","Torque",
  "Trace","Tron","Turbo","Valor","Vault","Vector","Venom","Vertex","Viper","Warden",
  "Warp","Wolf","Wren","Xeon","Xero","Zane","Zeal","Zephyr","Zero","Zinc",
  "Zion","Zulu","Arco","Axle","Grid","Iron","Knox","Lynx","Null","Peak",
  "Rex","Rush","Sage","Salt","Silk","Slab","Smog","Snap","Spec","Spin",
  "Sync","Tide","Tilt","Trix","Vale","Void","Wave","Yoke","Dash","Flair",
  "Crypt","Coal","Prism","Sear","Rend","Veil","Gale","Krux","Daze","Wick",
  "Axiom","Blaze","Breach","Crest","Dusk","Flick","Gloom","Havoc","Influx","Juke",
  "Krypt","Latch","Manor","Niche","Overt","Patch","Quill","Rinse","Shard","Thrax",
  "Umbra","Vault","Wraith","Xylon","Yardx","Zarak","Ardex","Brixon","Cadex","Devoc",
  "Eclip","Fovex","Gaven","Hilex","Idron","Javik","Kenvex","Laxon","Maxen","Noxen",
];

const _REGIONS = ["NA","NA","NA","NA","EU","EU","EU","MENA","MENA"];

// Build one generated prospect for the annual refresh class.
// Uses seeded RNG for stats (reproducible per season+idx) and Math.random() for
// name / region / age so each save's class feels different.
function _buildFreshProspect(tier, idx, season) {
  const tierSeed = tier === "elite" ? 1 : tier === "mid" ? 2 : 3;
  const rng = seededRng(season * 99991 + idx * 1301 + tierSeed * 37);

  const ri = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const clamp = (v, lo = 41, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)));

  // Name — Math.random() so classes vary between saves
  const name = FRESH_PROSPECT_NAMES[Math.floor(Math.random() * FRESH_PROSPECT_NAMES.length)];

  // Age — varies by tier:
  //   elite → always 18–20 (future stars enter young)
  //   mid   → 70 % chance 18–20, 30 % chance 21–22
  //   low   → 50 % chance 19–20, 50 % chance 21–22
  let age;
  if (tier === "elite") {
    age = ri(18, 20);
  } else if (tier === "mid") {
    age = Math.random() < 0.70 ? ri(18, 20) : ri(21, 22);
  } else {
    age = Math.random() < 0.50 ? ri(19, 20) : ri(21, 22);
  }

  // Role
  const role = Math.random() < 0.55 ? "SMG" : "AR";

  // Region — random draw from weighted pool
  const region = _REGIONS[Math.floor(Math.random() * _REGIONS.length)];

  // Primary role within the weapon class
  const smgPrimaries = ["Entry SMG", "Slayer SMG"];
  const arPrimaries  = ["Main AR", "Flex", "Objective", "Search Specialist"];
  const priPool = role === "SMG" ? smgPrimaries : arPrimaries;
  const primary = priPool[Math.floor(rng() * priPool.length)];

  const allPrimaries = ["Entry SMG","Slayer SMG","Flex","Main AR","Objective","Search Specialist"];
  const secondary = allPrimaries[Math.floor(rng() * allPrimaries.length)];

  // Archetype — skew toward raw_upside for youth
  const eliteArchPool = ["raw_upside","raw_upside","raw_upside","smg_heavy","ar_flex","risky_ego"];
  const midArchPool   = ["raw_upside","raw_upside","polished","smg_heavy","ar_flex","glue","search_spec"];
  const lowArchPool   = ["polished","polished","glue","obj_spec","ar_flex","smg_heavy"];
  const archPool = tier === "elite" ? eliteArchPool : tier === "mid" ? midArchPool : lowArchPool;
  const archetype = archPool[Math.floor(rng() * archPool.length)];

  // Development curve
  const curvePick = rng();
  const developmentCurve = curvePick < 0.25 ? "early" : curvePick < 0.75 ? "standard" : "late";

  // Overall + potential per tier
  // Tier A (elite): clear future-star profile — 76–82 OVR, 85+ potential
  // Tier B (mid):   solid prospects         — 68–75 OVR, 78–87 potential
  // Tier C (low):   filler depth            — 60–67 OVR, 65–78 potential
  let overall, potential;
  if (tier === "elite") {
    overall   = ri(76, 82);
    potential = clamp(overall + ri(8, 13), 85, 92);
  } else if (tier === "mid") {
    overall   = ri(68, 75);
    potential = clamp(overall + ri(8, 14), 78, 87);
  } else {
    overall   = ri(60, 67);
    potential = clamp(overall + ri(5, 12), 65, 78);
  }

  // Individual stats
  const isSmg    = primary === "Entry SMG" || primary === "Slayer SMG";
  const isSearch = primary === "Search Specialist";
  const isObj    = primary === "Objective";

  const gunny        = clamp(overall + (isSmg    ? ri(2, 10)  : ri(-7, 4)));
  const awareness    = clamp(overall + (isSearch ? ri(4, 12)  : ri(-6, 6)));
  const objective    = clamp(overall + (isObj    ? ri(4, 12)  : ri(-7, 5)));
  const searchIQ     = clamp(overall + (isSearch ? ri(6, 14)  : ri(-6, 6)));
  const clutch       = clamp(overall + ri(-8,  8));
  const teamwork     = clamp(overall + ri(-10, 10));
  const composure    = clamp(overall + ri(-10, 8));
  const adaptability = clamp(overall + ri(-8,  10));

  // Mental traits (1–5)
  const ego            = ri(1, 5);
  const workEthic      = ri(1, 5);
  const tiltResistance = ri(1, 5);
  const leadership     = ri(1, 5);
  const metaDependence = ri(1, 5);

  // Salary (prospect formula matching prospects.js)
  const salary = Math.round((overall / 99) * 50 + 15) * 1000;

  // Scouted estimates with noise
  const scoutedOverall   = clamp(overall   + ri(-8, 8),  40, 99);
  const scoutedPotential = clamp(potential + ri(-6, 6),  40, 99);

  return {
    id:              `prospect_gen_${season}_${idx}_${tierSeed}`,
    name,
    age,
    role,
    region,
    teamId:          null,
    primary,
    secondary,
    archetype,
    developmentCurve,
    salary,
    overall,
    potential,
    gunny,
    awareness,
    objective,
    searchIQ,
    clutch,
    teamwork,
    composure,
    adaptability,
    ego,
    workEthic,
    tiltResistance,
    leadership,
    metaDependence,
    scoutedOverall,
    scoutedPotential,
    scouted:         false,
    form:            65,
    experience:      0,
    isProspect:      true,
  };
}

// Cleans up stale unsigned challengers and injects a fresh annual class.
// Only operates on the prospects array (unsigned challengers).
// Signed prospects are in gameState.players and are never touched here.
//
// Pool targets: minimum 150  |  fill target 175  |  hard cap 200
// Cleanup removes only clearly weak older players; 75+ OVR are shielded until 32.
// Annual intake: ~15 youth (2–3 Tier A elite, 8–10 Tier B mid, 3–5 Tier C low).
// Top-up batch fires when pool < 150 after annual class, adds mid/low to reach 175.
export function refreshProspectPool(prospects, season) {
  // ── Step 1: Remove old / weak unsigned challengers ───────────────────────
  // Philosophy: only remove players who are clearly washed and too old to develop.
  // Strong unsigned challengers (75+ OVR) are kept regardless of age below 32
  // because they are still valuable signings and interesting for the ecosystem.
  const cleaned = prospects.filter(p => {
    const age = p.age || 20;
    const ovr = p.overall || 70;

    // Shield: strong (75+ OVR) unsigned players kept until 32 — still valuable depth
    if (ovr >= 75 && age < 32) return true;

    // Hard rules — always gone
    if (age >= 30 && ovr < 68) return false;   // old and washed
    if (age >= 28 && ovr < 63) return false;   // older and weak

    // Age 27+ and not strong: 80 % chance to leave the scene
    // (unsigned at 27 with sub-75 OVR — extremely unlikely to ever get signed)
    if (age >= 27 && Math.random() < 0.80) return false;

    // Age 25+ and OVR ≤ 62: clear dead-end, 70 % chance to walk away
    if (age >= 25 && ovr <= 62 && Math.random() < 0.70) return false;

    // Age 26+ and below 68 OVR — 60 % chance (existing soft rule)
    if (age >= 26 && ovr < 68 && Math.random() < 0.60) return false;

    // Age 24+ and below 60 OVR — 50 % chance (existing soft rule)
    if (age >= 24 && ovr < 60 && Math.random() < 0.50) return false;

    return true;
  });

  // ── Step 2: Generate this season's incoming class ────────────────────────
  // Annual youth intake: 2–4 elite, 4–6 mid, rest low — always runs.
  // If the pool is still below the minimum target after the class is added,
  // a top-up batch of mid/low players fills it up to the target fill level.
  const POOL_MIN    = 150; // trigger top-up below this
  const POOL_TARGET = 175; // fill up to this when topping up

  // Annual class: ~15 total in three tiers matching user spec
  //   Tier A (elite): 2–3 — rare future stars (18–20, OVR 76–82, POT 85+)
  //   Tier B (mid):   8–10 — main bulk of class (18–22, OVR 68–75)
  //   Tier C (low):   3–5 — depth filler (19–22, OVR 60–67)
  const eliteCount = Math.floor(Math.random() * 2) + 2;   // 2–3
  const midCount   = Math.floor(Math.random() * 3) + 8;   // 8–10
  const lowCount   = Math.floor(Math.random() * 3) + 3;   // 3–5

  const newClass = [];
  let idx = 0;
  for (let i = 0; i < eliteCount; i++) newClass.push(_buildFreshProspect("elite", idx++, season));
  for (let i = 0; i < midCount;   i++) newClass.push(_buildFreshProspect("mid",   idx++, season));
  for (let i = 0; i < lowCount;   i++) newClass.push(_buildFreshProspect("low",   idx++, season));

  // Top-up: if pool is below POOL_MIN, add a mix of mid/low prospects to reach
  // POOL_TARGET. No bonus elites — those are rare and only come via the annual class.
  const afterAnnual = cleaned.length + newClass.length;
  let topUpCount = 0;
  if (afterAnnual < POOL_MIN) {
    const needed = POOL_TARGET - afterAnnual;
    topUpCount = needed;
    for (let i = 0; i < needed; i++) {
      const tier = Math.random() < 0.30 ? "mid" : "low";
      newClass.push(_buildFreshProspect(tier, idx++, season));
    }
  }

  // ── Step 3: Combine + enforce pool cap (max 200) ─────────────────────────
  const HARD_CAP = 200;
  const combined = [...cleaned, ...newClass];

  let finalProspects;
  let removedByCap = 0;

  if (combined.length <= HARD_CAP) {
    finalProspects = combined;
  } else {
    removedByCap = combined.length - HARD_CAP;
    // Over cap: sort weakest-and-oldest to front so they are trimmed first.
    // Strong players (75+ OVR) are always protected — they sort to the back.
    const sorted = [...combined].sort((a, b) => {
      const ovrA = a.overall || 70, ovrB = b.overall || 70;
      const ageA = a.age    || 20, ageB = b.age    || 20;
      const strongA = ovrA >= 75 ? 1 : 0;
      const strongB = ovrB >= 75 ? 1 : 0;
      if (strongA !== strongB) return strongA - strongB;
      if (ageA !== ageB) return ageB - ageA;
      return ovrA - ovrB;
    });
    finalProspects = sorted.slice(combined.length - HARD_CAP);
  }

  return {
    prospects: finalProspects,
    metrics: {
      beforeCleanup:    prospects.length,
      removedByCleanup: prospects.length - cleaned.length,
      annualIntake:     eliteCount + midCount + lowCount,
      topUpCount,
      removedByCap,
      afterCount:       finalProspects.length,
    },
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────
function buildTeamObj(teamId, gameState) {
  const eventTeam = gameState.schedule?.currentMajorEventTeams?.[teamId];
  if (eventTeam) return { id: eventTeam.id, name: eventTeam.name, players: eventTeam.players || [] };
  const meta    = CDL_TEAMS.find(t => t.id === teamId) ?? { id: teamId, name: teamId };
  const players = (gameState.players || []).filter(p => p.teamId === teamId);
  return { id: meta.id, name: meta.name, players };
}

// Non-seeded form update for interactive match results (mirrors updateForm logic).
function _updateFormSimple(players, won) {
  for (const p of players) {
    const base       = won ? (Math.floor(Math.random() * 7) + 2) : -(Math.floor(Math.random() * 7) + 2);
    const resistance = (p.tiltResistance || 2) - 1;
    const adjusted   = won ? base : Math.max(base + resistance * 2, -12);
    p.form = Math.max(30, Math.min(100, (p.form || 70) + adjusted));
  }
}

// ── Commit interactive user match result ──────────────────────────────────────
// Called after the MatchCenterOverlay finishes. Applies the user's match result
// to the game state exactly as simMatch would, then finishes the rest of the
// matchday / advances the bracket as appropriate.
//
// result — full simMatch-shaped object produced by MatchCenterOverlay
export function commitUserMatchResult(state, result) {
  const schedule = state.schedule;
  if (!schedule) return state;

  // ── Stage phase ─────────────────────────────────────────────────────────────
  if (schedule.phase === "stage") {
    const { userTeamId } = state;
    const stage = schedule.stages[schedule.stageIdx];

    // 1. Find and mark the user's match as played
    const allUnplayed = stage.matches
      .map((m, i) => (!m.played ? i : -1))
      .filter(i => i !== -1);

    const userMatchIdx = allUnplayed.find(
      i => stage.matches[i].a === userTeamId || stage.matches[i].b === userTeamId
    ) ?? -1;

    if (userMatchIdx >= 0) {
      const m = stage.matches[userMatchIdx];
      m.played = true;
      m.result = result;
    }

    // 2. Update standings for the user's match
    schedule.standings[result.winnerId].wins++;
    schedule.standings[result.winnerId].points += 10;
    schedule.standings[result.loserId].losses++;
    schedule.stageStandings[result.winnerId].wins++;
    schedule.stageStandings[result.winnerId].points += 10;
    schedule.stageStandings[result.loserId].losses++;

    // 3. Push user match to matchLog
    schedule.matchLog.push({ ...result, stage: stage.name });

    // 4. Update form on both teams' starters
    const teamAWon = result.winnerId === result.teamAId;
    _updateFormSimple(state.players.filter(p => p.teamId === result.teamAId).slice(0, 4), teamAWon);
    _updateFormSimple(state.players.filter(p => p.teamId === result.teamBId).slice(0, 4), !teamAWon);

    // 5. Sim the remaining non-user matches in the same matchday batch
    const stillUnplayed = stage.matches
      .map((m, i) => (!m.played ? i : -1))
      .filter(i => i !== -1);

    const usedTeams   = new Set([result.teamAId, result.teamBId]);
    const todayIndices = [];

    for (const idx of stillUnplayed) {
      const { a, b } = stage.matches[idx];
      if (!usedTeams.has(a) && !usedTeams.has(b)) {
        todayIndices.push(idx);
        usedTeams.add(a);
        usedTeams.add(b);
      }
      if (todayIndices.length === 5) break; // user was 1st of 6
    }

    for (const idx of todayIndices) {
      const match = stage.matches[idx];
      if (match.played) continue;
      const seed  = schedule.season * 100_000 + schedule.stageIdx * 10_000 + idx;
      const teamA = buildTeamObj(match.a, state);
      const teamB = buildTeamObj(match.b, state);
      const res   = simMatch(teamA, teamB, seed);

      match.played = true;
      match.result = res;

      schedule.standings[res.winnerId].wins++;
      schedule.standings[res.winnerId].points += 10;
      schedule.standings[res.loserId].losses++;
      schedule.stageStandings[res.winnerId].wins++;
      schedule.stageStandings[res.winnerId].points += 10;
      schedule.stageStandings[res.loserId].losses++;
      schedule.matchLog.push({ ...res, stage: stage.name });
    }

    // 6. Advance to major if stage is done
    if (stage.matches.every(m => m.played)) {
      enterChallengerQualifierPhase(state, schedule);
    }

    schedule.currentMatchday++;
    return { ...state, schedule: { ...schedule } };
  }

  // ── Major phase ─────────────────────────────────────────────────────────────
  if (schedule.phase === "major") {
    const bracket = schedule.majors[schedule.majorIdx]?.bracket;
    const isDE    = bracket?.type === "DE";

    const { allComplete } = bracket?.type === "DE16"
      ? _simOneMajorMatchDE16(schedule, state, result)
      : isDE
      ? _simOneMajorMatchDE(schedule, state, result)
      : _simOneMajorMatch(schedule, state, result);

    // Update form on both teams' starters
    const teamAWon = result.winnerId === result.teamAId;
    _updateFormSimple(state.players.filter(p => p.teamId === result.teamAId).slice(0, 4), teamAWon);
    _updateFormSimple(state.players.filter(p => p.teamId === result.teamBId).slice(0, 4), !teamAWon);

    let nextState = state;
    if (allComplete || _resolveMajorCompletion(schedule.majors[schedule.majorIdx])) nextState = _advanceMajorPhase(schedule, state);

    return { ...nextState, schedule: { ...schedule } };
  }

  return state;
}
