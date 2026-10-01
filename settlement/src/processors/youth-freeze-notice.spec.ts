import { readFileSync } from 'node:fs';
import { join } from 'path';

/**
 * Tripwire for the youth freeze notice.
 *
 * Youth development is paused indefinitely. The maintainer asked for the
 * freeze to be recorded in the codebase rather than enforced by tooling —
 * so the notice IS the mechanism, and deleting a doc comment is enough
 * to silently remove it.
 *
 * That is not hypothetical. Every entry in this list was a place a
 * reasonable engineer would plausibly make a drive-by change:
 *
 *  - `PROMOTION_REVEAL_THRESHOLD` looks like a tuning knob to make
 *    promotion feel less restrictive.
 *  - `PlayerService.promote`'s gate looks like over-restrictive
 *    validation.
 *  - The `promote` / `release` endpoints look like dead code on a frozen
 *    feature.
 *  - `!player.teamId` in the processor looks like a missing branch.
 *  - `youth-progression.module.ts`'s unused `StaffEntity` registration
 *    looks like leftover to clean up.
 *
 * The rule the freeze encodes — do not develop it, but keep it running —
 * is only discoverable if each of those sites says so. This test fails if
 * any notice is removed, so "just deleting the comment" stops working as
 * a way to unfreeze something.
 *
 * If a change here fails, the fix is to get an explicit go-ahead from
 * the maintainer and update BOTH the notice and this spec — not to delete
 * the notice.
 */

const REPO = join(__dirname, '..', '..', '..');

const read = (...parts: string[]) =>
  readFileSync(join(REPO, ...parts), 'utf8');

/**
 * Strip comments so the freeze marker is only accepted when it lives in
 * real documentation, not in a stray mention inside code.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('youth subsystem freeze notice', () => {
  const CLAUDE_MD = read('CLAUDE.md');

  describe('CLAUDE.md (the canonical notice)', () => {
    it('marks the Youth Pipeline section as FROZEN', () => {
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      expect(start).toBeGreaterThan(-1);

      const section = CLAUDE_MD.slice(start, start + 3000);
      expect(section).toContain('FROZEN');
      expect(section).toMatch(/do not develop|Do not develop/);
    });

    it('states that runtime behaviour must not change', () => {
      // The distinction that matters: freezing means "hands off", NOT
      // "shut it down". The weekly worker still ticks and youth fixtures
      // are still simulated, so a reader must not conclude that deleting
      // the subsystem is the sanctioned action.
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      const section = CLAUDE_MD.slice(start, start + 3000);
      expect(section).toMatch(/Runtime behaviour is unchanged|must stay that way/i);
    });

    it('still allows minimal bug fixes where the subsystem is running', () => {
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      const section = CLAUDE_MD.slice(start, start + 3000);
      expect(section).toMatch(/Bug fixes are still welcome/i);
    });

    it('documents Known limitations so "fix me" edges are identifiable', () => {
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      // Slice to the NEXT top-level section rather than a fixed width —
      // the section grew and a magic number would silently stop
      // covering the list.
      const rest = CLAUDE_MD.slice(start + 1);
      const nextSection = rest.search(/\n### (?!Youth Pipeline)/);
      const section =
        nextSection === -1 ? CLAUDE_MD.slice(start) : CLAUDE_MD.slice(start, start + nextSection);

      expect(section).toContain('Known limitations');
      // The team-less-youth dead end is the one an engineer is most
      // likely to "helpfully" resolve, so it is pinned by name.
      expect(section).toContain(
        'The promotion gate can never be satisfied for a team-less youth',
      );
    });
  });

  describe('the highest-risk code sites', () => {
    it('PROMOTION_REVEAL_THRESHOLD says do not retune', () => {
      const src = read(
        'libs',
        'database',
        'src',
        'constants',
        'youth-keys.constants.ts',
      );
      // The notice sits in the doc comment ABOVE the constant, so scan
      // backwards from the declaration.
      const decl = src.indexOf('export const PROMOTION_REVEAL_THRESHOLD');
      expect(decl).toBeGreaterThan(-1);
      const doc = src.slice(Math.max(0, decl - 1200), decl);
      expect(doc).toMatch(/FROZEN/);
      expect(doc).toMatch(/do not retune/i);
      // And it must explain WHY: it's the only server-side gate
      // against promoting a raw-API 0-reveal youth.
      expect(doc).toMatch(/server-side gate|only thing holding/i);
    });

    it('PlayerService.promote marks the gate as load-bearing', () => {
      const src = read(
        'api',
        'src',
        'api',
        'player',
        'player.service.ts',
      );
      const start = src.indexOf('async promote(');
      expect(start).toBeGreaterThan(-1);
      // Look at the doc comment ABOVE the method.
      const doc = src.slice(Math.max(0, start - 1600), start);
      expect(doc).toContain('FROZEN');
      expect(doc).toMatch(/load-bearing|load bearing/i);
    });

    it('the promote + release endpoints are marked as NOT removable', () => {
      const src = read(
        'api',
        'src',
        'api',
        'player',
        'player.controller.ts',
      );
      expect(src).toContain('FROZEN SUBSYSTEM');
      expect(src).toMatch(/NOT dead code|not dead code/i);
    });

    it('the youth processor says frozen but still running', () => {
      const src = read(
        'settlement',
        'src',
        'processors',
        'youth-progression.processor.ts',
      );
      expect(src).toMatch(/FROZEN SUBSYSTEM/);
      expect(src).toMatch(/must not change|must keep working|still ticking/i);
    });

    it('the team-less youth skip is documented as deliberate, not a gap', () => {
      const src = read(
        'settlement',
        'src',
        'processors',
        'youth-progression.processor.ts',
      );
      const idx = src.indexOf('if (!player.teamId)');
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(idx, idx + 1200);
      expect(block).toMatch(/DELIBERATE/);
      // And it must not be silently re-enabled by removing a comment.
      expect(stripComments(src)).toContain('if (!player.teamId)');
    });

    it('the youth module keeps its processor registered', () => {
      // "Freezing means hands off, not shut it down" — if someone
      // removes the processor from providers, the weekly growth tick
      // silently stops and the subsystem rots instead of pausing.
      const src = read('settlement', 'src', 'youth-progression.module.ts');
      expect(src).toContain('FROZEN SUBSYSTEM');
      expect(src).toContain('YouthProgressionProcessor');
    });

    it('the pure progression helpers say frozen', () => {
      const src = read(
        'libs',
        'database',
        'src',
        'services',
        'youth-progression.ts',
      );
      expect(src).toMatch(/FROZEN SUBSYSTEM/);
      // Specifically the missing age curve, which looks like an
      // omission worth fixing.
      expect(src).toMatch(/no age curve/i);
    });

    it('the FE youth tactics editor says frozen', () => {
      const src = read(
        'web',
        'src',
        'components',
        'youth',
        'YouthTacticsEditor.tsx',
      );
      expect(src).toMatch(/FROZEN SUBSYSTEM/);
    });

    it('the bootstrap generator says frozen but must keep running', () => {
      const src = read(
        'settlement',
        'src',
        'bootstrap',
        'generators',
        'youth-structure.generator.ts',
      );
      expect(src).toMatch(/FROZEN SUBSYSTEM/);
      expect(src).toMatch(/must keep running/);
    });
  });
});