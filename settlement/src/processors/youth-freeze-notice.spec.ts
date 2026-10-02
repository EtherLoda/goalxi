import { readFileSync, existsSync } from 'node:fs';
import { join } from 'path';

/**
 * Tripwire for the youth freeze.
 *
 * Youth development is paused indefinitely, and new players enter the
 * world through SCOUT DISCOVERY only — `ScoutsService.selectCandidate`
 * creates every player with `isYouth = false` and `youthLeagueId = null`.
 *
 * ## What changed, and why this file was rewritten
 *
 * This spec used to enforce the sentence:
 *
 *   > "This generator must keep running … youth fixtures are still
 *   >  simulated every matchday."
 *
 * Both halves were false, and the tripwire was *enforcing* them:
 *
 *   - `youth-structure.generator.ts` was never registered in
 *     `BootstrapModule`'s providers. It had zero references outside its
 *     own spec.
 *   - `ScheduleGenerator` writes `youthLeagueId: null` on every match it
 *     creates. No youth fixture was ever generated, so none was ever
 *     simulated.
 *
 * The freeze's stated reason for refusing deletion ("deleting it would
 * break the youth fixtures") therefore protected a fiction, and any
 * engineer reading the code would have been misled into thinking the
 * subsystem was live.
 *
 * What was removed, on the maintainer's explicit go-ahead: the orphan
 * generator, `YouthProgressionProcessor` (ticked weekly with zero
 * `is_youth` rows to act on), the zero-producer
 * `youth-match-simulation` queue, and the `promote` / `release`
 * endpoints — both of which require `is_youth === true` and therefore
 * could only ever return 400.
 *
 * **Deliberately kept**, so the subsystem can be restored without data
 * loss: every `youth_*` entity, every `player` column
 * (`is_youth`, `youth_league_id`, `revealed_skills`, `reveal_level`,
 * `potential_revealed`), and every migration.
 *
 * ## What this still guards
 *
 * The freeze itself. Someone must not "helpfully" re-add the generators,
 * or start writing youth features, without a go-ahead.
 */
const REPO = join(__dirname, '..', '..', '..');

const read = (...parts: string[]) =>
  readFileSync(join(REPO, ...parts), 'utf8');

const exists = (...parts: string[]) =>
  existsSync(join(REPO, ...parts));

describe('youth subsystem freeze', () => {
  const CLAUDE_MD = read('CLAUDE.md');

  describe('CLAUDE.md states the freeze accurately', () => {
    it('marks the Youth Pipeline section as FROZEN', () => {
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      expect(start).toBeGreaterThan(-1);

      const section = CLAUDE_MD.slice(start, start + 4000);
      expect(section).toContain('FROZEN');
      expect(section).toMatch(/do not develop|Do not develop/);
    });

    /**
     * The correction that matters. The old wording claimed the runtime
     * was live; a reader auditing this repo would spend hours trying to
     * find the youth fixtures it described.
     */
    it('does NOT claim youth fixtures are generated and simulated', () => {
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      const section = CLAUDE_MD.slice(start, start + 4000);

      expect(section).not.toMatch(
        /youth fixtures are still generated|fixtures are still simulated/i,
      );
      expect(section).not.toMatch(/must keep running/i);
    });

    it('records that the pipeline is inert and scouts are the source', () => {
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      const section = CLAUDE_MD.slice(start, start + 4000);

      // The two facts a reader needs to avoid a wild-goose chase.
      expect(section).toMatch(/scout/i);
      expect(section).toMatch(/isYouth\s*=\s*false|is_youth|not been developed|no longer/i);
    });

    it('still allows minimal bug fixes where code does run', () => {
      const start = CLAUDE_MD.indexOf('### Youth Pipeline');
      const section = CLAUDE_MD.slice(start, start + 4000);
      expect(section).toMatch(/Bug fixes are still welcome/i);
    });
  });

  describe('the removed runtime surface stays removed', () => {
    // Each of these was removed on the maintainer's go-ahead. If one
    // reappears, someone has reactivated the subsystem without asking.
    it('has no youth-structure bootstrap generator', () => {
      expect(
        exists(
          'settlement',
          'src',
          'bootstrap',
          'generators',
          'youth-structure.generator.ts',
        ),
      ).toBe(false);
    });

    it('has no youth-progression processor or module', () => {
      expect(
        exists(
          'settlement',
          'src',
          'processors',
          'youth-progression.processor.ts',
        ),
      ).toBe(false);
      expect(
        exists('settlement', 'src', 'youth-progression.module.ts'),
      ).toBe(false);
    });

    it('does not register the queues that had no producers', () => {
      const schedulerModule = read(
        'settlement',
        'src',
        'scheduler',
        'scheduler.module.ts',
      );
      expect(schedulerModule).not.toContain('youth-match-simulation');
      expect(schedulerModule).not.toContain('youth-progression-settlement');
    });

    it('has no promote / release endpoints', () => {
      const controller = read('api', 'src', 'api', 'player', 'player.controller.ts');
      expect(controller).not.toContain(':id/promote');
      expect(controller).not.toContain(':id/release');

      const service = read('api', 'src', 'api', 'player', 'player.service.ts');
      expect(service).not.toContain('async promote(');
      expect(service).not.toContain('async releaseYouth(');
    });

    it('does not enqueue youth progression on the weekly tick', () => {
      const weekly = read(
        'settlement',
        'src',
        'scheduler',
        'weekly-settlement.service.ts',
      );
      expect(weekly).not.toContain('youth-progression');
      expect(weekly).not.toContain('youthProgressionQueue');
    });
  });

  describe('the data model survives, so this is reversible', () => {
    // The whole point of only removing the runtime surface: restoring
    // the feature must not require a data migration.
    it('keeps the youth entities', () => {
      expect(exists('libs', 'database', 'src', 'entities', 'youth-league.entity.ts')).toBe(
        true,
      );
      expect(exists('libs', 'database', 'src', 'entities', 'youth-team.entity.ts')).toBe(
        true,
      );
    });

    it('keeps the player youth columns', () => {
      const playerEntity = read(
        'libs',
        'database',
        'src',
        'entities',
        'player.entity.ts',
      );
      for (const column of [
        'isYouth',
        'youthLeagueId',
        'revealedSkills',
        'revealLevel',
        'potentialRevealed',
      ]) {
        expect(playerEntity).toContain(column);
      }
    });

    it('keeps the migration that introduced the reveal mask', () => {
      const migration = read(
        'api',
        'src',
        'database',
        'migrations',
        '1722000000000-UnifyYouthIntoPlayer.ts',
      );
      expect(migration).toContain('is_youth');
    });
  });

  describe('remaining youth mentions are honest', () => {
    /**
     * The specific failure mode this replaces: a comment claiming a
     * generator "creates one youth_team per EVERY senior team", for a
     * generator that never ran.
     */
    it('no surviving comment claims YouthStructureGenerator creates rows', () => {
      const offenders: string[] = [];
      const claim =
        /YouthStructureGenerator|youth-structure\.generator[\s\S]{0,80}(creates|backfills)/i;

      for (const file of [
        'libs/database/src/entities/youth-league.entity.ts',
        'settlement/src/processors/condition.processor.ts',
        'settlement/src/scheduler/senior-decline-scheduler.service.ts',
        'settlement/src/senior-decline.module.ts',
      ]) {
        if (!exists(...file.split('/'))) continue;
        if (claim.test(read(...file.split('/')))) offenders.push(file);
      }

      expect(offenders).toEqual([]);
    });
  });
});

/**
 * Kept from the original spec: a comment-stripping helper, retained so
 * future assertions can distinguish a documented marker from a stray
 * mention inside code.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// Referenced so the helper is not flagged as dead by a future cleanup.
void stripComments;
