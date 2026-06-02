// src/components/OffseasonReport.jsx
// Shows per-player development/regression results from the most recent offseason.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { isChallengerMode, getChallengerRosterPlayers } from "../utils/userTeam.js";

const TEAM_MAP = Object.fromEntries(CDL_TEAMS.map(t => [t.id, t]));

export default function OffseasonReport() {
  const { state } = useGame();
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("delta");

  const challengerMode = isChallengerMode(state);
  const myRosterIds = new Set(challengerMode ? getChallengerRosterPlayers(state).map(p => p.id) : []);
  const isMine = (e) => challengerMode ? myRosterIds.has(e.id) : e.teamId === state.userTeamId;

  const FILTER_OPTIONS = [
    { id: "all",       label: "All Players" },
    { id: "myteam",    label: challengerMode ? "My Squad" : "My Team" },
    { id: "pros",      label: "Pros Only" },
    { id: "prospects", label: "Challengers" },
    { id: "improved",  label: "Improved" },
    { id: "declined",  label: "Declined" },
    { id: "breakouts", label: "Breakouts" },
    { id: "falloffs",  label: "Fall-offs" },
  ];

  const log = state?.progressionLog;

  if (!log || log.length === 0) {
    return (
      <div className="page-shell">
        <h2 className="page-title">Development Report</h2>
        <p className="text-dim" style={{ marginTop: 20 }}>
          No development data yet. Advance through a season and click
          <strong> Advance Offseason</strong> to see results here.
        </p>
      </div>
    );
  }

  // Summary counts
  const improved   = log.filter(e => e.delta > 0).length;
  const declined   = log.filter(e => e.delta < 0).length;
  const flat       = log.filter(e => e.delta === 0).length;
  const breakouts  = log.filter(e => e.eventType === "breakout").length;
  const falloffs   = log.filter(e => e.eventType === "collapse").length;
  const prosCount  = log.filter(e => !e.isProspect).length;

  const biggestGain    = [...log].sort((a, b) => b.delta - a.delta)[0];
  const biggestDecline = [...log].sort((a, b) => a.delta - b.delta)[0];

  // Filtering
  const filtered = log.filter(e => {
    if (filter === "myteam")    return isMine(e);
    if (filter === "pros")      return !e.isProspect;
    if (filter === "prospects") return !!e.isProspect;
    if (filter === "improved")  return e.delta > 0;
    if (filter === "declined")  return e.delta < 0;
    if (filter === "breakouts") return e.eventType === "breakout";
    if (filter === "falloffs")  return e.eventType === "collapse";
    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "delta") return b.delta - a.delta;
    if (sortBy === "new")   return b.newOverall - a.newOverall;
    if (sortBy === "age")   return a.age - b.age;
    if (sortBy === "name")  return a.name.localeCompare(b.name);
    return 0;
  });

  function teamTag(teamId) {
    if (!teamId) return "FA";
    return TEAM_MAP[teamId]?.tag ?? teamId;
  }

  function teamColor(teamId) {
    if (!teamId) return "var(--text-dim)";
    return TEAM_MAP[teamId]?.color ?? "var(--text)";
  }

  function deltaLabel(e) {
    const d = e.delta;
    const base = d > 0 ? `+${d}` : d < 0 ? `${d}` : "—";
    if (e.eventType === "breakout") return `${base} ⚡`;
    if (e.eventType === "collapse") return `${base} ↘`;
    return base;
  }

  const standoutGainLabel = biggestGain?.eventType === "breakout"
    ? "Breakout Season"
    : "Biggest Leap";
  const standoutDecLabel  = biggestDecline?.eventType === "collapse"
    ? "Sharp Decline"
    : "Biggest Drop";

  return (
    <div className="page-shell">
      <h2 className="page-title">
        {challengerMode ? "Challenger Development" : "Development Report"} — After Season {state.season - 1}
      </h2>
      {challengerMode && (
        <p className="text-dim" style={{ margin: "4px 0 12px", fontSize: 13 }}>
          Growing OVR/POT builds CDL-ready, higher-value players — develop talent for Pro-Am Majors, and expect buyout interest when they perform.
        </p>
      )}

      {/* Summary bar */}
      <div className="dev-summary-bar">
        <div className="dev-summary-stat">
          <span className="dev-sum-val" style={{ color: "var(--green)" }}>{improved}</span>
          <span className="dev-sum-label">Improved</span>
        </div>
        <div className="dev-summary-stat">
          <span className="dev-sum-val" style={{ color: "var(--text-dim)" }}>{flat}</span>
          <span className="dev-sum-label">Plateau</span>
        </div>
        <div className="dev-summary-stat">
          <span className="dev-sum-val" style={{ color: "var(--red)" }}>{declined}</span>
          <span className="dev-sum-label">Declined</span>
        </div>
        <div className="dev-summary-stat">
          <span className="dev-sum-val" style={{ color: "var(--yellow)" }}>{breakouts}</span>
          <span className="dev-sum-label">Breakouts ⚡</span>
        </div>
        <div className="dev-summary-stat">
          <span className="dev-sum-val" style={{ color: "var(--red)" }}>{falloffs}</span>
          <span className="dev-sum-label">Fall-offs ↘</span>
        </div>
        <div className="dev-summary-stat">
          <span className="dev-sum-val" style={{ color: "var(--accent)" }}>{prosCount}</span>
          <span className="dev-sum-label">Pros tracked</span>
        </div>

        {biggestGain && biggestGain.delta > 0 && (
          <div className="dev-standout dev-standout--green">
            <span className="dev-standout-label">{standoutGainLabel}</span>
            <span className="dev-standout-name">{biggestGain.name}</span>
            <span className="dev-standout-delta">
              +{biggestGain.delta} OVR
              {biggestGain.eventType === "breakout" && " ⚡"}
            </span>
          </div>
        )}
        {biggestDecline && biggestDecline.delta < 0 && (
          <div className="dev-standout dev-standout--red">
            <span className="dev-standout-label">{standoutDecLabel}</span>
            <span className="dev-standout-name">{biggestDecline.name}</span>
            <span className="dev-standout-delta">
              {biggestDecline.delta} OVR
              {biggestDecline.eventType === "collapse" && " ↘"}
            </span>
          </div>
        )}
      </div>

      {/* Filter + Sort controls */}
      <div className="dev-controls">
        <div className="dev-filter-row">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.id}
              className={`dev-filter-btn ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id === "breakouts" && breakouts > 0 && (
                <span className="dev-filter-count">{breakouts}</span>
              )}
              {f.id === "falloffs" && falloffs > 0 && (
                <span className="dev-filter-count">{falloffs}</span>
              )}
            </button>
          ))}
        </div>
        <div className="dev-sort-row">
          <span className="text-dim" style={{ fontSize: 12 }}>Sort:</span>
          {[
            { id: "delta", label: "Δ OVR" },
            { id: "new",   label: "Rating" },
            { id: "age",   label: "Age" },
            { id: "name",  label: "Name" },
          ].map(s => (
            <button
              key={s.id}
              className={`dev-sort-btn ${sortBy === s.id ? "active" : ""}`}
              onClick={() => setSortBy(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Player table */}
      <div className="dev-table-wrap">
        <table className="dev-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Type</th>
              <th>Age</th>
              <th>Before</th>
              <th>After</th>
              <th>Δ OVR</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(e => {
              const isBreakout = e.eventType === "breakout";
              const isCollapse = e.eventType === "collapse";
              const deltaClass = e.delta > 0 ? "delta-pos"
                               : e.delta < 0 ? "delta-neg"
                               : "delta-zero";
              const rowClass = [
                "dev-row",
                isMine(e) ? "dev-row--myteam" : "",
                isBreakout ? "dev-row--breakout" : "",
                isCollapse ? "dev-row--collapse" : "",
              ].filter(Boolean).join(" ");

              return (
                <tr key={e.id} className={rowClass}>
                  <td className="dev-name">{e.name}</td>
                  <td style={{ color: teamColor(e.teamId), fontWeight: 600, fontSize: 12 }}>
                    {teamTag(e.teamId)}
                  </td>
                  <td className="text-dim" style={{ fontSize: 11 }}>
                    {e.isProspect ? "prospect" : "pro"}
                  </td>
                  <td className="dev-age">{e.age}</td>
                  <td className="dev-old">{e.oldOverall}</td>
                  <td className="dev-new">{e.newOverall}</td>
                  <td className={`dev-delta ${deltaClass}`}>
                    {deltaLabel(e)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-dim" style={{ padding: "20px", textAlign: "center" }}>
            No players match this filter.
          </p>
        )}
      </div>
    </div>
  );
}
