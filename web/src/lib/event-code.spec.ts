import { EVENT_TWO_AXIS } from '@goalxi/database';

import { EVENT_CLASS_CODE, eventCodeOf } from './event-code';

describe('eventCodeOf', () => {
  it('joins class and outcome with a dot', () => {
    const goal = EVENT_TWO_AXIS.goal;
    expect(eventCodeOf(goal).code).toBe('SHOT.GOAL');
    expect(eventCodeOf(EVENT_TWO_AXIS.yellow_card).code).toBe('FOUL.YELLOW');
  });

  it('drops the outcome segment when the class has none', () => {
    expect(eventCodeOf(EVENT_TWO_AXIS.kickoff).code).toBe('KICKOFF');
  });

  it('returns UNKNOWN for a missing tuple', () => {
    expect(eventCodeOf(null).code).toBe('UNKNOWN');
    expect(eventCodeOf({ classId: null, outcomeCode: null }).code).toBe('UNKNOWN');
  });

  it('gives every engine-emitted event a readable code', () => {
    const unmapped = Object.entries(EVENT_TWO_AXIS)
      .filter(([, axis]) => eventCodeOf(axis).code === 'UNKNOWN')
      .map(([typeName]) => typeName);

    expect(unmapped).toEqual([]);
  });

  it('covers every class id with a name', () => {
    const ids = new Set(
      Object.values(EVENT_TWO_AXIS)
        .map((axis) => axis.classId)
        .filter((id): id is number => id != null),
    );
    for (const id of ids) expect(EVENT_CLASS_CODE[id]).toBeDefined();
  });
});
