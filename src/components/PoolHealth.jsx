// src/components/PoolHealth.jsx
// Collapsible debug panel for inspecting the challengers pool ecosystem.
// Embedded at the top of the Prospects (Challengers) page.
//
// Sections:
//  1. Snapshot   — pool size, avg age/OVR, 26+ count, 75+ OVR count
//  2. Distributions — age buckets + OVR buckets as inline bar charts
//  3. Last offseason — retirement/cleanup/intake/cap-trim counts
//  4. Top 20     — strongest unsigned challengers with age
//  5. History    — season-by-season table from challengersLog

import { useState } from "react";
import { getPoolSnapshot } from "../engine/poolReport.js";

// ── Mini helpers ─────────────────────────────────────────────────────────────
function statCell(label, value, warn) {
  return (
    <div style={{ textAlign: "center", minWidth: "80px" }}>
      <div style={{ fontSize: "1.35rem", fontWeight: "bold", color: warn ? "#ffa726" : "#e0e0e0" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.70rem", color: "#888", marginTop: "2px" }}>{label}</div>
    </div>
  );
}

function Bar({ count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "16px" }}>
      <div style={{ flex: 1, background: "#2a2a2a", borderRadius: "3px", height: "10px" }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: "3px", transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: "0.72rem", color: "#aaa", minWidth: "28px", textAlign: "right" }}>
        {count}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PoolHealth({ prospects, challengersLog }) {
  const [open, setOpen] = useState(false);

  const snap     = getPoolSnapshot(prospects);
  const log      = challengersLog || [];
  const lastEntry = log.length ? log[log.length - 1] : null;

  const sizeWarn = snap ? (snap.total < 150 || snap.total > 200) : false;

  return (
    <div style={{ marginBottom: "18px", border: "1px solid #2a2a2a", borderRadius: "6px", overflow: "hidden" }}>

      {/* ── Toggle header ───────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", textAlign: "left", background: "#1a1a1a", border: "none",
          padding: "9px 14px", cursor: "pointer", color: "#aaa", fontSize: "0.80rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <span>
          Pool Health{" "}
          {snap && (
            <span style={{ color: sizeWarn ? "#ffa726" : "#69f0ae", fontWeight: "bold" }}>
              ({snap.total} unsigned)
            </span>
          )}
          {!snap && <span style={{ color: "#ef5350" }}>(empty)</span>}
        </span>
        <span style={{ fontSize: "0.70rem" }}>{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div style={{ background: "#111", padding: "14px 16px", fontSize: "0.82rem", color: "#ccc" }}>

          {/* ── 1. Snapshot stats ─────────────────────────────────────── */}
          {snap ? (
            <>
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "16px",
                borderBottom: "1px solid #222", paddingBottom: "14px" }}>
                {statCell("Pool size",  snap.total, sizeWarn)}
                {statCell("Avg age",    snap.avgAge)}
                {statCell("Avg OVR",    snap.avgOvr)}
                {statCell("Age 26+",    snap.age26Plus)}
                {statCell("OVR 75+",    snap.ovr75Plus)}
              </div>

              {/* ── 2. Distributions ───────────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "16px",
                borderBottom: "1px solid #222", paddingBottom: "14px" }}>

                <div>
                  <div style={{ color: "#888", fontSize: "0.72rem", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Age</div>
                  {Object.entries(snap.ageBuckets).map(([label, count]) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "46px 1fr", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.72rem", color: "#888" }}>{label}</span>
                      <Bar count={count} total={snap.total} color="#42a5f5" />
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ color: "#888", fontSize: "0.72rem", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>OVR</div>
                  {Object.entries(snap.ovrBuckets).map(([label, count]) => {
                    const color = label === "80+" ? "#00e676" : label === "75–79" ? "#69f0ae" : label === "70–74" ? "#ffeb3b" : label === "65–69" ? "#ffa726" : "#ef5350";
                    return (
                      <div key={label} style={{ display: "grid", gridTemplateColumns: "46px 1fr", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "0.72rem", color: "#888" }}>{label}</span>
                        <Bar count={count} total={snap.total} color={color} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 3. Last offseason changes ─────────────────────────── */}
              {lastEntry && (
                <div style={{ marginBottom: "16px", borderBottom: "1px solid #222", paddingBottom: "14px" }}>
                  <div style={{ color: "#888", fontSize: "0.72rem", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Last offseason → Season {lastEntry.season}
                  </div>
                  <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                    {statCell("Retired",     lastEntry.removedByRetirement, lastEntry.removedByRetirement > 10)}
                    {statCell("Cleaned up",  lastEntry.removedByCleanup,    lastEntry.removedByCleanup > 20)}
                    {statCell("Annual class",lastEntry.annualIntake)}
                    {statCell("Top-up",      lastEntry.topUpCount, lastEntry.topUpCount > 40)}
                    {statCell("Cap trim",    lastEntry.removedByCap, lastEntry.removedByCap > 0)}
                  </div>
                </div>
              )}

              {/* ── 4. Top 20 unsigned challengers ───────────────────── */}
              <div style={{ marginBottom: "16px", borderBottom: "1px solid #222", paddingBottom: "14px" }}>
                <div style={{ color: "#888", fontSize: "0.72rem", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Top 20 unsigned challengers
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ color: "#666" }}>
                      <th style={{ textAlign: "left", paddingBottom: "4px", fontWeight: "normal" }}>#</th>
                      <th style={{ textAlign: "left", paddingBottom: "4px", fontWeight: "normal" }}>Name</th>
                      <th style={{ textAlign: "center", paddingBottom: "4px", fontWeight: "normal" }}>Age</th>
                      <th style={{ textAlign: "center", paddingBottom: "4px", fontWeight: "normal" }}>OVR</th>
                      <th style={{ textAlign: "center", paddingBottom: "4px", fontWeight: "normal" }}>POT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.top20.map((p, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #1e1e1e" }}>
                        <td style={{ padding: "3px 4px", color: "#555" }}>{i + 1}</td>
                        <td style={{ padding: "3px 4px" }}>{p.name}</td>
                        <td style={{ padding: "3px 4px", textAlign: "center", color: "#aaa" }}>{p.age}</td>
                        <td style={{ padding: "3px 4px", textAlign: "center", fontWeight: "bold",
                          color: p.ovr >= 80 ? "#00e676" : p.ovr >= 75 ? "#69f0ae" : p.ovr >= 70 ? "#ffeb3b" : "#ffa726" }}>
                          {p.ovr}
                        </td>
                        <td style={{ padding: "3px 4px", textAlign: "center", color: "#888" }}>{p.pot}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p style={{ color: "#ef5350", margin: "8px 0" }}>No unsigned challengers in pool.</p>
          )}

          {/* ── 5. Season history ─────────────────────────────────────── */}
          {log.length > 0 && (
            <div>
              <div style={{ color: "#888", fontSize: "0.72rem", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Season history
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                  <thead>
                    <tr style={{ color: "#555", borderBottom: "1px solid #2a2a2a" }}>
                      {["Season","Size","Avg Age","Avg OVR","Intake","Top-up","Retired","Cleanup","Cap trim"].map(h => (
                        <th key={h} style={{ padding: "3px 8px", fontWeight: "normal", textAlign: "center" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {log.map(e => {
                      const sizeOk = e.poolSize >= 150 && e.poolSize <= 200;
                      return (
                        <tr key={e.season} style={{ borderTop: "1px solid #1a1a1a" }}>
                          <td style={{ padding: "3px 8px", textAlign: "center", color: "#888" }}>{e.season}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center", fontWeight: "bold",
                            color: sizeOk ? "#69f0ae" : "#ffa726" }}>{e.poolSize}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center" }}>{e.avgAge}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center" }}>{e.avgOvr}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center" }}>{e.annualIntake}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center", color: e.topUpCount > 0 ? "#ffa726" : "#666" }}>{e.topUpCount}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center" }}>{e.removedByRetirement}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center" }}>{e.removedByCleanup}</td>
                          <td style={{ padding: "3px 8px", textAlign: "center", color: e.removedByCap > 0 ? "#ef5350" : "#666" }}>{e.removedByCap}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Console tip */}
          <div style={{ marginTop: "12px", color: "#444", fontSize: "0.68rem" }}>
            Console: <code style={{ color: "#555" }}>poolReport()</code> prints full text report
          </div>
        </div>
      )}
    </div>
  );
}
