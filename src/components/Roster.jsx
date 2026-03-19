diff --git a/src/components/Roster.jsx b/src/components/Roster.jsx
index ef5a19fb0d9e8dc8cc5f6678c5114a28c7bcd32b..6f828f238509773fbbdbc4353f9cdeeae3c77b6a 100644
--- a/src/components/Roster.jsx
+++ b/src/components/Roster.jsx
@@ -1,49 +1,49 @@
 // src/components/Roster.jsx
 // Displays every team's roster. Clicking a player opens a centered modal.
 
 import { useState } from "react";
 import { useGame } from "../store/gameStore.jsx";
 import { CDL_TEAMS } from "../data/teams.js";
 import { calcChemistry, chemLabel } from "../engine/chemistry.js";
 
 const RATING_KEYS = [
   { key: "gunny",        label: "Gunny" },
   { key: "awareness",    label: "Awareness" },
   { key: "objective",    label: "Obj" },
   { key: "searchIQ",     label: "S.IQ" },
   { key: "clutch",       label: "Clutch" },
   { key: "teamwork",     label: "T.Work" },
   { key: "composure",    label: "Composure" },
   { key: "adaptability", label: "Adapt." },
 ];
 
 function ratingColor(v) {
-  if (v >= 90) return "#00e676";
-  if (v >= 80) return "#69f0ae";
-  if (v >= 70) return "#ffeb3b";
-  if (v >= 60) return "#ffa726";
+  if (v >= 90) return "#166534";
+  if (v >= 80) return "#15803d";
+  if (v >= 70) return "#b45309";
+  if (v >= 60) return "#c2410c";
   return "#ef5350";
 }
 
 export default function Roster() {
   const { state, dispatch } = useGame();
   const [selectedTeam, setSelectedTeam] = useState(state?.userTeamId ?? "boston");
   const [modalPlayer,  setModalPlayer]  = useState(null);
 
   if (!state) return null;
 
   const { players, userTeamId, progressionLog, playerOvrHistory } = state;
   const myPlayers = players.filter(p => p.teamId === selectedTeam);
   const chem = calcChemistry(myPlayers);
   const team = CDL_TEAMS.find(t => t.id === selectedTeam);
 
   const starters = myPlayers.filter(p => !p.isSub);
   const subs     = myPlayers.filter(p => p.isSub);
   const sorted   = [...starters, ...subs];
 
   return (
     <div className="roster-page">
       {/* Team selector */}
       <div className="team-tabs">
         {CDL_TEAMS.map(t => (
           <button
@@ -70,52 +70,52 @@ export default function Roster() {
             <tr>
               <th>Player</th>
               <th>Age</th>
               <th>Role</th>
               <th>OVR</th>
               <th>POT</th>
               <th>Form</th>
               {RATING_KEYS.map(r => <th key={r.key}>{r.label}</th>)}
               <th>Salary</th>
               <th>Yrs</th>
               {selectedTeam === userTeamId && <th>Action</th>}
             </tr>
           </thead>
           <tbody>
             {sorted.map(p => (
               <tr
                 key={p.id}
                 className={`player-row ${p.isSub ? "sub-row" : ""}`}
                 onClick={() => setModalPlayer(p)}
                 title="Click for player detail"
               >
                 <td
                   className="player-name"
                   style={{
                     borderLeft: `3px solid ${
-                      p.overall >= 90 ? "#ffd700"
-                      : p.overall >= 85 ? "#00e676"
+                      p.overall >= 90 ? "#b45309"
+                      : p.overall >= 85 ? "#15803d"
                       : p.overall >= 80 ? "#3d8f5f"
                       : "var(--border)"
                     }`,
                     borderRadius: "6px 0 0 6px",
                     paddingLeft: 8,
                   }}
                 >
                   {p.name} {p.isSub && <span className="sub-label">SUB</span>}
                 </td>
                 <td>{p.age}</td>
                 <td><span className="role-pill">{p.primary}</span></td>
                 <td><span style={{ color: ratingColor(p.overall), fontWeight: "bold" }}>{p.overall}</span></td>
                 <td><span style={{ color: ratingColor(p.potential) }}>{p.potential}</span></td>
                 <td>
                   <div className="form-bar">
                     <div className="form-fill" style={{ width: `${p.form}%`, background: ratingColor(p.form) }} />
                   </div>
                   <span className="form-num">{Math.round(p.form)}</span>
                 </td>
                 {RATING_KEYS.map(r => (
                   <td key={r.key} style={{ color: ratingColor(p[r.key]) }}>{p[r.key]}</td>
                 ))}
                 <td className="salary">${(p.salary / 1000).toFixed(0)}k</td>
                 <td style={{ color: (p.contractYears ?? 2) <= 1 ? "#ff6450" : "var(--text-dim)", fontSize: 12 }}>
                   {p.contractYears ?? "—"}
@@ -180,51 +180,51 @@ function PlayerModal({ player, teamId, isUserTeam, matchLog, playerSeasonStats,
 
   // Career OVR timeline
   const ovrHistory = ((playerOvrHistory ?? {})[player.id] ?? [])
     .slice().sort((a, b) => a.season - b.season);
 
   // Team history
   const teamHistoryEntries = (player.teamHistory ?? [])
     .slice().sort((a, b) => a.season - b.season);
 
   // ── Derived identity fields ───────────────────────────────────────────────
   const region = player.region ?? "Unknown";
   const isUnsigned = !player.teamId;
   const isChallenger = isUnsigned && player.isProspect;
   const statusLabel = isChallenger ? "Challengers" : isUnsigned ? "Free Agent" : null;
 
   const TRAITS = [
     { label: "Work Ethic",      key: "workEthic",     desc: "Higher = faster dev",       invert: false },
     { label: "Tilt Resistance", key: "tiltResistance",desc: "Higher = bounces back",      invert: false },
     { label: "Leadership",      key: "leadership",    desc: "Boosts team chemistry",      invert: false },
     { label: "Ego",             key: "ego",           desc: "High = volatile",            invert: true  },
     { label: "Meta Dependence", key: "metaDependence",desc: "High = risky on meta shifts",invert: true  },
   ];
 
   function traitColor(val, invert) {
     const e = invert ? 6 - val : val;
-    return e >= 4 ? "#00e676" : e >= 3 ? "#ffeb3b" : "#ef5350";
+    return e >= 4 ? "#15803d" : e >= 3 ? "#b45309" : "#dc2626";
   }
 
   const contractColor = (player.contractYears ?? 2) <= 1 ? "#ff6450" : "var(--text)";
 
   return (
     <div className="player-modal-backdrop" onClick={onClose}>
       <div className="player-modal pm-wide" onClick={e => e.stopPropagation()}>
 
         {/* ════ HEADER ════════════════════════════════════════════════════════ */}
         <div className="pm-header" style={{ borderTopColor: team?.color ?? "var(--accent)" }}>
           <div className="pm-identity">
 
             {/* Name */}
             <div className="pm-name">{player.name}</div>
 
             {/* Team · Region · Role · [SUB] */}
             <div className="pm-meta">
               {!isUnsigned && (
                 <span className="pm-team" style={{ color: team?.color }}>
                   {team?.name ?? teamId}
                 </span>
               )}
               {isUnsigned && (
                 <span style={{ color: "#777", fontSize: "12px" }}>{statusLabel}</span>
               )}
