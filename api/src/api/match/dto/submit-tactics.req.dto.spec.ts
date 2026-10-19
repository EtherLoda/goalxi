import { ValidationPipe } from '@nestjs/common';
import { MAX_POSITION_MOVES } from './move-instruction.dto';
import { SubmitTacticsReqDto } from './submit-tactics.req.dto';

/**
 * The trigger condition has to survive the transport, not just the
 * service.
 *
 * History: `SubstitutionDto` shipped without a `condition` field, so the
 * global `ValidationPipe({ whitelist: true })` treated it as an
 * undeclared property and **silently deleted it**. The request still
 * returned 200, the row was written, and the engine received no
 * condition — `shouldFire` falls back to `always`, so 「领先时」 fired at
 * its minute in a match the team was losing. That is the exact report:
 * "it fires no matter the score". Fixed in d95231f by declaring the
 * field.
 *
 * `match.service.spec.ts` cannot catch a recurrence, because it calls
 * `submitTactics` with a plain object and never runs the pipe. These
 * tests run the pipe itself: the global production configuration
 * (`transform: true`, `whitelist: true`) against the real DTO class.
 * The "control" case proves the whitelist is actually active here — a
 * test that only asserts the happy path would pass just as happily with
 * `whitelist: false`, which is not the configuration we ship.
 */
describe('SubmitTacticsReqDto — trigger conditions survive the validation pipe', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  const TEAM_ID = '8f0d3b2e-4a51-4c8b-9f36-0d5a7c1e2b44';

  const base = {
    formation: '4-4-2',
    lineup: { GK: 1001, CBL: 1002, CB: 1003, CBR: 1004, CF: 1011 },
    teamId: TEAM_ID,
  };

  const run = async (payload: unknown): Promise<SubmitTacticsReqDto> =>
    (await pipe.transform(payload, {
      type: 'body',
      metatype: SubmitTacticsReqDto,
    })) as SubmitTacticsReqDto;

  it('keeps the condition on a substitution', async () => {
    const out = await run({
      ...base,
      substitutions: [
        { minute: 60, out: 1007, in: 1012, condition: 'leading' },
      ],
    });

    expect(out.substitutions).toHaveLength(1);
    expect(out.substitutions?.[0].condition).toBe('leading');
  });

  it('keeps every condition value the editor can send', async () => {
    // Two batches: the DTO caps the array at MATCH_MAX_SUBSTITUTIONS (3).
    const conditions = [
      'always',
      'leading',
      'trailing',
      'tied',
      'notLeading',
      'notTrailing',
    ];

    const kept: Array<string | undefined> = [];
    for (const batch of [conditions.slice(0, 3), conditions.slice(3)]) {
      const out = await run({
        ...base,
        substitutions: batch.map((condition, i) => ({
          minute: 10 + i,
          out: 1001 + i,
          in: 1011 + i,
          condition,
        })),
      });
      kept.push(...(out.substitutions ?? []).map((s) => s.condition));
    }

    expect(kept).toEqual(conditions);
  });

  it('keeps the condition on a move instruction', async () => {
    const out = await run({
      ...base,
      instructions: {
        moves: [
          { minute: 70, player: 1008, position: 'CAM', condition: 'trailing' },
        ],
      },
    });

    expect(out.instructions?.moves?.[0].condition).toBe('trailing');
  });

  it('leaves the condition off when the editor did not send one', async () => {
    const out = await run({
      ...base,
      substitutions: [{ minute: 60, out: 1007, in: 1012 }],
    });

    expect(out.substitutions?.[0].condition).toBeUndefined();
  });

  it('rejects a condition the engine does not know', async () => {
    await expect(
      run({
        ...base,
        substitutions: [
          { minute: 60, out: 1007, in: 1012, condition: 'while_winning' },
        ],
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('strips an undeclared field — proving this test runs with the whitelist on', async () => {
    const out = await run({
      ...base,
      bogusField: 'should not survive',
    });

    expect(out).not.toHaveProperty('bogusField');
  });
});

/**
 * Moves used to be an opaque `Record<string, any>`, so `position` was
 * never checked: a typo sailed through the pipe, was stored, and then
 * folded to "no position" by `SLOT_KEY_NORMALIZER` in the simulator —
 * the player stood nowhere, contributed nothing to any lane, and the
 * manager had no way to see it. These cases pin the three fields that
 * make a move placeable.
 */
describe('SubmitTacticsReqDto — a position move is validated, not just stored', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  const base = {
    formation: '4-4-2',
    lineup: { GK: 1001, CBL: 1002, CB: 1003, CBR: 1004, CF: 1011 },
    teamId: '8f0d3b2e-4a51-4c8b-9f36-0d5a7c1e2b44',
  };

  const run = async (payload: unknown): Promise<SubmitTacticsReqDto> =>
    (await pipe.transform(payload, {
      type: 'body',
      metatype: SubmitTacticsReqDto,
    })) as SubmitTacticsReqDto;

  const move = (overrides: Record<string, unknown> = {}) => ({
    minute: 60,
    player: 1008,
    position: 'CAM',
    ...overrides,
  });

  it('keeps a well-formed move and coerces its numbers', async () => {
    const out = await run({
      ...base,
      instructions: { moves: [move()] },
    });

    expect(out.instructions?.moves?.[0]).toMatchObject({
      minute: 60,
      player: 1008,
      position: 'CAM',
    });
  });

  it('accepts a legacy slot alias, because the engine folds those too', async () => {
    const out = await run({
      ...base,
      instructions: { moves: [move({ position: 'ST' })] },
    });

    expect(out.instructions?.moves?.[0].position).toBe('ST');
  });

  it('rejects a position the engine cannot place anyone in', async () => {
    await expect(
      run({ ...base, instructions: { moves: [move({ position: 'CBX' })] } }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects a bench key as a move target', async () => {
    await expect(
      run({
        ...base,
        instructions: { moves: [move({ position: 'BENCH_CB' })] },
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects a minute outside the match', async () => {
    await expect(
      run({ ...base, instructions: { moves: [move({ minute: 0 })] } }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      run({ ...base, instructions: { moves: [move({ minute: 121 })] } }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects a move without a position', async () => {
    await expect(
      run({
        ...base,
        instructions: { moves: [{ minute: 60, player: 1008 }] },
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('caps the number of queued moves', async () => {
    const many = Array.from({ length: MAX_POSITION_MOVES + 1 }, (_, i) =>
      move({ minute: 1 + i, player: 1000 + i }),
    );

    await expect(
      run({ ...base, instructions: { moves: many } }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('strips an undeclared field inside a move', async () => {
    const out = await run({
      ...base,
      instructions: { moves: [move({ secret: 'nope' })] },
    });

    expect(out.instructions?.moves?.[0]).not.toHaveProperty('secret');
  });
});
