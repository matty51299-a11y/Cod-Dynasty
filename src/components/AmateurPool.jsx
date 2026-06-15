import { useDynasty } from "../store/dynastyStore.jsx";

export default function AmateurPool() {
  const { state } = useDynasty();
  if (!state) return null;

  const pool = state.amateurPool || [];

  return (
    <div className="amateur-pool">
      <h2>Amateur Pool</h2>
      <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel}</p>

      {pool.length === 0 ? (
        <div className="empty-state">
          <p>No amateur prospects have entered the scene yet.</p>
          <p className="dim-text">New players will emerge as later titles begin.</p>
        </div>
      ) : (
        <div className="fa-list">
          {pool.map(p => (
            <div key={p.id} className="fa-row">
              <span className="player-name">{p.name}</span>
              <span className="player-role">{p.primary || "Unknown"}</span>
              <span className="player-ovr">OVR {p.overall || "?"}</span>
              <span className="player-age">Age {p.age || "?"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
