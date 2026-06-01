// src/components/MatchPreview.jsx
// Compact CDL 2026 map-pool match preview: per-mode edges + projected best-of-5
// map set. Reads team map profiles (read-only, deterministic) so the projected
// set matches what the series will actually play.

import { useGame } from "../store/gameStore.jsx";
import { calcTeamOvr } from "../engine/teamOvr.js";
import { getTeamMapProfile, computeModeEdges, autoVeto } from "../engine/mapProfile.js";
import { MODE_META, MODE_KEYS } from "../data/mapPool.js";
import { softenedMapEdge } from "../utils/mapDisplay.js";
import { resolveTeamDisplay } from "../utils/teamDisplay.js";

function edgeStr(edge, tagA, tagB) {
  return softenedMapEdge(edge, tagA, tagB).text;
}

export default function MatchPreview({ teamAId, teamBId, compact = false }) {
  const { state } = useGame();
  if (!state || !teamAId || !teamBId) return null;

  const profA = getTeamMapProfile(state, teamAId);
  const profB = getTeamMapProfile(state, teamBId);
  if (!profA || !profB) return null;

  const dispA = resolveTeamDisplay(teamAId, state.schedule);
  const dispB = resolveTeamDisplay(teamBId, state.schedule);
  const tagA = dispA.tag ?? teamAId;
  const tagB = dispB.tag ?? teamBId;

  const edges = computeModeEdges(profA, profB);
  const series = autoVeto(profA, profB);

  // OVR (CDL teams only; event teams may not resolve — guard).
  const ovrA = calcTeamOvr(teamAId, state.players ?? []) || profA.modeRatings?.hardpoint;
  const ovrB = calcTeamOvr(teamBId, state.players ?? []) || profB.modeRatings?.hardpoint;

  return (
    <div className={`mpv ${compact ? "mpv-compact" : ""}`}>
      <div className="mpv-head">
        <span className="mpv-title">Map Pool Preview</span>
        <span className="mpv-ovr">
          <span style={{ color: dispA.color }}>{tagA} {ovrA}</span>
          <span className="mpv-ovr-sep">·</span>
          <span style={{ color: dispB.color }}>{tagB} {ovrB}</span>
          <span className="mpv-ovr-lbl"> OVR</span>
        </span>
      </div>

      <div className="mpv-edges">
        {MODE_KEYS.map(k => {
          const e = edges[k];
          const lead = e > 0 ? dispA.color : e < 0 ? dispB.color : "var(--text-dim)";
          return (
            <div key={k} className="mpv-edge-row">
              <span className="mpv-edge-mode">{MODE_META[k].short}</span>
              <span className="mpv-edge-val" style={{ color: lead }}>{edgeStr(e, tagA, tagB)}</span>
            </div>
          );
        })}
      </div>

      <div className="mpv-mapset">
        <div className="mpv-mapset-label">Projected map set</div>
        {series.map(m => {
          const edgeColor = m.edgeA > 0 ? dispA.color : m.edgeA < 0 ? dispB.color : "var(--text-dim)";
          return (
            <div key={m.slot} className="mpv-map-row">
              <span className="mpv-map-num">{m.slot}</span>
              <span className="mpv-map-mode">{m.short}</span>
              <span className="mpv-map-name">{m.name}</span>
              {m.edgeA !== 0 && (
                <span className="mpv-map-edge" style={{ color: edgeColor }}>
                  {softenedMapEdge(m.edgeA, tagA, tagB).text}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
