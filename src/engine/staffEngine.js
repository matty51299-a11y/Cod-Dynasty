// src/engine/staffEngine.js
// Staff/coaching system utilities: migration, bonus calculations, hire/fire.

import { STARTING_STAFF, STAFF_ROLES } from "../data/staff.js";
import { CDL_TEAMS } from "../data/teams.js";

// ── Migration ──────────────────────────────────────────────────────────────────
// Returns initialized staff pool. If an existing staff array is passed (from a
// loaded save), it is returned as-is. Missing saves get a fresh STARTING_STAFF.
export function migrateStaff(existingStaff) {
  if (Array.isArray(existingStaff) && existingStaff.length > 0) return existingStaff;
  return STARTING_STAFF.map(s => ({ ...s }));
}

// ── Staff bonus calculation ────────────────────────────────────────────────────
// Returns small per-team bonus modifiers derived from assigned staff attributes.
// These are display-only for now; match sim wiring is a TODO.
export function calcStaffBonuses(staff, teamId) {
  const teamStaff = (staff || []).filter(s => s.currentTeamId === teamId);
  const hc = teamStaff.find(s => s.role === "head_coach");
  const gm = teamStaff.find(s => s.role === "gm");
  const an = teamStaff.find(s => s.role === "analyst");
  const pc = teamStaff.find(s => s.role === "performance_coach");

  // Scale all bonuses 0–3 pts based on attribute/100 ratios.
  // These are intentionally modest so staff doesn't override player ratings.
  const chemistry    = Math.round(((hc?.chemistry ?? 60) / 100) * 2 + ((pc?.chemistry ?? 60) / 100) * 1);
  const development  = Math.round(((hc?.development ?? 60) / 100) * 1.5 + ((pc?.development ?? 60) / 100) * 1.5);
  const scouting     = Math.round(((gm?.scouting ?? 60) / 100) * 1.5 + ((an?.scouting ?? 60) / 100) * 1.5);
  const negotiation  = Math.round(((gm?.negotiation ?? 60) / 100) * 2);
  const tactical     = Math.round(((hc?.tactical ?? 60) / 100) * 1.5 + ((an?.tactical ?? 60) / 100) * 1.5);

  return { chemistry, development, scouting, negotiation, tactical };
}

// ── Hire staff ────────────────────────────────────────────────────────────────
// Returns updated staff array: assigns staffId to teamId.
// If the team already has someone in the same role, they are released first.
export function hireStaff(staff, staffId, teamId) {
  const target = (staff || []).find(s => s.id === staffId);
  if (!target) return staff || [];

  return (staff || []).map(s => {
    if (s.currentTeamId === teamId && s.role === target.role && s.id !== staffId) {
      // Release the incumbent
      return { ...s, currentTeamId: null, contractYears: 0, status: "free_agent" };
    }
    if (s.id === staffId) {
      return { ...s, currentTeamId: teamId, contractYears: 2, status: "active" };
    }
    return s;
  });
}

// ── Fire / release staff ───────────────────────────────────────────────────────
export function fireStaff(staff, staffId) {
  return (staff || []).map(s =>
    s.id === staffId ? { ...s, currentTeamId: null, contractYears: 0, status: "free_agent" } : s
  );
}

// ── Ensure CDL teams have at least HC + GM ─────────────────────────────────────
// Safe fill: assigns best free agent if a CDL team is missing a role.
// Called during migration / new-game creation.
export function ensureTeamStaff(staff) {
  let result = (staff || []).map(s => ({ ...s }));

  for (const team of CDL_TEAMS) {
    const teamStaff = result.filter(s => s.currentTeamId === team.id);
    const hasHC = teamStaff.some(s => s.role === "head_coach");
    const hasGM = teamStaff.some(s => s.role === "gm");

    if (!hasHC) {
      const free = result.filter(s => !s.currentTeamId && s.role === "head_coach")
        .sort((a, b) => b.reputation - a.reputation);
      if (free.length) {
        const pick = free[0];
        result = result.map(s =>
          s.id === pick.id ? { ...s, currentTeamId: team.id, contractYears: 2, status: "active" } : s
        );
      }
    }

    if (!hasGM) {
      const free = result.filter(s => !s.currentTeamId && s.role === "gm")
        .sort((a, b) => b.reputation - a.reputation);
      if (free.length) {
        const pick = free[0];
        result = result.map(s =>
          s.id === pick.id ? { ...s, currentTeamId: team.id, contractYears: 2, status: "active" } : s
        );
      }
    }
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
export function getStaffForTeam(staff, teamId) {
  return (staff || []).filter(s => s.currentTeamId === teamId);
}

export function getFreeStaff(staff) {
  return (staff || []).filter(s => !s.currentTeamId);
}

export function roleLabel(role) {
  return STAFF_ROLES[role] ?? role;
}

// Returns the key attribute columns shown for each role
export function getKeyAttributes(staffMember) {
  if (!staffMember) return [];
  switch (staffMember.role) {
    case "head_coach":
      return [
        { key: "Tactical", value: staffMember.tactical },
        { key: "S&D",      value: staffMember.snd },
        { key: "Chem",     value: staffMember.chemistry },
        { key: "Dev",      value: staffMember.development },
        { key: "Disc",     value: staffMember.discipline },
      ];
    case "gm":
      return [
        { key: "Negot",    value: staffMember.negotiation },
        { key: "Scout",    value: staffMember.scouting },
        { key: "Chem",     value: staffMember.chemistry },
        { key: "Disc",     value: staffMember.discipline },
      ];
    case "analyst":
      return [
        { key: "Tactical", value: staffMember.tactical },
        { key: "S&D",      value: staffMember.snd },
        { key: "Scout",    value: staffMember.scouting },
        { key: "Respawn",  value: staffMember.respawn },
      ];
    case "performance_coach":
      return [
        { key: "Dev",      value: staffMember.development },
        { key: "Chem",     value: staffMember.chemistry },
        { key: "Disc",     value: staffMember.discipline },
      ];
    default:
      return [];
  }
}

export function staffPayroll(staff, teamId) {
  return (staff || [])
    .filter(s => s.currentTeamId === teamId)
    .reduce((sum, s) => sum + (s.salary || 0), 0);
}
