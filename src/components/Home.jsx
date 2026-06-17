import { useDynasty, getCurrentEventInfo } from "../store/dynastyStore.jsx";
import { getSortedStandings } from "../engine/standingsEngine.js";
import { EVENT_TIERS } from "../data/ghostsEventCalendar.js";

export default function Home({ setScreen }) {
  const { state, dispatch } = useDynasty();
  if (!state) return null;

  const team = state.teams.find(t => t.id === state.userTeamId);
  const roster = state.players.filter(p => p.teamId === state.userTeamId);
  const sorted = getSortedStandings(state.standings);
  const userStanding = sorted.find(s => s.teamId === state.userTeamId);
  const eventInfo = getCurrentEventInfo(state);
  const lastEvent = state.completedEvents[state.completedEvents.length - 1];
  const activeProgress = eventInfo?.activeProgress;
  const activeUserStatus = activeProgress?.teamStates?.[state.userTeamId];
  const lastTopPerformer = lastEvent ? Object.values(lastEvent.playerEventStats || {}).sort((a, b) => (b.kd || 0) - (a.kd || 0))[0] : null;

  function handlePrimaryAction() {
    if (!eventInfo) return;
    const { buttonAction, currentEvent } = eventInfo;
    if (buttonAction === "play_match") {
      dispatch({ type: "OPEN_EVENT", eventId: currentEvent.id });
      setScreen("eventdetail");
    } else if (buttonAction === "continue_event") {
      setScreen("eventdetail");
    } else if (buttonAction === "start_event") {
      dispatch({ type: "OPEN_EVENT", eventId: currentEvent.id });
      setScreen("eventdetail");
    }
  }

  const tierInfo = eventInfo?.currentEvent ? EVENT_TIERS[eventInfo.currentEvent.tier] : null;
  const previousSeason = state.seasonHistory?.[state.seasonHistory.length - 1];
  const userResults = state.completedEvents.map(ev => ev.results?.find(r => r.teamId === state.userTeamId)).filter(Boolean);
  const bestFinish = userResults.length ? Math.min(...userResults.map(r => r.placement)) : "—";

  if (state.rostermaniaActive) {
    return (
      <div className="dynasty-home">
        <div className="home-header"><div><h2>Offseason — Rostermania</h2><div className="home-meta"><span className="home-chip">{state.currentGameTitle}</span><span className="home-chip">{state.seasonLabel}</span></div></div></div>
        <div className="home-grid">
          <div className="home-card">
            <h3>Rostermania In Progress</h3>
            <p>You are managing your roster before the {state.seasonLabel} season begins.</p>
            <p className="dim-text">Roster: {roster.length}/4 players · Team OVR: {roster.length ? Math.round(roster.reduce((s, p) => s + (p.overall || 0), 0) / roster.length) : 0}</p>
            <button className="btn-primary" onClick={() => setScreen("rostermania")}>Continue Rostermania →</button>
          </div>
        </div>
      </div>
    );
  }

  if (state.transitionSummary && !state.rostermaniaActive) {
    const summary = state.transitionSummary;
    return (
      <div className="dynasty-home">
        <div className="home-card transition-summary-card">
          <h2>{summary.title}</h2>
          <p className="dim-text">{state.currentSeasonLabel || state.seasonLabel} season transition summary</p>
          <div className="home-grid">
            <div className="home-card"><h3>New teams</h3><p>{summary.newTeams.length ? summary.newTeams.join(", ") : "No new teams."}</p></div>
            <div className="home-card"><h3>Departed teams</h3><p>{summary.departedTeams.length ? summary.departedTeams.join(", ") : "No departed teams."}</p></div>
            <div className="home-card"><h3>New players</h3><p>{summary.newPlayers.slice(0, 12).join(", ")}</p></div>
            <div className="home-card"><h3>Your team</h3><p>{summary.userTeamStatus === "preserved" ? "Your organisation and roster were preserved." : "Your Ghosts team was not active in AW; you have been safely assigned to an AW team while career history remains archived."}</p></div>
          </div>
          <div className="home-card"><h3>Major roster changes</h3><p>{summary.majorRosterChanges.length ? summary.majorRosterChanges.slice(0, 10).join(" · ") : "No major AI changes recorded."}</p></div>
          <button className="btn-primary" onClick={() => dispatch({ type: "ACK_TRANSITION_SUMMARY" })}>Continue to 2014/15 Season</button>
        </div>
      </div>
    );
  }

  if (eventInfo?.allComplete && state.currentEraId === "ghosts") {
    return (
      <div className="dynasty-home">
        <div className="home-header"><div><h2>Season Complete</h2><div className="home-meta"><span className="home-chip">{state.currentGameTitle}</span><span className="home-chip">{state.seasonLabel}</span></div></div></div>
        <div className="home-grid">
          <div className="home-card"><h3>Final Standing</h3><p>Rank <strong>#{userStanding?.rank || "—"}</strong></p><p>Pro Points <strong>{(userStanding?.proPoints || 0).toLocaleString()}</strong></p><p>Event wins <strong>{userStanding?.eventWins || 0}</strong></p><p>Best finish <strong>#{bestFinish}</strong></p></div>
          <div className="home-card"><h3>Event Winners</h3>{state.completedEvents.map(ev => <div key={ev.eventId} className="home-stat-row"><span>{ev.eventName}</span><strong>{ev.champion?.teamName}</strong></div>)}</div>
          <div className="home-card"><h3>Roster Summary</h3>{roster.map(p => <div key={p.id} className="home-roster-row"><span className="player-name">{p.name}</span><span className="player-ovr">OVR {p.overall}</span></div>)}</div>
        </div>
        <div className="rostermania-action-bar">
          <p className="dim-text">The {state.seasonLabel} Ghosts season is complete. Review your season before entering the offseason.</p>
          <button className="btn-primary btn-lg" onClick={() => setScreen("seasonreview")}>View Season Review →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dynasty-home">
      <div className="home-header">
        <div className="home-header-left">
          <h2>{team?.name || "My Team"}</h2>
          <div className="home-meta">
            <span className="home-chip">{state.currentGameTitle}</span>
            <span className="home-chip">{state.seasonLabel}</span>
          </div>
        </div>
        {eventInfo?.buttonLabel && eventInfo.buttonAction && (
          <button className="btn-primary home-play-btn" onClick={handlePrimaryAction}>
            {eventInfo.buttonLabel === "Play Match" ? "▶ " : ""}{eventInfo.buttonLabel}
          </button>
        )}
        {eventInfo?.allComplete && (
          <span className="home-season-complete-badge">Season Complete</span>
        )}
      </div>

      {eventInfo?.currentEvent && !eventInfo.allComplete && (
        <div className="home-current-event-banner">
          <div className="home-event-banner-left">
            <div className="home-event-banner-kicker">
              {eventInfo.isEventInProgress ? "Current Event — In Progress" : "Next Event"}
            </div>
            <h3 className="home-event-banner-name">{eventInfo.currentEvent.name}</h3>
            <div className="home-event-banner-meta">
              <span>{eventInfo.currentEvent.dateLabel}</span>
              {tierInfo && <span className="home-tier-badge" style={{ color: tierInfo.color }}>{tierInfo.label}</span>}
              <span>{eventInfo.currentEvent.format}</span>
              <span>{eventInfo.currentEvent.teamCount} teams</span>
              <span>1st: +{(eventInfo.currentEvent.proPoints?.[1] || 0).toLocaleString()} PP</span>
            </div>
            <div className="home-event-banner-match">
              User status: <strong>{activeUserStatus?.eliminated ? "Eliminated" : eventInfo.isEventInProgress ? "Alive" : "Ready to start"}</strong>{eventInfo.userMatch ? <> · Next match: <strong>{eventInfo.userMatch.teamA?.teamName}</strong> vs <strong>{eventInfo.userMatch.teamB?.teamName}</strong></> : activeProgress ? <> · Next match: <strong>Waiting</strong></> : null}
            </div>
          </div>
          <div className="home-event-banner-actions">
            <button className="btn-primary" onClick={handlePrimaryAction}>
              {eventInfo.buttonLabel === "Play Match" ? "▶ " : ""}{eventInfo.buttonLabel}
            </button>
            <button className="btn-link" onClick={() => setScreen("events")}>View Calendar →</button>
          </div>
        </div>
      )}

      <div className="home-grid">
        <div className="home-card">
          <h3>Team Record</h3>
          <div className="home-stat-row">
            <span>Pro Points</span>
            <strong>{(userStanding?.proPoints || 0).toLocaleString()}</strong>
          </div>
          <div className="home-stat-row">
            <span>Event Wins</span>
            <strong>{userStanding?.eventWins || 0}</strong>
          </div>
          <div className="home-stat-row">
            <span>Rank</span>
            <strong>#{userStanding?.rank || "—"}</strong>
          </div>
          <div className="home-stat-row">
            <span>Events Played</span>
            <strong>{userStanding?.eventsPlayed || 0} / {state.eventCalendar.length}</strong>
          </div>
        </div>

        <div className="home-card">
          <h3>Roster ({roster.length}/4)</h3>
          {roster.map(p => (
            <div key={p.id} className="home-roster-row">
              <span className="player-name">{p.name}</span>
              <span className="player-role">{p.primary}</span>
              <span className="player-ovr">OVR {p.overall}</span>
            </div>
          ))}
          <button className="btn-link" onClick={() => setScreen("roster")}>View Roster →</button>
        </div>

        <div className="home-card">
          <h3>Last Event</h3>
          {lastEvent ? (
            <>
              <div className="home-event-name">{lastEvent.eventName}</div>
              <p>Champion: <strong>{lastEvent.champion.teamName}</strong></p>
              {(() => {
                const userResult = lastEvent.results.find(r => r.teamId === state.userTeamId);
                return userResult ? <p>Your finish: <strong>#{userResult.placement}</strong> (+{userResult.proPointsAwarded.toLocaleString()} PP)</p> : null;
              })()}
              {lastTopPerformer && <p>Top performer: <strong>{lastTopPerformer.name}</strong> ({lastTopPerformer.kd} K/D)</p>}
            </>
          ) : (
            <p className="dim-text">No events completed yet.</p>
          )}
        </div>

        <div className="home-card">
          <h3>Season Progress</h3>
          <div className="home-stat-row">
            <span>Events Completed</span>
            <strong>{state.completedEvents.length} / {state.eventCalendar.length}</strong>
          </div>
          <div className="home-stat-row">
            <span>Events Remaining</span>
            <strong>{state.eventCalendar.length - state.currentEventIndex}</strong>
          </div>
          <button className="btn-link" onClick={() => setScreen("events")}>View Calendar →</button>
          {previousSeason && <p className="dim-text">Previous season archived: {previousSeason.gameTitle} {previousSeason.seasonLabel}</p>}
        </div>
      </div>
    </div>
  );
}
