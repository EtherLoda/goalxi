import {
  OnboardingAssigner,
  OnboardingNoBotAvailableError,
  TeamEntity,
} from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { UnrecoverableError } from 'bullmq';
import { OnboardingProcessor } from './onboarding.processor';

/**
 * Minimal smoke test — the processor is a thin shell over
 * `OnboardingAssigner` and `seedSeniorScoutCandidate`, both of
 * which are pure functions tested in their own suites. Here
 * we verify just the things that live in the processor itself:
 *
 *   - malformed payload ⇒ UnrecoverableError
 *   - happy path ⇒ result shape contains teamId/reused/durationMs
 *   - no BOT available ⇒ UnrecoverableError (so BullMQ stops retrying)
 *
 * Anything more elaborate (the actual claim transaction, the
 * scout seed insert) is exercised by the libs/database suites.
 */
describe('OnboardingProcessor', () => {
  function makeProcessor() {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
    };
    const dataSource = {
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOneByOrFail: jest.fn().mockResolvedValue({
            id: 'team-1',
            nationality: 'CN',
          }),
        }),
      },
      transaction: jest.fn(),
    };
    const processor = new OnboardingProcessor(
      logger as never,
      dataSource as never,
    );
    return { processor, logger, dataSource };
  }

  function makeJob(data: unknown) {
    return {
      id: 'job-1',
      data,
      attemptsMade: 0,
    } as never;
  }

  it('rejects malformed payloads without retrying', async () => {
    const { processor } = makeProcessor();
    await expect(
      processor.process(makeJob({ v: 2, userId: 'u-1' })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processor.process(makeJob({ v: 1 }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('returns a result shape with teamId / reused / durationMs on success', async () => {
    const { processor, dataSource } = makeProcessor();
    const claimSpy = jest.spyOn(OnboardingAssigner, 'claim').mockResolvedValue({
      team: { id: 'team-1' } as TeamEntity,
      reused: false,
      appliedName: 'Test Club',
    });
    const markSpy = jest
      .spyOn(OnboardingAssigner, 'markProcessing')
      .mockResolvedValue();

    const result = await processor.process(makeJob({ v: 2, userId: 'u-1' }));

    expect(markSpy).toHaveBeenCalledWith(dataSource, 'u-1');
    expect(claimSpy).toHaveBeenCalledWith(dataSource, 'u-1');
    expect(result).toMatchObject({
      userId: 'u-1',
      teamId: 'team-1',
      reused: false,
    });
    expect(typeof result.durationMs).toBe('number');
  });

  it('surfaces "no BOT available" as UnrecoverableError so BullMQ stops retrying', async () => {
    const { processor } = makeProcessor();
    jest.spyOn(OnboardingAssigner, 'markProcessing').mockResolvedValue();
    jest
      .spyOn(OnboardingAssigner, 'claim')
      .mockRejectedValue(new OnboardingNoBotAvailableError('no BOT available'));

    await expect(
      processor.process(makeJob({ v: 2, userId: 'u-1' })),
    ).rejects.toBeInstanceOf(OnboardingNoBotAvailableError);
  });
});
