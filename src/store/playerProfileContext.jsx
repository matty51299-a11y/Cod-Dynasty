/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";

const PlayerProfileContext = createContext(null);

export function PlayerProfileProvider({ children }) {
  const [openPlayerRef, setOpenPlayerRef] = useState(null);
  return (
    <PlayerProfileContext.Provider value={{
      openPlayerRef,
      openPlayerProfile: (playerOrId) => setOpenPlayerRef(playerOrId),
      closePlayerProfile: () => setOpenPlayerRef(null),
    }}>
      {children}
    </PlayerProfileContext.Provider>
  );
}

export function usePlayerProfile() {
  return useContext(PlayerProfileContext) ?? {
    openPlayerRef: null,
    openPlayerProfile: () => {},
    closePlayerProfile: () => {},
  };
}
