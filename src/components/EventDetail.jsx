import { useMemo, useState } from "react";
import { useDynasty } from "../store/dynastyStore.jsx";

function score(match) {
  if (match.status !== "completed") return "vs";
  return `${match.scoreA}-${match.scoreB}`;
}

function matchTeamLabel(team, isUser) {
  if (!team) return "TBD";
  return `${team.seed ? `#${team.seed} ` : ""}${team.teamName}${isUser ? " (You)" : ""}`;
}

function resultText(match) {
  if (match.status !== "completed") return "Upcoming";
  const winner = match.winnerId === match.teamA?.teamId ? match.teamA : match.teamB;
  const loser = match.loserId === match.teamA?.teamId ? match.teamA : match.teamB;
  const winnerScore = winner?.teamId === match.teamA?.teamId ? match.scoreA : match.scoreB;
  const loserScore = loser?.teamId === match.teamA?.teamId ? match.scoreA : match.scoreB;
  return `${winner?.teamName} def. ${loser?.teamName} ${winnerScore}-${loserScore}`;
}

function placementRows(progress) {
  if (progress.placements?.length) return progress.placements;
  return Object.values(progress.teamStates || {})
    .filter(t => t.eliminated)
    .sort((a, b) => (b.eliminatedOrder || 0) - (a.eliminatedOrder || 0))
    .map((t, i) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      teamTag: t.teamTag,
      placement: `Elim ${i + 1}`,
      proPointsAwarded: 0,
      wins: t.wins,
      losses: t.losses,
      provisional: true,
    }));
}

function groupMatches(matches) {
  return matches.reduce((acc, match) => {
    const key = match.roundLabel || `Round ${match.round}`;
    acc[key] = acc[key] || [];
    acc[key].push(match);
    return acc;
  }, {});
}

function MatchCard({ match, userTeamId, isCurrent, onSelect }) {
  const userA = match.teamA?.teamId === userTeamId;
  const userB = match.teamB?.teamId === userTeamId;
  const winnerA = match.winnerId === match.teamA?.teamId;
  const winnerB = match.winnerId === match.teamB?.teamId;
  return (
    <button
      type="button"
      className={`event-match-card ${match.status} ${match.userInvolved ? "user-match" : ""} ${isCurrent ? "current-match" : ""}`}
      onClick={() => onSelect(match)}
    >
      <div className="event-match-card-top">
        <span>{match.roundLabel}</span>
        <strong>{isCurrent ? "Current" : match.status === "completed" ? "Completed" : "Upcoming"}</strong>
      </div>
      <div className={`event-match-team ${userA ? "user-team" : ""} ${winnerA ? "winner" : ""}`}>
        <span>{matchTeamLabel(match.teamA, userA)}</span>
        <strong>{match.status === "completed" ? match.scoreA : "—"}</strong>
      </div>
      <div className={`event-match-team ${userB ? "user-team" : ""} ${winnerB ? "winner" : ""}`}>
        <span>{matchTeamLabel(match.teamB, userB)}</span>
        <strong>{match.status === "completed" ? match.scoreB : "—"}</strong>
      </div>
      <div className="event-match-card-foot">{match.mapSummary}</div>
    </button>
  );
}

function UserTracker({ progress, userTeamId, userTeam, userStatus, userMatch, completedUserMatches }) {
  const latestUserMatch = completedUserMatches[completedUserMatches.length - 1];
  const currentSide = userStatus?.eliminated
    ? "Eliminated"
    : progress.status === "completed"
      ? `Finished #${progress.userPlacement || "—"}`
      : userStatus?.losses > 0 && progress.format === "double_elimination"
        ? "Losers Bracket"
        : progress.format === "single_elimination"
          ? "Single Elimination"
          : progress.format === "round_robin"
            ? "League Fixtures"
            : "Winners Bracket";
  const bestFinish = userStatus?.eliminated ? `#${progress.userPlacement || "—"}` : "1st";
  return (
    <aside className="event-summary-panel event-my-team-panel">
      <div className="panel-kicker">My Team</div>
      <h3>{userTeam?.name || "My Team"}</h3>
      <div className="event-status-pill-row">
        <span className={`event-status-pill ${userStatus?.eliminated ? "danger" : "success"}`}>
          {userStatus?.eliminated ? "Eliminated" : progress.status === "completed" ? "Event Complete" : "Alive"}
        </span>
        <span className="event-status-pill">{currentSide}</span>
      </div>
      <div className="event-summary-grid">
        <span>Record</span><strong>{userStatus?.wins || 0}-{userStatus?.losses || 0}</strong>
        <span>Next opponent</span><strong>{userMatch ? (userMatch.teamA?.teamId === userTeamId ? userMatch.teamB?.teamName : userMatch.teamA?.teamName) : "Waiting"}</strong>
        <span>Best possible finish</span><strong>{bestFinish}</strong>
        <span>Pro Points earned</span><strong>{progress.status === "completed" ? `+${progress.userProPointsAwarded.toLocaleString()}` : "Pending"}</strong>
      </div>
      <h4>Route So Far</h4>
      {completedUserMatches.length ? completedUserMatches.map(m => (
        <div key={m.id} className={`event-route-row ${m.winnerId === userTeamId ? "win" : "loss"}`}>
          <span>{m.roundLabel}</span>
          <strong>{resultText(m)}</strong>
        </div>
      )) : <p className="dim-text">Your run starts when your first match is reached.</p>}
      {latestUserMatch && <p className="event-latest-user">Latest: {resultText(latestUserMatch)}</p>}
    </aside>
  );
}

export default function EventDetail({ setScreen }) {
  const { state, dispatch } = useDynasty();
  const [tab, setTab] = useState("overview");
  const [selectedMatch, setSelectedMatch] = useState(null);
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
  const completed = progress.matches.filter(m => m.status === "completed");
  const nextMatch = pending[0];
  const userMatch = pending.find(m => m.userInvolved);
  const completedUserMatches = completed.filter(m => m.userInvolved);
  const alive = Object.values(progress.teamStates || {}).filter(t => !t.eliminated);
  const favourite = [...progress.field].sort((a, b) => b.ovr - a.ovr)[0];
  const currentRoundLabel = nextMatch?.roundLabel || (progress.status === "completed" ? "Event Complete" : "Awaiting next round");
  const grouped = useMemo(() => groupMatches(progress.matches), [progress.matches]);
  const tabs = progress.format === "round_robin"
    ? [["overview", "Overview"], ["bracket", "Fixtures"], ["matches", "Matches"], ["results", "Results"], ["placements", "Placements"]]
    : [["overview", "Overview"], ["bracket", "Bracket"], ["matches", "Matches"], ["results", "Results"], ["placements", "Placements"]];
  const rows = placementRows(progress);

  function sim(type) {
    setSelectedMatch(null);
    dispatch({ type });
  }

  return (
    <div className="event-detail event-hub">
      <div className="event-hero-card">
        <div className="event-hero-topline">
          <button className="btn-secondary-sm" onClick={() => setScreen("events")}>← Event Calendar</button>
          <span>{state.currentGameTitle}</span>
          <span>{state.seasonLabel}</span>
        </div>
        <div className="event-hero-main">
          <div>
            <div className="panel-kicker">Historical Event Hub</div>
            <h2>{event.name}</h2>
            <p>{event.type} · {event.dateLabel} · {progress.displayFormat} · {event.teamCount} invited teams</p>
          </div>
          <div className="event-hero-metrics">
            <div><span>Phase</span><strong>{currentRoundLabel}</strong></div>
            <div><span>Teams Alive</span><strong>{alive.length}</strong></div>
            <div><span>Top Seed</span><strong>{favourite?.teamTag || favourite?.teamName}</strong></div>
            <div><span>Champion PP</span><strong>+{(event.proPoints?.[1] || 100).toLocaleString()}</strong></div>
          </div>
        </div>
        <div className="event-command-deck">
          <button className="btn-primary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_NEXT_MATCH")}>Sim Next Match</button>
          <button className="btn-primary-sm" disabled={progress.status === "completed" || !userMatch} onClick={() => sim("SIM_USER_MATCH")}>Sim User Match</button>
          <button className="btn-secondary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_ROUND")}>Sim Round</button>
          <button className="btn-secondary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_EVENT")}>Sim Event</button>
          <span className="event-command-note">
            {userMatch ? `Your match is ready vs ${userMatch.teamA?.teamId === state.userTeamId ? userMatch.teamB?.teamName : userMatch.teamA?.teamName}.` : userStatus?.eliminated ? "Your team is out; finish the event when ready." : "Waiting for your next bracket match."}
          </span>
        </div>
      </div>

      <div className="event-tabs event-hub-tabs">
        {tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      <div className="event-detail-layout event-hub-layout">
        <main className="event-main-panel event-hub-main">
          {tab === "overview" && (
            <div className="event-overview-grid">
              <section className="event-section-card">
                <h3>Event Field</h3>
                <div className="event-field-grid">
                  {progress.field.map(t => {
                    const teamState = progress.teamStates?.[t.teamId];
                    return <span key={t.teamId} className={t.teamId === state.userTeamId ? "user-chip" : "team-chip"}>#{t.seed} {t.teamName} <small>{teamState?.wins || 0}-{teamState?.losses || 0} · OVR {Math.round(t.ovr)}</small></span>;
                  })}
                </div>
              </section>
              <section className="event-section-card">
                <h3>Control Room</h3>
                <div className="event-control-room-grid">
                  <div><span>Current match</span><strong>{nextMatch ? `${nextMatch.teamA?.teamTag} vs ${nextMatch.teamB?.teamTag}` : "None"}</strong></div>
                  <div><span>User status</span><strong>{userStatus?.eliminated ? "Eliminated" : "Alive"}</strong></div>
                  <div><span>Completed matches</span><strong>{completed.length} / {progress.matches.length}</strong></div>
                  <div><span>Importance</span><strong>{event.type === "championship" ? "World Championship" : event.type === "qualifier" ? "Qualifier" : "Pro Circuit"}</strong></div>
                </div>
              </section>
            </div>
          )}

          {tab === "bracket" && (
            <div className="event-bracket-board">
              {Object.entries(grouped).map(([label, matches]) => (
                <section className="event-bracket-column" key={label}>
                  <h3>{label}</h3>
                  {matches.map(m => <MatchCard key={m.id} match={m} userTeamId={state.userTeamId} isCurrent={nextMatch?.id === m.id} onSelect={setSelectedMatch} />)}
                </section>
              ))}
            </div>
          )}

          {tab === "matches" && (
            <div className="event-match-list-panel">
              <h3>All Matches</h3>
              <div className="event-match-list">
                {progress.matches.map(m => <MatchCard key={m.id} match={m} userTeamId={state.userTeamId} isCurrent={nextMatch?.id === m.id} onSelect={setSelectedMatch} />)}
              </div>
              {selectedMatch && (
                <div className="event-match-detail-panel">
                  <h4>{selectedMatch.roundLabel}</h4>
                  <p>{matchTeamLabel(selectedMatch.teamA, selectedMatch.teamA?.teamId === state.userTeamId)} vs {matchTeamLabel(selectedMatch.teamB, selectedMatch.teamB?.teamId === state.userTeamId)}</p>
                  <p>Status: <strong>{selectedMatch.status}</strong> · Score: <strong>{score(selectedMatch)}</strong></p>
                  <p>{selectedMatch.status === "completed" ? resultText(selectedMatch) : selectedMatch.mapSummary}</p>
                </div>
              )}
            </div>
          )}

          {tab === "results" && (
            <section className="event-section-card">
              <h3>Completed Results</h3>
              {completed.length ? completed.map((m, i) => (
                <div key={m.id} className={`event-result-row ${m.userInvolved ? "user-row" : ""}`}>
                  <span>#{i + 1}</span>
                  <strong>{m.roundLabel}</strong>
                  <span>{resultText(m)}</span>
                </div>
              )) : <p className="dim-text">No matches completed yet. Sim the next match to begin the event story.</p>}
            </section>
          )}

          {tab === "placements" && (
            <section className="event-section-card">
              <h3>{progress.status === "completed" ? "Final Placements" : "Elimination Tracker"}</h3>
              {rows.length ? rows.map(p => <div key={p.teamId} className={p.teamId === state.userTeamId ? "event-placement-row user-row" : "event-placement-row"}>
                <span>{typeof p.placement === "number" ? `#${p.placement}` : p.placement}</span>
                <strong>{p.teamName}</strong>
                <span>{p.wins}-{p.losses}</span>
                <span>{p.provisional ? "Pending PP" : `+${p.proPointsAwarded.toLocaleString()} Pro Points`}</span>
              </div>) : <p className="dim-text">No teams eliminated yet.</p>}
            </section>
          )}
        </main>

        <UserTracker
          progress={progress}
          userTeamId={state.userTeamId}
          userTeam={userTeam}
          userStatus={userStatus}
          userMatch={userMatch}
          completedUserMatches={completedUserMatches}
        />
      </div>
    </div>
  );
}
