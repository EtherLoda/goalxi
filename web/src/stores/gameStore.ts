import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface GameState {
  season: number
  week: number
  teamId: string
  teamName: string
  /** `null` is now valid: during onboarding the user's team
   *  is being claimed asynchronously and `leagueId` may not
   *  be wired up yet. See `api/src/api/onboarding/`. */
  leagueId: string | null
  leagueName: string
  viewTeamId: string | null
  /**
   * IANA timezone string used by every `Intl.DateTimeFormat`
   * call on the client (see `web/src/lib/format-datetime.ts`).
   * Mirrors `UserEntity.timezone`; the `AuthContext` syncs this
   * on every `/users/me` response and `SiteTimezoneForm`
   * writes a new value back through `api.users.updateMe`.
   * Defaults to `'UTC'` so the very first render — before
   * `AuthContext` has hydrated — never crashes the formatter.
   */
  timezone: string

  setWeek: (week: number) => void
  setSeason: (season: number) => void
  setTeam: (team: {
    teamId: string
    teamName: string
    leagueId: string | null
    leagueName: string
  }) => void
  setViewTeam: (teamId: string | null) => void
  clearViewTeam: () => void
  setTimezone: (timezone: string) => void
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
      timezone: 'UTC',

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
      setTimezone: (timezone) => set({ timezone }),
      clear: () =>
        set({
          season: 1,
          week: 1,
          teamId: '',
          teamName: '',
          leagueId: '',
          leagueName: '',
          viewTeamId: null,
          timezone: 'UTC',
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
