import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry } from "./chemistry.js";

const PHILOSOPHIES = ["win_now", "youth_upside", "chemistry_stability", "balanced_value", "high_risk_gamble"];

// ── 1. Budget system ──────────────────────────────────────────────────────────
// Each franchise has a budgetTier (2–6) defined in teams.js.
// BUDGET_CAPS is the maximum combined signing cost for a 4-player starting lineup.
//
// getSigningCost() uses a power curve (exponent 2.5) that keeps low/mid players
// affordable while making elite signings genuinely expensive:
//   70 OVR → ~$25k   75 OVR → ~$32k   80 OVR → ~$65k
//   85 OVR → ~$136k  88 OVR → ~$200k  90 OVR → ~$252k
//   93 OVR → ~$347k  99 OVR → $600k
//
// Challenger prospects remain cheap ($15k–$65k) so small orgs can build
// viable rosters through the challenger path.

const BUDGET_CAPS = {
  6: 1_500_000, // Riyadh Falcons only — highest budget in the CDL
  5: 1_150_000, // Top spenders (OpTic, FaZe, Paris) — star-heavy rosters
  4:   850_000, // Upper-mid orgs (LAT, Toronto, Miami, G2) — one star + depth
  3:   680_000, // (fallback default — no teams currently assigned here)
  2:   580_000, // Budget orgs (Boston, Carolina, Cloud9, VAN) — challenger path
};

export function getTeamBudgetTier(teamId) {
  return CDL_TEAMS.find(t => t.id === teamId)?.budgetTier ?? 3;
}

export function getTeamCap(teamId) {
  return BUDGET_CAPS[getTeamBudgetTier(teamId)] ?? 680_000;
}

// AI signing cost assessment (not the stored salary — a separate "market value").
// Uses the same power-curve formula as the displayed salary so AI budget logic
// and the free agency UI stay consistent.
export function getSigningCost(player) {
  const ovr = player.overall || 70;
  if (player.isProspect) {
    return Math.round((ovr / 99) * 50 + 15) * 1000; // $15k–$65k
  }
  const t = Math.max(0, ovr - 70) / 29;
  return Math.round((Math.pow(t, 2.5) * 575 + 25)) * 1000;
}

// Re-sign salary demand for deal lengths 1, 2, or 3 seasons.
// dealLength 1 = +1 yr (cheapest), 2 = baseline market, 3 = premium/discount.
// Deterministic — no randomness. Uses getSigningCost as the base.
export function getResignDemand(player, dealLength, playerSeasonStats, season) {
  let base = getSigningCost(player);

  // K/D modifier: current season performance shifts demand up or down
  const entry = (playerSeasonStats?.[player.id] ?? []).find(e => e.season === season);
  if (entry && entry.deaths > 0) {
    const kd = entry.kills / entry.deaths;
    if      (kd >= 1.5) base *= 1.10;
    else if (kd >= 1.3) base *= 1.05;
    else if (kd < 0.7)  base *= 0.90;
    else if (kd < 0.9)  base *= 0.95;
  }

  // Age modifier
  const age = player.age ?? 23;
  if      (age <= 22) base *= 1.05;
  else if (age >= 29) base *= 0.90;
  else if (age >= 27) base *= 0.95;

  // High-potential young player premium
  const pot = player.potential ?? 75;
  if (age <= 25) {
    if      (pot >= 92) base *= 1.08;
    else if (pot >= 85) base *= 1.03;
  }

  // Ego premium
  const ego = player.ego ?? 50;
  if      (ego >= 90) base *= 1.10;
  else if (ego >= 75) base *= 1.05;

  // Work ethic + leadership stability discount
  const stability = ((player.workEthic ?? 50) + (player.leadership ?? 50)) / 2;
  if (stability >= 75) base *= 0.98;

  // Contract length modifier relative to 2-yr baseline
  const isDecline = (age >= 28) && ((player.overall ?? 75) < 80);
  if (dealLength === 1) {
    base *= 0.90;                          // shorter → cheaper
  } else if (dealLength === 3) {
    base *= isDecline ? 0.95 : 1.12;      // declining → slight discount; others → premium
  }

  return Math.round(base / 5000) * 5000;
}

function getRosterSigningCost(players, teamId) {
  return getStarters(players, teamId)
    .reduce((sum, p) => sum + (p.salary ?? getSigningCost(p)), 0);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ── Per-save world nonce ───────────────────────────────────────────────────────
// Derives a unique integer from the prospect pool, which is seeded with
// Date.now() each new game (see gameStore newGameState). Mixing this into
// every team's roster seed breaks save-to-save determinism without requiring
// any changes to the game state structure.
function getWorldNonce(prospects) {
  if (!prospects || prospects.length === 0) return 0;
  return prospects.slice(0, 6).reduce((h, p) => (hashString(p.id) ^ ((h * 31) >>> 0)) >>> 0, 17);
}

// ── Philosophy-driven cut score modifier ─────────────────────────────────────
// Applied on top of the standard formula to make each team identity genuinely
// affect WHO they hold vs. who they release, not just who they sign.
//   youth_upside     → patient with young high-upside players
//   chemistry_stab.  → reluctant to cut high-teamwork players
//   win_now          → quicker to cut older/stagnant players
//   balanced_value   → mild patience with players showing upside
//   high_risk_gamble → no bias (relies on noise for variation)
function philosophyCutModifier(player, context) {
  const age     = player.age || 22;
  const overall = player.overall || 70;
  const upside  = (player.potential || overall) - overall;

  switch (context.philosophy) {
    case "youth_upside":
      if (age <= 21 && upside >= 5) return -15;
      if (age <= 23 && upside >= 5) return -8;
      if (age <= 23 && upside >= 3) return -4;
      return 0;

    case "chemistry_stability": {
      const tw = player.teamwork || 70;
      if (tw >= 82) return -10;
      if (tw >= 72) return -5;
      return 0;
    }

    case "win_now":
      if (age >= 28) return 5;
      if (overall <= 78 && age >= 26) return 4;
      return 0;

    case "balanced_value":
      return upside >= 4 ? -3 : 0;

    default:
      return 0;
  }
}

// ── Hesitation threshold ──────────────────────────────────────────────────────
// Minimum margin a player's score must exceed the eligibility threshold before
// a team acts confidently. Teams whose top cut candidate barely qualifies may
// hold instead of forcing the move. Philosophy shapes how decisive each team is.
function hesitationMargin(philosophy) {
  switch (philosophy) {
    case "chemistry_stability": return 10; // strong evidence required
    case "youth_upside":        return 7;
    case "balanced_value":      return 5;
    case "high_risk_gamble":    return 3;  // acts quickly on any weakness
    case "win_now":             return 2;  // most decisive
    default:                    return 5;
  }
}

// ── Weighted cut selection ────────────────────────────────────────────────────
// Picks `count` players to cut from the eligible pool using proportional
// weighting on cut score. Higher-scored players are still most likely to be
// cut, but players in similar score bands occasionally swap — preventing the
// same player from always being dropped across different saves.
function weightedCutSelect(eligibleWithScores, count, rng) {
  const pool     = [...eligibleWithScores];
  const selected = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, e) => sum + Math.max(1, e.cutScore), 0);
    let roll = rng() * totalWeight;
    let pick = pool[pool.length - 1]; // fallback
    for (const entry of pool) {
      roll -= Math.max(1, entry.cutScore);
      if (roll <= 0) { pick = entry; break; }
    }
    selected.push(pick.player);
    pool.splice(pool.indexOf(pick), 1);
  }
  return selected;
}

function ensureContexts(gameState) {
  const existing = gameState.teamContexts || {};
  const next = { ...existing };
  for (const team of CDL_TEAMS) {
    if (next[team.id]) continue;
    const base = hashString(team.id);
    const rng = seededRng(base);
    next[team.id] = {
      philosophy: PHILOSOPHIES[Math.floor(rng() * PHILOSOPHIES.length)],
      loyalty: 0.2 + rng() * 0.5,
      volatility: 0.1 + rng() * 0.8,
      challengerTrust: 0.15 + rng() * 0.7,
      pressure: 0,
    };
  }
  return next;
}

function getStarters(players, teamId) {
  const teamPlayers = players.filter(p => p.teamId === teamId && !p.isSub);
  if (teamPlayers.length <= 4) return teamPlayers;
  return [...teamPlayers].sort((a, b) => b.overall - a.overall).slice(0, 4);
}

function getMajorPlacement(schedule, teamId, majorIdx) {
  const major = schedule.majors?.[majorIdx];
  if (!major?.bracket) return 12;
  if (major.bracket.champion === teamId) return 1;

  const sfRound = major.bracket.rounds?.[1]?.matches || [];
  if (sfRound.some(m => m.played && (m.a === teamId || m.b === teamId) && m.result?.winnerId !== teamId)) return 3;

  const qfRound = major.bracket.rounds?.[0]?.matches || [];
  if (qfRound.some(m => m.played && (m.a === teamId || m.b === teamId))) return 5;

  return 9;
}

// ── Champion status detection ─────────────────────────────────────────────────
// Returns flags used to apply winning-team stability bias throughout the AI.
//   recentMajorWinner — won the specific major that just concluded
//   isChampion        — won any major this season (including earlier ones)
function getChampionStatus(teamId, gameState, majorIdx) {
  const majors = gameState.schedule?.majors || [];

  // Check the just-concluded major
  if (majorIdx != null) {
    const recent = getMajorPlacement(gameState.schedule, teamId, majorIdx);
    if (recent === 1) return { recentMajorWinner: true, isChampion: true };
  }

  // Check all other majors this season
  for (let i = 0; i < majors.length; i++) {
    if (i === majorIdx) continue;
    if (majors[i]?.bracket?.champion === teamId) {
      return { recentMajorWinner: false, isChampion: true };
    }
  }

  return { recentMajorWinner: false, isChampion: false };
}

// teamId is included in the returned object so downstream functions (budget
// checks, destination penalty) can look up franchise-specific data.
function evaluateTeam(teamId, gameState, windowType, majorIdx) {
  const starters = getStarters(gameState.players, teamId);
  const chemistry = starters.length ? calcChemistry(starters) : 40;
  const avgAge = starters.length ? starters.reduce((s, p) => s + (p.age || 22), 0) / starters.length : 22;
  const avgOverall = starters.length ? starters.reduce((s, p) => s + (p.overall || 70), 0) / starters.length : 70;
  const avgPotential = starters.length ? starters.reduce((s, p) => s + (p.potential || p.overall || 70), 0) / starters.length : 72;
  const upside = avgPotential - avgOverall;

  const standingsRows = Object.entries(gameState.schedule.standings || {}).sort((a, b) => b[1].points - a[1].points);
  const standingIdx = standingsRows.findIndex(([id]) => id === teamId);
  const standingRank = standingIdx === -1 ? 12 : standingIdx + 1;

  const majorPlacement = majorIdx == null ? 12 : getMajorPlacement(gameState.schedule, teamId, majorIdx);

  // Champion/winner status flags
  const { recentMajorWinner, isChampion } = getChampionStatus(teamId, gameState, majorIdx);
  const isTopPerformer = standingRank <= 4;

  let pressure = 0;
  pressure += (standingRank - 1) * 4.5;
  pressure += majorPlacement <= 1 ? -18 : majorPlacement <= 3 ? -7 : majorPlacement <= 5 ? 3 : 12;
  pressure += chemistry >= 80 ? -9 : chemistry >= 68 ? -2 : chemistry >= 55 ? 6 : 13;
  pressure += avgAge >= 27 ? 8 : avgAge >= 25 ? 3 : -2;
  pressure += upside >= 7 ? -6 : upside >= 4 ? -2 : 6;
  pressure += avgOverall >= 88 ? -8 : avgOverall <= 80 ? 7 : 0;

  // ── Winning-team stability bonus ─────────────────────────────────────────
  // Champions and top performers get significant extra pressure reduction so
  // the AI correctly models successful teams staying intact.
  if (recentMajorWinner) pressure -= 28;
  else if (isChampion) pressure -= 16;
  else if (isTopPerformer) pressure -= 8;

  // Chemistry / success protection: well-performing teams with good chemistry
  // should rarely make changes — penalise the pressure score further.
  if (chemistry >= 72 && isTopPerformer) pressure -= 6;

  if (windowType === "major") pressure *= 0.6;
  return {
    teamId, standingRank, majorPlacement, chemistry, avgAge, avgOverall, upside, pressure,
    recentMajorWinner, isChampion, isTopPerformer,
  };
}

function decideMoveCount(evaluation, context, rng, windowType) {
  const loyaltyAnchor = context.loyalty * 18;
  const volatilityKick = (rng() - 0.5) * 20 * context.volatility;
  const pressureNow = context.pressure * 0.55 + evaluation.pressure + volatilityKick - loyaltyAnchor;

  const baseNoMove = windowType === "major" ? 0.72 : 0.42;
  const smallMoveRate = windowType === "major" ? 0.2 : 0.34;
  const twoMoveRate = windowType === "major" ? 0.07 : 0.19;
  const resetRate = windowType === "major" ? 0.01 : 0.05;

  let noMove = baseNoMove - pressureNow / 140;
  let oneMove = smallMoveRate + pressureNow / 180;
  let twoMove = twoMoveRate + pressureNow / 210;
  let reset = resetRate + pressureNow / 260;

  // ── Winning-team stability floors ────────────────────────────────────────
  // A team that just won a Major should almost never make roster changes.
  // Champions from earlier this season also get a strong stability floor.
  if (evaluation.recentMajorWinner) {
    noMove = Math.max(noMove, 0.93);
  } else if (evaluation.isChampion) {
    noMove = Math.max(noMove, 0.85);
  } else if (evaluation.isTopPerformer) {
    noMove = Math.max(noMove, 0.78);
  }

  noMove = clamp(noMove, 0.05, 0.95);
  oneMove = clamp(oneMove, 0.08, 0.6);
  twoMove = clamp(twoMove, 0.02, 0.45);
  reset = clamp(reset, 0.005, 0.22);

  const total = noMove + oneMove + twoMove + reset;
  const roll = rng();
  const r0 = noMove / total;
  const r1 = r0 + oneMove / total;
  const r2 = r1 + twoMove / total;

  const moveCount = roll < r0 ? 0 : roll < r1 ? 1 : roll < r2 ? 2 : 3;
  return { moveCount, nextPressure: clamp(pressureNow * 0.65 + (moveCount === 0 ? 2 : -8), 0, 100) };
}

// ── Drop protection ───────────────────────────────────────────────────────────
// A player is protected from being cut if:
//   • OVR >= 87 (elite tier — stars should almost never be released)
//   • OR they are in the team's top 2 starters by OVR (top 3 for champion teams)
//   • OR the team is a recent major winner and the player is a core piece
//
// Protected players receive a near-zero or negative cut score.
// This ensures they can only be released when there is literally nobody else
// worse on the roster, preventing unrealistic star releases.
//
// Recent season K/D adds a performance modifier for unprotected players:
//   underperformers (< 0.88 K/D) cut more readily; strong performers less so.
function playerCutScore(player, evaluation, starters, playerSeasonStats, season) {
  const overall = player.overall || 70;
  const age     = player.age || 22;

  // ── Protection check ──────────────────────────────────────────────────────
  const sortedByOvr = [...starters].sort((a, b) => (b.overall || 70) - (a.overall || 70));

  // Champion teams protect their top 3 starters; all others protect top 2
  const protectedCount = evaluation.recentMajorWinner ? 3 : evaluation.isChampion ? 3 : 2;
  const isCorePlayer = sortedByOvr.slice(0, protectedCount).some(p => p.id === player.id);

  // Elite OVR threshold: 87+ is always fully protected regardless of team status
  const isElite = overall >= 87;

  if (isElite || isCorePlayer) {
    // Recent major winners: give their core players a strongly negative score
    // so they are genuinely last in line and virtually never cut
    if (evaluation.recentMajorWinner) return -20;
    if (evaluation.isChampion) return -10;
    // Allow only age-based micro-increases so truly ancient stars can eventually rotate out
    const ageMod = age >= 31 ? 6 : age >= 29 ? 3 : 0;
    return ageMod; // 0–6: will never win over a normal-range player (scores 16+)
  }

  // ── Performance modifier for K/D (strong performers are harder to cut) ───
  let perfPenalty = 0;
  if (playerSeasonStats && season != null) {
    const stats = (playerSeasonStats[player.id] || [])
      .filter(s => s.season === season && (s.matches || 0) > 2);
    if (stats.length > 0) {
      const kills  = stats.reduce((s, r) => s + (r.kills  || 0), 0);
      const deaths = stats.reduce((s, r) => s + (r.deaths || 0), 0);
      if (deaths > 0) {
        const kd = kills / deaths;
        if (kd < 0.88)  perfPenalty = Math.round((0.88 - kd) * 25); // up to +12
        else if (kd > 1.15) perfPenalty = -5; // stronger protection for strong performers
      }
    }
  }

  // ── Standard formula ──────────────────────────────────────────────────────
  const agePenalty      = age >= 27 ? 8 : age >= 25 ? 4 : 0;
  const upside          = (player.potential || overall) - overall;
  const lowUpsidePenalty = upside <= 2 ? 7 : upside <= 4 ? 3 : -2;
  const roleFitPenalty  = player.primary === "Flex" ? 1 : 0;

  return 100 - overall + agePenalty + lowUpsidePenalty + roleFitPenalty
    + (60 - evaluation.chemistry) * 0.14 + perfPenalty;
}

function roleFitScore(candidate, neededRole) {
  if (!neededRole) return 6;
  if (candidate.primary === neededRole) return 14;
  if (candidate.secondary === neededRole) return 8;

  const bothSmg = [candidate.primary, candidate.secondary, neededRole].some(r => r?.includes("SMG"));
  if (bothSmg && neededRole.includes("SMG")) return 4;
  return -4;
}

// ── 3. Star destination preference ───────────────────────────────────────────
// Elite players (86+ OVR) strongly prefer competitive, well-ranked teams.
// The penalty grows with the player's quality and the team's weakness, making
// it very difficult for bottom-tier rosters to land genuine stars.
//
// UPGRADE URGENCY exception: teams in the bottom half of the league with a
// weak roster rating get a 50% reduction in the destination penalty — the
// league's best remaining FA talent can realistically be picked up when a
// struggling team badly needs an upgrade.
//
// Examples for a 93 OVR star:
//   Top team (rank 1–2, avg 90 OVR): near-zero penalty
//   Mid team (rank 6–8, avg 84 OVR): ~20–30 penalty
//   Weak team needing upgrade (rank 9–12, avg <83 OVR): penalty halved
function getDestinationPenalty(candidate, evaluation) {
  const overall = candidate.overall || 70;
  if (candidate.isProspect || overall < 86) return 0;

  // Team attractiveness: standing (0–30.8) + roster quality (0–12+)
  const rankScore   = Math.max(0, 12 - evaluation.standingRank) * 2.8;
  const rosterScore = Math.max(0, evaluation.avgOverall - 80) * 1.2;
  const attractiveness = rankScore + rosterScore;

  // Star's bar rises steeply: 86=5, 90=25, 93=40, 96=55, 99=70
  const starBar = (overall - 85) * 5;
  const gap = starBar - attractiveness;
  if (gap <= 0) return 0;

  // Upgrade urgency: bottom-half teams with a weak roster get penalty relief
  // so desperately-needed stars can actually be acquired.
  const needsUpgrade = evaluation.standingRank >= 9 && evaluation.avgOverall < 83;
  const penaltyMultiplier = needsUpgrade ? 0.5 : 1.0;

  return gap * 2.0 * penaltyMultiplier;
}

// ── 2. Budget affordability ───────────────────────────────────────────────────
// Applies a score penalty when signing this candidate would push the team over
// its budget cap. Scales from -5 to -50 based on overspend amount.
// teamPlayers should be the current starters AFTER releasing the player being
// replaced (so the slot is open before costing the new signing).
function getAffordabilityPenalty(candidate, evaluation, teamPlayers) {
  const cap     = getTeamCap(evaluation.teamId);
  const current = getRosterSigningCost(teamPlayers, evaluation.teamId);
  const cost    = getSigningCost(candidate);
  const over    = cost - (cap - current);
  if (over <= 0) return 0;

  // Soften affordability penalty slightly for bottom-4 teams signing clear upgrades —
  // allow some budget flexibility so needed improvements can go through.
  const needsUpgrade = evaluation.standingRank >= 9;
  const divisor = needsUpgrade ? 10000 : 8000;
  return -clamp(over / divisor, 0, 50);
}

// ── Combined candidate scoring ────────────────────────────────────────────────
function candidateScore(candidate, teamPlayers, context, evaluation, neededRole, rng, windowType) {
  const age     = candidate.age || 22;
  const overall = candidate.overall || 70;
  const upside  = (candidate.potential || overall) - overall;
  const isProspect = !!candidate.isProspect;
  const roleFit = roleFitScore(candidate, neededRole);

  const baseChem = calcChemistry(teamPlayers);
  const testChem = calcChemistry([...teamPlayers, candidate].slice(-4));
  const chemDelta = testChem - baseChem;

  const philosophyBoost = {
    win_now:              overall * 0.9 + (age <= 23 ? 2 : 0),
    youth_upside:         upside * 5 + (24 - age) * 1.8,
    chemistry_stability:  chemDelta * 3 + (candidate.teamwork || 70) * 0.22,
    balanced_value:       overall * 0.55 + upside * 2.1 + chemDelta * 1.5,
    high_risk_gamble:     upside * 4.4 + (rng() - 0.5) * 6,
  }[context.philosophy] || (overall * 0.5 + upside * 2);

  let score = 0;
  score += roleFit;
  score += overall * 0.45;
  // Upside base weight reduced from 2.2 to 1.0.
  // Previously upside was counted twice: once here and again inside every
  // philosophy boost that includes upside (balanced_value, youth_upside,
  // high_risk_gamble). That stacked 4-7× per upside point, letting a
  // 62 OVR / 85-pot challenger outscore an 83 OVR proven FA by ~100 pts.
  // Philosophy boosts now carry the primary upside weight; the 1.0 base
  // preserves a small universal signal for philosophies that ignore upside.
  score += upside * 1.0;
  score += chemDelta * 2;
  score += philosophyBoost;

  // ── Budget affordability ─────────────────────────────────────────────────
  score += getAffordabilityPenalty(candidate, evaluation, teamPlayers);

  // ── Star destination preference ──────────────────────────────────────────
  score -= getDestinationPenalty(candidate, evaluation);

  // ── 4. Challenger market dynamics ────────────────────────────────────────
  // Base call-up need (pressure + aging + low-upside roster).
  // Clamp lower for top-performing teams so they don't over-rely on prospects.
  const callupNeed = clamp(
    (context.pressure + evaluation.pressure) / 70 +
    (evaluation.avgAge - 24) * 0.18 +
    (4 - evaluation.upside) * 0.2,
    -1, evaluation.isTopPerformer ? 0.8 : 3
  );

  // Small-budget teams lean more heavily on challengers
  const budgetTier       = getTeamBudgetTier(evaluation.teamId);
  const budgetChallBonus = Math.max(0, 3 - budgetTier) * 10; // +10 tier-2, +20 tier-1

  // Premium challengers (76+ OVR, 86+ potential) are genuine starter options
  const isPremiumChallenger = isProspect && overall >= 76 && (candidate.potential || overall) >= 86;
  const premiumBonus = isPremiumChallenger ? 8 : 0;

  if (isProspect) {
    score += 4 + context.challengerTrust * 8 + callupNeed * 5 + budgetChallBonus + premiumBonus;

    // ── Below-roster-level penalty ──────────────────────────────────────────
    // A prospect rated well below the team's current average should not beat a
    // proven FA on upside math alone. Premium challengers (76+ OVR) have a small
    // gap and are barely affected; very weak challengers take a meaningful hit.
    const rosterGap = evaluation.avgOverall - overall;
    if (rosterGap > 5) score -= (rosterGap - 5) * 2.5;
  } else {
    score -= callupNeed * 2.8;

    // ── Proven-quality floor for established free agents ──────────────────────
    // Reliable mid-to-high OVR FAs get a direct quality bonus that reflects their
    // certainty over a prospect's theoretical upside. Without this, upside math
    // dominates and solid FAs sit unsigned while weak challengers fill slots.
    //   80 OVR → +7.2   83 OVR → +12.6   86 OVR → +18   90 OVR → +25.2
    if (overall >= 80) score += (overall - 76) * 1.8;

    // ── Upgrade urgency ────────────────────────────────────────────────────
    // Threshold lowered from > 3 to > 0 — any positive gap should be rewarded.
    // A team averaging 80 OVR signing an 83 OVR FA (gap=3) previously got zero
    // bonus; that is the exact case that caused proven FAs to sit unsigned.
    const upgradeGap = overall - evaluation.avgOverall;
    if (upgradeGap > 0) {
      const upgradeBonus = upgradeGap * 2.5;
      const urgencyMultiplier = evaluation.standingRank >= 9 ? 1.6 : evaluation.standingRank >= 7 ? 1.2 : 1.0;
      score += upgradeBonus * urgencyMultiplier;
    }
  }

  if (windowType === "major") score -= isProspect ? 2 : 0;
  score += (rng() - 0.5) * 4 * context.volatility;
  return score;
}

function getChallengerStockLabel(candidate) {
  const ovr = candidate.overall ?? 70;
  const pot = candidate.potential ?? ovr;
  const age = candidate.age ?? 22;
  const form = candidate.form ?? 0;
  const showcase = candidate.challengerShowcase?.slice(-1)[0];
  if ((candidate.ego ?? 50) >= 80 && (candidate.composure ?? 70) <= 60) return "High Risk";
  if (showcase && (showcase.kd ?? 0) >= 1.12) return "Pro-Am Standout";
  if (ovr >= 80 && pot >= 88) return "Blue Chip";
  if (ovr >= 78 || (ovr >= 75 && pot >= 86)) return "CDL Ready";
  if (age >= 28 && !candidate.teamId) return "Veteran";
  if (form >= 2 || (candidate.lastQualifierPlacement ?? 99) <= 4) return "Rising";
  if (form <= -2) return "Falling";
  return "Stable";
}

function scoreChallengerPickupCandidate(candidate, teamPlayers, evaluation, neededRole, gameState) {
  const ovr = candidate.overall ?? 70;
  const pot = candidate.potential ?? ovr;
  const age = candidate.age ?? 22;
  const fit = roleFitScore(candidate, neededRole);
  const slot = teamPlayers.filter(p => p.primary === neededRole).sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0))[0];
  const slotKd = getCurrentKD(slot || {}, gameState.playerSeasonStats, gameState.season);
  const showcase = candidate.challengerShowcase?.slice(-1)[0];
  const stock = getChallengerStockLabel(candidate);
  let score = ovr * 0.65 + (pot - ovr) * 1.25 + fit;
  score += age <= 23 ? 7 : age <= 26 ? 3 : -2;
  score += (candidate.form ?? 0) * 2.4;
  score += slotKd < 0.92 ? 6 : 0;
  if (slot) score += Math.max(0, ovr - (slot.overall ?? 70)) * 1.2;
  if (showcase) score += (showcase.kd ?? 1) >= 1.05 ? 6 : -2;
  if (showcase) score += (showcase.placement ?? 16) <= 8 ? 3 : 0;
  score += stock === "Blue Chip" ? 8 : stock === "CDL Ready" ? 5 : stock === "Pro-Am Standout" ? 6 : stock === "Falling" ? -4 : 0;
  score += evaluation.standingRank >= 9 ? 6 : evaluation.standingRank <= 3 ? -6 : 0;
  return score;
}

function signCandidate(candidate, teamId, players, prospects) {
  if (candidate.isProspect) {
    const signed = { ...candidate, teamId, scouted: true, isSub: false };
    return {
      players: [...players, signed],
      prospects: prospects.filter(p => p.id !== candidate.id),
    };
  }

  return {
    players: players.map(p => p.id === candidate.id ? { ...p, teamId, isSub: false, scouted: true } : p),
    prospects,
  };
}

function pushTx(transactions, gameState, entry) {
  return [...transactions, {
    season: gameState.season,
    stageIdx: gameState.schedule?.stageIdx ?? null,
    majorIdx: gameState.schedule?.majorIdx ?? null,
    ...entry,
  }];
}

function refillAllChallengerRosters(challengerTeams, players, prospects) {
  const teams = (challengerTeams || []).map(t => ({ ...t, playerIds: [...(t.playerIds || [])] }));
  const assigned = new Set(teams.flatMap(t => t.playerIds));
  const allPool = [...players.filter(p => !p.teamId && p.status !== "inactive" && p.status !== "retired"), ...prospects.filter(p => !p.teamId && p.status !== "inactive" && p.status !== "retired")]
    .sort((a, b) => ((b.overall ?? 0) + (b.potential ?? 0) * 0.35) - ((a.overall ?? 0) + (a.potential ?? 0) * 0.35));
  for (const team of teams) {
    team.playerIds = team.playerIds.filter((pid, idx, arr) => pid && arr.indexOf(pid) === idx);
    while (team.playerIds.length < 4) {
      const sameRegion = allPool.find(p => !assigned.has(p.id) && (p.challengerTeamId == null) && (p.region === team.region));
      const fallback = allPool.find(p => !assigned.has(p.id) && (p.challengerTeamId == null));
      const pick = sameRegion || fallback;
      if (!pick) break;
      pick.challengerTeamId = team.id;
      team.playerIds.push(pick.id);
      assigned.add(pick.id);
    }
  }
  return teams;
}

function releasePlayer(player, players, prospects) {
  const shouldRetire = (player.age ?? 25) >= 33 || ((player.age ?? 25) >= 30 && (player.overall ?? 70) < 70);
  const shouldGoChall = (player.overall ?? 70) >= 76 || ((player.overall ?? 70) >= 73 && (player.age ?? 25) < 29);
  const shouldGoInactive = !shouldRetire && !shouldGoChall;
  if (player.isProspect) {
    if (shouldRetire) return { players: players.filter(p => p.id !== player.id), prospects };
    return {
      players: players.filter(p => p.id !== player.id),
      prospects: [...prospects, { ...player, teamId: null, isSub: false, status: "challengers" }],
    };
  }
  if (shouldRetire) {
    return {
      players: players.filter(p => p.id !== player.id),
      prospects,
      retired: { ...player, teamId: null, isSub: false, status: "retired" },
    };
  }
  if (shouldGoChall) {
    const toProspect = { ...player, teamId: null, isSub: false, challengerTeamId: null, contractYears: 0, status: "challengers" };
    return {
      players: players.filter(p => p.id !== player.id),
      prospects: [...prospects, toProspect],
      movedToChallengers: toProspect,
    };
  }

  if (shouldGoInactive) {
    return {
      players: players.map(p => p.id === player.id ? { ...p, teamId: null, isSub: false, challengerTeamId: null, status: "inactive" } : p),
      prospects,
      inactive: { ...player, teamId: null, status: "inactive" },
    };
  }
  return { players, prospects };
}

// ── Minimum roster guarantee ──────────────────────────────────────────────────
// After retirements or failed signings a team may have fewer than 4 starters.
// This pass runs once per team at the end of every roster window and fills any
// open starter slots with the best affordable candidate available.
//
// Rules:
//   • Skips the user's team (user fills their own gaps manually)
//   • Respects the hard budget cap — never signs over budget
//   • Prefers highest-OVR affordable option (no philosophy weighting — this is
//     emergency fill, not a considered decision)
//   • Stops if no affordable candidate exists rather than leaving > 4 (better
//     to have 3 strong players than 4 where one is terrible and over budget)
function fillMinimumRoster(teamId, players, prospects, rosterMovesLog, season, windowType) {
  let cur = { players, prospects };
  const additions = [];
  let safety = 0;

  while (safety++ < 4) {
    const starters = getStarters(cur.players, teamId);
    if (starters.length >= 4) break;

    const committed   = starters.reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
    const budgetLeft  = getTeamCap(teamId) - committed;

    const pick = [
      ...cur.players.filter(p => !p.teamId && !p.isProspect),
      ...cur.prospects.filter(p => !p.teamId),
    ]
      .filter(c => getSigningCost(c) <= budgetLeft)
      .sort((a, b) => (b.overall || 70) - (a.overall || 70))[0];

    if (!pick) break; // nothing affordable — stop rather than go over budget

    cur = signCandidate(pick, teamId, cur.players, cur.prospects);
    additions.push({ out: null, in: pick.name, fromChallengers: !!pick.isProspect, reason: "roster_fill" });
  }

  if (additions.length > 0) {
    rosterMovesLog.push({
      season, teamId, windowType,
      moveCount: additions.length,
      philosophy: "roster_fill",
      additions,
    });
  }

  return cur;
}

function runRosterWindow(gameState, { windowType, majorIdx }) {
  const teamContexts = ensureContexts(gameState);
  let players = [...(gameState.players || [])];
  let prospects = [...(gameState.prospects || [])];
  const rosterMovesLog = [...(gameState.rosterMovesLog || [])];
  let challengerTeams = [...(gameState.challengerTeams || [])];
  let challengerTransactions = [...(gameState.challengerTransactions || [])];

  for (const team of CDL_TEAMS) {
    if (team.id === gameState.userTeamId) continue;

    // Mix in the per-save world nonce (derived from randomly-seeded prospects)
    // so the same season/window produces different decisions across different saves.
    const worldNonce = getWorldNonce(gameState.prospects);
    const seed = hashString(`${team.id}_${gameState.season}_${windowType}_${majorIdx ?? -1}_${worldNonce}`);
    const rng = seededRng(seed);
    const context = { ...teamContexts[team.id] };
    const evaluation = evaluateTeam(team.id, { ...gameState, players, prospects }, windowType, majorIdx);
    const { moveCount, nextPressure } = decideMoveCount(evaluation, context, rng, windowType);

    context.pressure = nextPressure;
    teamContexts[team.id] = context;

    if (moveCount === 0) {
      rosterMovesLog.push({ season: gameState.season, teamId: team.id, windowType, moveCount: 0, philosophy: context.philosophy });
      continue;
    }

    let starters = getStarters(players, team.id);

    // ── Cut eligibility gate ──────────────────────────────────────────────
    // Compute cut scores up front and filter out players who are too strong /
    // protected to be legitimately dropped. This prevents the AI from cutting
    // elite or champion-roster players simply because moveCount > 0.
    //
    // Thresholds:
    //   recentMajorWinner — only drop players with score >= 20 (very weak slot)
    //   isChampion        — only drop players with score >= 16
    //   isTopPerformer    — only drop players with score >= 13
    //   everyone else     — only drop players with score >= 10
    const cutThreshold = evaluation.recentMajorWinner ? 20
                       : evaluation.isChampion        ? 16
                       : evaluation.isTopPerformer    ? 13
                       : 10;

    // ── Score each starter with philosophy modifier + controlled noise ────
    // Philosophy modifiers give each team identity a real effect on who they
    // keep (e.g. youth_upside retains young talent; chemistry_stability holds
    // high-teamwork players longer). Noise (scaled by volatility and philosophy)
    // ensures players in similar score bands don't always produce the same
    // ordering across different saves.
    const noiseScale = context.philosophy === "high_risk_gamble" ? 1.8
                     : context.philosophy === "chemistry_stability" ? 0.6
                     : context.philosophy === "win_now" ? 0.8
                     : 1.0;
    const noiseRange = 12 * clamp(context.volatility, 0.3, 1.0) * noiseScale;

    const startersWithScores = starters.map(p => {
      const base      = playerCutScore(p, evaluation, starters, gameState.playerSeasonStats, gameState.season);
      const philoMod  = philosophyCutModifier(p, context);
      const noise     = (rng() - 0.5) * noiseRange;
      return { player: p, cutScore: base + philoMod + noise };
    }).sort((a, b) => b.cutScore - a.cutScore);

    const eligiblePool = startersWithScores.filter(({ cutScore }) => cutScore >= cutThreshold);

    // If no players are genuinely weak enough to cut, skip this team's window
    if (eligiblePool.length === 0) {
      rosterMovesLog.push({ season: gameState.season, teamId: team.id, windowType, moveCount: 0, philosophy: context.philosophy });
      continue;
    }

    // ── Hesitation gate ───────────────────────────────────────────────────
    // If the top cut candidate barely clears the threshold, the team may hold
    // rather than always acting on marginal weakness. Philosophy governs how
    // much margin is needed before the team feels confident enough to move.
    // Loyal teams hesitate more; volatile teams second-guess less.
    const topCutScore = eligiblePool[0].cutScore;
    const margin      = topCutScore - cutThreshold;
    if (margin < hesitationMargin(context.philosophy)) {
      const holdChance = 0.30 + context.loyalty * 0.25; // 0.30–0.55
      if (rng() < holdChance) {
        rosterMovesLog.push({ season: gameState.season, teamId: team.id, windowType, moveCount: 0, philosophy: context.philosophy });
        continue;
      }
    }

    // ── Weighted cut selection ────────────────────────────────────────────
    // Pick cut candidates using proportional weighting rather than always
    // taking the top scorer(s). Players in similar bands get interchangeable
    // outcomes between saves; genuinely weak players are still most likely cut.
    const eligibleToCut = weightedCutSelect(eligiblePool, moveCount, rng);

    const additions = [];
    for (const cut of eligibleToCut) {
      const afterRelease = releasePlayer(cut, players, prospects);
      players = afterRelease.players;
      prospects = afterRelease.prospects;
      if (afterRelease.movedToChallengers) {
        challengerTransactions = pushTx(challengerTransactions, gameState, {
          type: "CDL_RELEASE_TO_CHALLENGERS",
          playerId: cut.id,
          playerName: cut.name,
          fromTeamId: team.id,
          toTeamId: null,
          note: `${cut.name} moved to Challengers pool`,
        });
      }
      if (afterRelease.retired) {
        challengerTransactions = pushTx(challengerTransactions, gameState, {
          type: "RETIREMENT",
          playerId: cut.id,
          playerName: cut.name,
          fromTeamId: team.id,
          toTeamId: null,
          note: `${cut.name} retired after release`,
        });
      }
      if (afterRelease.inactive) {
        challengerTransactions = pushTx(challengerTransactions, gameState, {
          type: "INACTIVE",
          playerId: cut.id,
          playerName: cut.name,
          fromTeamId: team.id,
          toTeamId: null,
          note: `${cut.name} went inactive after release`,
        });
      }

      const teamNow = getStarters(players, team.id);

      // ── Hard budget filter ────────────────────────────────────────────────
      // Only consider candidates the team can actually afford after this
      // release. This is a hard cap: over-budget players are excluded before
      // scoring so the AI can never sign past its limit regardless of score.
      const committed     = teamNow.reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
      const budgetLeft    = getTeamCap(team.id) - committed;

      const candidates = [
        ...players.filter(p => p.teamId == null),
        ...prospects,
      ].filter(c => c.status !== "inactive" && c.status !== "retired")
        .filter(c => getSigningCost(c) <= budgetLeft);

      if (!candidates.length) continue;

      const neededRole = cut.primary;
      const ranked = candidates
        .filter(c => c.id !== cut.id)
        .map(c => {
          const base = candidateScore(c, teamNow, context, evaluation, neededRole, rng, windowType);
          const chall = (c.isProspect || c.challengerTeamId) ? scoreChallengerPickupCandidate(c, teamNow, evaluation, neededRole, gameState) : 0;
          return { c, score: base + chall * 0.55 };
        })
        .sort((a, b) => b.score - a.score);

      const pickPool = ranked.slice(0, Math.min(6, ranked.length));
      const pick = pickPool[Math.floor(rng() * pickPool.length)]?.c;
      if (!pick) continue;

      const afterSign = signCandidate(pick, team.id, players, prospects);
      players = afterSign.players;
      prospects = afterSign.prospects;
      if (pick.challengerTeamId) {
        challengerTeams = challengerTeams.map(t => t.id === pick.challengerTeamId ? { ...t, playerIds: (t.playerIds || []).filter(pid => pid !== pick.id) } : t);
      }
      challengerTransactions = pushTx(challengerTransactions, gameState, {
        type: "CDL_SIGNING",
        playerId: pick.id,
        playerName: pick.name,
        fromTeamId: pick.challengerTeamId ?? null,
        toTeamId: team.id,
        note: `${team.tag} signed ${pick.name}${pick.challengerTeamId ? ` from ${challengerTeams.find(t => t.id === pick.challengerTeamId)?.name || "Challengers"}` : ""} as a ${neededRole} upgrade`,
      });
      additions.push({ out: cut.name, in: pick.name, fromChallengers: !!pick.isProspect });
      starters = getStarters(players, team.id);
    }

    rosterMovesLog.push({
      season: gameState.season,
      teamId: team.id,
      windowType,
      moveCount: additions.length,
      philosophy: context.philosophy,
      additions,
      pressure: Math.round(context.pressure),
      standingRank: evaluation.standingRank,
      chemistry: Math.round(evaluation.chemistry),
    });
  }

  // ── Mandatory roster fill ─────────────────────────────────────────────────
  // After all regular AI decisions, guarantee every AI team has 4 starters.
  // Catches gaps caused by retirements, failed signings, or budget constraints
  // in the window above. User's team is intentionally excluded — the player
  // fills their own gaps through Free Agency / Challengers screens.
  for (const team of CDL_TEAMS) {
    if (team.id === gameState.userTeamId) continue;
    const result = fillMinimumRoster(team.id, players, prospects, rosterMovesLog, gameState.season, windowType);
    players   = result.players;
    prospects = result.prospects;
  }
  challengerTeams = refillAllChallengerRosters(challengerTeams, players, prospects);

  return {
    ...gameState,
    players,
    prospects,
    teamContexts,
    rosterMovesLog,
    challengerTeams,
    challengerTransactions,
  };
}

export function runAIMajorRosterWindow(gameState, majorIdx) {
  return runRosterWindow(gameState, { windowType: "major", majorIdx });
}

export function runAIOffseasonRosterWindow(gameState) {
  return runRosterWindow(gameState, { windowType: "offseason", majorIdx: null });
}
