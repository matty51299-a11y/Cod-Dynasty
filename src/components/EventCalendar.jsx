import { useDynasty } from "../store/dynastyStore.jsx";

export default function EventCalendar({ setScreen }) {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const events = state.eventCalendar;
  const completedIds = new Set(state.completedEvents.map(e => e.eventId));
  const nextIdx = state.currentEventIndex;

  function handleSim() {
    dispatch({ type: "SIM_EVENT" });
    setScreen("eventresult");
  }

  return (
    <div className="event-calendar">
      <h2>Event Calendar</h2>
      <p className="dim-text">{state.currentGameTitle} · {state.seasonLabel} · Pro Circuit</p>

      <div className="event-list">
        {events.map((ev, i) => {
          const completed = completedIds.has(ev.id);
          const isNext = i === nextIdx;
          const result = state.completedEvents.find(r => r.eventId === ev.id);
          return (
            <div key={ev.id} className={`event-row ${completed ? "completed" : ""} ${isNext ? "next-event" : ""}`}>
              <div className="event-row-left">
                <span className="event-status">
                  {completed ? "✓" : isNext ? "▸" : "○"}
                </span>
                <div>
                  <div className="event-name">{ev.name}</div>
                  <div className="event-meta-row">
                    <span>{ev.dateLabel}</span>
                    <span>{ev.type}</span>
                    <span>{ev.format}</span>
                    <span>{ev.teamCount} teams</span>
                  </div>
                </div>
              </div>
              <div className="event-row-right">
                {completed && result && (
                  <span className="event-champion">🏆 {result.champion.teamName}</span>
                )}
                {isNext && !completed && (
                  <button className="btn-primary-sm" onClick={handleSim}>Simulate</button>
                )}
                {!completed && !isNext && (
                  <span className="dim-text">Upcoming</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
