// src/components/ChallengerBoard.jsx
// Board / objectives screen for the user-managed Challenger team. Shows the
// season's Challenger-appropriate goals (derived live, read-only) and a simple
// confidence read. No CDL objectives (Champs/top-6) are ever shown here.

import { useGame } from "../store/gameStore.jsx";
import { evaluateChallengerObjectives, getChallengerConfidence, getChallengerTier } from "../engine/challengerBoard.js";
import { resolveUserTeamMeta } from "../utils/userTeam.js";
import { PageHeader, SectionCard, StatCard, Pill } from "./ui.jsx";

const TIER_LABEL = { weak: "Developing", mid: "Mid-table", strong: "Contender", elite: "Powerhouse" };

export default function ChallengerBoard() {
  const { state } = useGame();
  if (!state) return null;

  const meta = resolveUserTeamMeta(state);
  const { tier, rank, total, ovr } = getChallengerTier(state);
  const { objectives } = evaluateChallengerObjectives(state);
  const confidence = getChallengerConfidence(state);
  const primary = objectives.find(o => o.weight === "primary");
  const secondary = objectives.filter(o => o.weight !== "primary");

  return (
    <div className="standings-page">
      <PageHeader
        eyebrow="Owner Objectives — Open Circuit"
        title={`${meta?.name ?? "Your team"} · ${TIER_LABEL[tier] ?? tier}`}
        subtitle="Your owner judges you against Open Circuit expectations — qualifiers, Majors and circuit growth — not the Pro Circuit table."
        accent={meta?.color}
        meta={(
          <div className="ui-stat-grid compact">
            <StatCard label="Circuit Rank" value={`${rank}/${total}`} />
            <StatCard label="Roster OVR" value={ovr} />
            <StatCard label="Owner Confidence" value={`${confidence}%`} tone={confidence >= 60 ? "success" : confidence >= 40 ? "warning" : "danger"} />
          </div>
        )}
      />

      <SectionCard title="Primary Objective" subtitle="The headline goal for this season.">
        {primary ? (
          <div className="cb-obj-row">
            <span className="cb-obj-label">{primary.label}</span>
            <span className="cb-obj-progress">{primary.progress}</span>
            <Pill tone={primary.met ? "success" : "warning"}>{primary.met ? "Completed" : "In progress"}</Pill>
          </div>
        ) : <p className="muted">No primary objective.</p>}
      </SectionCard>

      <SectionCard title="Secondary Objectives" subtitle="Supporting goals for the campaign.">
        {secondary.length === 0 ? <p className="muted">No secondary objectives.</p> : (
          <div className="cb-obj-list">
            {secondary.map(o => (
              <div key={o.id} className="cb-obj-row">
                <span className="cb-obj-label">{o.label}</span>
                <span className="cb-obj-progress">{o.progress}</span>
                <Pill tone={o.met ? "success" : "neutral"}>{o.met ? "Completed" : "In progress"}</Pill>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
