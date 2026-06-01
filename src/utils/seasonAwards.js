import { CDL_TEAMS } from "../data/teams.js";
import { isCdlTeamId } from "./playerIdentity.js";
import { resolveTeamDisplay } from "./teamDisplay.js";

function kd(kills, deaths) {
  if (!kills && !deaths) return null;
  return deaths > 0 ? kills / deaths : kills;
}

function kdText(value) {
  return value == null || Number.isNaN(value) ? null : `${value.toFixed(2)} K/D`;
}

function roleOf(player, stat) {
  return player?.primary || player?.role || stat?.role || null;
}

function normalizeRole(role) {
  return String(role || "").toLowerCase().replace(/[^a-z]/g, "");
}

function awardId(season, key) {
  return `s${season}_${key}`;
}

function getAllPlayers(state) {
  return [...(state?.players || []), ...(state?.prospects || []), ...(state?.retiredPlayers || [])];
}

function findPlayer(state, playerId) {
  const id = String(playerId);
  return getAllPlayers(state).find(p => String(p.id) === id) || null;
}

function challengerTeamById(state, teamId) {
  return (state?.challengerTeams || []).find(t => t.id === teamId) || null;
}

function teamInfo(state, teamId) {
  if (!teamId) return null;
  const cdl = CDL_TEAMS.find(t => t.id === teamId);
  if (cdl) return cdl;
  const challenger = challengerTeamById(state, teamId);
  if (challenger) return challenger;
  for (const q of state?.schedule?.challengerQualifierResults || []) {
    const row = (q.teams || []).find(t => t.teamId === teamId);
    if (row) return { id: teamId, name: row.teamName || teamId, tag: row.tag || String(teamId).slice(0, 3).toUpperCase(), logo: row.logo, color: row.color };
  }
  return resolveTeamDisplay(teamId, state?.schedule);
}

function buildPlayerAward(state, season, key, name, candidate, contextParts = []) {
  if (!candidate) return null;
  const player = findPlayer(state, candidate.playerId);
  const teamId = candidate.teamId || player?.teamId || player?.challengerTeamId || null;
  const team = teamInfo(state, teamId);
  const context = contextParts.filter(Boolean).join(", ");
  return {
    id: awardId(season, key),
    season,
    key,
    type: "player",
    awardName: name,
    playerId: String(candidate.playerId),
    playerName: candidate.playerName || player?.name || String(candidate.playerId),
    teamId,
    teamName: team?.name || teamId || null,
    teamTag: team?.tag || null,
    role: candidate.role || roleOf(player, candidate) || null,
    kd: candidate.kd ?? null,
    maps: candidate.maps ?? null,
    score: candidate.awardScore ?? candidate.score ?? null,
    context,
  };
}

function buildTeamAward(state, season, key, name, candidate, contextParts = []) {
  if (!candidate) return null;
  const team = teamInfo(state, candidate.teamId);
  return {
    id: awardId(season, key),
    season,
    key,
    type: "team",
    awardName: name,
    teamId: candidate.teamId,
    teamName: candidate.teamName || team?.name || candidate.teamId,
    teamTag: candidate.teamTag || team?.tag || null,
    context: contextParts.filter(Boolean).join(", "),
  };
}

function aggregateCdlPlayerStats(state) {
  const cdlIds = new Set(CDL_TEAMS.map(t => t.id));
  const players = getAllPlayers(state);
  const rows = new Map();
  const majorWins = new Map();
  const champsWinner = state?.schedule?.majors?.[4]?.bracket?.champion || null;
  const standingsRows = Object.values(state?.schedule?.standings || {})
    .filter(r => r?.teamId && cdlIds.has(r.teamId))
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.wins || 0) - (a.wins || 0));
  const teamRanks = new Map(standingsRows.map((row, idx) => [row.teamId, idx + 1]));
  const teamPoints = new Map(standingsRows.map(row => [row.teamId, row.points || 0]));
  for (const major of (state?.schedule?.majors || []).slice(0, 4)) {
    const champ = major?.bracket?.champion;
    if (champ) majorWins.set(champ, (majorWins.get(champ) || 0) + 1);
  }

  for (const match of state?.schedule?.matchLog || []) {
    for (const [playerId, stat] of Object.entries(match.playerStats || {})) {
      if (!cdlIds.has(stat.teamId)) continue;
      const player = players.find(p => String(p.id) === String(playerId));
      const id = String(playerId);
      if (!rows.has(id)) {
        rows.set(id, {
          playerId: id,
          playerName: stat.name || player?.name || id,
          teamId: stat.teamId,
          role: roleOf(player, stat),
          age: player?.age ?? null,
          isProspect: !!player?.isProspect,
          kills: 0,
          deaths: 0,
          matches: 0,
          maps: 0,
          majorWins: 0,
          overall: player?.overall ?? null,
          potential: player?.potential ?? null,
          isCdlRookie: false,
        });
      }
      const row = rows.get(id);
      row.kills += stat.kills || 0;
      row.deaths += stat.deaths || 0;
      row.matches += 1;
      row.maps += match.mapResults?.length || 0;
      row.teamId = stat.teamId || row.teamId;
      row.role = row.role || roleOf(player, stat);
    }
  }

  for (const row of rows.values()) {
    row.kd = kd(row.kills, row.deaths);
    row.majorWins = majorWins.get(row.teamId) || 0;
    row.teamRank = teamRanks.get(row.teamId) || null;
    row.teamPoints = teamPoints.get(row.teamId) || 0;
    row.champsWin = champsWinner && row.teamId === champsWinner ? 1 : 0;
    row.sample = row.maps || row.matches;
    row.isCdlRookie = isRookieEligible(findPlayer(state, row.playerId), state?.schedule?.season ?? state?.season ?? 1, state, row);
    row.score = mvpScore(row);
  }
  return [...rows.values()].filter(r => r.matches >= 3 && r.kd != null);
}

function aggregateChallengerStats(state) {
  const players = getAllPlayers(state);
  const rows = new Map();
  const teamStats = new Map();

  for (const q of state?.schedule?.challengerQualifierResults || []) {
    for (const team of q.teams || []) {
      const id = team.teamId;
      if (!id) continue;
      if (!teamStats.has(id)) teamStats.set(id, { teamId: id, teamName: team.teamName, teamTag: team.tag, qualifierWins: 0, majorQualifications: 0, circuitPoints: 0, placements: [] });
      const row = teamStats.get(id);
      if (Number(team.placement) === 1) row.qualifierWins += 1;
      if (team.qualified) row.majorQualifications += 1;
      row.circuitPoints += team.circuitPointsAwarded || 0;
      if (team.placement != null) row.placements.push(team.placement);
    }
    for (const qMatch of q.matchLog || []) {
      const result = qMatch.result || qMatch;
      for (const [playerId, stat] of Object.entries(result.playerStats || {})) {
        const qr = (q.teams || []).find(t => t.teamId === stat.teamId || (t.rosterIds || []).map(String).includes(String(playerId)));
        const teamId = stat.teamId || qr?.teamId;
        const player = players.find(p => String(p.id) === String(playerId));
        const id = String(playerId);
        if (!rows.has(id)) rows.set(id, { playerId: id, playerName: stat.name || player?.name || id, teamId, role: roleOf(player, stat), kills: 0, deaths: 0, matches: 0, majorQualifications: 0 });
        const row = rows.get(id);
        row.kills += stat.kills || 0;
        row.deaths += stat.deaths || 0;
        row.matches += 1;
        row.teamId = teamId || row.teamId;
        row.role = row.role || roleOf(player, stat);
      }
    }
  }

  for (const row of rows.values()) {
    row.kd = kd(row.kills, row.deaths);
    const team = teamStats.get(row.teamId);
    row.majorQualifications = team?.majorQualifications || 0;
    row.score = (row.kd ?? 0) * 100 + Math.min(row.matches, 20) + row.majorQualifications * 8;
  }
  for (const row of teamStats.values()) {
    row.score = row.circuitPoints + row.majorQualifications * 20 + row.qualifierWins * 15;
  }
  return { players: [...rows.values()].filter(r => r.matches >= 2 && r.kd != null), teams: [...teamStats.values()] };
}

function bestBy(rows, predicate, score = row => row.score ?? row.kd ?? 0) {
  return rows.filter(predicate).sort((a, b) => score(b) - score(a))[0] || null;
}

const ROLE_MIN_MAPS = 25;
const ROOKIE_MIN_CDL_MAPS = 10;
const ROLE_STRONG_KD = 1.03;
const ROLE_POSITIVE_KD = 1.0;

function sampleFor(row) {
  return Number(row?.maps || 0) || Number(row?.matches || 0) || 0;
}

function teamRankBonus(row, max = 8) {
  if (!row?.teamRank) return 0;
  return Math.max(0, max - (row.teamRank - 1) * (max / 11));
}

function mvpScore(row) {
  const kdValue = row?.kd ?? 0;
  const sampleBonus = Math.min(sampleFor(row), 70) * 0.45;
  const successBonus = teamRankBonus(row, 18) + (row?.majorWins || 0) * 8 + (row?.champsWin ? 10 : 0);
  const ovrBonus = Math.max(0, ((row?.overall || 70) - 70) * 0.2);
  const negativePenalty = kdValue < 1 ? (1 - kdValue) * 80 : 0;
  return kdValue * 100 + sampleBonus + successBonus + ovrBonus - negativePenalty;
}

function roleAwardScore(row) {
  const kdValue = row?.kd ?? 0;
  const sampleBonus = Math.min(sampleFor(row), 75) * 0.22;
  const teamBonus = teamRankBonus(row, 7);
  const trophyBonus = (row?.majorWins || 0) * 3 + (row?.champsWin ? 3 : 0);
  const ovrTiebreak = Math.max(0, ((row?.overall || 70) - 70) * 0.05);
  const negativePenalty = kdValue < ROLE_POSITIVE_KD ? (ROLE_POSITIVE_KD - kdValue) * 120 : 0;
  return kdValue * 160 + sampleBonus + teamBonus + trophyBonus + ovrTiebreak - negativePenalty;
}

function pickRoleAward(rows, rolePredicate, label) {
  const roleRows = rows.filter(rolePredicate).filter(r => r.kd != null);
  const meaningfulRows = roleRows.filter(r => sampleFor(r) >= ROLE_MIN_MAPS);
  const poolBase = meaningfulRows.length ? meaningfulRows : roleRows;
  const strongPool = poolBase.filter(r => (r.kd ?? 0) >= ROLE_STRONG_KD);
  const positivePool = poolBase.filter(r => (r.kd ?? 0) >= ROLE_POSITIVE_KD);
  const awardPool = strongPool.length >= 2 ? strongPool : positivePool.length ? positivePool : poolBase;
  const ranked = [...awardPool]
    .map(r => ({ ...r, awardScore: roleAwardScore(r), eligibilityNote: awardPool === strongPool ? `K/D ≥ ${ROLE_STRONG_KD.toFixed(2)}` : awardPool === positivePool ? `K/D ≥ ${ROLE_POSITIVE_KD.toFixed(2)}` : "fallback pool" }))
    .sort((a, b) => b.awardScore - a.awardScore || (b.kd ?? 0) - (a.kd ?? 0));
  const diagnostics = [...poolBase]
    .map(r => ({ ...r, awardScore: roleAwardScore(r) }))
    .sort((a, b) => b.awardScore - a.awardScore || (b.kd ?? 0) - (a.kd ?? 0))
    .slice(0, 5);
  return { winner: ranked[0] || null, diagnostics, label, usedFallback: !strongPool.length && !positivePool.length };
}


function playerIdOf(playerOrId) {
  return String(typeof playerOrId === "object" ? playerOrId?.id : playerOrId);
}

function awardIsRookieOfYear(award) {
  return award?.key === "rookie_of_year" || String(award?.awardName || "").toLowerCase() === "rookie of the year";
}

function hasWonRookieOfYear(playerId, season, state) {
  const id = String(playerId);
  const awardRows = [
    ...(state?.awards || []),
    ...(state?.seasonHistory || []).flatMap(s => s?.awards || []),
    ...(state?.playerCareerHistory || []).flatMap(s => s?.awards || []),
  ];
  return awardRows.some(award => (
    awardIsRookieOfYear(award)
    && String(award.playerId) === id
    && Number(award.season ?? season) <= Number(season)
  ));
}

function currentSeasonCdlStats(playerId, season, state) {
  const id = String(playerId);
  const out = { maps: 0, kills: 0, deaths: 0, matches: 0, teamIds: new Set() };
  for (const match of state?.schedule?.matchLog || []) {
    const matchSeason = Number(match.season ?? state?.schedule?.season ?? state?.season ?? season);
    if (Number(matchSeason) !== Number(season)) continue;
    const stat = match.playerStats?.[id];
    if (!stat || !isCdlTeamId(stat.teamId)) continue;
    out.maps += match.mapResults?.length || 0;
    out.kills += stat.kills || 0;
    out.deaths += stat.deaths || 0;
    out.matches += 1;
    out.teamIds.add(stat.teamId);
  }
  out.kd = kd(out.kills, out.deaths);
  return out;
}

function priorCdlMapsBySeason(playerId, season, state) {
  const id = String(playerId);
  const mapsBySeason = new Map();
  const add = (rowSeason, teamId, maps) => {
    const s = Number(rowSeason);
    if (!Number.isFinite(s) || s >= Number(season) || !isCdlTeamId(teamId)) return;
    mapsBySeason.set(s, (mapsBySeason.get(s) || 0) + (Number(maps) || 0));
  };

  for (const snapshot of state?.playerCareerHistory || []) {
    if (String(snapshot?.playerId) !== id) continue;
    for (const event of snapshot.events || []) add(event.season ?? snapshot.season, event.teamId, event.maps);
    if (isCdlTeamId(snapshot.teamId)) add(snapshot.season, snapshot.teamId, snapshot.maps);
    if (!(snapshot.events || []).length) {
      const cdlTeam = (snapshot.teams || []).find(isCdlTeamId);
      if (cdlTeam) add(snapshot.season, cdlTeam, snapshot.maps);
    }
  }

  for (const match of state?.schedule?.matchLog || []) {
    const matchSeason = Number(match.season ?? state?.schedule?.season ?? state?.season ?? season);
    const stat = match.playerStats?.[id];
    if (!stat) continue;
    add(matchSeason, stat.teamId, match.mapResults?.length || 0);
  }

  return mapsBySeason;
}

export function isRookieEligible(player, season, state, currentStats = null) {
  const id = playerIdOf(player);
  if (!id || id === "undefined" || id === "null") return false;
  if (hasWonRookieOfYear(id, season, state)) return false;

  const current = currentStats && String(currentStats.playerId) === id
    ? currentStats
    : currentSeasonCdlStats(id, season, state);
  const currentMaps = Number(current?.cdlMaps ?? current?.maps ?? 0);
  const currentTeamIsCdl = isCdlTeamId(player?.teamId);
  const hasCurrentCdlTeamMaps = currentMaps >= ROOKIE_MIN_CDL_MAPS;
  if (!hasCurrentCdlTeamMaps || (!currentTeamIsCdl && !current?.teamIds?.size && !isCdlTeamId(current?.teamId))) return false;

  const priorMaps = priorCdlMapsBySeason(id, season, state);
  for (const maps of priorMaps.values()) {
    if (maps >= ROOKIE_MIN_CDL_MAPS) return false;
  }
  return true;
}

function rookieScore(row) {
  const kdValue = row?.kd ?? 0;
  const sampleBonus = Math.min(sampleFor(row), 60) * 0.3;
  const successBonus = teamRankBonus(row, 8) + (row?.majorWins || 0) * 4 + (row?.champsWin ? 4 : 0);
  const upsideTiebreak = Math.max(0, ((row?.potential || row?.overall || 70) - 70) * 0.08);
  return kdValue * 120 + sampleBonus + successBonus + upsideTiebreak;
}

function logRoleDiagnostics(season, roleResults) {
  if (typeof console === "undefined") return;
  for (const result of roleResults) {
    if (!result?.diagnostics?.length) continue;
    console.info(`[season-awards] Season ${season} ${result.label} top candidates`);
    const rows = result.diagnostics.map(r => ({
      player: r.playerName,
      team: teamInfo({ schedule: {} }, r.teamId)?.tag || r.teamId,
      role: r.role,
      kd: r.kd?.toFixed?.(2) ?? r.kd,
      maps: r.maps || r.matches,
      teamResult: r.teamRank ? `#${r.teamRank}` : "—",
      majorWins: r.majorWins || 0,
      score: Number(r.awardScore || 0).toFixed(1),
    }));
    console.table(rows);
  }
}

function finalMatchResult(major) {
  const rounds = major?.bracket?.rounds || [];
  const gf = rounds.find(r => r.type === "GF" || r.name === "Grand Final") || rounds.at(-1);
  return gf?.matches?.[0]?.result || null;
}

function majorMvpAward(state, season, major, idx, keyPrefix = "major") {
  const result = finalMatchResult(major);
  if (!result?.standoutId) return null;
  return buildPlayerAward(state, season, `${keyPrefix}_${idx + 1}_mvp`, `${major?.name || `Major ${idx + 1}`} MVP`, {
    playerId: result.standoutId,
    playerName: result.standoutName,
    teamId: result.winnerId,
    kd: result.standoutKD,
  }, [kdText(result.standoutKD), result.winnerName ? `${result.winnerName} winner` : null]);
}

export function calculateSeasonAwards(gameState) {
  const season = gameState?.schedule?.season ?? gameState?.season ?? 1;
  const cdl = aggregateCdlPlayerStats(gameState);
  const challenger = aggregateChallengerStats(gameState);
  const awards = [];

  const mvpPool = cdl.filter(r => sampleFor(r) >= ROLE_MIN_MAPS && (r.kd ?? 0) >= 1.03);
  const mvp = bestBy(mvpPool.length ? mvpPool : cdl, () => true, mvpScore);
  const rookiePool = cdl.filter(r => r.isCdlRookie && sampleFor(r) >= ROOKIE_MIN_CDL_MAPS);
  const rookie = bestBy(rookiePool, () => true, rookieScore);
  const mainArResult = pickRoleAward(cdl, r => normalizeRole(r.role).includes("mainar") || normalizeRole(r.role) === "ar", "Best Main AR");
  const flexResult = pickRoleAward(cdl, r => normalizeRole(r.role).includes("flex"), "Best Flex");
  const entryResult = pickRoleAward(cdl, r => normalizeRole(r.role).includes("entry"), "Best Entry SMG");
  const slayerResult = pickRoleAward(cdl, r => normalizeRole(r.role).includes("slayersmg") || normalizeRole(r.role) === "slayer", "Best Slayer SMG");
  const mainAr = mainArResult.winner;
  const flex = flexResult.winner;
  const entry = entryResult.winner;
  const slayer = slayerResult.winner;
  const roleResults = [mainArResult, flexResult, entryResult, slayerResult];
  logRoleDiagnostics(season, roleResults);
  const challengerPoty = bestBy(challenger.players, () => true);
  const challengerTeam = bestBy(challenger.teams, () => true);
  const champsMvp = majorMvpAward(gameState, season, gameState?.schedule?.majors?.[4], 4, "champs");
  // ESWC MVP — separate event award, only when ESWC has been completed. Awards
  // now run after ESWC, so this surfaces alongside Champs MVP without affecting
  // Season MVP / Rookie / role / Major MVP selection logic.
  const eswcMajor = gameState?.schedule?.majors?.[5];
  const eswcMvp = eswcMajor?.completed ? majorMvpAward(gameState, season, eswcMajor, 5, "eswc") : null;

  const playerContext = r => [kdText(r?.kd), r?.maps ? `${r.maps} maps` : null, r?.teamRank ? `team rank #${r.teamRank}` : null, r?.majorWins ? `${r.majorWins} Major win${r.majorWins === 1 ? "" : "s"}` : null];
  const rookieContext = r => [kdText(r?.kd), r?.maps ? `${r.maps} CDL maps` : null, "first CDL-team season", r?.teamRank ? `team rank #${r.teamRank}` : null, r?.majorWins ? `${r.majorWins} Major win${r.majorWins === 1 ? "" : "s"}` : null];
  const roleContext = r => [kdText(r?.kd), r?.maps ? `${r.maps} maps` : null, r?.eligibilityNote, r?.teamRank ? `team rank #${r.teamRank}` : null, r?.majorWins ? `${r.majorWins} Major win${r.majorWins === 1 ? "" : "s"}` : null];
  awards.push(buildPlayerAward(gameState, season, "season_mvp", "Season MVP", mvp, playerContext(mvp)));
  awards.push(buildPlayerAward(gameState, season, "rookie_of_year", "Rookie of the Year", rookie, rookieContext(rookie)));
  awards.push(buildPlayerAward(gameState, season, "best_main_ar", "Best Main AR", mainAr, roleContext(mainAr)));
  awards.push(buildPlayerAward(gameState, season, "best_flex", "Best Flex", flex, roleContext(flex)));
  awards.push(buildPlayerAward(gameState, season, "best_entry_smg", "Best Entry SMG", entry, roleContext(entry)));
  awards.push(buildPlayerAward(gameState, season, "best_slayer_smg", "Best Slayer SMG", slayer, roleContext(slayer)));
  awards.push(buildPlayerAward(gameState, season, "challenger_poty", "Challenger Player of the Year", challengerPoty, [kdText(challengerPoty?.kd), challengerPoty?.majorQualifications ? `${challengerPoty.majorQualifications} Major qualification${challengerPoty.majorQualifications === 1 ? "" : "s"}` : null]));
  awards.push(buildTeamAward(gameState, season, "challenger_team_of_year", "Challenger Team of the Year", challengerTeam, [challengerTeam?.qualifierWins ? `${challengerTeam.qualifierWins} qualifier win${challengerTeam.qualifierWins === 1 ? "" : "s"}` : null, challengerTeam?.majorQualifications ? `${challengerTeam.majorQualifications} Major qualification${challengerTeam.majorQualifications === 1 ? "" : "s"}` : null]));
  awards.push(champsMvp ? { ...champsMvp, awardName: "Champs MVP", key: "champs_mvp", id: awardId(season, "champs_mvp") } : null);
  awards.push(eswcMvp ? { ...eswcMvp, awardName: "ESWC MVP", key: "eswc_mvp", id: awardId(season, "eswc_mvp") } : null);

  const majorMvps = (gameState?.schedule?.majors || []).slice(0, 4).map((major, idx) => majorMvpAward(gameState, season, major, idx)).filter(Boolean);

  return {
    season,
    title: `Season ${season} Awards`,
    awards: awards.filter(Boolean),
    majorMvps,
    diagnostics: {
      roleRankings: Object.fromEntries(roleResults.map(result => [result.label, result.diagnostics.map(r => ({
        player: r.playerName,
        team: r.teamId,
        role: r.role,
        kd: r.kd,
        maps: r.maps || r.matches,
        teamRank: r.teamRank,
        majorWins: r.majorWins || 0,
        score: Number((r.awardScore || 0).toFixed(2)),
      }))])),
    },
    createdAt: new Date().toISOString(),
  };
}

export function mergeSeasonAwards(gameState, seasonAwards) {
  if (!seasonAwards?.season) return gameState;
  const existing = Array.isArray(gameState.awards) ? gameState.awards.filter(Boolean) : [];
  const byId = new Map(existing.map(a => [a.id || `${a.season}_${a.key}_${a.playerId || a.teamId}`, a]));
  for (const award of [...(seasonAwards.awards || []), ...(seasonAwards.majorMvps || [])]) {
    byId.set(award.id || `${award.season}_${award.key}_${award.playerId || award.teamId}`, award);
  }
  const awards = [...byId.values()].sort((a, b) => Number(a.season) - Number(b.season));

  const decoratePlayer = (snapshot) => {
    const won = awards.filter(a => Number(a.season) === Number(snapshot.season) && a.type === "player" && String(a.playerId) === String(snapshot.playerId));
    return won.length ? { ...snapshot, awards: won } : { ...snapshot, awards: snapshot.awards ?? [] };
  };
  const decorateTeam = (snapshot) => {
    const won = awards.filter(a => Number(a.season) === Number(snapshot.season) && a.teamId && String(a.teamId) === String(snapshot.teamId));
    return won.length ? { ...snapshot, awards: won } : { ...snapshot, awards: snapshot.awards ?? [] };
  };

  return {
    ...gameState,
    awards,
    playerCareerHistory: (gameState.playerCareerHistory || []).map(decoratePlayer),
    teamCareerHistory: (gameState.teamCareerHistory || []).map(decorateTeam),
    seasonHistory: (gameState.seasonHistory || []).map(s => Number(s?.season) === Number(seasonAwards.season) ? { ...s, awards: seasonAwards.awards || [], majorMvps: seasonAwards.majorMvps || [] } : s),
  };
}
