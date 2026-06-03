// src/components/ConversationModal.jsx
// Player Conversation Hub: a manager-led meeting UI layered on top of the
// existing morale, promise, cooldown and conversation-history state.

import { useMemo, useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import {
  buildConversationContext,
  getConversationTopics,
  getPlayerTopicResponse,
  getManagerResponsesForTopic,
  getMorale,
  moodForLevel,
  moraleColor,
  getPromiseRiskLabel,
} from "../engine/moraleEngine.js";
import { CDL_TEAMS } from "../data/teams.js";

function teamLabel(state, player) {
  const teamId = player.teamId || player.challengerTeamId || state.userTeamId;
  const team = CDL_TEAMS.find(t => t.id === teamId);
  return team ? `${team.tag} · ${team.name}` : teamId || "Unsigned";
}

function groupTopics(topics) {
  return topics.reduce((acc, topic) => {
    acc[topic.category] = [...(acc[topic.category] || []), topic];
    return acc;
  }, {});
}

function promiseDeadline(p) {
  if (!p) return "—";
  return `S${p.deadlineSeason ?? "?"} Stage ${((p.deadlineStage ?? 0) + 1)}`;
}

export default function ConversationModal({ player, event = null, onClose }) {
  const { state, dispatch } = useGame();
  const meetingId = useMemo(() => `hub_${player?.id}_${Date.now().toString(36)}`, [player?.id]);
  const ctx = buildConversationContext(state, player, event);
  const topics = getConversationTopics(state, player, event);
  const openingTopic = ctx.openingTopic || null;
  const [phase, setPhase] = useState(openingTopic ? "response" : "topics");
  const [selectedTopic, setSelectedTopic] = useState(openingTopic);
  const [outcome, setOutcome] = useState(null);
  const [askedTopics, setAskedTopics] = useState(openingTopic ? [openingTopic] : []);

  if (!state || !player) return null;
  const morale = getMorale(state, player.id);
  const grouped = groupTopics(topics);
  const selected = selectedTopic ? getPlayerTopicResponse(state, player, selectedTopic) : null;
  const managerOptions = selectedTopic ? getManagerResponsesForTopic(state, player, selectedTopic) : [];
  const latestOutcome = state.lastMoraleConversationOutcome?.playerId === player.id ? state.lastMoraleConversationOutcome : null;
  const impactCount = morale.currentMeeting?.id === meetingId ? (morale.currentMeeting.impactedTopics || []).length : 0;
  const duplicateSelected = askedTopics.includes(selectedTopic);

  function selectTopic(topicId) {
    setSelectedTopic(topicId);
    setOutcome(null);
    setPhase("response");
    setAskedTopics(prev => prev.includes(topicId) ? prev : [...prev, topicId]);
  }

  function choose(option) {
    dispatch({ type: "TALK_TO_PLAYER", playerId: player.id, optionId: option.id, topic: selectedTopic, eventId: event?.id, meetingId });
    setOutcome({ pending: true, optionLabel: option.label, conflictWarning: option.conflictWarning });
    setPhase("outcome");
  }

  const displayedOutcome = latestOutcome && phase === "outcome" ? latestOutcome : outcome;

  return (
    <div className="convo-backdrop" onClick={onClose}>
      <div className="convo-modal player-meeting-modal conversation-hub" onClick={e => e.stopPropagation()}>
        <div className="convo-head meeting-head hub-head">
          <div>
            <div className="meeting-eyebrow">PLAYER CONVERSATION</div>
            <div className="convo-title">{player.name}</div>
            <div className="convo-sub">
              <span>{teamLabel(state, player)}</span><span className="convo-dot">·</span>
              <span>{player.primary || "Flex"} · {ctx.starterStatus}</span><span className="convo-dot">·</span>
              <span style={{ color: moraleColor(morale.level), fontWeight: 900 }}>{morale.level} {moodForLevel(morale.level)}</span>
            </div>
          </div>
          <button className="pm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="meeting-context-grid hub-context-grid">
          <div><span>Personality</span><b>{ctx.traits.join(", ")}</b></div>
          <div><span>Main concern</span><b>{ctx.mainConcern}</b></div>
          <div><span>Promises</span><b>{ctx.activePromises.length} active</b></div>
          <div><span>Transfer stance</span><b>{ctx.transferStance}</b></div>
          <div><span>Contract</span><b>{ctx.contractYears == null ? "N/A" : `${ctx.contractYears} yr${ctx.contractYears === 1 ? "" : "s"}`}</b></div>
          <div><span>Meeting impact</span><b>{impactCount}/3 morale topics used</b></div>
        </div>

        {event && (
          <div className="meeting-trigger"><b>Player-raised issue:</b> {event.title} — {event.trigger}. You can resolve it and still continue the meeting.</div>
        )}

        <div className="hub-layout">
          <aside className="hub-topic-panel">
            <div className="meeting-eyebrow">Topics ({topics.length})</div>
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="hub-topic-group">
                <div className="hub-topic-category">{category}</div>
                {items.map(t => (
                  <button key={t.id} className={`hub-topic-btn ${selectedTopic === t.id ? "active" : ""} ${askedTopics.includes(t.id) ? "asked" : ""}`} onClick={() => selectTopic(t.id)}>
                    <span>{t.label}</span>
                    {t.active && <em>Action issue</em>}
                    {askedTopics.includes(t.id) && <em>Asked</em>}
                  </button>
                ))}
              </div>
            ))}
            <button className="hub-end-btn" onClick={onClose}>End conversation</button>
          </aside>

          <main className="hub-main-panel">
            {phase === "topics" && (
              <div className="hub-empty-state">
                <div className="meeting-eyebrow">Choose a topic</div>
                <h3>Start a manager-led meeting with {player.name}.</h3>
                <p>Select from role, performance, contracts, transfers, team direction, promises and dressing-room topics. The meeting stays open after each answer.</p>
              </div>
            )}

            {phase === "response" && selected && (
              <>
                <div className="hub-question"><span>Manager</span>{selected.question}</div>
                <div className="convo-intro meeting-quote"><span>{player.name}</span>“{selected.quote}”</div>
                <div className="meeting-context-panel"><b>Tone:</b> {selected.toneLine}</div>
                {duplicateSelected && <div className="meeting-warning"><b>Spam guard:</b> Repeating the same topic in this meeting will not stack morale impact.</div>}
                <div className="convo-options meeting-options">
                  {managerOptions.map(opt => (
                    <button key={opt.id} className={`convo-option meeting-option ${opt.conflictWarning ? "conflict" : ""}`} onClick={() => choose(opt)}>
                      <span className="convo-option-label">{opt.label}</span>
                      <span className="convo-option-hint">Impact: {opt.impact}</span>
                      {opt.conflictWarning && <span className="convo-option-hint warning-text">⚠ {opt.conflictWarning}</span>}
                      <span className={`meeting-risk risk-${String(opt.risk).toLowerCase().replaceAll(" ", "-")}`}>{opt.risk}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {phase === "outcome" && displayedOutcome && (
              <div className="meeting-outcome-panel">
                <div className="meeting-eyebrow">Outcome</div>
                <h3>{displayedOutcome.summary || "Outcome recorded."}</h3>
                {outcome?.conflictWarning && <p className="warning-text">⚠ {outcome.conflictWarning}</p>}
                <div className="meeting-effects">
                  {(displayedOutcome.effects || ["Conversation outcome recorded"]).map(effect => <span key={effect}>{effect}</span>)}
                </div>
                {displayedOutcome.promiseCreated && (
                  <div className="hub-promise-detail">
                    <b>Promise added:</b> {displayedOutcome.promiseCreated.label}<br />
                    Deadline: {promiseDeadline(displayedOutcome.promiseCreated)} · Risk: tracked in Dynamics · Consequence: morale/trust drop if broken.
                  </div>
                )}
                <div className="hub-outcome-actions">
                  <button className="btn-secondary-sm" onClick={() => { setPhase("topics"); setOutcome(null); }}>Ask another topic</button>
                  <button className="btn-primary-sm" onClick={onClose}>End conversation</button>
                </div>
              </div>
            )}
          </main>

          <aside className="hub-side-panel">
            <div className="hub-side-card">
              <div className="meeting-eyebrow">Active promises</div>
              {!ctx.activePromises.length ? <p className="muted">No active promises.</p> : ctx.activePromises.map(p => (
                <div key={p.id} className="hub-promise-row">
                  <b>{p.label}</b>
                  <span>{promiseDeadline(p)} · {getPromiseRiskLabel(p, state, player)}</span>
                  <small>{p.status}</small>
                </div>
              ))}
            </div>
            <div className="hub-side-card">
              <div className="meeting-eyebrow">Recent meetings</div>
              {!morale.conversationHistory?.length ? <p className="muted">No recent meetings.</p> : morale.conversationHistory.slice(-3).reverse().map((h, idx) => (
                <div key={`${h.date}-${idx}`} className="hub-history-row">
                  <b>{h.topic}</b>
                  <span>{h.date} · {h.response}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
