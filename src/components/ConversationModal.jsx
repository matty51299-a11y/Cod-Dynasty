// src/components/ConversationModal.jsx
// Lightweight player conversation popup. Reads the generated conversation for a
// player (topic + 2-4 options) and dispatches TALK_TO_PLAYER on a choice.
// Shared by the Dynamics page and the Player Profile overlay.

import { useGame } from "../store/gameStore.jsx";
import { getConversationFor, getMorale, moodForLevel, moraleColor } from "../engine/moraleEngine.js";

export default function ConversationModal({ player, onClose }) {
  const { state, dispatch } = useGame();
  if (!state || !player) return null;

  const convo = getConversationFor(state, player);
  const morale = getMorale(state, player.id);

  function choose(optionId) {
    dispatch({ type: "TALK_TO_PLAYER", playerId: player.id, optionId });
    onClose?.();
  }

  return (
    <div className="convo-backdrop" onClick={onClose}>
      <div className="convo-modal" onClick={e => e.stopPropagation()}>
        <div className="convo-head">
          <div>
            <div className="convo-title">Talk to {player.name}</div>
            <div className="convo-sub">
              <span style={{ color: moraleColor(morale.level), fontWeight: 700 }}>
                {morale.level} {moodForLevel(morale.level)}
              </span>
              <span className="convo-dot">·</span>
              <span>Trust {morale.trust}</span>
            </div>
          </div>
          <button className="pm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="convo-intro">{convo.intro}</p>

        <div className="convo-options">
          {convo.options.map(opt => (
            <button key={opt.id} className="convo-option" onClick={() => choose(opt.id)}>
              <span className="convo-option-label">{opt.label}</span>
              {opt.hint && <span className="convo-option-hint">{opt.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
