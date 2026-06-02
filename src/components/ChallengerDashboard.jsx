// src/components/ChallengerDashboard.jsx
// Home dashboard for the user-managed Challenger team ("Road to CDL"). Shows
// Challenger context: roster, circuit points, qualifier position, route to the
// Major / Finals, latest moves, player development, CDL buyout offers and board
// objectives. CDL standings appear only as a small compact panel.

import { useEffect } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import {
  resolveUserTeamMeta, getUserChallengerTeam, getChallengerRosterPlayers,
} from "../utils/userTeam.js";
import { getChallengerRosterStatus } from "../utils/rosterValidation.js";
import { evaluateChallengerObjectives, getChallengerConfidence, getChallengerTier } from "../engine/challengerBoard.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import { PageHeader, SectionCard, StatCard, Pill, EmptyState } from "./ui.jsx";

const TIER_LABEL = { weak: "Developing", mid: "Mid-table", strong: "Contender", elite: "Powerhouse" };
const k = (n) => `$${Math.round((n || 0) / 1000)}k`;

function fmtPlacement(p) {
  if (p == null) return "—";
  const s = ["th", "st", "nd", "rd"], v = p % 100;
  return p + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function ChallengerDashboard({ setScreen }) {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();

  // Surface CDL buyout interest once per open transfer window.
  useEffect(() => {
    dispatch({ type: "GENERATE_CHALLENGER_OFFERS" });
  }, [dispatch, state?.schedule?.phase, state?.schedule?.stageIdx, state?.season]);

  if (!state) return null;

  const meta = resolveUserTeamMeta(state);
  const team = getUserChallengerTeam(state);
  const roster = getChallengerRosterPlayers(state).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const status = getChallengerRosterStatus(state);
  const { tier, rank, total } = getChallengerTier(state);
  const ovr = roster.length ? Math.round(roster.reduce((s, p) => s + (p.overall ?? 0), 0) / roster.length) : 0;
  const { objectives } = evaluateChallengerObjectives(state);
  const confidence = getChallengerConfidence(state);
  const primary = objectives.find(o => o.weight === "primary");

  const schedule = state.schedule || {};
  const phase = schedule.phase;
  const offers = (state.challengerOffers || []).filter(o => o.status === "pending");

  // Qualifier position (live event).
  const qual = schedule.currentChallengerQualifier;
  const userRow = (qual?.field || []).find(r => r.teamId === state.userTeamId);
  const userResult = (qual?.results || []).find(r => r.teamId === state.userTeamId);

  // Route context.
  const stageName = schedule.stages?.[schedule.stageIdx ?? 0]?.name ?? "Stage";
  let nextEvent;
  if (phase === "stage") nextEvent = `${stageName} in progress — Challenger Qualifier next`;
  else if (phase === "challengerQualifier") nextEvent = qual?.eventType === "challengersFinals" ? "Challengers Finals — LIVE" : "Challenger Qualifier — LIVE";
  else if (phase === "major") {
    const inMajor = schedule.majors?.[schedule.majorIdx ?? 0]?.bracket?.seeds?.includes(state.userTeamId);
    nextEvent = inMajor ? `${schedule.majors?.[schedule.majorIdx ?? 0]?.name ?? "Major"} — you qualified!` : `${schedule.majors?.[schedule.majorIdx ?? 0]?.name ?? "Major"} live (you did not qualify)`;
  } else nextEvent = phase === "preChamps" ? "Pre-Championship window" : phase === "offseason" || phase === "contracts" ? "Offseason" : phase;

  // Latest moves involving the user team.
  const moves = (state.challengerTransactions || [])
    .filter(t => t.toTeamId === state.userTeamId || t.fromTeamId === state.userTeamId)
    .slice(-6).reverse();

  // Development watch: high-upside youngsters.
  const devPlayers = roster
    .map(p => ({ p, gap: (p.potential ?? p.overall ?? 0) - (p.overall ?? 0) }))
    .filter(d => d.gap > 0)
    .sort((a, b) => b.gap - a.gap).slice(0, 4);

  // Compact CDL table (top 4).
  const cdlTop = Object.entries(schedule.standings || {})
    .sort((a, b) => (b[1]?.points || 0) - (a[1]?.points || 0))
    .slice(0, 4)
    .map(([id, rec]) => ({ team: CDL_TEAMS.find(t => t.id === id), rec }));

  return (
    <div className="standings-page">
      <PageHeader
        eyebrow={`Challenger Circuit · ${meta?.region ?? "NA"} · ${TIER_LABEL[tier] ?? tier}`}
        title={meta?.name ?? "Your Challenger Team"}
        subtitle={nextEvent}
        accent={meta?.color}
        meta={(
          <div className="ui-stat-grid compact">
            <StatCard label="Roster" value={`${status.count}/${status.required}`} tone={status.valid ? "success" : "danger"} />
            <StatCard label="Roster OVR" value={ovr} />
            <StatCard label="Circuit Pts" value={team?.circuitPoints ?? 0} />
            <StatCard label="Circuit Rank" value={`${rank}/${total}`} />
            <StatCard label="Transfer Funds" value={k(state.challengerFunds)} tone={state.challengerFunds ? "success" : "neutral"} />
          </div>
        )}
      />

      {!status.valid && (
        <div className="roster-warning" role="status">
          <strong>Roster incomplete</strong> — {meta?.name} have {status.count}/{status.required} starters.
          Sign {status.missing} more {status.missing === 1 ? "player" : "players"} from the Market before continuing.
        </div>
      )}

      {/* CDL buyout offers — the core Challenger pressure. */}
      {offers.length > 0 && (
        <SectionCard title="CDL Buyout Offers" subtitle="Bigger teams want your players. Sell for transfer income, or hold on to develop them.">
          <div className="cd-offers">
            {offers.map(o => {
              const buyer = CDL_TEAMS.find(t => t.id === o.fromCdlTeamId);
              return (
                <div key={o.id} className="cd-offer-row">
                  <span className="cd-offer-player">{o.playerName}</span>
                  <span className="cd-offer-buyer" style={{ color: buyer?.color }}>{buyer?.name ?? o.fromCdlTeamId}</span>
                  <span className="cd-offer-fee">{k(o.fee)}</span>
                  <span className="cd-offer-actions">
                    <button className="btn-cta" onClick={() => dispatch({ type: "RESPOND_CHALLENGER_OFFER", offerId: o.id, decision: "accept" })}>Accept</button>
                    <button className="btn-secondary" onClick={() => dispatch({ type: "RESPOND_CHALLENGER_OFFER", offerId: o.id, decision: "reject" })}>Reject</button>
                  </span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <div className="cd-grid">
        <SectionCard title="Current Roster" subtitle="Click a player for the full profile." action={<button className="link-button" onClick={() => setScreen?.("roster")}>Manage ›</button>}>
          {roster.length === 0 ? (
            <EmptyState title="No players signed" detail="Sign players from the Market screen." />
          ) : (
            <table className="standings-table">
              <thead><tr><th>Player</th><th>Age</th><th>Role</th><th>OVR</th><th>POT</th></tr></thead>
              <tbody>
                {roster.map(p => (
                  <tr key={p.id} className="player-row" onClick={() => openPlayerProfile(p)}>
                    <td><button className="link-button" onClick={(e) => { e.stopPropagation(); openPlayerProfile(p); }}>{p.name}</button></td>
                    <td>{p.age}</td>
                    <td>{p.primary}</td>
                    <td>{p.overall}</td>
                    <td>{p.potential}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="Owner Objectives" subtitle="Challenger-appropriate goals." action={<button className="link-button" onClick={() => setScreen?.("board")}>Board ›</button>}>
          <div className="cd-board">
            <div className="cd-confidence">
              <span className="muted">Confidence</span>
              <strong style={{ color: confidence >= 60 ? "#34d399" : confidence >= 40 ? "#fbbf24" : "#f87171" }}>{confidence}%</strong>
            </div>
            {primary && (
              <div className="cb-obj-row">
                <span className="cb-obj-label">{primary.label}</span>
                <Pill tone={primary.met ? "success" : "warning"}>{primary.met ? "Done" : primary.progress}</Pill>
              </div>
            )}
            {objectives.filter(o => o.weight !== "primary").map(o => (
              <div key={o.id} className="cb-obj-row">
                <span className="cb-obj-label">{o.label}</span>
                <Pill tone={o.met ? "success" : "neutral"}>{o.met ? "Done" : o.progress}</Pill>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Qualifier Position">
          {userResult ? (
            <div className="ui-stat-grid compact">
              <StatCard label="Placement" value={fmtPlacement(userResult.placement)} tone={userResult.qualified ? "success" : "neutral"} />
              <StatCard label="Status" value={userResult.qualified ? "Qualified" : "Out"} tone={userResult.qualified ? "success" : "danger"} />
            </div>
          ) : userRow ? (
            <div className="ui-stat-grid compact">
              <StatCard label="Seed" value={`#${userRow.seed}`} />
              <StatCard label="Field OVR" value={userRow.teamOvr} />
            </div>
          ) : (
            <p className="muted">Best qualifier finish: {fmtPlacement(team?.lastQualifierPlacement)}. Next qualifier follows the current stage.</p>
          )}
          <p className="muted" style={{ marginTop: 8 }}>Majors qualified this run: {(team?.qualifiedMajorIdxs || []).length}</p>
        </SectionCard>

        <SectionCard title="Player Development" subtitle="Your highest-upside talent.">
          {devPlayers.length === 0 ? <p className="muted">No clear development candidates.</p> : (
            <div className="cd-dev-list">
              {devPlayers.map(({ p, gap }) => (
                <div key={p.id} className="cb-obj-row">
                  <button className="link-button cb-obj-label" onClick={() => openPlayerProfile(p)}>{p.name} · {p.primary}</button>
                  <span className="muted">OVR {p.overall} → POT {p.potential} (+{gap})</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Latest Moves">
          {moves.length === 0 ? <p className="muted">No recent moves.</p> : (
            <ul className="cd-moves">
              {moves.map((m, i) => <li key={i}>{m.note}</li>)}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="CDL League (compact)" subtitle="The CDL season runs in the background." action={<button className="link-button" onClick={() => setScreen?.("standings")}>Full ›</button>}>
          <table className="standings-table">
            <thead><tr><th>#</th><th>Team</th><th>Pts</th></tr></thead>
            <tbody>
              {cdlTop.map(({ team: t, rec }, i) => (
                <tr key={t?.id ?? i}><td>{i + 1}</td><td style={{ color: t?.color }}>{t?.name ?? "—"}</td><td>{rec.points}</td></tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </div>
  );
}
