import { useDynasty } from "../store/dynastyStore.jsx";

export default function DynastyRoster() {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const team = state.teams.find(t => t.id === state.userTeamId);
  const roster = state.players.filter(p => p.teamId === state.userTeamId);

  function handleRelease(playerId) {
    dispatch({ type: "RELEASE_PLAYER", playerId });
  }

  return (
    <div className="dynasty-roster">
      <h2>Roster — {team?.name || "My Team"}</h2>
      <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel} · {roster.length}/4 players</p>

      <div className="roster-grid">
        {roster.map(p => (
          <div key={p.id} className="roster-card">
            <div className="roster-card-header">
              <span className="player-name-lg">{p.name}</span>
              <span className="player-ovr-badge">OVR {p.overall}</span>
            </div>
            <div className="roster-card-body">
              <div className="roster-stat"><span>Role</span><strong>{p.primary}</strong></div>
              <div className="roster-stat"><span>Age</span><strong>{p.age}</strong></div>
              <div className="roster-stat"><span>Potential</span><strong>{p.potential}</strong></div>
              <div className="roster-stat"><span>Gunny</span><strong>{p.gunny}</strong></div>
              <div className="roster-stat"><span>Awareness</span><strong>{p.awareness}</strong></div>
              <div className="roster-stat"><span>SnD IQ</span><strong>{p.searchIQ}</strong></div>
              <div className="roster-stat"><span>Clutch</span><strong>{p.clutch}</strong></div>
              <div className="roster-stat"><span>Teamwork</span><strong>{p.teamwork}</strong></div>
              <div className="roster-stat"><span>Contract</span><strong>{p.contractYears}yr</strong></div>
            </div>
            <div className="roster-card-actions">
              <button className="btn-danger-sm" onClick={() => handleRelease(p.id)}>Release</button>
            </div>
          </div>
        ))}
        {roster.length === 0 && <p className="dim-text">No players on roster.</p>}
      </div>
    </div>
  );
}
