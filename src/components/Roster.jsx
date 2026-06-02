// src/components/Roster.jsx
// Displays team rosters. In CDL mode the user manages their CDL franchise; in
// Challenger mode the user manages their Challenger team (sign/release via the
// Market) while CDL rosters remain viewable read-only.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { calcChemistry, chemLabel } from "../engine/chemistry.js";
import { getTeamRosterStatus, getChallengerRosterStatus } from "../utils/rosterValidation.js";
import { isChallengerMode, getChallengerRosterPlayers, getUserChallengerTeam } from "../utils/userTeam.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { EmptyState, PageHeader, Pill, SectionCard, StatCard } from "./ui.jsx";

const RATING_KEYS = [
  { key: "gunny",        label: "Gunny" },
  { key: "awareness",    label: "Awareness" },
  { key: "objective",    label: "Obj" },
  { key: "searchIQ",     label: "S.IQ" },
  { key: "clutch",       label: "Clutch" },
  { key: "teamwork",     label: "T.Work" },
  { key: "composure",    label: "Composure" },
  { key: "adaptability", label: "Adapt." },
];

function ratingColor(v) {
  if (v >= 90) return "#fbbf24";
  if (v >= 80) return "#34d399";
  if (v >= 70) return "#60a5fa";
  if (v >= 60) return "#fb923c";
  return "#f87171";
}

export default function Roster({ setScreen }) {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const challengerMode = isChallengerMode(state);
  // In Challenger mode the special "me" tab is the user's Challenger team.
  const [selectedTeam, setSelectedTeam] = useState(state?.userTeamId ?? "boston");

  if (!state) return null;

  const { players, userTeamId } = state;
  const isUserTab = selectedTeam === userTeamId;
  const userChallengerTab = challengerMode && isUserTab;

  const challengerTeam = getUserChallengerTeam(state);
  const myPlayers = userChallengerTab
    ? getChallengerRosterPlayers(state)
    : players.filter(p => p.teamId === selectedTeam);

  const chem = calcChemistry(myPlayers);
  const team = userChallengerTab
    ? { name: challengerTeam?.name ?? "Your Challenger Team", color: challengerTeam?.color, tag: challengerTeam?.tag }
    : CDL_TEAMS.find(t => t.id === selectedTeam);

  const starters = myPlayers.filter(p => !p.isSub);
  const subs     = myPlayers.filter(p => p.isSub);
  const sorted   = [...starters, ...subs].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const rosterStatus = userChallengerTab
    ? getChallengerRosterStatus(state)
    : getTeamRosterStatus(players, selectedTeam);
  const showIncomplete = isUserTab && !rosterStatus.valid;
  const avgOvr = starters.length ? Math.round(starters.reduce((sum, p) => sum + (p.overall ?? 0), 0) / starters.length) : "—";
  const expiringCount = myPlayers.filter(p => (p.contractYears ?? 2) <= 1).length;
  const starCount = myPlayers.filter(p => (p.overall ?? 0) >= 85).length;

  // Tabs: in Challenger mode, lead with the user's team, then all CDL teams (read-only).
  const cdlTabs = CDL_TEAMS.map(t => ({ id: t.id, tag: t.tag, color: t.color }));
  const tabs = challengerMode
    ? [{ id: userTeamId, tag: challengerTeam?.tag ?? "ME", color: challengerTeam?.color }, ...cdlTabs]
    : cdlTabs;

  const releaseAction = userChallengerTab ? "RELEASE_CHALLENGER_PLAYER" : "RELEASE_PLAYER";
  const canRelease = isUserTab;

  return (
    <div className="roster-page">
      <div className="team-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${selectedTeam === t.id ? "active" : ""}`}
            style={selectedTeam === t.id ? { borderBottomColor: t.color, color: t.color } : {}}
            onClick={() => setSelectedTeam(t.id)}
          >
            {t.tag}{challengerMode && t.id === userTeamId ? " ★" : ""}
          </button>
        ))}
      </div>

      <PageHeader
        eyebrow={userChallengerTab ? "Challenger Squad" : "Squad Management"}
        title={team?.name}
        subtitle={userChallengerTab
          ? "Manage your Challenger roster. Sign players from the Market; releasing below 4 blocks match play."
          : "Manage starters, substitute depth, contracts and rating profile. Click any player row for the full profile."}
        accent={team?.color}
        action={userChallengerTab && setScreen ? <button className="btn-cta" onClick={() => setScreen("prospects")}>Open Market ›</button> : null}
        meta={(
          <div className="ui-stat-grid compact">
            <StatCard label="Starters" value={`${starters.length}/4`} tone={showIncomplete ? "danger" : "success"} />
            <StatCard label="Avg OVR" value={avgOvr} />
            <StatCard label="Chemistry" value={chem} hint={chemLabel(chem)} />
            {!userChallengerTab && <StatCard label="Expiring" value={expiringCount} tone={expiringCount ? "warning" : "neutral"} />}
          </div>
        )}
      />

      <div className="roster-alert-row">
        {starCount > 0 && <Pill tone="gold">★ {starCount} star player{starCount === 1 ? "" : "s"}</Pill>}
        {expiringCount > 0 && !userChallengerTab && <Pill tone="warning">{expiringCount} expiring contract{expiringCount === 1 ? "" : "s"}</Pill>}
        {starters.some(p => (p.form ?? 50) < 45) && <Pill tone="danger">Low form watchlist</Pill>}
      </div>

      {showIncomplete && (
        <div className="roster-warning" role="status">
          <strong>Roster incomplete</strong> — {team?.name} have {rosterStatus.count}/{rosterStatus.required} starters.
          Sign {rosterStatus.missing} more {rosterStatus.missing === 1 ? "player" : "players"} before playing or simming matches.
        </div>
      )}

      <SectionCard title="First Team & Bench" subtitle="Dense squad view with ratings, form, salary and contract status.">
      {sorted.length === 0 ? (
        <EmptyState title="No players on this roster" detail={userChallengerTab ? "Use the Market to add players." : "Use Free Agency or Challengers to add players."} />
      ) : (
        <div className="ui-table-wrap roster-table-wrap"><table className="roster-table data-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Age</th>
              <th>Role</th>
              <th>OVR</th>
              <th>POT</th>
              <th>Form</th>
              {RATING_KEYS.map(r => <th key={r.key}>{r.label}</th>)}
              <th>Salary</th>
              <th>Yrs</th>
              {canRelease && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr
                key={p.id}
                className={`player-row ${p.isSub ? "sub-row" : ""}`}
                onClick={() => openPlayerProfile(p)}
                title="Click for player detail"
              >
                <td
                  className="player-name"
                  style={{
                    borderLeft: `3px solid ${
                      p.overall >= 90 ? "#b45309"
                      : p.overall >= 85 ? "#15803d"
                      : p.overall >= 80 ? "#3d8f5f"
                      : "var(--border)"
                    }`,
                    borderRadius: "6px 0 0 6px",
                    paddingLeft: 8,
                  }}
                >
                  <button className="link-button player-link roster-player-link" onClick={(e) => { e.stopPropagation(); openPlayerProfile(p); }}>{p.name}</button>
                  {p.overall >= 85 && <span className="ui-mini-flag star">★</span>}
                  {(p.contractYears ?? 2) <= 1 && !userChallengerTab && <span className="ui-mini-flag warn">EXP</span>}
                  {(p.form ?? 50) < 45 && <span className="ui-mini-flag danger">FORM</span>}
                  {p.isSub && <span className="sub-label">SUB</span>}
                </td>
                <td>{p.age}</td>
                <td><span className="role-pill ui-pill ui-pill-neutral">{p.primary}</span></td>
                <td><span style={{ color: ratingColor(p.overall), fontWeight: "bold" }}>{p.overall}</span></td>
                <td><span style={{ color: ratingColor(p.potential) }}>{p.potential}</span></td>
                <td>
                  <div className="form-bar">
                    <div className="form-fill" style={{ width: `${p.form}%`, background: ratingColor(p.form) }} />
                  </div>
                  <span className="form-num">{Math.round(p.form)}</span>
                </td>
                {RATING_KEYS.map(r => (
                  <td key={r.key} style={{ color: ratingColor(p[r.key]) }}>{p[r.key]}</td>
                ))}
                <td className="salary">{p.salary != null ? `$${(p.salary / 1000).toFixed(0)}k` : "—"}</td>
                <td style={{ color: (p.contractYears ?? 2) <= 1 ? "#ff6450" : "var(--text-dim)", fontSize: 12 }}>
                  {userChallengerTab ? "—" : (p.contractYears ?? "—")}
                </td>
                {canRelease && (
                  <td>
                    <button
                      className="btn-danger-sm"
                      onClick={e => { e.stopPropagation(); dispatch({ type: releaseAction, playerId: p.id }); }}
                    >
                      Release
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      </SectionCard>
    </div>
  );
}
