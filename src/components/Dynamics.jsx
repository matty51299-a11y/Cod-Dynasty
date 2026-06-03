// src/components/Dynamics.jsx
// Squad Dynamics page — the home of the Player Morale, Promises & Concerns
// system. Read-only over the morale engine; the only writes are user-initiated
// conversations (Talk) which dispatch through the reducer.

import { useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import {
  getSquadMorale, getMorale, moodForLevel, moraleColor, moraleTone, derivePersonality, PROMISE_TYPES,
} from "../engine/moraleEngine.js";
import { getTransferStatus } from "../engine/transferEngine.js";
import { isChallengerMode } from "../utils/userTeam.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { PageHeader, SectionCard, StatCard, EmptyState, Pill } from "./ui.jsx";
import ConversationModal from "./ConversationModal.jsx";

function MoraleBadge({ level }) {
  return (
    <span className={`morale-badge morale-${moraleTone(level)}`} style={{ color: moraleColor(level), borderColor: moraleColor(level) }}>
      <b>{level}</b> {moodForLevel(level)}
    </span>
  );
}

function promiseRisk(promise, state, player) {
  // Cheap risk read for the promises panel.
  if (promise.type.startsWith("starter") || promise.type === "more_maps" || promise.type === "no_bench_unless_form") {
    return player?.isSub ? "High" : "Low";
  }
  if (promise.type === "new_contract" || promise.type === "contract_talks") {
    return promise.progress >= 1 ? "None" : "Medium";
  }
  const m = getMorale(state, promise.playerId);
  if (m.concerns?.some(c => c.key === "blocked_move")) return "High";
  return "Medium";
}

export default function Dynamics() {
  const { state } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const [talkTo, setTalkTo] = useState(null);

  if (!state) return null;
  const challenger = isChallengerMode(state);
  const squad = getSquadMorale(state);

  if (!squad.rows.length) {
    return (
      <div className="dynamics-page">
        <PageHeader eyebrow="Squad Dynamics" title="Morale & Promises" subtitle="Track how your players feel and manage promises." />
        <EmptyState title="No squad to manage yet" detail="Build a roster to see morale, concerns and promises." />
      </div>
    );
  }

  return (
    <div className="dynamics-page">
      <PageHeader
        eyebrow="Squad Dynamics"
        title="Morale & Promises"
        subtitle="React to benching, form, results, contracts and transfer interest. Talk to players and make promises — but be ready to keep them."
        meta={(
          <div className="ui-stat-grid compact">
            <StatCard label="Squad Morale" value={squad.avg} hint={squad.mood} tone={squad.avg >= 64 ? "success" : squad.avg >= 50 ? "neutral" : squad.avg >= 38 ? "warning" : "danger"} />
            <StatCard label="Leaders" value={squad.leaders.length} />
            <StatCard label="Unhappy" value={squad.unhappy.length} tone={squad.unhappy.length ? "warning" : "neutral"} />
            <StatCard label="At Risk" value={squad.atRisk.length} tone={squad.atRisk.length ? "danger" : "neutral"} />
            <StatCard label="Active Promises" value={squad.activePromises.length} />
            <StatCard label="Broken" value={squad.brokenPromises.length} tone={squad.brokenPromises.length ? "danger" : "neutral"} />
          </div>
        )}
      />

      {/* Dressing room notes */}
      <SectionCard title="Dressing Room" subtitle="How the squad is feeling right now.">
        <p className="dressing-room-note">{squad.note}</p>
        <div className="roster-alert-row">
          {squad.leaders.slice(0, 4).map(p => <Pill key={p.id} tone="accent">★ {p.name}</Pill>)}
          {squad.atRisk.map(r => <Pill key={r.player.id} tone="danger">{r.player.name} wants out</Pill>)}
        </div>
      </SectionCard>

      {/* Player morale table */}
      <SectionCard title="Player Morale" subtitle="Click a player for their full profile, or Talk to address concerns.">
        <div className="ui-table-wrap">
          <table className="data-table dynamics-table">
            <thead>
              <tr>
                <th>Player</th><th>Role</th><th>Status</th><th>Morale</th>
                <th>Concern</th><th>Promise</th><th>Contract</th><th>Transfer</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {squad.rows
                .slice()
                .sort((a, b) => a.level - b.level)
                .map(({ player, morale, level }) => {
                  const topConcern = morale.concerns[morale.concerns.length - 1];
                  const activePromise = (morale.promises || []).find(p => p.status === "active");
                  const traits = derivePersonality(player);
                  return (
                    <tr key={player.id}>
                      <td className="player-name">
                        <button className="link-button player-link" onClick={() => openPlayerProfile(player)}>{player.name}</button>
                        <div className="dynamics-traits">{traits.map(t => <span key={t} className="trait-chip">{t}</span>)}</div>
                      </td>
                      <td><span className="role-pill ui-pill ui-pill-neutral">{player.primary}</span></td>
                      <td>{player.isSub ? <span className="sub-label">SUB</span> : <span className="sub-label">STARTER</span>}</td>
                      <td><MoraleBadge level={level} /></td>
                      <td className="dynamics-concern">{topConcern ? topConcern.label : <span className="muted">—</span>}</td>
                      <td>{activePromise ? <span className="trait-chip promise-chip">{activePromise.label}</span> : <span className="muted">—</span>}</td>
                      <td style={{ color: (player.contractYears ?? 2) <= 1 ? "#ff6450" : "var(--text-dim)" }}>
                        {challenger ? "—" : `${player.contractYears ?? "—"} yr`}
                      </td>
                      <td className="muted">{getTransferStatus(player, state)}</td>
                      <td>
                        <button className="btn-secondary-sm" onClick={() => setTalkTo(player)}>Talk</button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Promises panel */}
      <SectionCard title="Promises" subtitle="Active and recently resolved promises. Keep them to build trust; break them at your peril.">
        {!squad.activePromises.length && !squad.brokenPromises.length ? (
          <EmptyState title="No promises made yet" detail="Talk to a player and make a promise to see it tracked here." />
        ) : (
          <div className="ui-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Player</th><th>Promise</th><th>Importance</th><th>Status</th><th>Deadline</th><th>Risk</th></tr>
              </thead>
              <tbody>
                {squad.activePromises.map(pr => (
                  <tr key={pr.id}>
                    <td className="player-name"><button className="link-button player-link" onClick={() => openPlayerProfile(pr.player)}>{pr.player.name}</button></td>
                    <td>{pr.label}</td>
                    <td>{pr.importance}</td>
                    <td><Pill tone="accent">Active</Pill></td>
                    <td className="muted">S{pr.deadlineSeason} · Stage {(pr.deadlineStage ?? 0) + 1}</td>
                    <td>{promiseRisk(pr, state, pr.player)}</td>
                  </tr>
                ))}
                {squad.brokenPromises.map(pr => (
                  <tr key={pr.id}>
                    <td className="player-name"><button className="link-button player-link" onClick={() => openPlayerProfile(pr.player)}>{pr.player.name}</button></td>
                    <td>{pr.label}</td>
                    <td>{pr.importance}</td>
                    <td><Pill tone="danger">Broken</Pill></td>
                    <td className="muted">—</td>
                    <td>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted dynamics-promise-help">
          Promise types: {Object.values(PROMISE_TYPES).map(p => p.label).slice(0, 6).join(" · ")}…
        </p>
      </SectionCard>

      {talkTo && <ConversationModal player={talkTo} onClose={() => setTalkTo(null)} />}
    </div>
  );
}
