import { useMemo, useState } from "react";
import { useDynasty } from "../store/dynastyStore.jsx";
import { findPlayerLocation, getPlayerStatus, getTeamOvr, getTeamRoster, searchPlayers } from "../utils/playerLocation.js";
import { getSortedStandings } from "../engine/standingsEngine.js";

function statusLabel(status) {
  return String(status || "missing").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function LeagueRosters() {
  const { state } = useDynasty();
  const [selectedTeamId, setSelectedTeamId] = useState(state?.userTeamId || state?.teams?.[0]?.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const standings = useMemo(() => getSortedStandings(state?.standings || {}), [state?.standings]);
  if (!state) return null;

  const activeTeamIds = new Set(state.activeTeams || state.teams.map(t => t.id));
  const selectedTeam = state.teams.find(t => t.id === selectedTeamId) || state.teams[0];
  const roster = selectedTeam ? getTeamRoster(state, selectedTeam.id) : [];
  const activePlayers = (state.players || []).filter(p => p.teamId && activeTeamIds.has(p.teamId));
  const freeAgents = (state.players || []).filter(p => getPlayerStatus(p, findPlayerLocation(state, p.id).assignments) === "free_agent");
  const inactive = Object.values(state.playerRegistry || {}).filter(p => getPlayerStatus(p, []) === "inactive");
  const retired = Object.values(state.playerRegistry || {}).filter(p => getPlayerStatus(p, []) === "retired");
  const results = searchPlayers(state, query);
  const duplicateIds = roster.filter((p, i) => roster.findIndex(other => other.id === p.id) !== i).map(p => p.id);

  const visiblePlayers = filter === "free_agent" ? freeAgents : filter === "inactive" ? inactive : filter === "retired" ? retired : filter === "all" ? Object.values(state.playerRegistry || {}) : [];

  return (
    <div className="league-rosters screen-padded">
      <div className="league-header">
        <div>
          <h2>League Rosters</h2>
          <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel}</p>
        </div>
        <div className="league-stats">
          <span><strong>{activeTeamIds.size}</strong> Active Teams</span>
          <span><strong>{activePlayers.length}</strong> Active Players</span>
          <span><strong>{freeAgents.length}</strong> Free Agents</span>
          <span><strong>{inactive.length + retired.length}</strong> Inactive/Retired</span>
        </div>
      </div>

      <div className="finder-card">
        <label>Player Finder</label>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Crimsix, C6, FormaL, Formal, Karma..." />
        {query && (
          <div className="finder-results">
            {results.length ? results.map(result => (
              <div key={result.playerId} className={`finder-result ${result.duplicateAssignments.length ? "warn" : ""}`}>
                <strong>{result.displayName}</strong>
                <span>playerId: {result.playerId}</span>
                <span>Status: {statusLabel(result.status)}</span>
                <span>Current Team: {result.currentTeamName || "—"}</span>
                <span>{result.role || "Unknown Role"} · OVR {result.overall ?? "—"} · POT {result.potential ?? "—"}</span>
                {result.confidence && <span>Rating confidence: {result.confidence}</span>}
                {result.duplicateAssignments.length > 0 && <b>Duplicate assignments: {result.duplicateAssignments.map(a => a.teamName).join(", ")}</b>}
              </div>
            )) : <div className="finder-result warn">No player found for “{query}”. Check aliases or missing player report.</div>}
          </div>
        )}
      </div>

      <div className="league-filters">
        {[ ["active", "Active Teams"], ["free_agent", "Free Agents"], ["inactive", "Inactive"], ["retired", "Retired"], ["all", "All Players"] ].map(([id, label]) => (
          <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {filter === "active" ? (
        <div className="league-grid">
          <div className="team-directory">
            {state.teams.map(team => {
              const count = getTeamRoster(state, team.id).length;
              const standing = standings.find(s => s.teamId === team.id);
              const active = activeTeamIds.has(team.id);
              return <button key={team.id} className={`team-directory-row ${selectedTeam?.id === team.id ? "selected" : ""} ${count < 4 ? "warn" : ""}`} onClick={() => setSelectedTeamId(team.id)}>
                <span><strong>{team.name}</strong><small>{active ? "Active" : "Departed"}</small></span>
                <span>OVR {getTeamOvr(state, team.id)}</span><span>{count}/4</span><span>{standing?.proPoints || 0} PP</span><em>View Roster</em>
              </button>;
            })}
          </div>

          {selectedTeam && <div className="team-detail-panel">
            <h3>{selectedTeam.name}</h3>
            <p className="dim-text">{state.currentGameTitle} · OVR {getTeamOvr(state, selectedTeam.id)} · Roster {roster.length}/4</p>
            {roster.length < 4 && <div className="roster-warning">Roster incomplete: {roster.length}/4</div>}
            {duplicateIds.length > 0 && <div className="roster-warning">Duplicate player IDs: {duplicateIds.join(", ")}</div>}
            {roster.map(player => <div key={`${selectedTeam.id}-${player.id}`} className="team-player-row">
              <strong>{player.displayName || player.name}</strong><span>{player.role || player.primary || "Unknown"}</span><span>OVR {player.overall ?? "—"}</span><span>POT {player.potential ?? "—"}</span><span>{statusLabel(getPlayerStatus(player, [{ teamId: selectedTeam.id }]))}</span><small>{player.id}</small>{player.confidence && <small>{player.confidence}</small>}
            </div>)}
          </div>}
        </div>
      ) : (
        <div className="player-list-panel">
          {visiblePlayers.length ? visiblePlayers.map(player => <div key={player.id} className="team-player-row"><strong>{player.displayName || player.name}</strong><span>{player.role || player.primary || "Unknown"}</span><span>OVR {player.overall ?? "—"}</span><span>POT {player.potential ?? "—"}</span><small>{player.id}</small></div>) : <p className="dim-text">No players in this bucket.</p>}
        </div>
      )}
    </div>
  );
}
