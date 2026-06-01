// src/components/BoardReviewOverlay.jsx
// Modal overlay shown at season end when pendingBoardReview is set.
// Displays verdict, confidence changes, objective results, and owner flavour text.

import { useGame, saveGame, deleteSave } from "../store/gameStore.jsx";
import { getSecurityBand, bandColor, objStatusColor, objStatusLabel } from "../engine/boardEngine.js";

const statusBadgeColor = objStatusColor;

function verdictColor(verdict) {
  switch (verdict) {
    case "Retained":      return "#34d399";
    case "Final Warning": return "#fbbf24";
    case "Released":      return "#f87171";
    default:              return "#60a5fa";
  }
}

function StatusBadge({ status }) {
  return (
    <span
      className="br-status-badge"
      style={{ color: statusBadgeColor(status), borderColor: statusBadgeColor(status) }}
    >
      {objStatusLabel(status)}
    </span>
  );
}

function ObjRow({ obj }) {
  const weight = obj.weight === "primary" ? "Primary" : obj.weight === "stretch" ? "Stretch" : "Secondary";
  return (
    <div className="br-obj-row">
      <div className="br-obj-header">
        <span className="br-obj-weight">{weight}</span>
        <span className="br-obj-label">{obj.label}</span>
        <StatusBadge status={obj.status} />
      </div>
      {obj.progressNote && (
        <div className="br-obj-note">{obj.progressNote}</div>
      )}
    </div>
  );
}

function ConfBar({ before, after }) {
  const beforeBand = getSecurityBand(before);
  const afterBand = getSecurityBand(after);
  const afterCol = bandColor(afterBand);
  return (
    <div className="br-conf-section">
      <div className="br-conf-row">
        <span className="br-conf-label">Confidence</span>
        <span className="br-conf-change">
          <span style={{ color: bandColor(getSecurityBand(before)) }}>{before}</span>
          <span className="br-conf-arrow"> → </span>
          <span style={{ color: afterCol, fontWeight: 900 }}>{after}</span>
          <span className="br-conf-band" style={{ color: afterCol }}>{afterBand}</span>
        </span>
      </div>
      <div className="br-conf-bar">
        <span style={{ width: `${before}%`, background: bandColor(getSecurityBand(before)) }} />
      </div>
      <div className="br-conf-bar br-conf-bar-after">
        <span style={{ width: `${after}%`, background: afterCol }} />
      </div>
    </div>
  );
}

export default function BoardReviewOverlay() {
  const { state, dispatch } = useGame();
  const review = state?.pendingBoardReview;

  if (!review) return null;

  const {
    verdict,
    objectives,
    confidenceBefore,
    confidenceAfter,
    delta,
    flavour,
    season,
    overachievements,
    underperformances,
  } = review;

  const primary = (objectives ?? []).find(o => o.weight === "primary");
  const secondaries = (objectives ?? []).filter(o => o.weight === "secondary");
  const stretches = (objectives ?? []).filter(o => o.weight === "stretch");

  const vc = verdictColor(verdict);
  const isReleased = verdict === "Released";

  return (
    <div className="br-backdrop" role="dialog" aria-modal="true" aria-labelledby="br-title">
      <div className="br-panel">
        {/* Header */}
        <div className="br-header">
          <div>
            <div className="br-kicker">Season {season} — Owner Review</div>
            <h2 id="br-title">Board Decision</h2>
          </div>
          <div
            className="br-verdict-badge"
            style={{ color: vc, borderColor: vc }}
          >
            {verdict}
          </div>
        </div>

        {/* Confidence bar */}
        <ConfBar before={confidenceBefore} after={confidenceAfter} />

        {/* Delta indicator */}
        <div className="br-delta">
          <span>Season impact:</span>
          <strong style={{ color: delta >= 0 ? "#34d399" : "#f87171" }}>
            {delta >= 0 ? `+${delta}` : delta} confidence
          </strong>
        </div>

        {/* Objectives */}
        <div className="br-obj-section">
          <div className="br-section-title">Mandate Review</div>
          {primary && <ObjRow obj={primary} />}
          {secondaries.map(obj => (
            <ObjRow key={obj.id} obj={obj} />
          ))}
          {stretches.map(obj => (
            <ObjRow key={obj.id} obj={obj} />
          ))}
        </div>

        {/* Overachievements / underperformances */}
        {(overachievements?.length > 0 || underperformances?.length > 0) && (
          <div className="br-summary-section">
            {overachievements?.length > 0 && (
              <div className="br-summary-col">
                <div className="br-summary-title" style={{ color: "#34d399" }}>Overachievements</div>
                {overachievements.map((t, i) => <div key={i} className="br-summary-item">▲ {t}</div>)}
              </div>
            )}
            {underperformances?.length > 0 && (
              <div className="br-summary-col">
                <div className="br-summary-title" style={{ color: "#f87171" }}>Underperformances</div>
                {underperformances.map((t, i) => <div key={i} className="br-summary-item">▼ {t}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Flavour text from owner */}
        <div className="br-flavour">
          <div className="br-flavour-label">Owner Statement</div>
          <p className="br-flavour-text">{flavour}</p>
        </div>

        {/* Action buttons */}
        <div className="br-actions">
          {isReleased ? (
            <>
              <button
                className="br-btn br-btn-accept"
                onClick={() => dispatch({ type: "BOARD_ACCEPT_NEW_MANDATE" })}
              >
                Accept New Mandate
              </button>
              <button
                className="br-btn br-btn-new"
                onClick={() => {
                  deleteSave();
                  dispatch({ type: "RESET_TO_TEAM_SELECT" });
                }}
              >
                Start New Game
              </button>
            </>
          ) : (
            <button
              className="br-btn br-btn-continue"
              onClick={() => dispatch({ type: "BOARD_REVIEW_CONTINUE" })}
            >
              Continue to Offseason
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
