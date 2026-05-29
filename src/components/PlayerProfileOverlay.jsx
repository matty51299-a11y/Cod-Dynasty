import { useMemo, useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import TeamLogo from "./TeamLogo.jsx";
import { buildPlayerHistory, findPlayerEverywhere, getPlayerCurrentStatus, kdText } from "../utils/historyProfiles.js";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";

function ratingColor(v) {
  if (v >= 90) return "#166534";
  if (v >= 80) return "#15803d";
  if (v >= 70) return "#1d4ed8";
  if (v >= 60) return "#9a3412";
  return "#dc2626";
}

function statText(value, fallback = "Not tracked yet") {
  return value == null || Number.isNaN(value) ? fallback : value;
}

function stockLabel(player) {
  const ovr = player?.overall ?? player?.scoutedOverall ?? 0;
  const pot = player?.potential ?? player?.scoutedPotential ?? ovr;
  if (!player) return null;
  if (ovr >= 80 && pot >= 88) return "Blue Chip";
  if (ovr >= 78 || (ovr >= 75 && pot >= 86)) return "CDL Ready";
  if (player.isProspect) return "Prospect";
  if (!player.teamId) return "Free Agent";
  return null;
}

export default function PlayerProfileOverlay() {
  const { state } = useGame();
  const { openPlayerRef, closePlayerProfile } = usePlayerProfile();
  const [tab, setTab] = useState(null);
  const player = useMemo(() => findPlayerEverywhere(state, openPlayerRef), [state, openPlayerRef]);
  const history = useMemo(() => buildPlayerHistory(state, player), [state, player]);

  if (!state || !openPlayerRef) return null;

  const status = getPlayerCurrentStatus(player, state);
  const seasons = history.seasons.length ? history.seasons : [{ season: state.season, kills: 0, deaths: 0, matches: 0, maps: 0, teams: new Set(player?.teamId ? [player.teamId] : []), roles: new Set(player?.primary ? [player.primary] : []), events: [] }];
  const activeSeason = tab ?? seasons[seasons.length - 1]?.season;
  const season = seasons.find(s => s.season === activeSeason) ?? seasons[0];
  const summary = history.summary || {};
  const ovr = player?.overall ?? player?.scoutedOverall;
  const pot = player?.potential ?? player?.scoutedPotential;

  return (
    <div className="player-modal-backdrop" onClick={closePlayerProfile}>
      <div className="player-modal pm-wide profile-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-header" style={{ borderTopColor: status.team?.color ?? "var(--accent)" }}>
          <div className="pm-identity">
            <div className="pm-name">{player?.name ?? "Unknown Player"}</div>
            <div className="pm-meta">
              {status.team && <span className="pm-team" style={{ color: status.team.color, display: "inline-flex", alignItems: "center", gap: 6 }}><TeamLogo team={status.team} size={18} />{status.team.name}</span>}
              {!status.team && <span className="muted">{status.label}</span>}
              {player?.region && <><span className="pm-dot">·</span><span className="pm-region-badge">{player.region}</span></>}
              {player?.primary && <><span className="pm-dot">·</span><span className="role-pill pm-role">{player.primary}</span></>}
              {player?.isSub && <span className="sub-label">SUB</span>}
            </div>
            <div className="pm-info-strip">
              <span><span className="pm-strip-lbl">Age</span> {player?.age ?? "—"}</span>
              <span><span className="pm-strip-lbl">POT</span> <b style={{ color: ratingColor(pot) }}>{pot ?? "—"}</b></span>
              <span><span className="pm-strip-lbl">Salary</span> {player?.salary ? `$${(player.salary / 1000).toFixed(0)}k` : "—"}</span>
              <span><span className="pm-strip-lbl">Contract</span> {player?.contractYears != null ? `${player.contractYears} yr${player.contractYears === 1 ? "" : "s"}` : "—"}</span>
              {stockLabel(player) && <span><span className="pm-strip-lbl">Stock</span> {stockLabel(player)}</span>}
            </div>
          </div>
          <div className="pm-ovr-block"><div className="pm-ovr" style={{ color: ratingColor(ovr) }}>{ovr ?? "—"}</div><div className="pm-ovr-label">OVR</div></div>
          <button className="pm-close" onClick={closePlayerProfile} aria-label="Close">✕</button>
        </div>

        <div className="pm-body">
          <div className="pm-section">
            <div className="pm-section-title">Career Summary</div>
            <div className="profile-summary-grid">
              <ProfileStat label="Seasons" value={summary.seasonsPlayed ?? 0} />
              <ProfileStat label="Teams" value={summary.teamsPlayed ?? 0} />
              <ProfileStat label="Maps" value={summary.maps || "Not tracked yet"} />
              <ProfileStat label="Kills" value={summary.kills ?? 0} />
              <ProfileStat label="Deaths" value={summary.deaths ?? 0} />
              <ProfileStat label="Career K/D" value={summary.kd == null ? "—" : summary.kd.toFixed(2)} />
              <ProfileStat label="Major Apps" value={summary.majorAppearances || "Not tracked yet"} />
              <ProfileStat label="Champs Apps" value={summary.champsAppearances || "Not tracked yet"} />
              <ProfileStat label="CQ Apps" value={summary.challengerQualifierAppearances || "Not tracked yet"} />
              <ProfileStat label="Best Major" value="Not tracked yet" />
              <ProfileStat label="Best Champs" value="Not tracked yet" />
              <ProfileStat label="Best CQ" value="Not tracked yet" />
            </div>
          </div>

          <div className="profile-tabs">
            {seasons.map(s => <button key={s.season} className={s.season === season.season ? "active" : ""} onClick={() => setTab(s.season)}>Season {s.season}</button>)}
          </div>

          <div className="pm-section">
            <div className="pm-section-title">Season {season.season}</div>
            <div className="pm-info-strip profile-season-meta">
              <span><span className="pm-strip-lbl">Team(s)</span> {[...(season.teams || [])].map(tid => resolveTeamDisplay(tid, state.schedule).tag).join(", ") || status.label}</span>
              <span><span className="pm-strip-lbl">Role(s)</span> {[...(season.roles || [])].join(", ") || player?.primary || "—"}</span>
              <span><span className="pm-strip-lbl">Matches</span> {season.matches || 0}</span>
              <span><span className="pm-strip-lbl">Maps</span> {season.maps || "Not tracked yet"}</span>
              <span><span className="pm-strip-lbl">K/D</span> {kdText(season.kills, season.deaths)}</span>
              <span><span className="pm-strip-lbl">HP K/D</span> Not tracked yet</span>
              <span><span className="pm-strip-lbl">S&D K/D</span> Not tracked yet</span>
              <span><span className="pm-strip-lbl">Overload K/D</span> Not tracked yet</span>
            </div>
          </div>

          <div className="pm-section">
            <div className="pm-section-title">Event Breakdown</div>
            {!season.events?.length ? <p className="muted">No tracked event history for this season yet.</p> : (
              <table className="kd-history-table profile-event-table">
                <thead><tr><th>Event</th><th>Team</th><th>Maps</th><th>K</th><th>D</th><th>K/D</th><th>Result</th></tr></thead>
                <tbody>{season.events.map((e, i) => {
                  const team = e.teamId ? resolveTeamDisplay(e.teamId, state.schedule) : null;
                  return <tr key={`${e.eventName}_${i}`}><td>{e.eventName}</td><td>{team?.tag ?? e.teamName ?? "—"}</td><td>{statText(e.maps, "—")}</td><td>{statText(e.kills, "—")}</td><td>{statText(e.deaths, "—")}</td><td>{e.kd != null ? e.kd.toFixed(2) : e.kills != null ? kdText(e.kills, e.deaths) : "—"}</td><td>{e.placement ?? "Not tracked yet"}</td></tr>;
                })}</tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileStat({ label, value }) {
  return <div className="profile-stat"><span>{label}</span><strong>{value}</strong></div>;
}
