export default function PlayerCard({ player }) {
  if (!player) return null;

  return (
    <div className="player-card">
      <div className="player-card-header">
        <span className="player-name-lg">{player.name}</span>
        <span className="player-ovr-badge">OVR {player.overall}</span>
      </div>
      <div className="player-card-body">
        <div className="roster-stat"><span>Role</span><strong>{player.primary}</strong></div>
        <div className="roster-stat"><span>Age</span><strong>{player.age}</strong></div>
        <div className="roster-stat"><span>Potential</span><strong>{player.potential}</strong></div>
        <div className="roster-stat"><span>Gunny</span><strong>{player.gunny}</strong></div>
        <div className="roster-stat"><span>Awareness</span><strong>{player.awareness}</strong></div>
        <div className="roster-stat"><span>Objective</span><strong>{player.objective}</strong></div>
        <div className="roster-stat"><span>SnD IQ</span><strong>{player.searchIQ}</strong></div>
        <div className="roster-stat"><span>Clutch</span><strong>{player.clutch}</strong></div>
        <div className="roster-stat"><span>Teamwork</span><strong>{player.teamwork}</strong></div>
        <div className="roster-stat"><span>Composure</span><strong>{player.composure}</strong></div>
        <div className="roster-stat"><span>Adaptability</span><strong>{player.adaptability}</strong></div>
        <div className="roster-stat"><span>Contract</span><strong>{player.contractYears}yr</strong></div>
        <div className="roster-stat"><span>Era</span><strong>{player.eraId}</strong></div>
      </div>
    </div>
  );
}
