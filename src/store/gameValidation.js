import { CDL_TEAMS } from "../data/teams.js";

const VALID_PHASES = new Set(["stage", "challengerQualifier", "major", "preChamps", "offseason", "contracts"]);

export function isValidTeamId(teamId) {
  return CDL_TEAMS.some(t => t.id === teamId);
}

export function isValidGameState(state) {
  return Boolean(
    state &&
    isValidTeamId(state.userTeamId) &&
    state.schedule &&
    VALID_PHASES.has(state.schedule.phase) &&
    Array.isArray(state.schedule.stages) &&
    Array.isArray(state.schedule.majors) &&
    Number.isFinite(state.season)
  );
}

// Phase-specific invariants. Returns an array of human-readable problem
// strings, or [] if everything is consistent.
//
// The intent is to catch transitions that left the schedule in a state where
// rendering would explode (e.g. phase=major but no bracket, bracket with
// unresolvable team ids, qualifier phase with no qualifier object).
export function findPhaseInvariantViolations(state) {
  const problems = [];
  if (!state || !state.schedule) return problems;

  const { schedule, userTeamId } = state;
  const { phase, majorIdx, stageIdx } = schedule;

  if (!isValidTeamId(userTeamId)) {
    problems.push(`Invalid userTeamId: ${String(userTeamId)}`);
  }

  if (!VALID_PHASES.has(phase)) {
    problems.push(`Invalid phase: ${String(phase)}`);
    return problems;
  }

  const cdlIds = new Set(CDL_TEAMS.map(t => t.id));
  const eventIds = new Set(Object.keys(schedule.currentMajorEventTeams || {}));

  if (phase === "stage") {
    const stage = schedule.stages?.[stageIdx];
    if (!stage) problems.push(`Stage phase but no stage at idx ${stageIdx}`);
    if (majorIdx != null) problems.push(`Stage phase but majorIdx is ${majorIdx} (should be null)`);
  }

  if (phase === "challengerQualifier") {
    if (!schedule.currentChallengerQualifier) {
      problems.push("challengerQualifier phase but no currentChallengerQualifier");
    } else if (!schedule.currentChallengerQualifier.field?.length) {
      problems.push("currentChallengerQualifier has empty field");
    }
  }

  if (phase === "major") {
    if (majorIdx == null) {
      problems.push("major phase but majorIdx is null");
    } else {
      const major = schedule.majors?.[majorIdx];
      if (!major) problems.push(`major phase but majors[${majorIdx}] is missing`);
      else if (!major.bracket) problems.push(`major phase but majors[${majorIdx}].bracket is null`);
      else {
        const seeds = major.bracket.seeds || [];
        if (!seeds.length) problems.push(`major ${majorIdx} bracket has no seeds`);
        const bad = seeds.filter(id => !cdlIds.has(id) && !eventIds.has(id));
        if (bad.length) {
          problems.push(`major ${majorIdx} bracket has ${bad.length} unresolvable seed(s): ${bad.join(", ")}`);
        }
        // Cross-check every team-id referenced by any match.
        for (const round of major.bracket.rounds || []) {
          for (const m of round.matches || []) {
            for (const id of [m.a, m.b]) {
              if (id && !cdlIds.has(id) && !eventIds.has(id)) {
                problems.push(`major ${majorIdx} ${round.name} references unresolvable team ${id}`);
              }
            }
          }
        }
      }
    }
  }

  if (phase === "preChamps") {
    if (majorIdx != null) problems.push(`preChamps phase but majorIdx is ${majorIdx}`);
  }

  // Roster integrity — every CDL team needs 4 starters for match sim to work.
  // simMap now pads thin rosters so this is no longer fatal, but report it so
  // the user/AI window can be inspected if it ever shows up.
  if (Array.isArray(state.players)) {
    for (const team of CDL_TEAMS) {
      const starters = state.players.filter(p => p.teamId === team.id && !p.isSub);
      if (starters.length < 4) {
        problems.push(`team ${team.id} has only ${starters.length} starter(s)`);
      }
    }
  }

  return problems;
}
