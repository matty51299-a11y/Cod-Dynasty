import { useMemo } from "react";
import { useGame } from "../store/gameStore.jsx";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { useTeamHub } from "../store/teamHubContext.jsx";
import TeamLogo from "./TeamLogo.jsx";
import { findPlayerEverywhere, findTeamEverywhere } from "../utils/historyProfiles.js";

function contextForAward(award) {
  const parts = [];
  if (award?.kd != null && !String(award.context || "").includes("K/D")) parts.push(`${Number(award.kd).toFixed(2)} K/D`);
  if (award?.context) parts.push(award.context);
  return parts.filter(Boolean).join(" · ");
}

function AwardCard({ award, state, openPlayerProfile, openTeamHub }) {
  const team = award.teamId ? findTeamEverywhere(state, award.teamId) : null;
  const player = award.playerId ? findPlayerEverywhere(state, award.playerId) : null;
  const context = contextForAward(award);
  const canOpenPlayer = !!player && !!award.playerId;
  const canOpenTeam = !!team && !!award.teamId;

  return (
    <div className="sao-card">
      <div className="sao-card-award">{award.awardName}</div>
      <div className="sao-card-main">
        {team && <TeamLogo team={team} size={34} />}
        <div>
          {award.type === "player" ? (
            <button className="link-button player-link sao-winner" disabled={!canOpenPlayer} onClick={() => canOpenPlayer && openPlayerProfile(award.playerId)}>{award.playerName}</button>
          ) : (
            <button className="link-button team-link sao-winner" disabled={!canOpenTeam} onClick={() => canOpenTeam && openTeamHub(award.teamId)}>{award.teamName}</button>
          )}
          <div className="sao-subline">
            {award.type === "player" && award.teamName && (
              <button className="link-button team-link" disabled={!canOpenTeam} onClick={() => canOpenTeam && openTeamHub(award.teamId)}>{award.teamName}</button>
            )}
            {award.type === "player" && award.role && <span>{award.teamName ? " · " : ""}{award.role}</span>}
            {award.type === "team" && award.teamTag && <span>{award.teamTag}</span>}
          </div>
        </div>
      </div>
      {context && <div className="sao-context">{context}</div>}
    </div>
  );
}

export default function SeasonAwardsOverlay() {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const { openTeamHub } = useTeamHub();
  const pending = state?.pendingSeasonAwards;
  const awards = useMemo(() => pending?.awards || [], [pending]);
  const majorMvps = useMemo(() => pending?.majorMvps || [], [pending]);

  const enteredMajor = state?.enteredMajorIdx != null ? state?.schedule?.majors?.[state.enteredMajorIdx] : null;

  if (!state || !pending || enteredMajor?.completed) return null;

  return (
    <div className="sao-backdrop" role="dialog" aria-modal="true" aria-labelledby="season-awards-title">
      <div className="sao-panel">
        <div className="sao-header">
          <div>
            <div className="sao-kicker">Season Complete</div>
            <h2 id="season-awards-title">{pending.title || `Season ${pending.season} Awards`}</h2>
          </div>
          <button className="sao-close" onClick={() => dispatch({ type: "CONTINUE_FROM_SEASON_AWARDS", season: pending.season })}>Continue</button>
        </div>

        <div className="sao-grid">
          {awards.map(award => (
            <AwardCard key={award.id || `${award.awardName}_${award.playerId || award.teamId}`} award={award} state={state} openPlayerProfile={openPlayerProfile} openTeamHub={openTeamHub} />
          ))}
        </div>

        {majorMvps.length > 0 && (
          <div className="sao-major-recap">
            <div className="sao-section-title">Major MVPs</div>
            <div className="sao-major-list">
              {majorMvps.map(award => (
                <div key={award.id} className="sao-major-row">
                  <span>{award.awardName.replace(" MVP", "")}</span>
                  <button className="link-button player-link" onClick={() => openPlayerProfile(award.playerId)}>{award.playerName}</button>
                  {award.teamName && <em>{award.teamName}</em>}
                  {award.kd != null && <strong>{Number(award.kd).toFixed(2)} K/D</strong>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sao-footer">
          <p>Awards have been archived and will remain visible in player and team profiles.</p>
          <button className="btn-primary" onClick={() => dispatch({ type: "CONTINUE_FROM_SEASON_AWARDS", season: pending.season })}>Continue to Offseason</button>
        </div>
      </div>
    </div>
  );
}
