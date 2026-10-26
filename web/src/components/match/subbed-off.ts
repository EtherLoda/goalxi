import type { SubbedOffPlayer } from './SubbedOffStrip';

/** The substitution event shape the timeline/commentary payloads use. */
type SubEvent = {
  id?: string | number;
  minute: number;
  teamId?: string;
  type: string;
  data?: { playerName?: string };
};

/**
 * Substitution events → the players who came OFF, in match order.
 *
 * The engine writes the outgoing player's name into `data.playerName`, so
 * the strip only ever names who left. The player who came on is standing on
 * the pitch, which is a better place to learn about them.
 */
export function subbedOffFrom(events: unknown, homeTeamId?: string): SubbedOffPlayer[] {
  const list = (events ?? []) as SubEvent[];
  return list
    .filter((e) => e.type === 'substitution' && e.data?.playerName)
    .map((e) => ({
      key: String(e.id ?? `${e.minute}-${e.teamId ?? ''}`),
      name: e.data?.playerName ?? '',
      minute: e.minute,
      isHome: e.teamId === homeTeamId,
    }));
}
