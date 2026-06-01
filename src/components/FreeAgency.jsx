// src/components/FreeAgency.jsx
// Lists all players currently without a team (free agents from the pro pool).
// Player can sign them to their team as a starter or sub.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { getTeamCap, getSigningCost, getChallengerStockLabel } from "../engine/rosterAI.js";
import { isInactivePlayer } from "../utils/playerIdentity.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";
import { EmptyState, PageHeader, Pill, SectionCard, StatCard } from "./ui.jsx";


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
  if (v >= 90) return "#fbbf24";
  if (v >= 80) return "#34d399";
  if (v >= 70) return "#60a5fa";
  if (v >= 60) return "#fb923c";
  return "#f87171";
}

export default function FreeAgency() {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const [sortKey, setSortKey] = useState("overall");
  const [roleFilter, setRoleFilter] = useState("All");
  const [marketFilter, setMarketFilter] = useState("All");
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

  // Free agents = no team from the pro roster. Previous-team metadata is
  // preserved by contract expiry/release processing so the market can be
  // audited as league-wide instead of only showing former user players.
  const freeAgents = players
    .filter(p => !p.teamId && !p.isProspect && !isInactivePlayer(p))
    .filter(p => !p.status || p.status === "freeAgent")
    .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  const marketCounts = {
    total: freeAgents.length,
    formerUser: freeAgents.filter(p => p.previousTeamId === userTeamId).length,
    formerAi: freeAgents.filter(p => p.previousTeamId && p.previousTeamId !== userTeamId).length,
    veterans: freeAgents.filter(p => p.previousTeamId).length,
    unsigned: freeAgents.filter(p => !p.previousTeamId).length,
  };

  const roles = ["All", "Entry SMG", "Slayer SMG", "Flex", "Main AR", "Objective", "Search Specialist"];
  const marketFilters = [
    { id: "All", label: "All Free Agents" },
    { id: "Former User", label: "Former User Players" },
    { id: "Former AI", label: "Former AI Players" },
    { id: "CDL Veterans", label: "CDL Veterans" },
    { id: "Unsigned", label: "Unsigned" },
  ];
  const byMarket = freeAgents.filter(p => {
    if (marketFilter === "Former User") return p.previousTeamId === userTeamId;
    if (marketFilter === "Former AI") return p.previousTeamId && p.previousTeamId !== userTeamId;
    if (marketFilter === "CDL Veterans") return !!p.previousTeamId;
    if (marketFilter === "Unsigned") return !p.previousTeamId;
    return true;
  });
  const filtered = roleFilter === "All" ? byMarket : byMarket.filter(p => p.primary === roleFilter);

  const myRoster = players.filter(p => p.teamId === userTeamId);
  const starterCount = myRoster.filter(p => !p.isSub).length;
  const subCount = myRoster.filter(p => p.isSub).length;

  function handleSign(playerId) {
    const slot = signAs[playerId] || "starter";
    dispatch({ type: "SIGN_PLAYER", playerId, slotType: slot });
  }

  return (
    <div className="fa-page">
      <PageHeader
        eyebrow="Recruitment"
        title="Free Agency"
        subtitle="Open-market players, salary demands, role fit and roster-slot controls."
        meta={(
          <div className="ui-stat-grid compact">
            <StatCard label="Market" value={filtered.length} hint={`${marketCounts.total} total`} />
            <StatCard label="Former AI" value={marketCounts.formerAi} hint={`${marketCounts.formerUser} user`} />
            <StatCard label="Starters" value={`${starterCount}/4`} tone={starterCount < 4 ? "warning" : "neutral"} />
            <StatCard label="Sub" value={`${subCount}/1`} />
            <StatCard label="Remaining" value={fmtMoney(remaining)} tone={remaining < 0 ? "danger" : "success"} />
          </div>
        )}
      />
      {state.offseason?.freeAgencyOpen && <div className="ui-warning-banner"><strong>User free-agency window is open.</strong> AI teams will not bid until you click <strong>Run AI Free Agency</strong> from the Offseason Hub.</div>}
      <div className="cm-hero ui-budget-panel">
        <div className="cm-chip-row">
          <Pill>Cap {fmtMoney(teamCap)}</Pill>
          <Pill>Committed {fmtMoney(committed)}</Pill>
          <Pill tone={remaining < 0 ? "danger" : "success"}>Remaining {fmtMoney(remaining)}</Pill>
          <Pill>{marketCounts.veterans} former CDL</Pill>
          <Pill>{marketCounts.formerAi} former AI</Pill>
          <Pill>{marketCounts.formerUser} former user</Pill>
        </div>
        <div className="cm-budget-bar"><div style={{ width: `${budgetPct}%`, background: budgetColor }} /></div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Market:</label>
          {marketFilters.map(f => (
            <button key={f.id} className={`filter-btn ${marketFilter === f.id ? "active" : ""}`}
              onClick={() => setMarketFilter(f.id)}>{f.label}</button>
          ))}
        </div>
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

      <SectionCard title="Available Players" subtitle="Sort and filter the market, then choose whether to sign players as starters or substitute depth.">
      {filtered.length === 0 ? (
        <EmptyState title="No free agents available" detail="The market is empty for the current phase and filters." />
      ) : (
        <div className="ui-table-wrap"><table className="roster-table data-table">
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
                  <td><span className="role-pill ui-pill ui-pill-neutral">{p.primary}</span></td>
                  <td>{p.previousTeamId ? (resolveTeamDisplay(p.previousTeamId, state.schedule)?.tag || p.previousTeamId) : "Unsigned"}</td>
                  <td><span style={{ color: ratingColor(p.overall), fontWeight: "bold" }}>{p.overall}</span></td>
                  <td><span style={{ color: ratingColor(p.potential) }}>{p.potential}</span></td>
                  <td style={{ color: ratingColor(p.gunny) }}>{p.gunny}</td>
                  <td style={{ color: ratingColor(p.clutch) }}>{p.clutch}</td>
                  <td style={{ color: ratingColor(p.searchIQ) }}>{p.searchIQ}</td>
                  <td style={{ color: ratingColor(p.teamwork) }}>{p.teamwork}</td>
                  <td>{formatRecentKd(p, state.playerSeasonStats, state.offseason?.outgoingSeason ?? state.season)}</td>
                  <td><Pill tone="accent">{getChallengerStockLabel(p, state)}</Pill></td>
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
        </table></div>
      )}
      </SectionCard>
    </div>
  );
}
