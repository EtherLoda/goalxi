import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface GameState {
  season: number
  week: number
  teamId: string
  teamName: string
  leagueId: string
  leagueName: string
  viewTeamId: string | null

  setWeek: (week: number) => void
  setSeason: (season: number) => void
  setTeam: (team: {
    teamId: string
    teamName: string
    leagueId: string
    leagueName: string
  }) => void
  setViewTeam: (teamId: string | null) => void
  clearViewTeam: () => void
  clear: () => void
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      season: 1,
      week: 1,
      teamId: '',
      teamName: '',
      leagueId: '',
      leagueName: '',
      viewTeamId: null,

      setWeek: (week) => set({ week }),
      setSeason: (season) => set({ season }),
      setTeam: (team) =>
        set({
          teamId: team.teamId,
          teamName: team.teamName,
          leagueId: team.leagueId,
          leagueName: team.leagueName,
        }),
      setViewTeam: (teamId) => set({ viewTeamId: teamId }),
      clearViewTeam: () => set({ viewTeamId: null }),
      clear: () =>
        set({
          season: 1,
          week: 1,
          teamId: '',
          teamName: '',
          leagueId: '',
          leagueName: '',
          viewTeamId: null,
        }),
    }),
    {
      name: 'goalxi-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)

// Selector hooks for common patterns
export const useMyTeam = () => {
  const teamId = useGameStore((s) => s.teamId)
  const viewTeamId = useGameStore((s) => s.viewTeamId)
  return viewTeamId === null || viewTeamId === teamId
}

export const useCurrentTeamId = () => {
  const teamId = useGameStore((s) => s.teamId)
  const viewTeamId = useGameStore((s) => s.viewTeamId)
  return viewTeamId || teamId
}
