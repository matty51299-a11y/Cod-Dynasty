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

function UserTracker({ progress, userTeamId, userTeam, userStatus, userMatch, completedUserMatches, onPlayMatch }) {
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
      {userMatch ? <button className="btn-primary event-play-match-btn" onClick={onPlayMatch}>▶ Play Match</button> : <p className="event-user-waiting">{userStatus?.eliminated ? "Your team has been eliminated from this event." : "Waiting for other event matches to finish."}</p>}
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

function LiveMatchModal({ live, dispatch }) {
  if (!live) return null;
  const current = live.mapSet[live.currentMapIndex];
  const nextMapIndex = live.mapResults.length;
  const nextMap = live.mapSet[nextMapIndex];
  const reviewing = live.status !== "completed" && live.mapResults.length > live.currentMapIndex;
  const canPlay = live.status !== "completed" && live.mapResults.length === live.currentMapIndex;
  const lastResult = live.mapResults[live.mapResults.length - 1];
  const stats = lastResult?.playerStats;
  const row = (p) => <div key={p.playerId} className={lastResult?.bestPerformer?.playerId === p.playerId ? "live-stat-row best" : "live-stat-row"}><span>{p.name}</span><span>{p.kills}</span><span>{p.deaths}</span><strong>{p.kd.toFixed(2)}</strong></div>;
  return (
    <div className="live-match-backdrop">
      <div className="live-match-modal">
        <div className="live-match-header">
          <div>
            <div className="panel-kicker">{live.eventName} · {live.roundLabel}</div>
            <h2>{live.teamA.teamName} vs {live.teamB.teamName}</h2>
            <p>{live.gameTitle}</p>
          </div>
          <strong className="live-series-score">{live.scoreA}-{live.scoreB}</strong>
        </div>
        <section className="live-current-map">
          {live.status === "completed" ? <>
            <span className="live-phase-badge completed">Series Complete</span>
            <h3>{live.winnerId === live.teamA.teamId ? live.teamA.teamName : live.teamB.teamName} wins {Math.max(live.scoreA, live.scoreB)}-{Math.min(live.scoreA, live.scoreB)}</h3>
          </> : reviewing ? <>
            <span className="live-phase-badge reviewing">Map {lastResult.mapNumber} Complete</span>
            <h3>{lastResult.mapName} — {lastResult.mode}</h3>
            <p className="live-map-result-line">{lastResult.winnerId === live.teamA.teamId ? live.teamA.teamName : live.teamB.teamName} wins {lastResult.scoreA}-{lastResult.scoreB}</p>
            <p className="live-best-performer">Best performer: <strong>{lastResult.bestPerformer.name}</strong> — {lastResult.bestPerformer.kills}/{lastResult.bestPerformer.deaths} ({lastResult.bestPerformer.kd.toFixed(2)} K/D)</p>
          </> : <>
            <span className="live-phase-badge upcoming">Map {current.mapNumber} of 5 — Upcoming</span>
            <h3>{current.mapName} — {current.mode}</h3>
            {lastResult && <p>Previous: {lastResult.mapName} {lastResult.mode} · {lastResult.winnerId === live.teamA.teamId ? live.teamA.teamName : live.teamB.teamName} won {lastResult.scoreA}-{lastResult.scoreB}</p>}
          </>}
        </section>
        <div className="live-map-history">{live.mapResults.map(m => <div key={m.mapNumber} className={`live-map-chip ${m.winnerId === live.teamA.teamId ? "team-a-win" : "team-b-win"}`}><strong>Map {m.mapNumber}</strong><span>{m.mapName}</span><span>{m.mode}</span><b>{m.scoreA}-{m.scoreB}</b></div>)}</div>
        {stats && reviewing && <div className="live-stats-grid"><section><h4>{live.teamA.teamName}</h4><div className="live-stat-head"><span>Player</span><span>K</span><span>D</span><span>K/D</span></div>{stats.teamA.map(row)}</section><section><h4>{live.teamB.teamName}</h4><div className="live-stat-head"><span>Player</span><span>K</span><span>D</span><span>K/D</span></div>{stats.teamB.map(row)}</section></div>}
        <div className="live-match-actions">
          {canPlay && <button className="btn-primary" onClick={() => dispatch({ type: "PLAY_HISTORICAL_MAP" })}>▶ Play Map</button>}
          {reviewing && <button className="btn-primary" onClick={() => dispatch({ type: "ADVANCE_HISTORICAL_MAP" })}>Next Map →</button>}
          {live.status === "completed" && <button className="btn-primary" onClick={() => dispatch({ type: "FINISH_PLAY_MATCH" })}>Finish Match</button>}
          {live.mapResults.length === 0 && <button className="btn-secondary" onClick={() => dispatch({ type: "CANCEL_PLAY_MATCH" })}>Cancel / Back</button>}
        </div>
      </div>
    </div>
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
  const currentMatches = nextMatch ? progress.matches.filter(m => m.round === nextMatch.round && m.roundLabel === nextMatch.roundLabel) : [];
  const userResult = rows.find(r => r.teamId === state.userTeamId);
  const nextEvent = state.eventCalendar[state.currentEventIndex];

  function playMatch() { dispatch({ type: "START_PLAY_MATCH" }); }

  function sim(type) {
    setSelectedMatch(null);
    dispatch({ type });
  }

  return (
    <div className="event-detail event-hub">
      <LiveMatchModal live={state.liveHistoricalMatch} dispatch={dispatch} />
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
            <p>{event.type} · {event.dateLabel} · {progress.gameTitle} · {progress.displayFormat} · {progress.field.length} entered teams</p>
          </div>
          <div className="event-hero-metrics">
            <div><span>Phase</span><strong>{currentRoundLabel}</strong></div>
            <div><span>Teams Alive</span><strong>{alive.length}</strong></div>
            <div><span>Top Seed</span><strong>{favourite?.teamTag || favourite?.teamName}</strong></div>
            <div><span>Champion PP</span><strong>+{(event.proPoints?.[1] || 100).toLocaleString()}</strong></div>
            <div><span>Status</span><strong>{progress.status === "completed" ? "Complete" : progress.status === "in_progress" ? "In Progress" : "Not Started"}</strong></div>
          </div>
        </div>
        <div className="event-command-deck">
          {userMatch && <button className="btn-primary event-play-match-btn" disabled={progress.status === "completed"} onClick={playMatch}>▶ Play Match</button>}
          <button className="btn-primary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_NEXT_MATCH")}>Sim Next Match</button>
          <button className="btn-primary-sm" disabled={progress.status === "completed" || !userMatch} onClick={() => sim("SIM_USER_MATCH")}>Sim User Match</button>
          <button className="btn-secondary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_ROUND")}>Sim Round</button>
          <button className="btn-secondary-sm" disabled={progress.status === "completed"} onClick={() => sim("SIM_EVENT")}>Sim Event</button>
          <span className="event-command-note">
            {userMatch ? `Your match is ready vs ${userMatch.teamA?.teamId === state.userTeamId ? userMatch.teamB?.teamName : userMatch.teamA?.teamName}.` : userStatus?.eliminated ? "Your team is out; finish the event when ready." : "Waiting for your next bracket match."}
          </span>
        </div>
      </div>

      {progress.status === "completed" && (
        <section className="event-section-card event-complete-summary">
          <div className="panel-kicker">Event Complete</div>
          <h3>{event.name}</h3>
          <div className="event-control-room-grid">
            <div><span>Champion</span><strong>{progress.champion?.teamName || "TBD"}</strong></div>
            <div><span>Your Finish</span><strong>{userResult?.placement ? `#${userResult.placement}` : "—"}</strong></div>
            <div><span>Pro Points Earned</span><strong>+{(userResult?.proPointsAwarded || progress.userProPointsAwarded || 0).toLocaleString()}</strong></div>
          </div>
          <div className="event-your-match-actions">
            <button className="btn-primary" onClick={() => setScreen("home")}>Continue to Home</button>
            {nextEvent && nextEvent.id !== event.id && <button className="btn-secondary-sm" onClick={() => { dispatch({ type: "OPEN_EVENT", eventId: nextEvent.id }); setScreen("eventdetail"); }}>Start Next Event</button>}
            <button className="btn-secondary-sm" onClick={() => setScreen("events")}>View Calendar</button>
          </div>
        </section>
      )}

      <div className="event-tabs event-hub-tabs">
        {tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      <div className="event-detail-layout event-hub-layout">
        <main className="event-main-panel event-hub-main">
          {tab === "overview" && (
            <div className="event-overview-grid">
              <section className="event-section-card event-your-match-panel">
                <h3>Your Match</h3>
                {progress.status === "completed" ? <>
                  <p><strong>Event Complete</strong></p>
                  <p>Champion: {progress.champion?.teamName || "TBD"} · Your finish: {userResult?.placement ? `#${userResult.placement}` : "—"}</p>
                  <div className="event-your-match-actions"><button className="btn-primary" onClick={() => setScreen("home")}>Continue to Home</button><button className="btn-secondary-sm" onClick={() => setScreen("events")}>View Calendar</button></div>
                </> : userMatch ? <>
                  <p><strong>{userMatch.teamA?.teamName}</strong> vs <strong>{userMatch.teamB?.teamName}</strong></p>
                  <p>{userMatch.roundLabel} · Best of 5 · Status: Ready</p>
                  <div className="event-your-match-actions"><button className="btn-primary event-play-match-btn" onClick={playMatch}>▶ Play Match</button><button className="btn-secondary-sm" onClick={() => sim("SIM_USER_MATCH")}>Sim User Match</button></div>
                </> : userStatus?.eliminated ? <>
                  <p><strong>Eliminated</strong></p><p>Final placement {userResult?.placement ? `#${userResult.placement}` : "pending"}</p><button className="btn-secondary-sm" onClick={() => sim("SIM_EVENT")}>Sim Rest of Event</button>
                </> : <p className="dim-text">Waiting for other matches to finish. Current bracket position: {userStatus?.losses > 0 ? "Losers Bracket" : progress.format === "single_elimination" ? "Single Elimination" : "Winners Bracket"}.</p>}
              </section>
              <section className="event-section-card">
                <h3>Current Matches</h3>
                {currentMatches.length ? currentMatches.map(m => <MatchCard key={m.id} match={m} userTeamId={state.userTeamId} isCurrent={nextMatch?.id === m.id} onSelect={setSelectedMatch} />) : <p className="dim-text">No current matches. The event is complete.</p>}
              </section>
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
          onPlayMatch={playMatch}
        />
      </div>
    </div>
  );
}
