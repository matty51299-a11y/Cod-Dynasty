import { useState } from "react";
import { useDynasty, loadGame, isValidDynastyState } from "../store/dynastyStore.jsx";
import DynastyTeamSelect from "./DynastyTeamSelect.jsx";

export default function StartScreen() {
  const { dispatch } = useDynasty();
  const [showTeamSelect, setShowTeamSelect] = useState(false);

  const saved = loadGame();
  const hasSave = isValidDynastyState(saved);

  function handleContinue() {
    if (hasSave) dispatch({ type: "LOAD_GAME", state: saved });
  }

  if (showTeamSelect) return <DynastyTeamSelect />;

  return (
    <div className="start-screen">
      <div className="start-card">
        <h1 className="start-title">COD DYNASTY</h1>
        <p className="start-subtitle">
          Start in Call of Duty: Ghosts and build through COD history.
        </p>
        <div className="start-actions">
          <button className="btn-primary start-btn" onClick={() => setShowTeamSelect(true)}>
            Start Dynasty
          </button>
          {hasSave && (
            <button className="btn-secondary start-btn" onClick={handleContinue}>
              Continue
            </button>
          )}
        </div>
        <div className="start-meta">
          <span className="start-chip">Ghosts Era</span>
          <span className="start-chip">4v4</span>
          <span className="start-chip">Domination · SnD · Blitz</span>
        </div>
      </div>
    </div>
  );
}
