import { useState } from "react";
import { useDynasty } from "../store/dynastyStore.jsx";

function score(match) {
  if (match.status !== "completed") return "vs";
  return `${match.scoreA}-${match.scoreB}`;
}

export default function EventDetail({ setScreen }) {
  const { state, dispatch } = useDynasty();
  const [tab, setTab] = useState("Overview");
  if (!state) return null;

  const eventId = state.activeEventId || state.eventCalendar[state.currentEventIndex]?.id;
  const event = state.eventCalendar.find(e => e.id === eventId);
  const progress = state.eventProgress?.[eventId];
  if (!event || !progress) {
    return <div className="event-detail"><button className="btn-secondary" onClick={() => setScreen("events")}>Back to Calendar</button></div>;
  }

  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  const userStatus = progress.teamStates?.[state.userTeamId];
  const pending = progress.matches.filter(m => m.status === "pending");
  const nextMatch = pending[0];
  const userMatch = pending.find(m => m.userInvolved);
  const alive = Object.values(progress.teamStates || {}).filter(t => !t.eliminated);
  const favourite = [...progress.field].sort((a, b) => b.ovr - a.ovr)[0];
  const grouped = progress.matches.reduce((acc, m) => {
    const key = m.roundLabel || `Round ${m.round}`;
    acc[key] = acc[key] || [];
    acc[key].push(m);
    return acc;
  }, {});

  function sim(type) {
    dispatch({ type });
  }

  const tabs = ["Overview", "Bracket", "Matches", "Results", "Placements"];

  return (
    <div className="event-detail">
      <div className="event-detail-header">
        <button className="btn-secondary-sm" onClick={() => setScreen("events")}>← Back to Calendar</button>
        <div>
          <h2>{event.name}</h2>
          <p className="dim-text">{event.type} · {event.dateLabel} · {state.currentGameTitle} · {progress.displayFormat}</p>
        </div>
        <div className="event-header-stats">
          <span>{alive.length} teams alive</span>
          <span>{userTeam?.tag}: {userStatus?.eliminated ? "Eliminated" : progress.status === "completed" ? `Finished #${progress.userPlacement}` : "Alive"}</span>
          {progress.champion && <span>🏆 {progress.champion.teamName}</span>}
        </div>
      </div>

      <div className="event-actions-bar">
        <button className="btn-primary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_NEXT_MATCH")}>Sim Next Match</button>
        <button className="btn-primary-sm" disabled={progress.status === "completed" || !userMatch} onClick={() => sim("SIM_USER_MATCH")}>Sim User Match</button>
        <button className="btn-secondary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_ROUND")}>Sim Round</button>
        <button className="btn-secondary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_EVENT")}>Sim Event</button>
      </div>

      <div className="event-tabs">
        {tabs.map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <div className="event-detail-layout">
        <section className="event-main-panel">
          {tab === "Overview" && (
            <>
              <h3>Event Field</h3>
              <div className="event-field-grid">
                {progress.field.map(t => <span key={t.teamId} className={t.teamId === state.userTeamId ? "user-chip" : "team-chip"}>#{t.seed} {t.teamName} <small>OVR {Math.round(t.ovr)}</small></span>)}
              </div>
            </>
          )}
          {(tab === "Bracket" || tab === "Matches") && Object.entries(grouped).map(([label, matches]) => (
            <div className="bracket-round" key={label}>
              <h3>{label}</h3>
              {matches.map(m => <div key={m.id} className={`match-row ${m.userInvolved ? "user-row" : ""} ${m.status}`}>
                <span>{m.teamA?.teamName}</span><strong>{score(m)}</strong><span>{m.teamB?.teamName}</span><em>{m.status}{m.winnerId ? ` · winner ${m.winnerId === m.teamA?.teamId ? m.teamA.teamTag : m.teamB.teamTag}` : ""}</em>
              </div>)}
            </div>
          ))}
          {tab === "Results" && <div><h3>Latest Results</h3>{progress.latestResults.length ? progress.latestResults.map(r => <p key={r}>{r}</p>) : <p className="dim-text">No matches completed yet.</p>}</div>}
          {tab === "Placements" && <div><h3>Placements</h3>{progress.placements.length ? progress.placements.map(p => <div key={p.teamId} className={p.teamId === state.userTeamId ? "result-table-row user-row" : "result-table-row"}><span>#{p.placement}</span><span>{p.teamName}</span><span>+{p.proPointsAwarded.toLocaleString()} Pro Points</span></div>) : <p className="dim-text">Placements lock when the event completes.</p>}</div>}
        </section>

        <aside className="event-summary-panel">
          <h3>Event Summary</h3>
          <p><strong>Your path:</strong> {userStatus?.eliminated ? `Eliminated · projected #${progress.userPlacement || "—"}` : "Still alive"}</p>
          <p><strong>Next match:</strong> {nextMatch ? `${nextMatch.teamA?.teamName} vs ${nextMatch.teamB?.teamName}` : "None"}</p>
          <p><strong>Current opponent:</strong> {userMatch ? (userMatch.teamA?.teamId === state.userTeamId ? userMatch.teamB?.teamName : userMatch.teamA?.teamName) : "Waiting for bracket"}</p>
          <p><strong>Event favourite:</strong> {favourite?.teamName}</p>
          <p><strong>Pro Points available:</strong> +{(event.proPoints?.[1] || 100).toLocaleString()} to champion</p>
          <h4>Latest</h4>
          {(progress.latestResults || []).slice(0, 4).map(r => <p key={r} className="dim-text">{r}</p>)}
        </aside>
      </div>
    </div>
  );
}
