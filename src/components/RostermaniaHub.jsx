import { useState } from "react";
import { useDynasty } from "../store/dynastyStore.jsx";
import { getEra } from "../data/codEras.js";
import { getRosterIntegrityProblems } from "../engine/rosterIntegrity.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "roster", label: "My Roster" },
  { id: "freeagency", label: "Free Agency" },
  { id: "newteams", label: "New Teams" },
  { id: "departed", label: "Departed Teams" },
  { id: "moves", label: "Roster Moves" },
];

function computeTeamOVR(players, teamId) {
  const roster = players.filter(p => p.teamId === teamId);
  if (roster.length === 0) return 0;
  return Math.round(roster.reduce((sum, p) => sum + (p.overall || 0), 0) / roster.length);
}

export default function RostermaniaHub({ setScreen }) {
  const { state, dispatch } = useDynasty();
  const [tab, setTab] = useState("overview");

  if (!state?.rostermaniaActive) {
    return (
      <div className="dynasty-home">
        <div className="home-card"><h2>Rostermania is not active.</h2><button className="btn-primary" onClick={() => setScreen("home")}>Return Home</button></div>
      </div>
    );
  }

  const data = state.rostermaniaData || {};
  const summary = state.transitionSummary || {};
  const review = data.seasonReview || {};
  const fromEra = getEra(summary.fromEraId || "ghosts");
  const toEra = getEra(summary.toEraId || "advanced_warfare");
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  const userRoster = state.players.filter(p => p.teamId === state.userTeamId);
  const userRosterCount = userRoster.length;
  const teamOVR = computeTeamOVR(state.players, state.userTeamId);

  const freeAgents = (state.freeAgents?.length ? state.freeAgents : state.players.filter(p => !p.teamId))
    .filter(p => !p.teamId && (
      p.eraId === "advanced_warfare" ||
      p.debutEraId === "advanced_warfare" ||
      (["ghosts", "advanced_warfare", undefined].includes(p.debutEraId || p.eraId))
    ))
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));

  const problems = getRosterIntegrityProblems(state, "advanced_warfare");
  const canStart = userRosterCount === 4 && problems.length === 0;

  function handleSign(playerId) {
    dispatch({ type: "SIGN_PLAYER", playerId });
  }

  function handleRelease(playerId) {
    dispatch({ type: "RELEASE_PLAYER", playerId });
  }

  function handleStartSeason() {
    dispatch({ type: "CONFIRM_AW_SEASON" });
    setScreen("home");
  }

  function handleSelectTeam(teamId) {
    dispatch({ type: "SELECT_ROSTERMANIA_TEAM", teamId });
  }

  const transitionRows = state.transitionAuditRows || [];
  const rosterMoves = transitionRows.filter(r =>
    r.status === "assigned_to_aw_team" || r.status === "moved_to_free_agency" || r.status === "preserved_on_user_roster"
  );

  const newTeamNames = new Set(summary.newTeams || []);
  const newTeams = state.teams.filter(t => newTeamNames.has(t.name));
  const departedTeamNames = summary.departedTeams || [];

  if (data.needsTeamSelect) {
    return (
      <div className="dynasty-home">
        <div className="home-header"><div><h2>Rostermania — Choose Your Team</h2><div className="home-meta"><span className="home-chip">{toEra.gameTitle}</span><span className="home-chip">{toEra.seasonLabel}</span></div></div></div>
        <div className="home-card">
          <h3>Your Ghosts team is not active in Advanced Warfare</h3>
          <p className="dim-text">
            {review.userTeamName || data.previousUserTeamId} does not exist in the AW era.
            Choose an Advanced Warfare team to take over.
          </p>
        </div>
        <div className="rm-team-select-grid">
          {state.teams.map(t => {
            const roster = state.players.filter(p => p.teamId === t.id);
            const ovr = computeTeamOVR(state.players, t.id);
            return (
              <div key={t.id} className="rm-team-card" onClick={() => handleSelectTeam(t.id)}>
                <div className="rm-team-header">
                  <span className="rm-team-dot" style={{ background: t.color || "#5b9dff" }} />
                  <strong>{t.name}</strong>
                </div>
                <div className="rm-team-meta">
                  <span>OVR {ovr}</span>
                  <span>{roster.length}/4 players</span>
                </div>
                <div className="rm-team-roster-preview">
                  {roster.slice(0, 4).map(p => (
                    <span key={p.id} className="dim-text">{p.name} ({p.overall})</span>
                  ))}
                </div>
                <button className="btn-primary-sm">Take Over</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="dynasty-home rostermania-hub">
      <div className="home-header">
        <div>
          <h2>Rostermania Hub</h2>
          <div className="home-meta">
            <span className="home-chip">{fromEra.shortTitle} → {toEra.shortTitle}</span>
            <span className="home-chip">{toEra.seasonLabel}</span>
            <span className="home-chip">{userTeam?.name || "My Team"}</span>
          </div>
        </div>
        <div className="rm-header-actions">
          <span className={`rm-roster-badge ${userRosterCount === 4 ? "rm-roster-ok" : "rm-roster-warn"}`}>
            Roster: {userRosterCount}/4
          </span>
          <button className="btn-primary" disabled={!canStart} onClick={handleStartSeason}>
            Start {toEra.shortTitle} Season
          </button>
        </div>
      </div>

      <div className="rm-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`rm-tab ${tab === t.id ? "rm-tab-active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {!canStart && (
        <div className="rm-warnings">
          {userRosterCount !== 4 && (
            <div className="roster-warning">Your roster has {userRosterCount}/4 players. You need exactly 4 to start the season.</div>
          )}
          {problems.map((p, i) => (
            <div key={i} className="roster-warning">{p}</div>
          ))}
        </div>
      )}

      <div className="rm-content">
        {tab === "overview" && <OverviewTab state={state} summary={summary} review={review} fromEra={fromEra} toEra={toEra} userTeam={userTeam} userRoster={userRoster} freeAgents={freeAgents} newTeams={newTeams} departedTeamNames={departedTeamNames} teamOVR={teamOVR} />}
        {tab === "roster" && <RosterTab state={state} userRoster={userRoster} userRosterCount={userRosterCount} teamOVR={teamOVR} onRelease={handleRelease} />}
        {tab === "freeagency" && <FreeAgencyTab freeAgents={freeAgents} userRosterCount={userRosterCount} onSign={handleSign} />}
        {tab === "newteams" && <NewTeamsTab newTeams={newTeams} players={state.players} />}
        {tab === "departed" && <DepartedTab departedTeamNames={departedTeamNames} transitionRows={transitionRows} />}
        {tab === "moves" && <MovesTab rosterMoves={rosterMoves} summary={summary} />}
      </div>
    </div>
  );
}

function OverviewTab({ state, summary, review, fromEra, toEra, userTeam, userRoster, freeAgents, newTeams, departedTeamNames, teamOVR }) {
  return (
    <div className="home-grid">
      <div className="home-card">
        <h3>Era Transition</h3>
        <div className="home-stat-row"><span>From</span><strong>{fromEra.gameTitle}, {fromEra.seasonLabel}</strong></div>
        <div className="home-stat-row"><span>To</span><strong>{toEra.gameTitle}, {toEra.seasonLabel}</strong></div>
        <div className="home-stat-row"><span>Movement</span><strong>{toEra.movementStyle === "jetpack" ? "Jetpack" : "Boots"}</strong></div>
      </div>
      <div className="home-card">
        <h3>Your Team — {userTeam?.name}</h3>
        <div className="home-stat-row"><span>Roster</span><strong>{userRoster.length}/4</strong></div>
        <div className="home-stat-row"><span>Team OVR</span><strong>{teamOVR}</strong></div>
        <div className="home-stat-row"><span>Status</span><strong>{summary.userTeamStatus === "preserved" ? "Preserved from Ghosts" : "Assigned to AW org"}</strong></div>
      </div>
      <div className="home-card">
        <h3>League Summary</h3>
        <div className="home-stat-row"><span>Active Teams</span><strong>{state.teams.length}</strong></div>
        <div className="home-stat-row"><span>Free Agents</span><strong>{freeAgents.length}</strong></div>
        <div className="home-stat-row"><span>New Teams</span><strong>{newTeams.length}</strong></div>
        <div className="home-stat-row"><span>Departed Teams</span><strong>{departedTeamNames.length}</strong></div>
      </div>
      <div className="home-card">
        <h3>New Players Entering AW</h3>
        {(summary.newPlayers || []).length > 0 ? (
          <p>{summary.newPlayers.slice(0, 12).join(", ")}</p>
        ) : (
          <p className="dim-text">No new entrants.</p>
        )}
      </div>
    </div>
  );
}

function RosterTab({ state, userRoster, userRosterCount, teamOVR, onRelease }) {
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  const hasDuplicateWarning = (() => {
    const ids = userRoster.map(p => p.id);
    return new Set(ids).size !== ids.length;
  })();

  return (
    <div className="rm-roster-section">
      <div className="rm-roster-header">
        <h3>{userTeam?.name || "My Team"} Roster</h3>
        <span className={`rm-roster-badge ${userRosterCount === 4 ? "rm-roster-ok" : "rm-roster-warn"}`}>
          {userRosterCount}/4 Players
        </span>
        <span className="rm-roster-ovr">Team OVR: {teamOVR}</span>
      </div>
      {userRosterCount < 4 && <div className="roster-warning">Roster incomplete — sign a free agent to fill the gap.</div>}
      {hasDuplicateWarning && <div className="roster-warning">Duplicate player detected on your roster.</div>}
      <div className="rm-roster-list">
        {userRoster.map(p => (
          <div key={p.id} className="rm-player-card">
            <div className="rm-player-info">
              <strong className="player-name">{p.displayName || p.name}</strong>
              <span className="player-role">{p.primary || p.role}</span>
            </div>
            <div className="rm-player-stats">
              <span className="player-ovr">OVR {p.overall}</span>
              <span className="dim-text">POT {p.potential}</span>
              {p.confidence && <span className="dim-text">{p.confidence}</span>}
              {p.eraFit && <span className={`rm-era-fit rm-fit-${p.eraFit}`}>{p.eraFit} fit</span>}
            </div>
            <button className="btn-danger-sm" onClick={() => onRelease(p.id)}>Release</button>
          </div>
        ))}
        {userRosterCount < 4 && Array.from({ length: 4 - userRosterCount }).map((_, i) => (
          <div key={`empty-${i}`} className="rm-player-card rm-empty-slot">
            <span className="dim-text">Empty Roster Slot</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FreeAgencyTab({ freeAgents, userRosterCount, onSign }) {
  const canSign = userRosterCount < 4;
  const [search, setSearch] = useState("");

  const filtered = search
    ? freeAgents.filter(p => (p.displayName || p.name || "").toLowerCase().includes(search.toLowerCase()))
    : freeAgents;

  return (
    <div className="rm-fa-section">
      <div className="rm-fa-header">
        <h3>Free Agency ({freeAgents.length} available)</h3>
        <span className={`rm-roster-badge ${canSign ? "rm-roster-warn" : "rm-roster-ok"}`}>
          Your roster: {userRosterCount}/4
        </span>
      </div>
      {userRosterCount >= 4 && <p className="dim-text">Roster full — release a player before signing.</p>}
      <div className="rm-search">
        <input type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} className="rm-search-input" />
      </div>
      <div className="fa-list">
        {filtered.length === 0 ? (
          <p className="dim-text">No matching free agents.</p>
        ) : (
          filtered.map(p => (
            <div key={p.id} className="fa-row rm-fa-row">
              <span className="player-name">{p.displayName || p.name}</span>
              {p.previousTeamId && <span className="dim-text rm-prev-team">ex-{p.previousTeamId}</span>}
              <span className="player-role">{p.primary || p.role}</span>
              <span className="player-ovr">OVR {p.overall}</span>
              <span className="dim-text">POT {p.potential}</span>
              {p.confidence && <span className="dim-text">{p.confidence}</span>}
              {p.personalityTraits?.length > 0 && <span className="dim-text rm-traits">{p.personalityTraits.slice(0, 2).join(", ")}</span>}
              <button className="btn-primary-sm" disabled={!canSign} onClick={() => onSign(p.id)}>
                {canSign ? "Sign" : "Full"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NewTeamsTab({ newTeams, players }) {
  if (newTeams.length === 0) return <div className="home-card"><h3>New Teams</h3><p className="dim-text">No new teams entering Advanced Warfare.</p></div>;

  return (
    <div className="rm-teams-section">
      <h3>New Advanced Warfare Teams</h3>
      <div className="rm-teams-grid">
        {newTeams.map(t => {
          const roster = players.filter(p => p.teamId === t.id);
          const ovr = roster.length ? Math.round(roster.reduce((s, p) => s + (p.overall || 0), 0) / roster.length) : 0;
          return (
            <div key={t.id} className="home-card rm-team-info-card">
              <div className="rm-team-header">
                <span className="rm-team-dot" style={{ background: t.color || "#5b9dff" }} />
                <strong>{t.name}</strong>
              </div>
              <div className="home-stat-row"><span>Roster</span><strong>{roster.length}/4</strong></div>
              <div className="home-stat-row"><span>Team OVR</span><strong>{ovr}</strong></div>
              {roster.map(p => (
                <div key={p.id} className="home-roster-row">
                  <span className="player-name">{p.name}</span>
                  <span className="player-ovr">OVR {p.overall}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DepartedTab({ departedTeamNames, transitionRows }) {
  if (departedTeamNames.length === 0) return <div className="home-card"><h3>Departed Teams</h3><p className="dim-text">No teams departed from the circuit.</p></div>;

  const teamPlayerFates = {};
  for (const name of departedTeamNames) {
    const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const relevant = transitionRows.filter(r => {
      const prev = String(r.previousTeam || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      return prev === slug;
    });
    teamPlayerFates[name] = relevant;
  }

  return (
    <div className="rm-teams-section">
      <h3>Departed Ghosts Teams</h3>
      {departedTeamNames.map(name => {
        const fates = teamPlayerFates[name] || [];
        return (
          <div key={name} className="home-card rm-departed-card">
            <h4>{name}</h4>
            {fates.length > 0 ? (
              <div className="rm-departed-fates">
                {fates.map((f, i) => (
                  <div key={i} className="home-stat-row">
                    <span>{f.displayName}</span>
                    <strong>
                      {f.status === "assigned_to_aw_team" && `→ ${f.newTeam}`}
                      {f.status === "moved_to_free_agency" && "→ Free Agency"}
                      {f.status === "preserved_on_user_roster" && "→ Your Roster"}
                      {f.status === "moved_inactive" && "Inactive"}
                      {!["assigned_to_aw_team", "moved_to_free_agency", "preserved_on_user_roster", "moved_inactive"].includes(f.status) && (f.newTeam || "Unknown")}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dim-text">No player tracking data available.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MovesTab({ rosterMoves, summary }) {
  const significantMoves = rosterMoves.filter(r => r.previousTeam && r.newTeam && r.previousTeam !== r.newTeam);
  const majorChanges = summary.majorRosterChanges || [];

  return (
    <div className="rm-moves-section">
      <h3>Major Roster Moves</h3>
      {majorChanges.length > 0 && (
        <div className="home-card">
          <h4>Headline Moves</h4>
          {majorChanges.map((m, i) => (
            <div key={i} className="home-stat-row"><span>{m}</span></div>
          ))}
        </div>
      )}
      <div className="home-card">
        <h4>All Transitions ({significantMoves.length})</h4>
        {significantMoves.length === 0 ? (
          <p className="dim-text">No tracked roster moves.</p>
        ) : (
          <div className="rm-moves-list">
            {significantMoves.slice(0, 40).map((r, i) => (
              <div key={i} className="home-stat-row rm-move-row">
                <span className="player-name">{r.displayName}</span>
                <span className="dim-text">{r.previousTeam} → {r.newTeam}</span>
                <span className={`rm-move-badge rm-move-${r.status}`}>
                  {r.status === "assigned_to_aw_team" ? "Signed" : r.status === "moved_to_free_agency" ? "FA" : r.status === "preserved_on_user_roster" ? "Protected" : r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
