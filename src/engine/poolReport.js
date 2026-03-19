// src/engine/poolReport.js
// Lightweight debug utility for the challengers ecosystem.
//
// Browser console usage:
//   poolReport()            → prints full report for current game state
//   poolReport(state)       → prints for a specific state snapshot
//
// The PoolHealth UI panel (Prospects page) renders the same data visually.

// ── Pool snapshot computed from prospects[] ───────────────────────────────────
export function getPoolSnapshot(prospects) {
  const unsigned = (prospects || []).filter(p => !p.teamId);
  if (!unsigned.length) return null;

  const ages = unsigned.map(p => p.age || 20);
  const ovrs = unsigned.map(p => p.overall || 70);

  const avgAge = +(ages.reduce((s, v) => s + v, 0) / ages.length).toFixed(1);
  const avgOvr = +(ovrs.reduce((s, v) => s + v, 0) / ovrs.length).toFixed(1);

  // Age buckets
  const ageBuckets = {
    "18–22": unsigned.filter(p => (p.age || 20) <= 22).length,
    "23–25": unsigned.filter(p => (p.age || 20) >= 23 && (p.age || 20) <= 25).length,
    "26–28": unsigned.filter(p => (p.age || 20) >= 26 && (p.age || 20) <= 28).length,
    "29+":   unsigned.filter(p => (p.age || 20) >= 29).length,
  };

  // OVR buckets
  const ovrBuckets = {
    "80+":   unsigned.filter(p => (p.overall || 70) >= 80).length,
    "75–79": unsigned.filter(p => (p.overall || 70) >= 75 && (p.overall || 70) <= 79).length,
    "70–74": unsigned.filter(p => (p.overall || 70) >= 70 && (p.overall || 70) <= 74).length,
    "65–69": unsigned.filter(p => (p.overall || 70) >= 65 && (p.overall || 70) <= 69).length,
    "<65":   unsigned.filter(p => (p.overall || 70) < 65).length,
  };

  const age26Plus = unsigned.filter(p => (p.age || 20) >= 26).length;
  const ovr75Plus = unsigned.filter(p => (p.overall || 70) >= 75).length;

  const top20 = [...unsigned]
    .sort((a, b) => (b.overall || 70) - (a.overall || 70))
    .slice(0, 20)
    .map(p => ({ name: p.name, age: p.age || 20, ovr: p.overall || 70, pot: p.potential || 80 }));

  return { total: unsigned.length, avgAge, avgOvr, ageBuckets, ovrBuckets, age26Plus, ovr75Plus, top20 };
}

// ── Format a human-readable text report ──────────────────────────────────────
export function formatPoolReport(state) {
  const snap     = getPoolSnapshot(state?.prospects);
  const log      = state?.challengersLog || [];
  const season   = state?.season ?? "?";
  const lines    = [];

  lines.push(`\n═══════════════════════════════════════════════`);
  lines.push(`  CHALLENGERS POOL REPORT  ·  Season ${season}`);
  lines.push(`═══════════════════════════════════════════════`);

  if (!snap) {
    lines.push("  (no unsigned challengers in pool)");
    return lines.join("\n");
  }

  lines.push(`  Pool size : ${snap.total}  (target 150–200)`);
  lines.push(`  Avg age   : ${snap.avgAge}    Avg OVR: ${snap.avgOvr}`);
  lines.push(`  Age 26+   : ${snap.age26Plus}    OVR 75+ : ${snap.ovr75Plus}`);

  lines.push(`\n  Age distribution:`);
  for (const [bucket, count] of Object.entries(snap.ageBuckets)) {
    const bar = "█".repeat(Math.round(count / snap.total * 30));
    lines.push(`    ${bucket.padEnd(6)} ${String(count).padStart(3)}  ${bar}`);
  }

  lines.push(`\n  OVR distribution:`);
  for (const [bucket, count] of Object.entries(snap.ovrBuckets)) {
    const bar = "█".repeat(Math.round(count / snap.total * 30));
    lines.push(`    ${bucket.padEnd(6)} ${String(count).padStart(3)}  ${bar}`);
  }

  lines.push(`\n  Top 20 by OVR:`);
  snap.top20.forEach((p, i) => {
    lines.push(`    ${String(i + 1).padStart(2)}. ${p.name.padEnd(20)} age ${p.age}  OVR ${p.ovr}  POT ${p.pot}`);
  });

  if (log.length) {
    const last = log[log.length - 1];
    lines.push(`\n  Last offseason (→ Season ${last.season}) changes:`);
    lines.push(`    Retired        : ${last.removedByRetirement}`);
    lines.push(`    Cleaned up     : ${last.removedByCleanup}`);
    lines.push(`    Annual intake  : ${last.annualIntake}`);
    lines.push(`    Top-up added   : ${last.topUpCount}`);
    lines.push(`    Trimmed at cap : ${last.removedByCap}`);
  }

  if (log.length > 1) {
    lines.push(`\n  Season history:`);
    lines.push(`    Season  Size  AvgAge  AvgOVR  Intake  Retired  Cleanup  CapTrim`);
    for (const e of log) {
      lines.push(
        `    ${String(e.season).padEnd(7)} ${String(e.poolSize).padEnd(5)} ` +
        `${String(e.avgAge).padEnd(7)} ${String(e.avgOvr).padEnd(7)} ` +
        `${String(e.annualIntake + e.topUpCount).padEnd(7)} ` +
        `${String(e.removedByRetirement).padEnd(8)} ` +
        `${String(e.removedByCleanup).padEnd(8)} ` +
        `${e.removedByCap}`
      );
    }
  }

  lines.push(`═══════════════════════════════════════════════\n`);
  return lines.join("\n");
}

// ── Expose on window for browser console use ─────────────────────────────────
// Usage: poolReport()  or  poolReport(customState)
// Reads from the store if no argument given — works because gameStore sets
// window.__gameState whenever state changes (added in gameStore.jsx).
if (typeof window !== "undefined") {
  window.poolReport = (state) => {
    const s = state ?? window.__gameState;
    if (!s) {
      console.warn("[poolReport] No state found. Pass state explicitly or wait for the game to load.");
      return;
    }
    const report = formatPoolReport(s);
    console.log(report);
    return report;
  };
}
