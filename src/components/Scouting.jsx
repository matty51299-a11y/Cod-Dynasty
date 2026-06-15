// src/components/Scouting.jsx
// Prospect Scouting 2.0 — the Prospect Hub.
// Prospects and young/unknown players are shown as estimated OVR/POT ranges with
// a scout-confidence score until the user invests scouting assignments to narrow
// the uncertainty. Established CDL players are shown with exact ratings.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { getSigningCost } from "../engine/rosterAI.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import {
  getScoutingSummary, getDisplayPot,
  isScoutTarget, getAssignmentsRemaining, getMaxAssignments, getStaffScoutPower,
  isShortlisted, isHiddenGemCandidate, formatDisplayRating, getConfidenceBand,
} from "../engine/scoutingEngine.js";
import { buildCdlRosterNameSet, isInactivePlayer, normalizePlayerName } from "../utils/playerIdentity.js";
import { isChallengerMode } from "../utils/userTeam.js";
import { EmptyState, PageHeader, Pill, SectionCard, StatCard } from "./ui.jsx";

const ROLES = ["All", "Entry SMG", "Slayer SMG", "Flex", "Main AR", "Objective", "Search Specialist"];

function riskTone(risk) {
  if (risk === "Low" || risk === "Safe Floor") return "success";
  if (risk === "Medium") return "neutral";
  if (risk === "High Ceiling") return "accent";
  if (risk === "Boom/Bust") return "gold";
  return "danger"; // High
}

function ConfBar({ conf }) {
  const band = getConfidenceBand(conf);
  const color = conf >= 75 ? "#34d399" : conf >= 50 ? "#60a5fa" : conf >= 25 ? "#fbbf24" : "#f87171";
  return (
    <div className="scout-conf" title={band.label}>
      <div className="scout-conf-track"><div style={{ width: `${conf}%`, background: color }} /></div>
      <span style={{ color }}>{conf}%</span>
    </div>
  );
}

function RangeCell({ disp, tone }) {
  const color = tone === "pot" ? "#c4b5fd" : "#93c5fd";
  return <span style={{ color, fontWeight: 600 }}>{formatDisplayRating(disp)}{disp.exact ? "" : ""}</span>;
}

export default function Scouting() {
  const { state, dispatch } = useGame();
  const challengerMode = isChallengerMode(state);
  const { openPlayerProfile } = usePlayerProfile();
  const [tab, setTab] = useState("pool");
  const [roleFilter, setRoleFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  if (!state) return null;
  const { players, prospects, userTeamId } = state;

  // ── Candidate pool: unsigned prospects + young/unknown free agents ──────────
  const cdlNames = buildCdlRosterNameSet(players);
  const poolProspects = (prospects || []).filter(p =>
    !p.teamId && !isInactivePlayer(p) && !cdlNames.has(normalizePlayerName(p.name)));
  const faTargets = (players || []).filter(p =>
    !p.teamId && !isInactivePlayer(p) && (!p.status || p.status === "freeAgent") && isScoutTarget(p, state));
  const allTargets = [...poolProspects, ...faTargets];

  // ── Staff / assignment summary ──────────────────────────────────────────────
  const { gm, an, power } = getStaffScoutPower(state, userTeamId);
  const remaining = getAssignmentsRemaining(state);
  const maxAssign = getMaxAssignments(state);
  const shortlistIds = state.userScouting?.shortlist || [];
  const shortlist = allTargets.filter(p => shortlistIds.includes(p.id));

  // Recommendations / hidden gems (analyst-driven, deterministic).
  const recommended = [...allTargets]
    .map(p => ({ p, sum: getScoutingSummary(p, state) }))
    .filter(x => x.sum.hiddenGem || x.sum.recommendation.startsWith("Possible") || x.sum.recommendation.startsWith("High-risk"))
    .slice(0, 24);
  const hiddenGems = allTargets.filter(p => isHiddenGemCandidate(p, state));

  // ── Active list for the current tab ─────────────────────────────────────────
  let list = tab === "shortlist" ? shortlist : tab === "recommended" ? recommended.map(x => x.p) : allTargets;
  list = list
    .filter(p => roleFilter === "All" || p.primary === roleFilter)
    .filter(p => !search || (p.name || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // Sort by displayed POT midpoint, then confidence.
      const pa = getDisplayPot(a, state), pb = getDisplayPot(b, state);
      const ma = pa.exact ? pa.value : (pa.min + pa.max) / 2;
      const mb = pb.exact ? pb.value : (pb.min + pb.max) / 2;
      return mb - ma;
    });

  const selected = allTargets.find(p => p.id === selectedId) || null;

  function scout(id, deep) { dispatch({ type: "SCOUT_PLAYER", playerId: id, deep }); }
  function shortlistToggle(id) { dispatch({ type: "TOGGLE_SHORTLIST", playerId: id }); }

  return (
    <div className="scouting-page">
      <PageHeader
        eyebrow={challengerMode ? "Recruitment — Road to Pro Circuit" : "Recruitment"}
        title="Prospect Scouting"
        subtitle={challengerMode
          ? "Find affordable talent, hidden gems and players with a route to the Pro Circuit. Pro-ready prospects you develop may attract buyout interest if they perform."
          : "Estimated ratings tighten as you scout. Spend assignments to uncover hidden gems and avoid busts."}
        meta={(
          <div className="ui-stat-grid compact">
            <StatCard label="Assignments" value={`${remaining}/${maxAssign}`} tone={remaining > 0 ? "success" : "warning"} hint="per stage" />
            <StatCard label="GM Scout" value={gm?.scouting ?? "—"} hint={gm?.name || "vacant"} />
            <StatCard label="Analyst Scout" value={an?.scouting ?? "—"} hint={an?.name || "vacant"} />
            <StatCard label="Shortlist" value={shortlist.length} tone="accent" />
          </div>
        )}
      />

      <div className="cm-hero ui-budget-panel">
        <div className="cm-chip-row">
          <Pill>Targets <strong>{allTargets.length}</strong></Pill>
          <Pill tone="accent">Hidden Gem Candidates <strong>{hiddenGems.length}</strong></Pill>
          <Pill tone={remaining > 0 ? "success" : "danger"}>Assignments Left <strong>{remaining}</strong></Pill>
          <Pill>Scout Power <strong>{Math.round(power * 100)}%</strong></Pill>
        </div>
        <p className="muted scout-note" style={{ margin: "6px 0 0" }}>
          ⚠ Ratings for prospects & young unknowns are <em>scouted estimates</em>. Better Assistant GM / Analyst scouting narrows the range faster and surfaces real gems.
        </p>
      </div>

      <div className="scouting-layout">
        <div className="scouting-main">
          <div className="cm-tabs ui-tabs">
            {[["pool", "Prospect Pool"], ["recommended", `Recommended (${recommended.length})`], ["shortlist", `Shortlist (${shortlist.length})`]].map(([k, label]) => (
              <button key={k} className={`filter-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>Role</label>
              <select className="slot-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Search</label>
              <input className="slot-select" value={search} onChange={e => setSearch(e.target.value)} placeholder="Player name" />
            </div>
          </div>

          <SectionCard title="Scouting Pool" subtitle="Estimated OVR/POT ranges; click a row to open the scout report.">
            {list.length === 0 ? (
              <EmptyState title="No prospects match" detail="Try another tab, role or search term." />
            ) : (
              <div className="ui-table-wrap"><table className="roster-table data-table scout-table">
                <thead>
                  <tr>
                    <th></th><th>Player</th><th>Age</th><th>Region</th><th>Role</th>
                    <th>Est OVR</th><th>Est POT</th><th>Confidence</th><th>Risk</th><th>Traits</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(p => {
                    const sum = getScoutingSummary(p, state);
                    const conf = sum.confidence;
                    const shortlisted = isShortlisted(state, p.id);
                    return (
                      <tr key={p.id} className={selectedId === p.id ? "scout-row-sel" : ""} onClick={() => setSelectedId(p.id)} style={{ cursor: "pointer" }}>
                        <td>{sum.hiddenGem ? <span title="Hidden gem candidate">💎</span> : sum.bustRisk ? <span title="Bust risk">⚠</span> : ""}</td>
                        <td className="player-name">
                          <button className="link-button player-link" onClick={(e) => { e.stopPropagation(); openPlayerProfile(p); }}>{p.name}</button>
                        </td>
                        <td>{p.age}</td>
                        <td>{p.region}</td>
                        <td><span className="role-pill ui-pill ui-pill-neutral">{p.primary}</span></td>
                        <td><RangeCell disp={sum.displayOvr} tone="ovr" /></td>
                        <td><RangeCell disp={sum.displayPot} tone="pot" /></td>
                        <td><ConfBar conf={conf} /></td>
                        <td><Pill tone={riskTone(sum.risk)}>{sum.risk}</Pill></td>
                        <td className="scout-traits">{sum.revealedTraits.length ? sum.revealedTraits.slice(0, 3).map(t => <span key={t} className="scout-trait-chip">{t}</span>) : <span className="muted">—</span>}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn-secondary scout-btn" disabled={remaining < 1 || conf >= 100} onClick={() => scout(p.id, false)} title="Scout (1 assignment)">Scout</button>
                          <button className="btn-secondary scout-btn" disabled={remaining < 2 || conf >= 100} onClick={() => scout(p.id, true)} title="Deep Scout (2 assignments)">Deep</button>
                          <button className="btn-secondary scout-btn" onClick={() => shortlistToggle(p.id)} title="Shortlist">{shortlisted ? "★" : "☆"}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </SectionCard>
        </div>

        {/* ── Scout report aside ─────────────────────────────────────────────── */}
        <aside className="scouting-aside">
          {!selected ? (
            <SectionCard title="Scout Report">
              <EmptyState title="Select a prospect" detail="Click any row to view the full scout report." />
            </SectionCard>
          ) : (() => {
            const sum = getScoutingSummary(selected, state);
            const cost = getSigningCost(selected);
            return (
              <SectionCard title="Scout Report" subtitle={`${selected.name} · ${selected.primary} · ${selected.region} · Age ${selected.age}`}>
                <div className="scout-report">
                  <div className="scout-report-grid">
                    <div><span className="muted">Est OVR</span><strong><RangeCell disp={sum.displayOvr} tone="ovr" /></strong></div>
                    <div><span className="muted">Est POT</span><strong><RangeCell disp={sum.displayPot} tone="pot" /></strong></div>
                    <div><span className="muted">Risk</span><strong><Pill tone={riskTone(sum.risk)}>{sum.risk}</Pill></strong></div>
                    <div><span className="muted">Report</span><strong>{sum.band}</strong></div>
                  </div>
                  <div style={{ margin: "8px 0" }}><ConfBar conf={sum.confidence} /></div>
                  <p className="scout-report-line"><em>{sum.report}</em></p>

                  {sum.strengths.length > 0 && (
                    <div className="scout-block"><h5>Strengths</h5><ul>{sum.strengths.map(s => <li key={s}>{s}</li>)}</ul></div>
                  )}
                  {sum.weaknesses.length > 0 && (
                    <div className="scout-block"><h5>Weaknesses</h5><ul>{sum.weaknesses.map(s => <li key={s}>{s}</li>)}</ul></div>
                  )}
                  {sum.revealedTraits.length > 0 && (
                    <div className="scout-block"><h5>Traits</h5><div className="scout-traits">{sum.revealedTraits.map(t => <span key={t} className="scout-trait-chip">{t}</span>)}</div></div>
                  )}
                  <div className="scout-block">
                    <h5>Recommendation</h5>
                    <p>{sum.recommendation}</p>
                    {sum.hiddenGem && <Pill tone="accent">💎 Hidden Gem Candidate</Pill>}
                    {sum.bustRisk && <Pill tone="danger">⚠ Bust Risk</Pill>}
                  </div>
                  <div className="scout-block muted" style={{ fontSize: "0.78rem" }}>Est. signing cost ${(cost / 1000).toFixed(0)}k</div>

                  <div className="scout-actions">
                    <button className="btn-primary-sm" disabled={remaining < 1 || sum.confidence >= 100} onClick={() => scout(selected.id, false)}>Scout (1)</button>
                    <button className="btn-primary-sm" disabled={remaining < 2 || sum.confidence >= 100} onClick={() => scout(selected.id, true)}>Deep Scout (2)</button>
                    <button className="btn-secondary" onClick={() => shortlistToggle(selected.id)}>{isShortlisted(state, selected.id) ? "★ Shortlisted" : "☆ Shortlist"}</button>
                  </div>
                </div>
              </SectionCard>
            );
          })()}

          {recommended.length > 0 && (
            <SectionCard title="Recommended Targets" subtitle="Analyst-flagged upside & risk to investigate.">
              <ul className="scout-reco-list">
                {recommended.slice(0, 6).map(({ p, sum }) => (
                  <li key={p.id} onClick={() => setSelectedId(p.id)}>
                    <span className="reco-name">{sum.hiddenGem ? "💎 " : ""}{p.name}</span>
                    <span className="muted">{p.primary} · {sum.displayOvrText} OVR · {sum.confidence}%</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  );
}
