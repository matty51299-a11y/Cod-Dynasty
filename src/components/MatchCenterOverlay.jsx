// src/components/MatchCenterOverlay.jsx
// Map-by-map interactive match center.
//
// Flow:
//   pregame      — matchup preview, "Start Match" button
//   simming      — 600ms pause then map auto-sims
//   map_result   — show map winner, player stats, procs
//   intermission — 3 tactical adjustment choices between maps
//   complete     — final series result, "Done" dispatches to game store
//
// Attributes drive results per mode (Hardpoint/S&D/Control).
// Traits (Tilt, Clutch, Leadership) apply between maps via applyTraitModifiers.

import { useReducer, useEffect, useState } from "react";
import { useGame }         from "../store/gameStore.jsx";
import { useMatchCenter }  from "../store/matchCenterContext.jsx";
import { CDL_TEAMS }       from "../data/teams.js";
import { simMap, makeMatchRng } from "../engine/matchSim.js";
import { calcTeamOvr }     from "../engine/teamOvr.js";

function teamColor(id) { return CDL_TEAMS.find(t => t.id === id)?.color ?? "#888"; }
function teamName(id)  { return CDL_TEAMS.find(t => t.id === id)?.name  ?? id; }
function teamTag(id)   { return CDL_TEAMS.find(t => t.id === id)?.tag   ?? id; }

const MAP_MODES = ["Hardpoint", "Search & Destroy", "Control", "Hardpoint", "Search & Destroy"];
const MODE_SHORT = { "Hardpoint": "HP", "Search & Destroy": "S&D", "Control": "CTL" };

// ── Reducer ───────────────────────────────────────────────────────────────────
const INIT = {
  phase:              "pregame",   // pregame | simming | map_result | intermission | complete
  rng:                null,
  currentMapIdx:      0,
  seriesScore:        [0, 0],      // [winsA, winsB]
  mapResults:         [],
  accStats:           {},          // { [pid]: { name, teamId, kills, deaths } }
  currentMapStats:    null,        // per-player stats for the map just played
  procs:              [],
  momentum:           0.5,
  tiltedIdsA:         new Set(),
  tiltedIdsB:         new Set(),
  lastMapKDByPlayer:  {},
  regainUsed:         false,
  pendingBoostA:      { gunny: 0, awareness: 0, teamwork: 0 },
  finalResult:        null,
};

function buildFinalResult(teamA, teamB, mapResults, winsA, winsB, accStats) {
  const playerStats = {};
  for (const [id, s] of Object.entries(accStats)) {
    playerStats[id] = {
      ...s,
      kd: s.deaths > 0 ? +(s.kills / s.deaths).toFixed(2) : s.kills > 0 ? s.kills : 0,
    };
  }

  const winner = winsA === 3 ? teamA : teamB;
  const loser  = winsA === 3 ? teamB : teamA;
  const score  = `${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}`;

  const winnerStats = winner.players.slice(0, 4)
    .map(p => ({ p, stat: playerStats[p.id] }))
    .filter(x => x.stat && x.stat.kills >= 3)
    .sort((a, b) => b.stat.kd - a.stat.kd);
  const standout = winnerStats[0]?.p ?? winner.players[0];

  return {
    winnerId:     winner.id,
    loserId:      loser.id,
    winnerName:   winner.name,
    loserName:    loser.name,
    score,
    teamAId:      teamA.id,
    teamAName:    teamA.name,
    teamBId:      teamB.id,
    teamBName:    teamB.name,
    winsA,
    winsB,
    mapResults,
    playerStats,
    standoutId:   standout?.id   ?? null,
    standoutName: standout?.name ?? null,
    standoutKD:   standout ? (playerStats[standout.id]?.kd ?? 0) : 0,
  };
}

function reducer(state, action) {
  switch (action.type) {

    case "RESET":
      return { ...INIT, tiltedIdsA: new Set(), tiltedIdsB: new Set() };

    case "START":
      return { ...state, phase: "simming", rng: makeMatchRng(action.seed) };

    case "SIM_MAP": {
      const { teamA, teamB } = action;
      const { mapResult, playerMapStats, procs, newTiltedIdsA, newTiltedIdsB, momentum } =
        simMap(teamA, teamB, state.currentMapIdx, {
          tiltedIdsA:        state.tiltedIdsA,
          tiltedIdsB:        state.tiltedIdsB,
          lastMapKDByPlayer: state.lastMapKDByPlayer,
          extraBoostsA:      state.pendingBoostA,
          extraBoostsB:      {},
        }, state.rng);

      const aWon     = mapResult.winnerId === teamA.id;
      const newWinsA = state.seriesScore[0] + (aWon ? 1 : 0);
      const newWinsB = state.seriesScore[1] + (aWon ? 0 : 1);
      const done     = newWinsA === 3 || newWinsB === 3;

      // Accumulate series stats
      const newAccStats = { ...state.accStats };
      for (const [id, s] of Object.entries(playerMapStats)) {
        if (!newAccStats[id]) newAccStats[id] = { name: s.name, teamId: s.teamId, kills: 0, deaths: 0 };
        newAccStats[id].kills  += s.kills;
        newAccStats[id].deaths += s.deaths;
      }

      const allMapResults = [...state.mapResults, mapResult];

      return {
        ...state,
        phase:             done ? "complete" : "map_result",
        seriesScore:       [newWinsA, newWinsB],
        mapResults:        allMapResults,
        accStats:          newAccStats,
        currentMapStats:   playerMapStats,
        procs,
        momentum,
        tiltedIdsA:        newTiltedIdsA,
        tiltedIdsB:        newTiltedIdsB,
        lastMapKDByPlayer: Object.fromEntries(
          Object.entries(playerMapStats).map(([id, s]) => [id, s.kd])
        ),
        pendingBoostA: { gunny: 0, awareness: 0, teamwork: 0 }, // consumed
        finalResult: done ? buildFinalResult(teamA, teamB, allMapResults, newWinsA, newWinsB, newAccStats) : null,
      };
    }

    case "SHOW_INTERMISSION":
      return { ...state, phase: "intermission" };

    case "APPLY_TACTIC": {
      let boost      = { ...state.pendingBoostA };
      let regainUsed = state.regainUsed;
      let tiltedA    = state.tiltedIdsA;

      if (action.tactic === "regain" && !regainUsed) {
        tiltedA    = new Set();
        regainUsed = true;
      } else if (action.tactic === "vibes") {
        boost = { ...boost, teamwork: boost.teamwork + 5 };
      } else if (action.tactic === "slayout") {
        boost = { ...boost, gunny: boost.gunny + 5, awareness: boost.awareness - 5 };
      }
      return { ...state, pendingBoostA: boost, regainUsed, tiltedIdsA: tiltedA };
    }

    case "NEXT_MAP":
      return {
        ...state,
        phase:          "simming",
        currentMapIdx:  state.currentMapIdx + 1,
        currentMapStats: null,
        procs:          [],
      };

    default:
      return state;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Scoreboard({ teamA, teamB, seriesScore, mapIdx, userTeamId }) {
  const [wA, wB] = seriesScore;
  const mode     = MAP_MODES[mapIdx] ?? "";
  const short    = MODE_SHORT[mode] ?? "";
  return (
    <div className="mco-scoreboard">
      <div className={`mco-sb-team ${teamA.id === userTeamId ? "mco-sb-you" : ""}`}>
        <span className="mco-sb-tag" style={{ color: teamColor(teamA.id) }}>{teamTag(teamA.id)}</span>
        {teamA.id === userTeamId && <span className="mco-sb-you-badge">YOU</span>}
      </div>
      <div className="mco-sb-score">
        <span className="mco-sb-num" style={{ color: wA > wB ? "var(--green)" : wA < wB ? "var(--red)" : "var(--text-head)" }}>{wA}</span>
        <span className="mco-sb-sep">—</span>
        <span className="mco-sb-num" style={{ color: wB > wA ? "var(--green)" : wB < wA ? "var(--red)" : "var(--text-head)" }}>{wB}</span>
        <span className="mco-sb-mode">{short} Map {mapIdx + 1}</span>
      </div>
      <div className={`mco-sb-team mco-sb-team-b ${teamB.id === userTeamId ? "mco-sb-you" : ""}`}>
        {teamB.id === userTeamId && <span className="mco-sb-you-badge">YOU</span>}
        <span className="mco-sb-tag" style={{ color: teamColor(teamB.id) }}>{teamTag(teamB.id)}</span>
      </div>
    </div>
  );
}

function MomentumBar({ momentum, teamA, teamB }) {
  const pct = Math.round(momentum * 100);
  return (
    <div className="mco-momentum-wrap">
      <span className="mco-mom-label" style={{ color: teamColor(teamA.id) }}>{teamTag(teamA.id)}</span>
      <div className="mco-momentum-bar">
        <div
          className="mco-momentum-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${teamColor(teamA.id)}, ${teamColor(teamB.id)})`,
          }}
        />
        <div className="mco-momentum-marker" style={{ left: `${pct}%` }} />
      </div>
      <span className="mco-mom-label" style={{ color: teamColor(teamB.id) }}>{teamTag(teamB.id)}</span>
    </div>
  );
}

function PlayerRow({ pid, stats, teamId, userTeamId, isHeader }) {
  if (isHeader) {
    return (
      <div className="mco-player-row mco-player-header">
        <span className="mco-pr-name">Player</span>
        <span className="mco-pr-k">K</span>
        <span className="mco-pr-d">D</span>
        <span className="mco-pr-kd">K/D</span>
      </div>
    );
  }

  if (!stats) return null;
  const isUser = teamId === userTeamId;
  const kdCls  = stats.kd >= 1.2 ? "mco-kd-great" : stats.kd >= 1.0 ? "mco-kd-ok" : "mco-kd-bad";

  return (
    <div className={`mco-player-row ${isUser ? "mco-pr-user-team" : ""}`}>
      <span className="mco-pr-name" style={isUser ? { color: teamColor(teamId) } : {}}>
        {stats.name}
      </span>
      <span className="mco-pr-k">{stats.kills}</span>
      <span className="mco-pr-d">{stats.deaths}</span>
      <span className={`mco-pr-kd ${kdCls}`}>{stats.kd?.toFixed(2)}</span>
    </div>
  );
}

function LiveView({ teamA, teamB, currentMapStats, userTeamId }) {
  const aPlayers = teamA.players.slice(0, 4);
  const bPlayers = teamB.players.slice(0, 4);

  return (
    <div className="mco-live-view">
      <div className="mco-team-col">
        <div className="mco-team-col-header" style={{ color: teamColor(teamA.id) }}>{teamTag(teamA.id)}</div>
        <PlayerRow isHeader />
        {aPlayers.map(p => (
          <PlayerRow
            key={p.id} pid={p.id}
            stats={currentMapStats?.[p.id] ?? { name: p.name, kills: "—", deaths: "—", kd: null }}
            teamId={teamA.id} userTeamId={userTeamId}
          />
        ))}
      </div>

      <div className="mco-live-divider">
        <span className="mco-live-vs">vs</span>
      </div>

      <div className="mco-team-col">
        <div className="mco-team-col-header" style={{ color: teamColor(teamB.id) }}>{teamTag(teamB.id)}</div>
        <PlayerRow isHeader />
        {bPlayers.map(p => (
          <PlayerRow
            key={p.id} pid={p.id}
            stats={currentMapStats?.[p.id] ?? { name: p.name, kills: "—", deaths: "—", kd: null }}
            teamId={teamB.id} userTeamId={userTeamId}
          />
        ))}
      </div>
    </div>
  );
}

function MapHistoryRow({ mr, teamA, teamB }) {
  const won = mr.winnerId === teamA.id;
  return (
    <div className={`mco-map-history-row ${won ? "mco-mhr-a" : "mco-mhr-b"}`}>
      <span className="mco-mhr-map">Map {mr.mapNum} · {mr.short}</span>
      <span className="mco-mhr-score">
        <span style={{ color: teamColor(mr.winnerId) }}>{teamTag(mr.winnerId)}</span>
        <span className="mco-mhr-sc">{mr.scoreWinner}–{mr.scoreLoser}</span>
      </span>
    </div>
  );
}

function ProcsFeed({ procs }) {
  if (!procs.length) return null;
  return (
    <div className="mco-procs">
      {procs.map((pr, i) => (
        <div key={i} className="mco-proc-badge">
          ★ {pr.label} — {pr.playerName}
        </div>
      ))}
    </div>
  );
}

function TacticButton({ label, desc, active, disabled, onClick }) {
  return (
    <button
      className={`mco-tactic-btn ${active ? "mco-tactic-active" : ""} ${disabled ? "mco-tactic-disabled" : ""}`}
      onClick={!disabled ? onClick : undefined}
    >
      <div className="mco-tactic-label">{label}</div>
      <div className="mco-tactic-desc">{desc}</div>
    </button>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MatchCenterOverlay() {
  const { ctx, closeMatchCenter }  = useMatchCenter();
  const { state, dispatch: gDispatch } = useGame();
  const [mcState, mcDispatch]      = useReducer(reducer, INIT);
  const [visibleProcs, setVisibleProcs] = useState([]);
  const [activeTactic, setActiveTactic] = useState(null);

  const isOpen = ctx !== null;

  // Reset state whenever the overlay opens
  useEffect(() => {
    if (isOpen) {
      mcDispatch({ type: "RESET" });
      setActiveTactic(null);
    }
  }, [isOpen]);

  // Auto-clear procs after 2.5s
  useEffect(() => {
    if (mcState.procs.length === 0) return;
    setVisibleProcs(mcState.procs);
    const t = setTimeout(() => setVisibleProcs([]), 2500);
    return () => clearTimeout(t);
  }, [mcState.procs]);

  // Derive team objects from game state
  const teamA = (() => {
    if (!state || !ctx) return null;
    const { schedule, players, userTeamId } = state;
    if (ctx.type === "stage") {
      const stage = schedule.stages?.[schedule.stageIdx];
      const m = stage?.matches.find(mx => !mx.played && (mx.a === userTeamId || mx.b === userTeamId));
      if (!m) return null;
      const id = m.a;
      const meta = CDL_TEAMS.find(t => t.id === id) ?? { id, name: id };
      return { id: meta.id, name: meta.name, players: players.filter(p => p.teamId === id) };
    }
    if (ctx.type === "major") {
      const bracket = schedule.majors?.[schedule.majorIdx]?.bracket;
      if (!bracket) return null;
      for (const round of bracket.rounds) {
        const m = round.matches.find(mx => !mx.played && (mx.a === userTeamId || mx.b === userTeamId));
        if (m) {
          const id = m.a;
          const meta = CDL_TEAMS.find(t => t.id === id) ?? { id, name: id };
          return { id: meta.id, name: meta.name, players: players.filter(p => p.teamId === id) };
        }
      }
    }
    return null;
  })();

  const teamB = (() => {
    if (!state || !ctx || !teamA) return null;
    const { schedule, players, userTeamId } = state;
    if (ctx.type === "stage") {
      const stage = schedule.stages?.[schedule.stageIdx];
      const m = stage?.matches.find(mx => !mx.played && (mx.a === userTeamId || mx.b === userTeamId));
      if (!m) return null;
      const id = m.b;
      const meta = CDL_TEAMS.find(t => t.id === id) ?? { id, name: id };
      return { id: meta.id, name: meta.name, players: players.filter(p => p.teamId === id) };
    }
    if (ctx.type === "major") {
      const bracket = schedule.majors?.[schedule.majorIdx]?.bracket;
      if (!bracket) return null;
      for (const round of bracket.rounds) {
        const m = round.matches.find(mx => !mx.played && (mx.a === state.userTeamId || mx.b === state.userTeamId));
        if (m) {
          const id = m.b;
          const meta = CDL_TEAMS.find(t => t.id === id) ?? { id, name: id };
          return { id: meta.id, name: meta.name, players: players.filter(p => p.teamId === id) };
        }
      }
    }
    return null;
  })();

  // Auto-sim: when phase becomes "simming", wait 600ms then sim the map
  useEffect(() => {
    if (mcState.phase !== "simming" || !teamA || !teamB) return;
    const t = setTimeout(() => {
      mcDispatch({ type: "SIM_MAP", teamA, teamB });
    }, 600);
    return () => clearTimeout(t);
  }, [mcState.phase, mcState.currentMapIdx]); // eslint-disable-line

  if (!isOpen || !state || !ctx) return null;
  if (!teamA || !teamB) return null;

  const { userTeamId } = state;
  const { phase, seriesScore, mapResults, currentMapStats, momentum, finalResult,
          currentMapIdx, regainUsed, pendingBoostA, tiltedIdsA } = mcState;

  const mode  = MAP_MODES[currentMapIdx] ?? "";
  const short = MODE_SHORT[mode] ?? "";

  // Count how many user team players are tilted
  const userTeamIsA = teamA.id === userTeamId;
  const myTiltCount = userTeamIsA
    ? teamA.players.slice(0, 4).filter(p => tiltedIdsA.has(p.id)).length
    : teamB.players.slice(0, 4).filter(p => mcState.tiltedIdsB.has(p.id)).length;

  function handleStart() {
    mcDispatch({ type: "START", seed: ctx.seed });
  }

  function handleTactic(tactic) {
    if (tactic === "regain" && regainUsed) return;
    setActiveTactic(tactic);
    mcDispatch({ type: "APPLY_TACTIC", tactic });
  }

  function handleNextMap() {
    setActiveTactic(null);
    mcDispatch({ type: "NEXT_MAP" });
  }

  function handleDone() {
    if (!finalResult) return;
    gDispatch({ type: "COMMIT_USER_MATCH_RESULT", result: finalResult });
    closeMatchCenter();
  }

  // ── Pregame ──────────────────────────────────────────────────────────────────
  if (phase === "pregame") {
    const userOvr = calcTeamOvr(userTeamId, state.players);
    const oppId   = userTeamIsA ? teamB.id : teamA.id;
    const oppOvr  = calcTeamOvr(oppId, state.players);
    const ctxLabel = ctx.type === "major"
      ? (() => {
          const bracket = state.schedule.majors?.[state.schedule.majorIdx]?.bracket;
          for (const r of bracket?.rounds ?? []) {
            if (r.matches.some(m => !m.played && (m.a === userTeamId || m.b === userTeamId)))
              return r.name;
          }
          return "Tournament";
        })()
      : `Stage ${(state.schedule.stageIdx ?? 0) + 1}`;

    return (
      <div className="mco-backdrop">
        <div className="mco-pregame-card">
          <div className="mco-pg-context">{ctxLabel}</div>
          <div className="mco-pg-title">MATCH CENTER</div>
          <div className="mco-pg-subtitle">BO5 — Map-by-Map</div>

          <div className="mco-pg-matchup">
            <div className="mco-pg-team">
              <div className="mco-pg-tag" style={{ color: teamColor(teamA.id) }}>{teamTag(teamA.id)}</div>
              <div className="mco-pg-name">{teamName(teamA.id)}</div>
              <div className="mco-pg-ovr">{teamA.id === userTeamId ? userOvr : oppOvr} OVR</div>
              {teamA.id === userTeamId && <span className="mco-pg-you">YOU</span>}
            </div>
            <div className="mco-pg-vs">vs</div>
            <div className="mco-pg-team">
              <div className="mco-pg-tag" style={{ color: teamColor(teamB.id) }}>{teamTag(teamB.id)}</div>
              <div className="mco-pg-name">{teamName(teamB.id)}</div>
              <div className="mco-pg-ovr">{teamB.id === userTeamId ? userOvr : oppOvr} OVR</div>
              {teamB.id === userTeamId && <span className="mco-pg-you">YOU</span>}
            </div>
          </div>

          <div className="mco-pg-maps">
            {MAP_MODES.map((m, i) => (
              <span key={i} className="mco-pg-map-badge">{MODE_SHORT[m]}</span>
            ))}
          </div>

          <button className="btn-primary mco-start-btn" onClick={handleStart}>
            ▶ Start Match
          </button>
        </div>
      </div>
    );
  }

  // ── Complete ──────────────────────────────────────────────────────────────────
  if (phase === "complete" && finalResult) {
    const userWon = finalResult.winnerId === userTeamId;
    return (
      <div className="mco-backdrop">
        <div className="mco-complete-card">
          <div className={`mco-final-banner ${userWon ? "mco-final-win" : "mco-final-loss"}`}>
            <div className="mco-final-outcome">{userWon ? "VICTORY" : "DEFEAT"}</div>
            <div className="mco-final-score">{finalResult.score}</div>
            <div className="mco-final-teams">
              <span style={{ color: teamColor(finalResult.winnerId) }}>{teamTag(finalResult.winnerId)}</span>
              <span className="mco-final-dash"> — </span>
              <span style={{ color: teamColor(finalResult.loserId), opacity: 0.6 }}>{teamTag(finalResult.loserId)}</span>
            </div>
          </div>

          {finalResult.standoutName && finalResult.standoutKD > 0 && (
            <div className="mco-final-mvp">
              ★ <strong>{finalResult.standoutName}</strong>
              <span className="mco-final-mvp-kd"> {finalResult.standoutKD.toFixed(2)} K/D · Series MVP</span>
            </div>
          )}

          <div className="mco-final-maps">
            {mapResults.map(mr => (
              <MapHistoryRow key={mr.mapNum} mr={mr} teamA={teamA} teamB={teamB} />
            ))}
          </div>

          <div className="mco-final-stats">
            <div className="mco-fst-header">
              <span className="mco-fst-name">Player</span>
              <span className="mco-fst-k">K</span>
              <span className="mco-fst-d">D</span>
              <span className="mco-fst-kd">K/D</span>
            </div>
            {[...teamA.players.slice(0, 4), ...teamB.players.slice(0, 4)].map(p => {
              const s = finalResult.playerStats[p.id];
              if (!s) return null;
              const kdCls = s.kd >= 1.2 ? "mco-kd-great" : s.kd >= 1.0 ? "mco-kd-ok" : "mco-kd-bad";
              const divider = p === teamB.players[0] ? "mco-fst-divider" : "";
              return (
                <div key={p.id} className={`mco-fst-row ${p.teamId === userTeamId ? "mco-fst-user" : ""} ${divider}`}>
                  <span className="mco-fst-name" style={{ color: teamColor(p.teamId) }}>{s.name}</span>
                  <span className="mco-fst-k">{s.kills}</span>
                  <span className="mco-fst-d">{s.deaths}</span>
                  <span className={`mco-fst-kd ${kdCls}`}>{s.kd?.toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          <button className="btn-primary mco-done-btn" onClick={handleDone}>
            {userWon ? "Continue →" : "Continue →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Live / map result / intermission ─────────────────────────────────────────
  const isSimming      = phase === "simming";
  const isMapResult    = phase === "map_result";
  const isIntermission = phase === "intermission";

  const lastMapResult  = mapResults[mapResults.length - 1];
  const seriesMapIdx   = isMapResult || isIntermission ? currentMapIdx : currentMapIdx;

  return (
    <div className="mco-backdrop">
      <div className="mco-live-card">

        {/* Scoreboard */}
        <Scoreboard
          teamA={teamA} teamB={teamB}
          seriesScore={seriesScore}
          mapIdx={seriesMapIdx}
          userTeamId={userTeamId}
        />

        {/* Momentum bar */}
        <MomentumBar momentum={momentum} teamA={teamA} teamB={teamB} />

        {/* Main body */}
        <div className="mco-body">

          {/* Left: live stats */}
          <div className="mco-body-left">
            {isSimming && (
              <div className="mco-simming-msg">
                <span className="mco-spin">⟳</span> Simulating {short} Map {currentMapIdx + 1}…
              </div>
            )}

            {(isMapResult || isIntermission) && (
              <>
                {lastMapResult && (
                  <div className={`mco-map-winner ${lastMapResult.winnerId === userTeamId ? "mco-mw-user-win" : lastMapResult.loserId === userTeamId ? "mco-mw-user-loss" : ""}`}>
                    <span style={{ color: teamColor(lastMapResult.winnerId) }}>{teamTag(lastMapResult.winnerId)}</span>
                    {" "}win Map {lastMapResult.mapNum} — {lastMapResult.short}
                    <span className="mco-mw-score"> {lastMapResult.scoreWinner}–{lastMapResult.scoreLoser}</span>
                  </div>
                )}
                <LiveView
                  teamA={teamA} teamB={teamB}
                  currentMapStats={currentMapStats}
                  userTeamId={userTeamId}
                />
              </>
            )}

            {/* Proc events */}
            <ProcsFeed procs={visibleProcs} />
          </div>

          {/* Right: map history */}
          <div className="mco-body-right">
            <div className="mco-history-label">MAP HISTORY</div>
            {mapResults.length === 0
              ? <div className="mco-history-empty muted">No maps played yet</div>
              : mapResults.map(mr => (
                  <MapHistoryRow key={mr.mapNum} mr={mr} teamA={teamA} teamB={teamB} />
                ))
            }

            {myTiltCount > 0 && (
              <div className="mco-tilt-notice">
                ⚠ {myTiltCount} player{myTiltCount > 1 ? "s" : ""} tilted
              </div>
            )}
          </div>
        </div>

        {/* Intermission panel */}
        {isIntermission && (
          <div className="mco-intermission">
            <div className="mco-int-label">TACTICAL ADJUSTMENT — Map {currentMapIdx + 2}</div>
            <div className="mco-tactics">
              <TacticButton
                label="Regain"
                desc="Clear tilt penalties (one-time use)"
                active={activeTactic === "regain"}
                disabled={regainUsed}
                onClick={() => handleTactic("regain")}
              />
              <TacticButton
                label="Vibes"
                desc="+5 Teamwork next map"
                active={activeTactic === "vibes"}
                disabled={false}
                onClick={() => handleTactic("vibes")}
              />
              <TacticButton
                label="Slay Out"
                desc="+5 Gunny, −5 Awareness next map"
                active={activeTactic === "slayout"}
                disabled={false}
                onClick={() => handleTactic("slayout")}
              />
            </div>
            <button className="btn-primary mco-next-map-btn" onClick={handleNextMap}>
              ▶ Map {currentMapIdx + 2} — {MODE_SHORT[MAP_MODES[currentMapIdx + 1]] ?? ""}
            </button>
          </div>
        )}

        {/* Map result → "Continue" (no intermission after map 5 or series clinched) */}
        {isMapResult && (() => {
          const seriesClinched = seriesScore[0] === 3 || seriesScore[1] === 3;
          if (seriesClinched) return null;
          return (
            <div className="mco-map-result-actions">
              <button
                className="btn-secondary mco-int-skip-btn"
                onClick={() => mcDispatch({ type: "SHOW_INTERMISSION" })}
              >
                Adjust Tactics
              </button>
              <button className="btn-primary mco-next-map-btn" onClick={handleNextMap}>
                ▶ Next Map
              </button>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
