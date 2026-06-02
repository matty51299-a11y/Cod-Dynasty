// scripts/diagnoseProspectScouting.mjs
// Verifies the Prospect Scouting 2.0 visibility layer.
//
// Run with:
//   node --loader ./scripts/asset-loader.mjs scripts/diagnoseProspectScouting.mjs
//
// Checks:
//  - existing-style save hydrates scouting data (no userScouting → safe defaults)
//  - prospect pool produces scouting summaries
//  - confidence values are always 0–100
//  - estimated ranges are plausible around the true OVR/POT
//  - scouting a player increases confidence and narrows the range
//  - shortlist add/remove works
//  - scouting UI helpers never expose exact ratings before full confidence
//  - better staff scouting improves confidence gain
//  - no player loses its true internal OVR/POT

import { buildInitialRoster } from "../src/data/players.js";
import { generateProspects } from "../src/data/prospects.js";
import { applyChallengerRatingOverride } from "../src/data/challengerRatingOverrides.js";
import { buildSeason, ensureChallengerTeams } from "../src/engine/seasonEngine.js";
import { ensureCdlRosterIntegrity } from "../src/engine/rosterAI.js";
import { ensureTeamStaff, migrateStaff } from "../src/engine/staffEngine.js";
import {
  migrateUserScouting, getScoutingSummary, getDisplayOvr, getDisplayPot,
  getPlayerScoutingConfidence, isScoutTarget, isEstablishedPlayer,
  applyScout, toggleShortlist, getStaffScoutPower, getAssignmentsRemaining,
  getMaxAssignments, scoutGain,
} from "../src/engine/scoutingEngine.js";

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; }
  else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}

function newGame(teamId = "lat", { withStaff = true } = {}) {
  const players = buildInitialRoster().map(applyChallengerRatingOverride);
  const prospects = generateProspects(424242).map(applyChallengerRatingOverride);
  const state = {
    userTeamId: teamId, season: 1, players, prospects,
    schedule: { ...buildSeason(1), phase: "stage", stageIdx: 0 },
    notifications: [], feed: [], playerSeasonStats: {}, playerOvrHistory: {},
    retiredPlayers: [], challengersLog: [], challengerTransactions: [], seasonHistory: [],
    staff: withStaff ? ensureTeamStaff(migrateStaff([])) : [],
    userScouting: migrateUserScouting(null),
  };
  ensureChallengerTeams(state);
  return ensureCdlRosterIntegrity(state, { windowType: "diagnose_scouting" });
}

// ── 1. Hydration of a save missing userScouting ──────────────────────────────
{
  const s = newGame();
  delete s.userScouting;
  s.userScouting = migrateUserScouting(s.userScouting);
  check("hydrate: userScouting structure", s.userScouting && Array.isArray(s.userScouting.shortlist) && typeof s.userScouting.players === "object");
  check("hydrate: no crash summarizing prospect", (() => {
    try { getScoutingSummary(s.prospects[0], s); return true; } catch { return false; }
  })());
}

const state = newGame();
const targets = state.prospects.filter(p => isScoutTarget(p, state));
check("pool: has scout targets", targets.length > 20, `targets=${targets.length}`);

// ── 2. Confidence range + plausible estimates + no exact exposure ────────────
let rangeViolations = 0, confViolations = 0, exactLeak = 0;
for (const p of targets) {
  const conf = getPlayerScoutingConfidence(p, state);
  if (conf < 0 || conf > 100) confViolations++;
  const ovr = getDisplayOvr(p, state);
  const pot = getDisplayPot(p, state);
  // Sub-100 confidence target must be a range, never an exact value.
  if (conf < 100 && (ovr.exact || pot.exact)) exactLeak++;
  // Plausibility: true value within the range (± small tolerance for bias).
  if (!ovr.exact && (p.overall < ovr.min - 4 || p.overall > ovr.max + 4)) rangeViolations++;
  if (!pot.exact && (p.potential < pot.min - 4 || p.potential > pot.max + 4)) rangeViolations++;
}
check("confidence: all within 0–100", confViolations === 0, `violations=${confViolations}`);
check("display: no exact ratings before full confidence", exactLeak === 0, `leaks=${exactLeak}`);
check("estimates: ranges plausible vs true rating", rangeViolations === 0, `violations=${rangeViolations}`);

// ── 3. Established players show exact ratings ────────────────────────────────
{
  const owned = state.players.find(p => p.teamId === state.userTeamId);
  check("established: user-owned player is established", isEstablishedPlayer(owned, state));
  const dispOwned = getDisplayOvr(owned, state);
  check("established: owned shows exact OVR", dispOwned.exact && dispOwned.value === owned.overall);
  const cdl = state.players.find(p => p.teamId && p.teamId !== state.userTeamId && !p.isProspect);
  check("established: other CDL pro shows exact OVR", getDisplayOvr(cdl, state).exact);
}

// ── 4. Scouting increases confidence and narrows the range ───────────────────
{
  let s = newGame();
  const t = s.prospects.find(p => isScoutTarget(p, s));
  const before = getPlayerScoutingConfidence(t, s);
  const ovrBefore = getDisplayOvr(t, s);
  const widthBefore = ovrBefore.exact ? 0 : ovrBefore.max - ovrBefore.min;
  const r1 = applyScout(s, t.id, { deep: false });
  check("scout: action ok", r1.ok, r1.reason);
  s = { ...s, userScouting: r1.scouting };
  const after = getPlayerScoutingConfidence(t, s);
  check("scout: confidence increased", after > before, `before=${before} after=${after}`);
  const ovrAfter = getDisplayOvr(t, s);
  const widthAfter = ovrAfter.exact ? 0 : ovrAfter.max - ovrAfter.min;
  check("scout: range narrowed (or equal)", widthAfter <= widthBefore, `before=${widthBefore} after=${widthAfter}`);

  // Repeated scouting reveals more (more traits/strengths at higher band).
  const sumLow = getScoutingSummary(t, newGame());
  let s2 = s;
  for (let i = 0; i < 6; i++) {
    const rr = applyScout(s2, t.id, { deep: true });
    if (!rr.ok) break;
    s2 = { ...s2, userScouting: rr.scouting };
  }
  const sumHigh = getScoutingSummary(t, s2);
  check("scout: more info revealed at higher confidence", sumHigh.strengths.length >= sumLow.strengths.length && sumHigh.confidence >= sumLow.confidence);
  check("scout: never exceeds 100", getPlayerScoutingConfidence(t, s2) <= 100);
}

// ── 5. Assignments cap + refresh-by-stage key ────────────────────────────────
{
  let s = newGame();
  const max = getMaxAssignments(s);
  check("assignments: positive max", max >= 5, `max=${max}`);
  // Drain assignments
  let drained = 0;
  const ids = s.prospects.filter(p => isScoutTarget(p, s)).map(p => p.id);
  for (const id of ids) {
    if (getAssignmentsRemaining(s) < 1) break;
    const r = applyScout(s, id, { deep: false });
    if (r.ok) { s = { ...s, userScouting: r.scouting }; drained++; }
  }
  check("assignments: drained to zero", getAssignmentsRemaining(s) === 0, `remaining=${getAssignmentsRemaining(s)}`);
  check("assignments: cannot scout with none left", !applyScout(s, ids[ids.length - 1], { deep: false }).ok);
  // New stage → refresh
  const s2 = { ...s, schedule: { ...s.schedule, stageIdx: 1 } };
  check("assignments: refresh at next stage", getAssignmentsRemaining(s2) === getMaxAssignments(s2), `remaining=${getAssignmentsRemaining(s2)}`);
}

// ── 6. Shortlist add/remove ──────────────────────────────────────────────────
{
  let s = newGame();
  const id = s.prospects[0].id;
  const a = toggleShortlist(s, id);
  s = { ...s, userScouting: a.scouting };
  check("shortlist: add", a.added && s.userScouting.shortlist.includes(id));
  const b = toggleShortlist(s, id);
  s = { ...s, userScouting: b.scouting };
  check("shortlist: remove", !b.added && !s.userScouting.shortlist.includes(id));
}

// ── 7. Better staff → bigger confidence gain ─────────────────────────────────
{
  const weak = newGame("lat", { withStaff: false });        // no staff → low power
  const strong = newGame("lat", { withStaff: true });
  strong.staff = strong.staff.map(st => st.currentTeamId === "lat" && (st.role === "analyst" || st.role === "assistant_gm")
    ? { ...st, scouting: 99, reputation: 95, tactical: 95, discipline: 90 } : st);
  const pWeak = getStaffScoutPower(weak, "lat").power;
  const pStrong = getStaffScoutPower(strong, "lat").power;
  check("staff: strong scout power > weak", pStrong > pWeak, `weak=${pWeak.toFixed(2)} strong=${pStrong.toFixed(2)}`);
  const t = strong.prospects.find(p => isScoutTarget(p, strong));
  const gainWeak = scoutGain(weak, t, false);
  const gainStrong = scoutGain(strong, t, false);
  check("staff: strong staff gains >= weak", gainStrong >= gainWeak, `weak=${gainWeak} strong=${gainStrong}`);
  check("staff: strong base confidence >= weak base", getPlayerScoutingConfidence(t, strong) >= getPlayerScoutingConfidence(t, weak));
}

// ── 8. True ratings preserved (no mutation) ──────────────────────────────────
{
  let s = newGame();
  const t = s.prospects.find(p => isScoutTarget(p, s));
  const trueOvr = t.overall, truePot = t.potential;
  for (let i = 0; i < 4; i++) {
    const r = applyScout(s, t.id, { deep: true });
    if (!r.ok) break;
    s = { ...s, userScouting: r.scouting };
  }
  const tAfter = s.prospects.find(p => p.id === t.id);
  check("integrity: true OVR unchanged", tAfter.overall === trueOvr, `was=${trueOvr} now=${tAfter.overall}`);
  check("integrity: true POT unchanged", tAfter.potential === truePot, `was=${truePot} now=${tAfter.potential}`);
  // Fully scouted reveals exact.
  const conf = getPlayerScoutingConfidence(tAfter, s);
  if (conf >= 100) check("integrity: fully scouted reveals exact OVR", getDisplayOvr(tAfter, s).exact && getDisplayOvr(tAfter, s).value === trueOvr);
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log("\n=== PROSPECT SCOUTING 2.0 DIAGNOSTIC ===\n");
const sampleState = newGame();
console.log("Sample prospect reads (Season 1, before user scouting):");
for (const p of sampleState.prospects.filter(x => isScoutTarget(x, sampleState)).slice(0, 5)) {
  const sum = getScoutingSummary(p, sampleState);
  console.log(`  ${(p.name || "?").padEnd(14)} ${String(p.primary).padEnd(16)} age ${p.age}  OVR ${sum.displayOvrText.padEnd(7)} POT ${sum.displayPotText.padEnd(7)} conf ${String(sum.confidence + "%").padEnd(5)} risk ${sum.risk}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:"); fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
console.log("\nALL CHECKS PASSED ✓");
