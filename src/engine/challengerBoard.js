// src/engine/challengerBoard.js
// Lightweight, Challenger-appropriate board objectives for the user-managed
// Challenger team. Pure + read-only — derives everything from existing save
// data (challengerTeams, challengerQualifierResults, currentChallengerQualifier,
// currentMajorEventTeams, rosters). It does NOT touch the CDL board engine,
// match sim, contracts, budgets, ratings, brackets or points.
//
// First pass: objectives + live status + a simple confidence read. The full
// season-end verdict lifecycle is intentionally out of scope for this pass.

import { getChallengerRosterPlayers, getUserChallengerTeam } from "../utils/userTeam.js";

function teamOvr(state, teamId) {
  const roster = getChallengerRosterPlayers(state, teamId);
  if (!roster.length) return 60;
  return Math.round(roster.reduce((s, p) => s + (p.overall ?? 60), 0) / roster.length);
}

// Rank the user team among all Challenger teams by roster OVR → strength tier.
export function getChallengerTier(state) {
  const teams = state?.challengerTeams || [];
  const ranked = teams
    .map(t => ({ id: t.id, ovr: teamOvr(state, t.id) }))
    .sort((a, b) => b.ovr - a.ovr);
  const total = ranked.length || 24;
  const rank = Math.max(1, ranked.findIndex(t => t.id === state?.userTeamId) + 1 || total);
  const pct = rank / total;
  let tier;
  if (pct <= 0.25) tier = "elite";
  else if (pct <= 0.55) tier = "strong";
  else if (pct <= 0.8) tier = "mid";
  else tier = "weak";
  return { tier, rank, total, ovr: teamOvr(state, state?.userTeamId) };
}

// All of this season's qualifier/finals result rows for the user team.
function userSeasonResults(state) {
  const season = state?.season;
  const history = state?.schedule?.challengerQualifierResults || [];
  const rows = [];
  for (const entry of history) {
    if (entry?.season !== season) continue;
    for (const t of entry.teams || []) {
      if (t.teamId === state.userTeamId) {
        rows.push({ ...t, eventType: entry.eventType, name: entry.name, source: entry.source });
      }
    }
  }
  return rows;
}

function bestQualifierPlacement(state) {
  const rows = userSeasonResults(state).filter(r => r.source === "visibleQualifier" || r.eventType === "majorQualifier");
  if (!rows.length) return null;
  return Math.min(...rows.map(r => r.placement ?? 99));
}

function userWonAnyQualifierMatch(state) {
  // Scan current + historical qualifier match logs for a user-team win.
  const logs = [];
  const cur = state?.schedule?.currentChallengerQualifier;
  if (cur?.matchLog) logs.push(...cur.matchLog);
  for (const entry of state?.schedule?.challengerQualifierResults || []) {
    if (entry?.season === state.season && entry.matchLog) logs.push(...entry.matchLog);
  }
  return logs.some(m => m.winnerId === state.userTeamId);
}

function majorsQualified(state) {
  const team = getUserChallengerTeam(state);
  const fromTeam = (team?.qualifiedMajorIdxs || []).length;
  // Top-4 qualifier finishes this season also count as a Major qualification.
  const rows = userSeasonResults(state).filter(r => r.source === "visibleQualifier");
  const fromResults = rows.filter(r => r.qualified || (r.placement ?? 99) <= 4).length;
  return Math.max(fromTeam, fromResults);
}

function youngTalent(state) {
  return getChallengerRosterPlayers(state).filter(p => (p.age ?? 25) <= 21 && (p.potential ?? 0) >= 80).length;
}

// Build the season's objectives based on team strength tier.
export function buildChallengerObjectives(state) {
  const { tier } = getChallengerTier(state);
  const team = getUserChallengerTeam(state);
  const circuitTarget = (team?.circuitPoints ?? 0) + 25;

  const TEMPLATES = {
    weak: [
      { id: "win_qual_match", weight: "primary",   label: "Win at least one qualifier match" },
      { id: "develop_player", weight: "secondary", label: "Develop a young prospect (≤21, POT 80+)" },
      { id: "build_circuit",  weight: "secondary", label: `Reach ${circuitTarget} circuit points`, target: circuitTarget },
    ],
    mid: [
      { id: "qual_top8",      weight: "primary",   label: "Reach the top 8 of a Challenger qualifier", target: 8 },
      { id: "qualify_major",  weight: "secondary", label: "Qualify for at least one Pro-Am Major", target: 1 },
      { id: "build_circuit",  weight: "secondary", label: `Reach ${circuitTarget} circuit points`, target: circuitTarget },
    ],
    strong: [
      { id: "qual_top4",      weight: "primary",   label: "Finish top 4 in a Challenger qualifier", target: 4 },
      { id: "qualify_major",  weight: "secondary", label: "Qualify for a Pro-Am Major", target: 1 },
      { id: "develop_player", weight: "secondary", label: "Develop a young prospect (≤21, POT 80+)" },
    ],
    elite: [
      { id: "win_qualifier",  weight: "primary",   label: "Win a Challenger qualifier", target: 1 },
      { id: "qualify_majors2",weight: "secondary", label: "Qualify for multiple Pro-Am Majors", target: 2 },
      { id: "reach_finals",   weight: "secondary", label: "Qualify for the Challengers Finals" },
    ],
  };
  return { tier, objectives: TEMPLATES[tier] || TEMPLATES.mid };
}

// Evaluate live status of each objective from current save data.
export function evaluateChallengerObjectives(state) {
  const { tier, objectives } = buildChallengerObjectives(state);
  const best = bestQualifierPlacement(state);
  const majors = majorsQualified(state);
  const team = getUserChallengerTeam(state);
  const finalsQualified = userSeasonResults(state).some(r => r.source === "challengersFinals" && r.qualified);

  const evaluated = objectives.map(o => {
    let met = false, progress = "—";
    switch (o.id) {
      case "win_qual_match":
        met = userWonAnyQualifierMatch(state);
        progress = met ? "Won a match" : "No qualifier win yet";
        break;
      case "win_qualifier":
        met = best === 1; progress = best ? `Best finish: ${ordinal(best)}` : "No qualifier yet"; break;
      case "qual_top4":
        met = best != null && best <= 4; progress = best ? `Best finish: ${ordinal(best)}` : "No qualifier yet"; break;
      case "qual_top8":
        met = best != null && best <= 8; progress = best ? `Best finish: ${ordinal(best)}` : "No qualifier yet"; break;
      case "qualify_major":
        met = majors >= 1; progress = `${majors} Major${majors === 1 ? "" : "s"} qualified`; break;
      case "qualify_majors2":
        met = majors >= 2; progress = `${majors} Major${majors === 1 ? "" : "s"} qualified`; break;
      case "reach_finals":
        met = finalsQualified || (team?.qualifiedMajorIdxs || []).length >= 0 && finalsQualified;
        progress = finalsQualified ? "Qualified" : "Not yet"; break;
      case "develop_player":
        met = youngTalent(state) >= 1; progress = `${youngTalent(state)} high-POT youngster(s)`; break;
      case "build_circuit":
        met = (team?.circuitPoints ?? 0) >= (o.target ?? 0);
        progress = `${team?.circuitPoints ?? 0} / ${o.target ?? 0} pts`; break;
      default:
        break;
    }
    return { ...o, met, progress, status: met ? "Completed" : "In progress" };
  });
  return { tier, objectives: evaluated };
}

// Simple confidence read (0–100) for the dashboard widget. Derived, not stored.
export function getChallengerConfidence(state) {
  const { objectives } = evaluateChallengerObjectives(state);
  if (!objectives.length) return 60;
  const met = objectives.filter(o => o.met).length;
  return Math.round(45 + (met / objectives.length) * 45);
}

function ordinal(n) {
  if (n == null) return "—";
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
