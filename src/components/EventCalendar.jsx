import { useDynasty } from "../store/dynastyStore.jsx";
import { EVENT_TIERS } from "../data/ghostsEventCalendar.js";

export default function EventCalendar({ setScreen }) {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const events = state.eventCalendar;
  const completedIds = new Set((state.completedEventIds || []).concat(state.completedEvents.map(e => e.eventId)));
  const currentIdx = state.currentEventIndex;

  function getStatus(ev, i) {
    if (completedIds.has(ev.id)) return "completed";
    if (state.activeEventId === ev.id && state.eventProgress?.[ev.id]?.status === "in_progress") return "in_progress";
    if (i === currentIdx) return "current";
    return "locked";
  }

  function openEvent(eventId) {
    dispatch({ type: "OPEN_EVENT", eventId });
    setScreen("eventdetail");
  }

  function viewResults(eventId) {
    dispatch({ type: "OPEN_EVENT", eventId });
    setScreen("eventdetail");
  }

  return (
    <div className="event-calendar">
      <h2>Event Calendar</h2>
      <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel} · Pro Circuit</p>

      <div className="event-list">
        {events.map((ev, i) => {
          const status = getStatus(ev, i);
          const result = state.completedEvents.find(r => r.eventId === ev.id);
          const tierInfo = EVENT_TIERS[ev.tier] || EVENT_TIERS[ev.type];
          const isLocked = status === "locked";
          const isCompleted = status === "completed";
          const isCurrent = status === "current" || status === "in_progress";

          return (
            <div key={ev.id} className={`event-row ${status}`}>
              <div className="event-row-left">
                <span className="event-status-icon">
                  {isCompleted ? "✓" : isCurrent ? "▸" : isLocked ? "🔒" : "○"}
                </span>
                <div>
                  <div className="event-name">{ev.name}</div>
                  <div className="event-meta-row">
                    <span>{ev.dateLabel}</span>
                    {tierInfo && <span className="event-tier-tag" style={{ color: tierInfo.color }}>{tierInfo.label}</span>}
                    <span>{ev.format}</span>
                    <span>{ev.teamCount} teams</span>
                    <span>1st: +{(ev.proPoints?.[1] || 0).toLocaleString()} PP</span>
                  </div>
                </div>
              </div>
              <div className="event-row-right">
                <span className={`event-status-badge ${status}`}>
                  {status === "completed" ? "Completed" : status === "in_progress" ? "In Progress" : isCurrent ? "Current" : "Upcoming"}
                </span>
                {isCompleted && result && (
                  <span className="event-champion">🏆 {result.champion.teamName} · Your #{result.results.find(r => r.teamId === state.userTeamId)?.placement || "—"}</span>
                )}
                {isCompleted ? (
                  <button className="btn-secondary-sm" onClick={() => viewResults(ev.id)}>View Results</button>
                ) : isCurrent ? (
                  <button className="btn-primary-sm" onClick={() => openEvent(ev.id)}>
                    {status === "in_progress" ? "Continue Event" : "Play Event"}
                  </button>
                ) : (
                  <button className="btn-secondary-sm" disabled>Locked</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
