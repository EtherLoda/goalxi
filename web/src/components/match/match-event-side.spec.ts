import { resolveSide } from './match-event-side';

/**
 * D8 spec — pins the side-derivation contract so the two consumers
 * (`MatchKeyEvents` and `EventBubble`) can't drift back to two
 * different inline copies. Each rule in `match-event-side.ts` has a
 * dedicated test below.
 */
describe('resolveSide (D8)', () => {
  const HOME = 'team-home';
  const AWAY = 'team-away';

  describe('Rule 1: explicit isHome wins (canonical answer)', () => {
    it('returns home when isHome is true', () => {
      expect(resolveSide({ isHome: true, teamId: AWAY }, HOME, AWAY)).toBe('home');
    });

    it('returns away when isHome is false', () => {
      expect(resolveSide({ isHome: false, teamId: HOME }, HOME, AWAY)).toBe('away');
    });
  });

  describe('Rule 2 + 3: fall back to teamId when isHome is missing', () => {
    it('returns home when teamId matches homeTeamId', () => {
      expect(resolveSide({ teamId: HOME }, HOME, AWAY)).toBe('home');
    });

    it('returns away when teamId matches awayTeamId', () => {
      expect(resolveSide({ teamId: AWAY }, HOME, AWAY)).toBe('away');
    });
  });

  describe('Rule 4: known teamId that matches neither side', () => {
    it('returns neutral — not home — when teamId is some unknown third team', () => {
      // Defensive against brand renames, youth-league placeholders, etc.
      // The previous ternary in `MatchKeyEvents` defaulted to 'home' here
      // and silently lied to the reader.
      expect(
        resolveSide({ teamId: 'team-someone-else' }, HOME, AWAY),
      ).toBe('neutral');
    });
  });

  describe('Rule 5: meta events with no team at all', () => {
    it('returns neutral when both isHome and teamId are missing', () => {
      // KICKOFF / HALF_TIME / FULL_TIME / weather announcements —
      // a colour tone for these events is misleading; the
      // `EventBubble` "neutral" tone is the honest rendering.
      expect(resolveSide({}, HOME, AWAY)).toBe('neutral');
    });

    it('returns neutral when home/away ids are missing (caller cannot resolve)', () => {
      // Without the home/away ids we genuinely cannot decide. The
      // old code used `isHome ?? false` here which is "away" — a
      // neutral default is the honest answer.
      expect(resolveSide({ teamId: HOME })).toBe('neutral');
      expect(resolveSide({ teamId: AWAY })).toBe('neutral');
    });
  });
});
