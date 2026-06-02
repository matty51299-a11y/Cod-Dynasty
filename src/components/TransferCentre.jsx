// src/components/TransferCentre.jsx
// In-contract transfer / buyout negotiation hub.
// Sections: Incoming Offers, Outgoing Offers, Transfer-Listed (league),
// My Squad transfer status. FM-style compact tables.

import { useEffect, useState } from "react";
import { useGame } from "../store/gameStore.jsx";
import { CDL_TEAMS } from "../data/teams.js";
import { isInactivePlayer } from "../utils/playerIdentity.js";
import { usePlayerProfile } from "../store/playerProfileContext.jsx";
import {
  isTransferWindowOpen, transferWindowLabel, getWindowKey, getTransferBudget,
  getPlayerValuation, getAskingPrice, getTransferStatus, getIncomingOffers,
  getOutgoingOffers, getLeagueTransferListed, fmtFee, teamTag,
} from "../engine/transferEngine.js";
import { EmptyState, PageHeader, Pill, SectionCard, StatCard } from "./ui.jsx";

const SETTABLE_STATUSES = ["Open to Offers", "Transfer Listed", "Not For Sale", "Unsettled"];

function feeColor(fee, val) {
  if (val <= 0) return "var(--text)";
  if (fee >= val) return "#34d399";
  if (fee >= val * 0.8) return "#fbbf24";
  return "#f87171";
}

function offerStatusTone(status) {
  return { Pending: "neutral", Countered: "warning", Accepted: "success", Rejected: "danger", Withdrawn: "danger", Expired: "danger" }[status] || "neutral";
}

export default function TransferCentre() {
  const { state, dispatch } = useGame();
  const { openPlayerProfile } = usePlayerProfile();
  const [tab, setTab] = useState("incoming");
  const [counterFees, setCounterFees] = useState({});
  const [askInputs, setAskInputs] = useState({});

  // Auto-scan the market once per open transfer window (guarded in the reducer).
  const windowKey = state ? getWindowKey(state) : null;
  useEffect(() => {
    if (state && isTransferWindowOpen(state) && state.transferMarket?.lastWaveKey !== windowKey) {
      dispatch({ type: "RUN_TRANSFER_WAVE" });
    }
  }, [windowKey, state?.transferMarket?.lastWaveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;
  const { players, userTeamId } = state;
  const windowOpen = isTransferWindowOpen(state);

  const incoming = getIncomingOffers(state).filter(n => ["Pending", "Countered", "Accepted"].includes(n.status));
  const incomingDone = getIncomingOffers(state).filter(n => ["Rejected", "Withdrawn", "Expired"].includes(n.status)).slice(-5);
  const outgoing = getOutgoingOffers(state);
  const listed = getLeagueTransferListed(state).filter(p => p.teamId !== userTeamId);
  const myPlayers = players.filter(p => p.teamId === userTeamId && !isInactivePlayer(p));
  const budget = getTransferBudget(state, userTeamId);

  const pById = id => players.find(p => p.id === id);

  function respond(negotiationId, act, fee) { dispatch({ type: "RESPOND_TRANSFER_OFFER", negotiationId, action: act, fee }); }
  function setStatus(playerId, status) { dispatch({ type: "SET_TRANSFER_STATUS", playerId, status }); }
  function setAsk(playerId) {
    const v = Number(askInputs[playerId]);
    if (v > 0) dispatch({ type: "SET_TRANSFER_STATUS", playerId, askingPrice: v * 1000 });
  }
  function makeOffer(playerId) {
    const v = Number(counterFees["mk_" + playerId]);
    if (v > 0) dispatch({ type: "MAKE_TRANSFER_OFFER", playerId, fee: v * 1000 });
  }

  const TABS = [
    ["incoming", `Incoming (${incoming.length})`],
    ["outgoing", `Outgoing (${outgoing.filter(o => ["Pending", "Countered", "Accepted"].includes(o.status)).length})`],
    ["listed", `Transfer Listed (${listed.length})`],
    ["squad", "My Squad"],
  ];

  return (
    <div className="transfer-centre">
      <PageHeader
        eyebrow="Recruitment"
        title="Transfer Centre"
        subtitle="Buyouts and in-contract moves. Receive and make offers, set asking prices and manage your squad's availability."
        meta={(
          <div className="ui-stat-grid compact">
            <StatCard label="Transfer Budget" value={fmtFee(budget.balance)} tone="success" />
            <StatCard label="Spent" value={fmtFee(budget.spend)} />
            <StatCard label="Income" value={fmtFee(budget.income)} />
            <StatCard label="Window" value={windowOpen ? "Open" : "Closed"} tone={windowOpen ? "success" : "warning"} hint={transferWindowLabel(state)} />
          </div>
        )}
      />

      {!windowOpen && (
        <div className="ui-warning-banner"><strong>Transfer window closed.</strong> In-contract moves resume between stages and in the offseason — not during live events.</div>
      )}

      <div className="cm-tabs ui-tabs">
        {TABS.map(([k, label]) => <button key={k} className={`filter-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {/* ── INCOMING OFFERS ─────────────────────────────────────────────────── */}
      {tab === "incoming" && (
        <SectionCard title="Incoming Offers" subtitle="Buyout offers from other clubs for your players. Accept, reject, counter or pull the player off the market.">
          {incoming.length === 0 ? (
            <EmptyState title="No live offers" detail="Rival clubs will table offers between stages and in the offseason. Transfer-listing a player attracts more interest." />
          ) : (
            <div className="ui-table-wrap"><table className="roster-table data-table">
              <thead><tr><th>Buying Team</th><th>Player</th><th>Fee</th><th>Your Value</th><th>Reason</th><th>Status</th><th>Counter</th><th>Actions</th></tr></thead>
              <tbody>
                {incoming.map(n => {
                  const p = pById(n.playerId); if (!p) return null;
                  const val = getPlayerValuation(p, state);
                  const live = n.counterFee ?? n.fee;
                  const accepted = n.status === "Accepted";
                  return (
                    <tr key={n.id}>
                      <td><span style={{ color: CDL_TEAMS.find(t => t.id === n.fromTeamId)?.color }}>{teamTag(n.fromTeamId)}</span></td>
                      <td className="player-name"><button className="link-button player-link" onClick={() => openPlayerProfile(p)}>{p.name}</button> <span className="muted">{p.primary} · {p.overall}</span></td>
                      <td style={{ color: feeColor(live, val), fontWeight: 700 }}>{fmtFee(live)}{n.counterBy === "buyer" ? " ↩" : ""}</td>
                      <td>{fmtFee(val)}</td>
                      <td className="muted" style={{ fontSize: ".78rem" }}>{n.reason}</td>
                      <td><Pill tone={offerStatusTone(n.status)}>{n.status}{n.counterBy ? ` (${n.counterBy})` : ""}</Pill></td>
                      <td>
                        <input className="slot-select tr-fee-input" type="number" placeholder="k" value={counterFees[n.id] ?? ""} onChange={e => setCounterFees({ ...counterFees, [n.id]: e.target.value })} />
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {accepted ? (
                          <button className="btn-primary-sm" onClick={() => respond(n.id, "accept")}>Confirm Sale</button>
                        ) : (<>
                          <button className="btn-primary-sm" onClick={() => respond(n.id, "accept")} title={`Sell for ${fmtFee(live)}`}>Accept</button>
                          <button className="btn-secondary tr-btn" onClick={() => { const v = Number(counterFees[n.id]); if (v > 0) respond(n.id, "counter", v * 1000); }} disabled={!(Number(counterFees[n.id]) > 0)}>Counter</button>
                          <button className="btn-secondary tr-btn" onClick={() => respond(n.id, "reject")}>Reject</button>
                          <button className="btn-danger-sm" onClick={() => respond(n.id, "nfs")} title="Mark Not For Sale">NFS</button>
                        </>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
          {incomingDone.length > 0 && (
            <details style={{ marginTop: 10 }}><summary className="muted">Recent closed offers</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: ".82rem" }}>
                {incomingDone.slice().reverse().map(n => { const p = pById(n.playerId); return <li key={n.id}>{teamTag(n.fromTeamId)} — {p?.name ?? n.playerId} — <span className="muted">{n.status}</span></li>; })}
              </ul>
            </details>
          )}
        </SectionCard>
      )}

      {/* ── OUTGOING OFFERS ─────────────────────────────────────────────────── */}
      {tab === "outgoing" && (
        <SectionCard title="Outgoing Offers" subtitle="Approaches you've made for other clubs' contracted players.">
          {outgoing.length === 0 ? (
            <EmptyState title="No outgoing offers" detail="Use the Transfer-Listed tab or a player's profile to make an offer for a contracted player." />
          ) : (
            <div className="ui-table-wrap"><table className="roster-table data-table">
              <thead><tr><th>Selling Team</th><th>Player</th><th>Your Fee</th><th>Counter</th><th>Status</th><th>Re-counter</th><th>Actions</th></tr></thead>
              <tbody>
                {outgoing.slice().reverse().map(n => {
                  const p = pById(n.playerId); if (!p) return null;
                  const accepted = n.status === "Accepted";
                  const countered = n.status === "Countered" && n.counterBy === "seller";
                  return (
                    <tr key={n.id}>
                      <td>{teamTag(n.toTeamId)}</td>
                      <td className="player-name"><button className="link-button player-link" onClick={() => openPlayerProfile(p)}>{p.name}</button> <span className="muted">{p.primary} · {p.overall}</span></td>
                      <td>{fmtFee(n.fee)}</td>
                      <td style={{ color: "#fbbf24", fontWeight: 600 }}>{n.counterFee ? fmtFee(n.counterFee) : "—"}</td>
                      <td><Pill tone={offerStatusTone(n.status)}>{n.status}</Pill></td>
                      <td>{(countered) && <input className="slot-select tr-fee-input" type="number" placeholder="k" value={counterFees[n.id] ?? ""} onChange={e => setCounterFees({ ...counterFees, [n.id]: e.target.value })} />}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {accepted && <button className="btn-primary-sm" onClick={() => respond(n.id, "accept")}>Complete Signing</button>}
                        {countered && <>
                          <button className="btn-primary-sm" onClick={() => respond(n.id, "accept")} title={`Pay ${fmtFee(n.counterFee)}`}>Accept Counter</button>
                          <button className="btn-secondary tr-btn" onClick={() => { const v = Number(counterFees[n.id]); if (v > 0) respond(n.id, "counter", v * 1000); }} disabled={!(Number(counterFees[n.id]) > 0)}>Re-counter</button>
                        </>}
                        {["Pending", "Countered", "Accepted"].includes(n.status) && <button className="btn-secondary tr-btn" onClick={() => respond(n.id, "withdraw")}>Withdraw</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      )}

      {/* ── TRANSFER LISTED (league) ────────────────────────────────────────── */}
      {tab === "listed" && (
        <SectionCard title="Available Around the League" subtitle="Players other clubs have transfer-listed. Make a buyout offer.">
          {listed.length === 0 ? (
            <EmptyState title="No listed players" detail="No rival clubs have transfer-listed players right now." />
          ) : (
            <div className="ui-table-wrap"><table className="roster-table data-table">
              <thead><tr><th>Player</th><th>Team</th><th>Role</th><th>Age</th><th>OVR</th><th>POT</th><th>Salary</th><th>Asking</th><th>Offer (k)</th><th>Action</th></tr></thead>
              <tbody>
                {listed.map(p => {
                  const ask = getAskingPrice(p, state);
                  return (
                    <tr key={p.id}>
                      <td className="player-name"><button className="link-button player-link" onClick={() => openPlayerProfile(p)}>{p.name}</button></td>
                      <td>{teamTag(p.teamId)}</td>
                      <td><span className="role-pill ui-pill ui-pill-neutral">{p.primary}</span></td>
                      <td>{p.age}</td><td style={{ fontWeight: 700 }}>{p.overall}</td><td>{p.potential}</td>
                      <td>{fmtFee(p.salary)}</td><td>{fmtFee(ask)}</td>
                      <td><input className="slot-select tr-fee-input" type="number" placeholder="k" value={counterFees["mk_" + p.id] ?? ""} onChange={e => setCounterFees({ ...counterFees, ["mk_" + p.id]: e.target.value })} /></td>
                      <td><button className="btn-primary-sm" disabled={!windowOpen || !(Number(counterFees["mk_" + p.id]) > 0)} onClick={() => makeOffer(p.id)}>Make Offer</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </SectionCard>
      )}

      {/* ── MY SQUAD TRANSFER STATUS ────────────────────────────────────────── */}
      {tab === "squad" && (
        <SectionCard title="My Squad — Transfer Status" subtitle="Set asking prices and availability. Not-for-sale players require a huge bid; transfer-listed players attract more offers.">
          <div className="ui-table-wrap"><table className="roster-table data-table">
            <thead><tr><th>Player</th><th>Role</th><th>Age</th><th>OVR</th><th>Yrs</th><th>Salary</th><th>Valuation</th><th>Asking (k)</th><th>Status</th></tr></thead>
            <tbody>
              {myPlayers.map(p => {
                const val = getPlayerValuation(p, state);
                const status = getTransferStatus(p, state);
                return (
                  <tr key={p.id}>
                    <td className="player-name"><button className="link-button player-link" onClick={() => openPlayerProfile(p)}>{p.name}</button>{p.isSub && <span className="sub-label">SUB</span>}</td>
                    <td><span className="role-pill ui-pill ui-pill-neutral">{p.primary}</span></td>
                    <td>{p.age}</td><td style={{ fontWeight: 700 }}>{p.overall}</td>
                    <td style={{ color: (p.contractYears ?? 2) <= 1 ? "#ff6450" : "var(--text-dim)" }}>{p.contractYears ?? "—"}</td>
                    <td>{fmtFee(p.salary)}</td>
                    <td style={{ color: "#60a5fa", fontWeight: 600 }}>{fmtFee(val)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <input className="slot-select tr-fee-input" type="number" placeholder={(getAskingPrice(p, state) / 1000).toFixed(0)} value={askInputs[p.id] ?? ""} onChange={e => setAskInputs({ ...askInputs, [p.id]: e.target.value })} />
                        <button className="btn-secondary tr-btn" onClick={() => setAsk(p.id)}>Set</button>
                      </div>
                    </td>
                    <td>
                      <select className="slot-select" value={SETTABLE_STATUSES.includes(status) ? status : "Open to Offers"} onChange={e => setStatus(p.id, e.target.value)} disabled={status === "Recently Signed"}>
                        {SETTABLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {status === "Recently Signed" && <span className="muted" style={{ fontSize: ".7rem" }}> protected</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </SectionCard>
      )}
    </div>
  );
}
