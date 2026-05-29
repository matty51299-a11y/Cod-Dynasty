// src/components/Prospects.jsx
// Challengers / Prospect pool browser.
// Shows scouted values (with noise) until a prospect is signed.
// Signing a prospect reveals their true ratings and hidden traits.

import { useMemo, useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { getTeamCap, getSigningCost } from "../engine/rosterAI.js";
import PoolHealth from "./PoolHealth.jsx";
import TeamLogo from "./TeamLogo.jsx";
import { placementText } from "../utils/placementDisplay.js";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";
import { buildCdlRosterNameSet, isInactivePlayer, normalizePlayerName } from "../utils/playerIdentity.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";

function ratingColor(v) {
  if (v >= 90) return "#166534";
  if (v >= 80) return "#15803d";
  if (v >= 70) return "#1d4ed8";
  if (v >= 60) return "#9a3412";
  return "#dc2626";
}

const ROLES = ["All", "Entry SMG", "Slayer SMG", "Flex", "Main AR", "Objective", "Search Specialist"];
const ARCHETYPES = ["All","raw_upside","polished","smg_heavy","ar_flex","search_spec","risky_ego","glue","obj_spec"];
const ARCH_LABELS = {
  raw_upside: "Raw Upside", polished: "Polished Prospect", smg_heavy: "SMG-heavy",
  ar_flex: "AR/Flex", search_spec: "Search Specialist", risky_ego: "Volatile Talent",
  glue: "Glue Player", obj_spec: "Objective Specialist",
};
const TAB_KEYS = ["all", "veterans", "prospects", "proam", "shortlist"];

function transactionLabel(type) {
  return {
    CDL_RELEASE_TO_CHALLENGERS: "CDL release to Challengers",
    CHALLENGER_TO_POOL: "Moved to Challengers pool",
    CHALLENGER_REPLACED: "Challenger replacement",
    CHALLENGER_REFILL: "Challenger roster fill",
    CDL_SIGNING: "CDL signing",
    INACTIVE: "Inactive",
    RETIREMENT: "Retirement",
  }[type] || String(type || "Move").replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
}

function challengerStockLabel(p) {
  const ovr = p.overall ?? p.scoutedOverall ?? 70;
  const pot = p.potential ?? p.scoutedPotential ?? ovr;
  if ((p.ego ?? 50) >= 80 && (p.composure ?? 70) <= 60) return "High Risk";
  if (ovr >= 80 && pot >= 88) return "Blue Chip";
  if (ovr >= 78 || (ovr >= 75 && pot >= 86)) return "CDL Ready";
  if (p.age >= 28 && !p.teamId) return "Veteran";
  if ((p.form ?? 0) >= 2) return "Rising";
  if ((p.form ?? 0) <= -2) return "Falling";
  return "Stable";
}

export default function Prospects() {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const { openTeamHub } = useTeamHub();
  const [roleFilter, setRoleFilter] = useState("All");
  const [archFilter, setArchFilter] = useState("All");
  const [sortKey, setSortKey] = useState("scoutedOverall");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [signAs, setSignAs] = useState({});
  const [shortlist, setShortlist] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("challenger_shortlist") || "[]")); } catch { return new Set(); }
  });

  if (!state) return null;

  const { prospects, userTeamId, players, challengersLog, challengerTeams, schedule, challengerTransactions } = state;

  if (typeof window !== "undefined" && window.__CLM_DEBUG_CHALLENGER_TX__) {
    console.debug("[challenger-tx] Prospects Latest Moves state", {
      count: challengerTransactions?.length ?? 0,
      latest: (challengerTransactions || []).slice(-3),
    });
  }
  const myRoster = players.filter(p => p.teamId === userTeamId);
  const starterCount = myRoster.filter(p => !p.isSub).length;
  const subCount = myRoster.filter(p => p.isSub).length;

  // ── Budget calc ─────────────────────────────────────────────────────────
  const myStarters  = myRoster.filter(p => !p.isSub);
  const teamCap     = getTeamCap(userTeamId);
  const committed   = myStarters.reduce((s, p) => s + (p.salary ?? getSigningCost(p)), 0);
  const remaining   = teamCap - committed;
  const budgetPct   = Math.min(100, Math.round((committed / teamCap) * 100));
  const budgetColor = budgetPct >= 90 ? "#dc2626" : budgetPct >= 70 ? "#9a3412" : "#15803d";

  // Available prospects (not already on a team and not duplicated with CDL rosters)
  const cdlNames = buildCdlRosterNameSet(players);
  const available = (prospects || []).filter(p => !p.teamId && !isInactivePlayer(p) && !cdlNames.has(normalizePlayerName(p.name)));

  const stats = useMemo(() => {
    const vets = available.filter(p => !p.isProspect).length;
    const prospectsCount = available.filter(p => p.isProspect).length;
    const proAmEligible = available.filter(p => (p.overall ?? p.scoutedOverall ?? 0) >= 75).length;
    const top = [...available].sort((a,b)=>(b.scoutedOverall??b.overall)-(a.scoutedOverall??a.overall))[0] ?? null;
    const topPot = [...available].sort((a,b)=>(b.scoutedPotential??b.potential)-(a.scoutedPotential??a.potential))[0] ?? null;
    return { vets, prospectsCount, proAmEligible, top, topPot };
  }, [available]);

  const filtered = available
    .filter(p => {
      if (tab === "veterans") return !p.isProspect;
      if (tab === "prospects") return !!p.isProspect;
      if (tab === "proam") return (p.overall ?? p.scoutedOverall ?? 0) >= 75;
      if (tab === "shortlist") return shortlist.has(p.id);
      return true;
    })
    .filter(p => roleFilter === "All" || p.primary === roleFilter)
    .filter(p => archFilter === "All" || p.archetype === archFilter)
    .filter(p => !search || (p.name || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = a.scouted ? a[sortKey.replace("scouted", "").toLowerCase() || "overall"] ?? a[sortKey] : a[sortKey];
      const vb = b.scouted ? b[sortKey.replace("scouted", "").toLowerCase() || "overall"] ?? b[sortKey] : b[sortKey];
      return vb - va;
    });
  const qualifierResults = schedule?.challengerQualifierResults || [];
  const latestQualifier = qualifierResults.length ? qualifierResults[qualifierResults.length - 1] : null;
  const teamMap = Object.fromEntries((challengerTeams || []).map(t => [t.id, t]));

  function handleSign(prospectId) {
    const slot = signAs[prospectId] || "starter";
    dispatch({ type: "SIGN_PLAYER", playerId: prospectId, slotType: slot });
  }
  function toggleShortlist(id) {
    const next = new Set(shortlist);
    if (next.has(id)) next.delete(id); else next.add(id);
    setShortlist(next);
    localStorage.setItem("challenger_shortlist", JSON.stringify([...next]));
  }

  return (
    <div className="prospects-page">
      <h2>Challengers Circuit</h2>
      <div className="cm-hero">
        <div className="cm-chip-row">
          <span className="cm-chip">Available: <strong>{available.length}</strong></span>
          <span className="cm-chip">CDL Veterans: <strong>{stats.vets}</strong></span>
          <span className="cm-chip">Prospects: <strong>{stats.prospectsCount}</strong></span>
          <span className="cm-chip">Pro-Am Eligible: <strong>{stats.proAmEligible}</strong></span>
          <span className="cm-chip">Roster: <strong>{starterCount}/4</strong> + <strong>{subCount}/1</strong></span>
        </div>
        <div className="cm-chip-row">
          <span className="cm-chip">Cap: <strong>${(teamCap / 1000).toFixed(0)}k</strong></span>
          <span className="cm-chip">Committed: <strong>${(committed / 1000).toFixed(0)}k</strong></span>
          <span className="cm-chip">Remaining: <strong style={{ color: budgetColor }}>${(remaining / 1000).toFixed(0)}k</strong></span>
          {stats.top && <span className="cm-chip">Top Available: <button className="link-button player-link" onClick={() => openPlayerProfile(stats.top)}>{stats.top.name}</button></span>}
          {stats.topPot && <span className="cm-chip">Highest Potential: <button className="link-button player-link" onClick={() => openPlayerProfile(stats.topPot)}>{stats.topPot.name}</button></span>}
        </div>
        <div className="cm-budget-bar"><div style={{ width: `${budgetPct}%`, background: budgetColor }} /></div>
      </div>
      <p className="muted scout-note">
        ⚠ Ratings shown are <em>scouted estimates</em> – true values revealed on signing.
      </p>
      {!!challengerTeams?.length && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Challenger Teams</h3>
          <table className="roster-table">
            <thead><tr><th>Team</th><th>Region</th><th>OVR</th><th>Roster</th><th>Circuit</th><th>Form</th><th>Last Qual</th></tr></thead>
            <tbody>{challengerTeams.map(t => {
              const roster = t.playerIds.map(pid => prospects.find(p => p.id===pid) || players.find(p=>p.id===pid)).filter(Boolean);
              const ovr = roster.length ? Math.round(roster.reduce((s,p)=>s+(p.overall??65),0)/roster.length) : 0;
              return <tr key={t.id}><td><button className="link-button team-link" onClick={() => openTeamHub(t.id)}>{t.tag} · {t.name}</button></td><td>{t.region}</td><td>{ovr}</td><td>{roster.map((p, idx)=><span key={p.id}>{idx > 0 ? ", " : ""}<button className="link-button player-link" onClick={() => openPlayerProfile(p)}>{p.name}</button></span>)}</td><td>{t.circuitPoints ?? 0}</td><td>{t.form ?? 0}</td><td>{t.lastQualifierPlacement != null ? placementText(t.lastQualifierPlacement) : "-"}</td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Challenger Qualifier</h3>
        <h4 style={{ marginBottom: 8 }}>Latest Qualifier Results</h4>
        {!latestQualifier ? (
          <p className="muted">No Challenger qualifier has been played yet.</p>
        ) : (
          <table className="roster-table">
            <thead><tr><th>Place</th><th>Team</th><th>Region</th><th>OVR</th><th>Score</th><th>Circuit Pts</th><th>Form Δ</th><th>Status</th></tr></thead>
            <tbody>{latestQualifier.teams.slice().sort((a,b)=>a.placement-b.placement).map(row => {
              const team = teamMap[row.teamId] || { id: row.teamId, name: row.teamId, tag: row.teamId, region: "-" };
              const formDelta = (row.formAfter ?? 0) - (row.formBefore ?? 0);
              const tDisplay = { ...resolveTeamDisplay(team.id, schedule), ...team };
              return <tr key={`${latestQualifier.season}_${latestQualifier.majorIdx}_${row.teamId}`} style={row.qualified ? { background: "rgba(52,211,153,0.12)" } : undefined}>
                <td><strong>{placementText(row.placement)}</strong></td>
                <td><button className="link-button team-link" onClick={() => openTeamHub(team.id)}><TeamLogo team={tDisplay} size={16} /> {team.tag} · {team.name}</button></td>
                <td>{team.region || "-"}</td>
                <td>{row.teamOvr ?? "-"}</td>
                <td>{row.score ?? "-"}</td>
                <td>{row.circuitPointsAwarded ?? 0}</td>
                <td style={{ color: formDelta >= 0 ? "#34d399" : "#f87171" }}>{formDelta >= 0 ? "+" : ""}{formDelta}</td>
                <td>{row.qualified ? "Qualified for Major" : "Missed qualification"}</td>
              </tr>;
            })}</tbody>
          </table>
        )}
        <h4 style={{ margin: "14px 0 8px" }}>Qualifier History</h4>
        {!qualifierResults.length ? <p className="muted">No qualifier history yet.</p> : qualifierResults.slice().reverse().map((q, idx) => {
          const top4 = q.teams.slice().sort((a,b)=>a.placement-b.placement).slice(0,4);
          const winner = top4[0];
          return <details key={`${q.season}_${q.majorIdx}_${idx}`} style={{ marginBottom: 8 }}>
            <summary>Season {q.season} · Major {Number(q.majorIdx) + 1} Qualifier — Winner: <button className="link-button team-link" onClick={(e) => { e.preventDefault(); openTeamHub(winner?.teamId); }}>{teamMap[winner?.teamId]?.name || winner?.teamId}</button></summary>
            <ol style={{ marginTop: 6 }}>
              {top4.map(r => <li key={r.teamId}><strong>{placementText(r.placement)}</strong> — <button className="link-button team-link" onClick={() => openTeamHub(r.teamId)}>{teamMap[r.teamId]?.name || r.teamId}</button> — Qualified</li>)}
            </ol>
          </details>;
        })}
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Latest Moves</h3>
        {!(challengerTransactions || []).length ? <p className="muted">No recent challenger/CDL moves yet.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(challengerTransactions || []).slice(-10).reverse().map((tx, i) => (
              <li key={`${tx.playerId}_${tx.season}_${i}`} style={{ marginBottom: 4 }}>
                S{tx.season} · {transactionLabel(tx.type)} · <button className="link-button player-link" onClick={() => openPlayerProfile(tx.playerId)}>{tx.playerName}</button>{tx.note ? ` — ${tx.note}` : " moved"}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="cm-tabs">
        {TAB_KEYS.map(k => <button key={k} className={`filter-btn ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{k==="all"?"All Players":k==="veterans"?"CDL Veterans":k==="prospects"?"Prospects":k==="proam"?"Pro-Am Eligible":"Shortlist"}</button>)}
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Role</label>
          <select className="slot-select" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select>
        </div>
        <div className="filter-group">
          <label>Archetype</label>
          <select className="slot-select" value={archFilter} onChange={e=>setArchFilter(e.target.value)}>{ARCHETYPES.map(a=><option key={a} value={a}>{ARCH_LABELS[a] ?? a}</option>)}</select>
        </div>
        <div className="filter-group">
          <label>Sort</label>
          <select className="slot-select" value={sortKey} onChange={e=>setSortKey(e.target.value)}>
            <option value="scoutedOverall">OVR</option><option value="scoutedPotential">POT</option><option value="age">Age</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Search</label>
          <input className="slot-select" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Player name" />
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
              <th>Stock</th>
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
                    <button className="link-button player-link" onClick={() => openPlayerProfile(p)}>{p.name}</button>
                    {p.scouted && <span className="signed-badge"> ✓</span>}
                  </td>
                  <td>{p.age}</td>
                  <td>{p.region}</td>
                  <td><span className="role-pill">{p.primary}</span></td>
                  <td><span className="arch-pill">{ARCH_LABELS[p.archetype] ?? p.archetype}</span></td>
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
                    <button className="btn-secondary" style={{ padding: "4px 8px", marginRight: 8 }} onClick={() => toggleShortlist(p.id)}>{shortlist.has(p.id) ? "★" : "☆"}</button>
                    {canAfford ? (
                      <button className="btn-primary-sm" onClick={() => handleSign(p.id)}>Sign</button>
                    ) : (
                      <span style={{ color: "#ef5350", fontSize: "0.78rem", fontWeight: "bold" }}
                        title={`Exceeds cap by $${(overBy / 1000).toFixed(0)}k`}>
                        Over Budget
                      </span>
                    )}
                  </td>
                  <td>{challengerStockLabel(p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <details style={{ marginTop: 18 }}>
        <summary className="muted">Advanced / Debug: Pool Health</summary>
        <PoolHealth prospects={prospects} challengersLog={challengersLog} />
      </details>
    </div>
  );
}
