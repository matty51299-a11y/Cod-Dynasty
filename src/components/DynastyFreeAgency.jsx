import { useDynasty } from "../store/dynastyStore.jsx";

export default function DynastyFreeAgency() {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const freeAgents = state.players.filter(p => !p.teamId && p.eraId === state.currentEraId);
  const userRosterCount = state.players.filter(p => p.teamId === state.userTeamId).length;
  const canSign = userRosterCount < 4;

  function handleSign(playerId) {
    dispatch({ type: "SIGN_PLAYER", playerId });
  }

  return (
    <div className="dynasty-fa">
      <h2>Free Agency</h2>
      <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel}</p>

      {freeAgents.length === 0 ? (
        <div className="empty-state">
          <p>No free agents available yet.</p>
        </div>
      ) : (
        <div className="fa-list">
          {freeAgents.map(p => (
            <div key={p.id} className="fa-row">
              <span className="player-name">{p.name}</span>
              <span className="player-role">{p.primary}</span>
              <span className="player-ovr">OVR {p.overall}</span>
              <span className="player-age">Age {p.age}</span>
              {canSign && (
                <button className="btn-primary-sm" onClick={() => handleSign(p.id)}>Sign</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
