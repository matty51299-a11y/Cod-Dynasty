// src/components/FreeAgency.jsx
// Lists all players currently without a team (free agents from the pro pool).
// Player can sign them to their team as a starter or sub.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { getTeamCap, getSigningCost, getChallengerStockLabel } from "../engine/rosterAI.js";
import { isInactivePlayer } from "../utils/playerIdentity.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";


function fmtMoney(n) { return `$${Math.round((n || 0) / 1000)}k`; }

function formatRecentKd(player, playerSeasonStats, season) {
  if (!player?.id || !playerSeasonStats || season == null) return "—";
  const rows = (playerSeasonStats[player.id] || []).filter(r => Number(r.season) === Number(season) && (r.matches || 0) > 0);
  if (!rows.length) return "—";
  const kills = rows.reduce((sum, r) => sum + (r.kills || 0), 0);
  const deaths = rows.reduce((sum, r) => sum + (r.deaths || 0), 0);
  const kd = deaths > 0 ? kills / deaths : kills > 0 ? kills : 1;
  return kd.toFixed(2);
}

const RATING_KEYS = ["gunny","awareness","objective","searchIQ","clutch","teamwork","composure","adaptability"];

function ratingColor(v) {
  if (v >= 90) return "#166534";
  if (v >= 80) return "#15803d";
  if (v >= 70) return "#1d4ed8";
  if (v >= 60) return "#9a3412";
  return "#dc2626";
}

export default function FreeAgency() {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const [sortKey, setSortKey] = useState("overall");
  const [roleFilter, setRoleFilter] = useState("All");
  const [signAs, setSignAs] = useState({}); // playerId -> "starter" | "sub"

  if (!state) return null;

  const { players, userTeamId } = state;

  // ── Budget calc ─────────────────────────────────────────────────────────
  const myStarters  = players.filter(p => p.teamId === userTeamId && !p.isSub);
  const teamCap     = getTeamCap(userTeamId);
  const committed   = myStarters.reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
  const remaining   = teamCap - committed;
  const budgetPct   = Math.min(100, Math.round((committed / teamCap) * 100));
  const budgetColor = budgetPct >= 90 ? "#dc2626" : budgetPct >= 70 ? "#9a3412" : "#15803d";

  // Free agents = no team from the pro roster
  const freeAgents = players
    .filter(p => !p.teamId && !p.isProspect && !isInactivePlayer(p))
    .filter(p => !p.status || p.status === "freeAgent")
    .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  const roles = ["All", "Entry SMG", "Slayer SMG", "Flex", "Main AR", "Objective", "Search Specialist"];
  const filtered = roleFilter === "All" ? freeAgents : freeAgents.filter(p => p.primary === roleFilter);

  const myRoster = players.filter(p => p.teamId === userTeamId);
  const starterCount = myRoster.filter(p => !p.isSub).length;
  const subCount = myRoster.filter(p => p.isSub).length;

  function handleSign(playerId) {
    const slot = signAs[playerId] || "starter";
    dispatch({ type: "SIGN_PLAYER", playerId, slotType: slot });
  }

  return (
    <div className="fa-page">
      <h2>Free Agency</h2>
      {state.offseason?.freeAgencyOpen && <p className="muted">Offseason user window is open: AI teams will not bid until you click <strong>Run AI Free Agency</strong> from the Offseason Hub.</p>}
      <p className="muted">
        Your roster: <strong>{starterCount}/4</strong> starters, <strong>{subCount}/1</strong> sub.
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

      <div className="filters">
        <div className="filter-group">
          <label>Role:</label>
          {roles.map(r => (
            <button key={r} className={`filter-btn ${roleFilter === r ? "active" : ""}`}
              onClick={() => setRoleFilter(r)}>{r}</button>
          ))}
        </div>
        <div className="filter-group">
          <label>Sort:</label>
          {["overall","gunny","clutch","searchIQ","teamwork"].map(k => (
            <button key={k} className={`filter-btn ${sortKey === k ? "active" : ""}`}
              onClick={() => setSortKey(k)}>{k}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No free agents available.</p>
      ) : (
        <table className="roster-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Age</th>
              <th>Primary Role</th>
              <th>Previous Team</th>
              <th>OVR</th>
              <th>POT</th>
              <th>Gunny</th>
              <th>Clutch</th>
              <th>S.IQ</th>
              <th>T.Work</th>
              <th>Recent K/D</th>
              <th>Stock</th>
              <th>Salary Demand</th>
              <th>Sign As</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const slot        = signAs[p.id] || "starter";
              const cost        = getSigningCost(p);
              // Subs don't count against the cap — only starters need the check.
              const overBy      = slot === "starter" ? Math.max(0, cost - remaining) : 0;
              const disabledReason = slot === "starter" && starterCount >= 4
                ? "Roster full"
                : slot === "sub" && subCount >= 1
                  ? "Sub slot full"
                  : overBy > 0
                    ? `Over cap by ${fmtMoney(overBy)}`
                    : null;
              return (
                <tr key={p.id}>
                  <td className="player-name"><button className="link-button player-link" onClick={() => openPlayerProfile(p)}>{p.name}</button></td>
                  <td>{p.age}</td>
                  <td><span className="role-pill">{p.primary}</span></td>
                  <td>{p.previousTeamId ? (resolveTeamDisplay(p.previousTeamId, state.schedule)?.tag || p.previousTeamId) : "Unsigned"}</td>
                  <td><span style={{ color: ratingColor(p.overall), fontWeight: "bold" }}>{p.overall}</span></td>
                  <td><span style={{ color: ratingColor(p.potential) }}>{p.potential}</span></td>
                  <td style={{ color: ratingColor(p.gunny) }}>{p.gunny}</td>
                  <td style={{ color: ratingColor(p.clutch) }}>{p.clutch}</td>
                  <td style={{ color: ratingColor(p.searchIQ) }}>{p.searchIQ}</td>
                  <td style={{ color: ratingColor(p.teamwork) }}>{p.teamwork}</td>
                  <td>{formatRecentKd(p, state.playerSeasonStats, state.offseason?.outgoingSeason ?? state.season)}</td>
                  <td>{getChallengerStockLabel(p, state)}</td>
                  <td className="salary">{fmtMoney(cost)}</td>
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
                    {disabledReason ? (
                      <span style={{ color: "#ef5350", fontSize: "0.78rem", fontWeight: "bold" }} title={disabledReason}>
                        {disabledReason}
                      </span>
                    ) : (
                      <button className="btn-primary-sm" onClick={() => handleSign(p.id)}>Sign</button>
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
