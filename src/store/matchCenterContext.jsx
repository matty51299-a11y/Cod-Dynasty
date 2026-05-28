// src/store/matchCenterContext.jsx
// Provides the ability to open the MatchCenterOverlay from anywhere in the tree.
// Used by NextMatchOverlay ("Play Matchday") and MajorMatchOverlay ("Play Match").

import { createContext, useContext, useState } from "react";

const MatchCenterContext = createContext(null);

export function MatchCenterProvider({ children }) {
  // ctx = { type: "stage" | "major", seed: number } | null
  const [ctx, setCtx] = useState(null);

  function openMatchCenter(type) {
    setCtx({ type, seed: Math.floor(Math.random() * 999_999_999) + 1 });
  }

  function closeMatchCenter() {
    setCtx(null);
  }

  return (
    <MatchCenterContext.Provider value={{ ctx, openMatchCenter, closeMatchCenter }}>
      {children}
    </MatchCenterContext.Provider>
  );
}

export function useMatchCenter() {
  return useContext(MatchCenterContext);
}
