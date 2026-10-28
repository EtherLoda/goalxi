/**
 * Pure helpers for linking player names inside a finished commentary string.
 *
 * The commentary is one translated sentence, so the only way to make a name
 * clickable is to find it in the text. We only link names the event actually
 * carries — the acting player and (when present) the player on the other end
 * of the action — and match longest-first so "Jun Guo" is not shadowed by a
 * shorter name that is a substring of it.
 */
export interface LinkedName {
  readonly name: string;
  readonly playerId: number;
}

export interface LinkedSegment {
  readonly text: string;
  /** Set when this run is a player name; `undefined` for plain prose. */
  readonly playerId?: number;
}

/** Minimum name length worth linking — avoids linking initials or "Li". */
const MIN_NAME_LENGTH = 3;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The names an event is allowed to link: the man the event is about and, for
 * goals, the assister. Both come straight off the payload, so a name is only
 * linked when the engine actually named that player.
 */
export function linkedNamesOfEvent(event: {
  readonly playerId?: number | null;
  readonly relatedPlayerId?: number | null;
  readonly data?: unknown;
}): LinkedName[] {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const names: LinkedName[] = [];

  const playerName = typeof data.playerName === 'string' ? data.playerName : null;
  if (playerName && typeof event.playerId === 'number') {
    names.push({ name: playerName, playerId: event.playerId });
  }

  const assistName = typeof data.assistName === 'string' ? data.assistName : null;
  if (assistName && typeof event.relatedPlayerId === 'number') {
    names.push({ name: assistName, playerId: event.relatedPlayerId });
  }

  return names;
}

export function splitLinkedNames(text: string, names: readonly LinkedName[]): LinkedSegment[] {
  if (!text) return [];

  const usable = names
    .filter(
      (n) =>
        n.name.trim().length >= MIN_NAME_LENGTH &&
        Number.isInteger(n.playerId) &&
        n.playerId > 0,
    )
    // Longest first: the alternation is tried left to right, so the longer
    // name must come first to win over a shorter one it contains.
    .sort((a, b) => b.name.length - a.name.length);

  if (usable.length === 0) return [{ text }];

  const idByName = new Map(usable.map((n) => [n.name, n.playerId]));
  const pattern = new RegExp(`(${usable.map((n) => escapeRegExp(n.name)).join('|')})`, 'g');

  const segments: LinkedSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: match[0], playerId: idByName.get(match[0]) });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
