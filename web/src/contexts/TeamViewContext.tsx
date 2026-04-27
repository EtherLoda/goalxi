"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import type { Team } from '@/lib/api';

interface TeamViewContextType {
  viewTeam: Team | null;
  isViewingMyTeam: boolean;
  setViewTeam: (team: Team) => void;
  resetToMyTeam: () => void;
}

const TeamViewContext = createContext<TeamViewContextType | undefined>(undefined);

export function TeamViewProvider({ children }: { children: ReactNode }) {
  const { team: myTeam } = useAuth();
  const [viewTeam, setViewTeamState] = useState<Team | null>(null);

  const setViewTeam = useCallback((team: Team) => {
    setViewTeamState(team);
  }, []);

  const resetToMyTeam = useCallback(() => {
    setViewTeamState(null);
  }, []);

  const isViewingMyTeam = viewTeam === null || viewTeam.id === myTeam?.id;

  return (
    <TeamViewContext.Provider
      value={{
        viewTeam,
        isViewingMyTeam,
        setViewTeam,
        resetToMyTeam,
      }}
    >
      {children}
    </TeamViewContext.Provider>
  );
}

export function useTeamView() {
  const context = useContext(TeamViewContext);
  if (context === undefined) {
    throw new Error('useTeamView must be used within a TeamViewProvider');
  }
  return context;
}
