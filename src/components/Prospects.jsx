// src/components/Prospects.jsx
// Challengers / Prospect pool browser.
// Shows scouted values (with noise) until a prospect is signed.
// Signing a prospect reveals their true ratings and hidden traits.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { getTeamCap, getSigningCost } from "../engine/rosterAI.js";
import PoolHealth from "./PoolHealth.jsx";

function ratingColor(v) {
  if (v >= 90) return "#00e676";
  if (v >= 80) return "#69f0ae";
  if (v >= 70) return "#ffeb3b";
  if (v >= 60) return "#ffa726";
  return "#ef5350";
}

const ROLES = ["All", "Entry SMG", "Slayer SMG", "Flex", "Main AR", "Objective", "Search Specialist"];
const ARCHETYPES = ["All","raw_upside","polished","smg_heavy","ar_flex","search_spec","risky_ego","glue","obj_spec"];

export default function Prospects() {
  const { state, dispatch } = useGame();
  const [roleFilter, setRoleFilter] = useState("All");
  const [archFilter, setArchFilter] = useState("All");
  const [sortKey, setSortKey] = useState("scoutedOverall");
  const [signAs, setSignAs] = useState({});

  if (!state) return null;

  const { prospects, userTeamId, players, challengersLog } = state;
  const myRoster = players.filter(p => p.teamId === userTeamId);
  const starterCount = myRoster.filter(p => !p.isSub).length;
  const subCount = myRoster.filter(p => p.isSub).length;

  // ── Budget calc ─────────────────────────────────────────────────────────
  const myStarters  = myRoster.filter(p => !p.isSub);
  const teamCap     = getTeamCap(userTeamId);
  const committed   = myStarters.reduce((s, p) => s + getSigningCost(p), 0);
  const remaining   = teamCap - committed;
  const budgetPct   = Math.min(100, Math.round((committed / teamCap) * 100));
  const budgetColor = budgetPct >= 90 ? "#ef5350" : budgetPct >= 70 ? "#ffa726" : "#69f0ae";

  // Available prospects (not already on a team)
  const available = (prospects || []).filter(p => !p.teamId);

  const filtered = available
    .filter(p => roleFilter === "All" || p.primary === roleFilter)
    .filter(p => archFilter === "All" || p.archetype === archFilter)
    .sort((a, b) => {
      const va = a.scouted ? a[sortKey.replace("scouted", "").toLowerCase() || "overall"] ?? a[sortKey] : a[sortKey];
      const vb = b.scouted ? b[sortKey.replace("scouted", "").toLowerCase() || "overall"] ?? b[sortKey] : b[sortKey];
      return vb - va;
    });

  function handleSign(prospectId) {
    const slot = signAs[prospectId] || "starter";
    dispatch({ type: "SIGN_PLAYER", playerId: prospectId, slotType: slot });
  }

  return (
    <div className="prospects-page">
      <h2>Challengers Pool</h2>
      <PoolHealth prospects={prospects} challengersLog={challengersLog} />
      <p className="muted">
        {available.length} prospects available · Your roster: <strong>{starterCount}/4</strong> starters, <strong>{subCount}/1</strong> sub
      </p>
      <div style={{ marginBottom: "14px" }}>
        <span className="muted">
          Cap: <strong>${(teamCap / 1000).toFixed(0)}k</strong>
          {" · "}Committed: <strong>${(committed / 1000).toFixed(0)}k</strong>
          {" · "}Remaining:{" "}
          <strong style={{ color: budgetColor }}>${(remaining / 1000).toFixed(0)}k</strong>
        </span>
        <div style={{ height: "5px", background: "#2a2a2a", borderRadius: "3px", marginTop: "5px", width: "300px" }}>
          <div style={{ height: "100%", width: `${budgetPct}%`, background: budgetColor, borderRadius: "3px", transition: "width 0.3s" }} />
        </div>
      </div>
      <p className="muted scout-note">
        ⚠ Ratings shown are <em>scouted estimates</em> – true values revealed on signing.
      </p>

      <div className="filters">
        <div className="filter-group">
          <label>Role:</label>
          {ROLES.map(r => (
            <button key={r} className={`filter-btn ${roleFilter === r ? "active" : ""}`}
              onClick={() => setRoleFilter(r)}>{r}</button>
          ))}
        </div>
        <div className="filter-group">
          <label>Archetype:</label>
          {ARCHETYPES.map(a => (
            <button key={a} className={`filter-btn ${archFilter === a ? "active" : ""}`}
              onClick={() => setArchFilter(a)}>{a}</button>
          ))}
        </div>
        <div className="filter-group">
          <label>Sort:</label>
          {["scoutedOverall","scoutedPotential","age"].map(k => (
            <button key={k} className={`filter-btn ${sortKey === k ? "active" : ""}`}
              onClick={() => setSortKey(k)}>{k}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No prospects match filters.</p>
      ) : (
        <table className="roster-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>Region</th>
              <th>Primary Role</th>
              <th>Archetype</th>
              <th>Dev Curve</th>
              <th>OVR (est.)</th>
              <th>POT (est.)</th>
              <th>Salary</th>
              <th>Sign As</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const ovr       = p.scouted ? p.overall : p.scoutedOverall;
              const pot       = p.scouted ? p.potential : p.scoutedPotential;
              const slot      = signAs[p.id] || "starter";
              const cost      = getSigningCost(p);
              const overBy    = slot === "starter" ? Math.max(0, cost - remaining) : 0;
              const canAfford = overBy === 0;
              return (
                <tr key={p.id}>
                  <td className="player-name">
                    {p.name}
                    {p.scouted && <span className="signed-badge"> ✓</span>}
                  </td>
                  <td>{p.age}</td>
                  <td>{p.region}</td>
                  <td><span className="role-pill">{p.primary}</span></td>
                  <td><span className="arch-pill">{p.archetype}</span></td>
                  <td>{p.developmentCurve}</td>
                  <td>
                    <span style={{ color: ratingColor(ovr), fontWeight: "bold" }}>
                      {ovr}{!p.scouted && "~"}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: ratingColor(pot) }}>
                      {pot}{!p.scouted && "~"}
                    </span>
                  </td>
                  <td className="salary">${(cost / 1000).toFixed(0)}k</td>
                  <td>
                    <select
                      value={slot}
                      onChange={e => setSignAs({ ...signAs, [p.id]: e.target.value })}
                      className="slot-select"
                    >
                      <option value="starter">Starter</option>
                      <option value="sub">Sub</option>
                    </select>
                  </td>
                  <td>
                    {canAfford ? (
                      <button className="btn-primary-sm" onClick={() => handleSign(p.id)}>Sign</button>
                    ) : (
                      <span style={{ color: "#ef5350", fontSize: "0.78rem", fontWeight: "bold" }}
                        title={`Exceeds cap by $${(overBy / 1000).toFixed(0)}k`}>
                        Over Budget
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
