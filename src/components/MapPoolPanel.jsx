// src/components/MapPoolPanel.jsx
// Compact "Mode Identity / Map Pool" panel for Team Profile (TeamHub).
// Reads the team's CDL 2026 map profile (read-only, deterministic).

import { useGame } from "../store/gameStore.jsx";
import { getTeamMapProfile } from "../engine/mapProfile.js";
import { MODE_META, MODE_KEYS } from "../data/mapPool.js";

function ratingColor(r) {
  if (r >= 86) return "var(--green)";
  if (r >= 80) return "var(--accent)";
  if (r >= 73) return "var(--text-head)";
  if (r >= 66) return "var(--text-dim)";
  return "var(--red)";
}

export default function MapPoolPanel({ teamId }) {
  const { state } = useGame();
  if (!state || !teamId) return null;
  const profile = getTeamMapProfile(state, teamId);
  if (!profile?.modeRatings) return null;

  const prep = profile.staffPrep ?? {};
  const hasPrep = MODE_KEYS.some(k => (prep[k] ?? 0) !== 0);

  return (
    <div className="mpp">
      <div className="mpp-identity">
        <span className="mpp-identity-label">Mode Identity</span>
        <span className="mpp-identity-val">{profile.identity ?? "—"}</span>
      </div>

      <div className="mpp-modes">
        {MODE_KEYS.map(k => (
          <div key={k} className="mpp-mode">
            <span className="mpp-mode-name">{MODE_META[k].short}</span>
            <span className="mpp-mode-rating" style={{ color: ratingColor(profile.modeRatings[k]) }}>
              {profile.modeRatings[k]}
            </span>
            {(prep[k] ?? 0) !== 0 && (
              <span className="mpp-mode-prep" title="Staff prep impact">
                {prep[k] > 0 ? `+${prep[k]}` : prep[k]}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mpp-maps">
        <div className="mpp-maps-col">
          <div className="mpp-maps-label mpp-best">Best maps</div>
          {(profile.strengths ?? []).map((s, i) => <div key={i} className="mpp-map-item">{s}</div>)}
        </div>
        <div className="mpp-maps-col">
          <div className="mpp-maps-label mpp-weak">Weak maps</div>
          {(profile.weaknesses ?? []).map((s, i) => <div key={i} className="mpp-map-item">{s}</div>)}
        </div>
      </div>

      {hasPrep && (
        <div className="mpp-prep-note">
          Staff prep: HP {fmt(prep.hardpoint)} · S&D {fmt(prep.snd)} · OVR {fmt(prep.overload)}
          {prep.vetoQuality ? ` · Veto +${prep.vetoQuality}` : ""}
        </div>
      )}
    </div>
  );
}

function fmt(n) {
  const v = n ?? 0;
  return v > 0 ? `+${v}` : `${v}`;
}
