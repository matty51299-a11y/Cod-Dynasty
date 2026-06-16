import { useDynasty } from "../store/dynastyStore.jsx";

export default function DynastyFreeAgency() {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const freeAgents = (state.freeAgents?.length ? state.freeAgents : state.players.filter(p => !p.teamId)).filter(p => !p.teamId && (p.eraId === state.currentEraId || p.debutEraId === state.currentEraId || (state.currentEraId === "advanced_warfare" && ["ghosts", "advanced_warfare", undefined].includes(p.debutEraId || p.eraId))));
  const userRosterCount = state.players.filter(p => p.teamId === state.userTeamId).length;
  const canSign = userRosterCount < 4;

  function handleSign(playerId) {
    dispatch({ type: "SIGN_PLAYER", playerId });
  }

  return (
    <div className="dynasty-fa">
      <h2>Free Agency</h2>
      <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel} · Your roster: {userRosterCount}/4</p>
      {userRosterCount < 4 && <div className="roster-warning"><strong>Roster incomplete: {userRosterCount}/4 players</strong><span>Signing is enabled until your active roster reaches 4.</span></div>}

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
              <button className="btn-primary-sm" disabled={!canSign} onClick={() => handleSign(p.id)}>{canSign ? "Sign" : "Roster Full"}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
