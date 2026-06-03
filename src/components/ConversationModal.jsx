// src/components/ConversationModal.jsx
// Dedicated Player Meeting popup for morale conversation events. Shows context,
// personality tone, promise risk, response impacts and a post-meeting outcome.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { getConversationFor, getMorale, moodForLevel, moraleColor, derivePersonality, getPromiseRiskLabel } from "../engine/moraleEngine.js";
import { CDL_TEAMS } from "../data/teams.js";

function teamLabel(state, player) {
  const teamId = player.teamId || player.challengerTeamId || state.userTeamId;
  const team = CDL_TEAMS.find(t => t.id === teamId);
  return team ? `${team.tag} · ${team.name}` : teamId || "Unsigned";
}

export default function ConversationModal({ player, event = null, onClose }) {
  const { state, dispatch } = useGame();
  const [followUp, setFollowUp] = useState(null);
  const [answered, setAnswered] = useState(false);
  if (!state || !player) return null;

  const convo = getConversationFor(state, player, event);
  const morale = getMorale(state, player.id);
  const traits = derivePersonality(player);
  const outcome = answered && state.lastMoraleConversationOutcome?.playerId === player.id
    ? state.lastMoraleConversationOutcome
    : null;
  const options = followUp ? convo.options.filter(opt => opt.id !== "ask_expectation") : convo.options;

  function choose(option) {
    if (option.followUp && !followUp) {
      setFollowUp(option.followUp);
      return;
    }
    dispatch({ type: "TALK_TO_PLAYER", playerId: player.id, optionId: option.id, eventId: event?.id });
    setAnswered(true);
  }

  return (
    <div className="convo-backdrop" onClick={onClose}>
      <div className="convo-modal player-meeting-modal" onClick={e => e.stopPropagation()}>
        <div className="convo-head meeting-head">
          <div>
            <div className="meeting-eyebrow">PLAYER MEETING</div>
            <div className="convo-title">{event?.title || `${player.name} wants to talk`}</div>
            <div className="convo-sub">
              <span>{teamLabel(state, player)}</span>
              <span className="convo-dot">·</span>
              <span>{player.primary} · {player.isSub ? "Substitute" : "Starter"}</span>
              <span className="convo-dot">·</span>
              <span className={`meeting-severity sev-${convo.severity}`}>{convo.severity}</span>
            </div>
          </div>
          <button className="pm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {outcome ? (
          <div className="meeting-outcome-panel">
            <div className="meeting-eyebrow">OUTCOME</div>
            <h3>{outcome.summary}</h3>
            <div className="meeting-effects">
              {outcome.effects.map(effect => <span key={effect}>{effect}</span>)}
            </div>
            <button className="btn-primary-sm" onClick={onClose}>Close meeting</button>
          </div>
        ) : (
          <>
            <div className="meeting-context-grid">
              <div><span>Morale</span><b style={{ color: moraleColor(morale.level) }}>{morale.level} {moodForLevel(morale.level)}</b></div>
              <div><span>Trust</span><b>{morale.trust}</b></div>
              <div><span>Concern</span><b>{convo.title}</b></div>
              <div><span>Personality</span><b>{traits.join(", ")}</b></div>
            </div>

            <div className="meeting-trigger"><b>Why this meeting triggered:</b> {convo.trigger}</div>

            <div className="convo-intro meeting-quote">“{convo.quote}”</div>
            {followUp && <div className="convo-intro meeting-follow-up">“{followUp}”</div>}

            <div className="meeting-context-panel">
              <b>Tone:</b> {convo.toneLine}
            </div>

            {convo.activePromises.length > 0 && (
              <div className="meeting-promises">
                <b>Current promises:</b>
                {convo.activePromises.map(p => (
                  <span key={p.id} className="trait-chip promise-chip">{p.label} · {getPromiseRiskLabel(p, state, player)}</span>
                ))}
              </div>
            )}
            <div className="meeting-warning">{convo.conflictWarning}</div>

            <div className="convo-options meeting-options">
              {options.map(opt => (
                <button key={opt.id} className="convo-option meeting-option" onClick={() => choose(opt)}>
                  <span className="convo-option-label">{opt.label}</span>
                  <span className="convo-option-hint">Impact: {opt.impact}</span>
                  <span className={`meeting-risk risk-${String(opt.risk).toLowerCase().replaceAll(" ", "-")}`}>{opt.risk}</span>
                  {opt.hint && <span className="convo-option-hint">{opt.hint}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
