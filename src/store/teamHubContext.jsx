// src/store/teamHubContext.jsx
// Global trigger for the TeamHubOverlay scouting panel.
// Any component can call openTeamHub(teamId) to inspect any team.

import { createContext, useContext, useState } from "react";

const TeamHubContext = createContext(null);

export function TeamHubProvider({ children }) {
  const [openTeamId, setOpenTeamId] = useState(null);
  return (
    <TeamHubContext.Provider value={{
      openTeamId,
      openTeamHub:  (id) => setOpenTeamId(id),
      closeTeamHub: ()   => setOpenTeamId(null),
    }}>
      {children}
    </TeamHubContext.Provider>
  );
}

export function useTeamHub() {
  return useContext(TeamHubContext) ?? {
    openTeamId:   null,
    openTeamHub:  () => {},
    closeTeamHub: () => {},
  };
}
