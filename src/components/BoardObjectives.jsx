// src/components/BoardObjectives.jsx
// Full Board Objectives page — visible all season long via the "Board" sidebar tab.
// Shows the owner header, the live mandate (primary / secondary / stretch), the
// reasoning behind the objectives, and a season-progress panel.

import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import {
  getBoardContext,
  evalAllObjectives,
  getSecurityBand,
  bandColor,
  objStatusLabel,
  objStatusColor,
} from "../engine/boardEngine.js";
import { getMajorPlacementMap } from "../utils/historyProfiles.js";
import { placementText } from "../utils/placementDisplay.js";

function ordinal(n) {
  const m100 = Math.abs(n) % 100;
  if (m100 >= 11 && m100 <= 13) return "th";
  switch (Math.abs(n) % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
}

function weightLabel(w) {
  return w === "primary" ? "Primary" : w === "secondary" ? "Secondary" : "Stretch";
}

function StatusBadge({ status }) {
  return (
    <span className="bo-status" style={{ color: objStatusColor(status), borderColor: objStatusColor(status) }}>
      {objStatusLabel(status)}
    </span>
  );
}

function ObjectiveCard({ obj }) {
  return (
    <div className={`bo-obj bo-obj-${obj.weight}`}>
      <div className="bo-obj-top">
        <span className={`bo-weight bo-weight-${obj.weight}`}>{weightLabel(obj.weight)}</span>
        <span className="bo-obj-label">{obj.label}</span>
        <StatusBadge status={obj.status} />
      </div>
      <div className="bo-obj-meta">
        <span className="bo-obj-tag">Importance: {obj.importance ?? "—"}</span>
        {obj.progressNote && <span className="bo-obj-note">{obj.progressNote}</span>}
      </div>
    </div>
  );
}

export default function BoardObjectives() {
  const { state } = useGame();
  if (!state) return null;

  const ctx = getBoardContext(state);
  if (!ctx) return <div className="bo-empty">No board data available.</div>;

  const board = state.boardState ?? {};
  const objectives = evalAllObjectives(board.objectives ?? [], state, false);
  const primary = objectives.filter(o => o.weight === "primary");
  const secondary = objectives.filter(o => o.weight === "secondary");
  const stretch = objectives.filter(o => o.weight === "stretch");

  const team = CDL_TEAMS.find(t => t.id === state.userTeamId);
  const band = getSecurityBand(ctx.confidence);
  const bc = bandColor(band);

  // ── Progress panel data ──
  const schedule = state.schedule ?? {};
  const cum = schedule.standings?.[state.userTeamId] ?? { wins: 0, losses: 0, points: 0 };

  // Best regular-season Major placement
  let bestMajor = null;
  for (let i = 0; i <= 3; i++) {
    const major = schedule.majors?.[i];
    if (!major?.completed || !major.bracket) continue;
    const place = getMajorPlacementMap(major)[state.userTeamId] ?? null;
    if (place != null && (bestMajor === null || place < bestMajor)) bestMajor = place;
  }

  // Champs status
  const champs = schedule.majors?.[4];
  let champsStatus = "Not reached";
  if (champs?.completed && champs.bracket) {
    const place = getMajorPlacementMap(champs)[state.userTeamId] ?? null;
    champsStatus = place != null ? `Finished ${placementText(place)}` : "Did not qualify";
  } else if (ctx.leaguePos > 0 && ctx.leaguePos <= 8) {
    champsStatus = "In qualifying spot (top 8)";
  } else if (ctx.leaguePos > 0) {
    champsStatus = "Outside top 8";
  }

  const ovrDelta = ctx.currentOvr - (ctx.ovrBaseline ?? ctx.currentOvr);
  const chemDelta = ctx.chem - (ctx.chemBaseline ?? ctx.chem);

  const ambLabel = ctx.ambition >= 80 ? "High" : ctx.ambition >= 55 ? "Moderate" : "Low";
  const patLabel = ctx.patience >= 70 ? "Patient" : ctx.patience >= 45 ? "Balanced" : "Demanding";

  return (
    <div className="bo-page">
      {/* ── Header ── */}
      <div className="bo-header" style={{ borderTopColor: team?.color ?? "var(--accent)" }}>
        <div className="bo-header-main">
          <div className="bo-kicker">Board · Season {ctx.season}</div>
          <h2 className="bo-title">{ctx.ownerName}</h2>
          <div className="bo-owner-traits">
            <span className="bo-trait">Ambition: <strong>{ambLabel}</strong> <em>({ctx.ambition})</em></span>
            <span className="bo-trait">Patience: <strong>{patLabel}</strong> <em>({ctx.patience})</em></span>
          </div>
        </div>
        <div className="bo-header-conf">
          <div className="bo-conf-band" style={{ color: bc }}>{band}</div>
          <div className="bo-conf-num">{ctx.confidence}</div>
          <div className="bo-conf-bar"><span style={{ width: `${ctx.confidence}%`, background: bc }} /></div>
          <div className="bo-conf-label">Board Confidence</div>
        </div>
      </div>

      {/* ── Header stat strip ── */}
      <div className="bo-strip">
        <div className="bo-stat"><span className="bo-stat-k">Team OVR Rank</span><span className="bo-stat-v">{ctx.ovrRank > 0 ? `${ctx.ovrRank}${ordinal(ctx.ovrRank)} / 12` : "—"}</span></div>
        <div className="bo-stat"><span className="bo-stat-k">Expected Tier</span><span className="bo-stat-v">{ctx.tier.label}</span></div>
        <div className="bo-stat"><span className="bo-stat-k">League Position</span><span className="bo-stat-v">{ctx.leaguePos > 0 ? `${ctx.leaguePos}${ordinal(ctx.leaguePos)}` : "—"}</span></div>
        <div className="bo-stat"><span className="bo-stat-k">Team OVR</span><span className="bo-stat-v">{ctx.currentOvr}{ovrDelta !== 0 && <em className={ovrDelta > 0 ? "bo-up" : "bo-down"}> {ovrDelta > 0 ? "▲" : "▼"}{Math.abs(ovrDelta)}</em>}</span></div>
        {ctx.verdict && <div className="bo-stat"><span className="bo-stat-k">Last Verdict</span><span className="bo-stat-v">{ctx.verdict}</span></div>}
      </div>

      <div className="bo-grid">
        {/* ── Objectives ── */}
        <div className="bo-objectives">
          <div className="bo-section-title">Season Mandate</div>
          {objectives.length === 0 && <div className="bo-empty">Objectives pending — they are set at the start of each season.</div>}
          {primary.map(o => <ObjectiveCard key={o.id} obj={o} />)}
          {secondary.map(o => <ObjectiveCard key={o.id} obj={o} />)}
          {stretch.map(o => <ObjectiveCard key={o.id} obj={o} />)}

          {/* ── Why these objectives ── */}
          <div className="bo-explain">
            <div className="bo-explain-title">Why these objectives?</div>
            <p>{ctx.explanation}</p>
          </div>
        </div>

        {/* ── Progress panel ── */}
        <aside className="bo-progress">
          <div className="bo-section-title">Season Progress</div>
          <div className="bo-prow"><span>League position</span><strong>{ctx.leaguePos > 0 ? `${ctx.leaguePos}${ordinal(ctx.leaguePos)}` : "—"}</strong></div>
          <div className="bo-prow"><span>Stage record</span><strong>{cum.wins}–{cum.losses}</strong></div>
          <div className="bo-prow"><span>Season points</span><strong>{cum.points ?? 0}</strong></div>
          <div className="bo-prow"><span>Best Major</span><strong>{bestMajor != null ? placementText(bestMajor) : "—"}</strong></div>
          <div className="bo-prow"><span>Champs</span><strong>{champsStatus}</strong></div>
          <div className="bo-prow"><span>Chemistry</span><strong>{ctx.chem}{chemDelta !== 0 && <em className={chemDelta > 0 ? "bo-up" : "bo-down"}> {chemDelta > 0 ? "▲" : "▼"}{Math.abs(chemDelta)}</em>}</strong></div>
          <div className="bo-prow"><span>Team OVR change</span><strong className={ovrDelta > 0 ? "bo-up" : ovrDelta < 0 ? "bo-down" : ""}>{ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta}</strong></div>
        </aside>
      </div>
    </div>
  );
}
