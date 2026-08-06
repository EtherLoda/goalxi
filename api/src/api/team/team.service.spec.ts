import { BadRequestException } from '@nestjs/common';
import { assertTrainingIntensityChangeAllowed } from './team.service';

describe('assertTrainingIntensityChangeAllowed (§5.4 weekly cooldown)', () => {
  const now = new Date('2026-08-06T12:00:00Z');
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  it('allows the very first intensity change (no prior timestamp)', () => {
    // A team that has never tuned intensity before should be able to
    // set an initial value without being blocked by the cooldown —
    // there's nothing to cooldown against yet.
    expect(() =>
      assertTrainingIntensityChangeAllowed(null, 0.1, 0.3, now),
    ).not.toThrow();
  });

  it('allows a no-op write (re-submitting the same value)', () => {
    // The UI re-PATCHes on every save click; the value may not have
    // changed. The cooldown should NOT block re-saves — only actual
    // changes.
    const lastChanged = new Date(now.getTime() - 60_000); // 1 min ago
    expect(() =>
      assertTrainingIntensityChangeAllowed(lastChanged, 0.3, 0.3, now),
    ).not.toThrow();
  });

  it('blocks a second change within the 7-day window', () => {
    const lastChanged = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3d ago
    expect(() =>
      assertTrainingIntensityChangeAllowed(lastChanged, 0.3, 0.5, now),
    ).toThrow(BadRequestException);
  });

  it('allows a change once the 7-day window has elapsed', () => {
    // Just past the boundary — should land cleanly. The boundary
    // itself is also allowed (>=), see the helper.
    const justOver = new Date(now.getTime() - SEVEN_DAYS_MS - 1);
    expect(() =>
      assertTrainingIntensityChangeAllowed(justOver, 0.3, 0.5, now),
    ).not.toThrow();
  });

  it('treats the boundary instant as still allowed (>= check)', () => {
    // Exactly SEVEN_DAYS_MS ago — the next millisecond is the first
    // legal one. Pinned here so a future refactor doesn't accidentally
    // flip `>=` to `>` and lock the user out for an extra day.
    const exact = new Date(now.getTime() - SEVEN_DAYS_MS);
    expect(() =>
      assertTrainingIntensityChangeAllowed(exact, 0.3, 0.5, now),
    ).not.toThrow();
  });

  it('uses the current wall clock when `now` is not injected', () => {
    // The helper accepts an optional `now` for testability, but in
    // production it falls back to `new Date()`. Spot-check the
    // fallback path: an old timestamp should not throw.
    expect(() =>
      assertTrainingIntensityChangeAllowed(
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60d ago
        0.1,
        0.2,
      ),
    ).not.toThrow();
  });
});
