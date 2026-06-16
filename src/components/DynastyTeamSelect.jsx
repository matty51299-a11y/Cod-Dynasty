import { useDynasty } from "../store/dynastyStore.jsx";
import { GHOSTS_TEAMS, getGhostsRosterForTeam, getGhostsTeamOvr } from "../data/historicalRosters.js";

export default function DynastyTeamSelect() {
  const { dispatch } = useDynasty();

  function pickTeam(teamId) {
    dispatch({ type: "NEW_GAME", teamId });
  }

  return (
    <div className="team-select-page">
      <div className="team-select-scroll">
        <div className="team-select">
          <h1 className="title">COD DYNASTY</h1>
          <p className="subtitle">Choose your Ghosts-era team.</p>

          <div className="ts-mode-tabs" aria-label="Dynasty start">
            <div className="ts-mode-tab active" role="note">
              Start Dynasty
              <span className="ts-mode-sub">Ghosts Era · 4v4 · Domination / Search and Destroy / Blitz</span>
            </div>
          </div>

          <div className="team-grid">
            {GHOSTS_TEAMS.map(team => {
              const roster = getGhostsRosterForTeam(team.id);
              const rosterNames = roster.map(p => p.name).join(", ");
              const ovr = getGhostsTeamOvr(team.id);
              return (
                <button
                  key={team.id}
                  className="team-card"
                  style={{ borderColor: team.color }}
                  onClick={() => pickTeam(team.id)}
                >
                  <span className="team-tag" style={{ color: team.color }}>{team.shortName || team.tag}</span>
                  <span className="team-name">{team.name}</span>
                  <span className="ts-challenger-meta">
                    <span className="ts-chip">Ghosts Era</span>
                    {ovr != null && <span className="ts-chip">OVR {ovr}</span>}
                  </span>
                  <span className="ts-mode-sub">{rosterNames}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
