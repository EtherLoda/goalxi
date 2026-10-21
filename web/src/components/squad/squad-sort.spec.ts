import type { Player } from '@/lib/api';
import {
  DEFAULT_SQUAD_SORT,
  findSortOption,
  nextSort,
  SKILL_SORT_OPTIONS,
  sortSquad,
  STAT_SORT_OPTIONS,
} from '@/components/squad/squad-sort';

/** Every bucket present, so a spec can override just the one skill it cares about. */
function skills(
  override: Partial<Record<string, Record<string, number>>> = {},
): Player['currentSkills'] {
  return {
    physical: {},
    technical: {},
    mental: {},
    setPieces: {},
    ...override,
  } as Player['currentSkills'];
}

/** Minimal roster row — only the fields the comparator reads. */
function makePlayer(overrides: Partial<Player> & { id: number }): Player {
  return {
    name: `Player ${overrides.id}`,
    age: 24,
    ageDays: 0,
    overall: 1000,
    currentWage: 4000,
    stamina: 3,
    form: 3,
    experience: 0,
    isGoalkeeper: false,
    currentSkills: skills(),
    ...overrides,
  } as unknown as Player;
}

describe('squad sort', () => {
  it('defaults to overall, strongest first', () => {
    expect(DEFAULT_SQUAD_SORT).toEqual({ key: 'overall', direction: -1 });

    const players = [
      makePlayer({ id: 1, overall: 800 }),
      makePlayer({ id: 2, overall: 2000 }),
      makePlayer({ id: 3, overall: 1400 }),
    ];

    expect(sortSquad(players, DEFAULT_SQUAD_SORT).map((p) => p.id)).toEqual([
      2, 3, 1,
    ]);
  });

  it('gives every option a natural direction', () => {
    expect(findSortOption('age').direction).toBe(1);
    expect(findSortOption('wage').direction).toBe(-1);
    expect(findSortOption('form').direction).toBe(-1);
    expect(findSortOption('stamina').direction).toBe(1);
    for (const option of SKILL_SORT_OPTIONS) {
      expect(option.direction).toBe(-1);
    }
  });

  it('flips the direction when the active option is picked again', () => {
    const first = nextSort(DEFAULT_SQUAD_SORT, 'overall');
    expect(first).toEqual({ key: 'overall', direction: 1 });

    const second = nextSort(first, 'overall');
    expect(second).toEqual({ key: 'overall', direction: -1 });
  });

  it('starts a new option in its own natural direction', () => {
    const fromOverall = nextSort(DEFAULT_SQUAD_SORT, 'age');
    expect(fromOverall).toEqual({ key: 'age', direction: 1 });

    const fromAge = nextSort(fromOverall, 'wage');
    expect(fromAge).toEqual({ key: 'wage', direction: -1 });
  });

  it('orders age by exact days, not just whole years', () => {
    const players = [
      makePlayer({ id: 1, age: 24, ageDays: 200 }),
      makePlayer({ id: 2, age: 24, ageDays: 10 }),
      makePlayer({ id: 3, age: 23, ageDays: 300 }),
    ];

    expect(sortSquad(players, { key: 'age', direction: 1 }).map((p) => p.id)).toEqual([
      3, 2, 1,
    ]);
  });

  it('reads a skill out of its bucket', () => {
    const players = [
      makePlayer({ id: 1, currentSkills: skills({ technical: { finishing: 4 } }) }),
      makePlayer({ id: 2, currentSkills: skills({ technical: { finishing: 11 } }) }),
      makePlayer({ id: 3, currentSkills: skills({ technical: { finishing: 7 } }) }),
    ];

    const sorted = sortSquad(players, { key: 'skill:finishing', direction: -1 });
    expect(sorted.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it('sinks a goalkeeper under a skill he does not have', () => {
    const players = [
      makePlayer({ id: 1, isGoalkeeper: true }),
      makePlayer({
        id: 2,
        currentSkills: skills({ technical: { finishing: 3 } }),
      }),
    ];

    const sorted = sortSquad(players, { key: 'skill:finishing', direction: -1 });
    expect(sorted.map((p) => p.id)).toEqual([2, 1]);
  });

  it('breaks ties deterministically instead of leaving order to the engine', () => {
    const players = [
      makePlayer({ id: 30, overall: 900 }),
      makePlayer({ id: 10, overall: 900 }),
      makePlayer({ id: 20, overall: 1200 }),
    ];

    // Same age for all three: the fallback must be overall desc, then id asc.
    const sorted = sortSquad(players, { key: 'age', direction: 1 });
    expect(sorted.map((p) => p.id)).toEqual([20, 10, 30]);
    // A second pass must not reshuffle.
    expect(sortSquad(sorted, { key: 'age', direction: 1 }).map((p) => p.id)).toEqual([
      20, 10, 30,
    ]);
  });

  it('never mutates the array it is given', () => {
    const players = [
      makePlayer({ id: 1, overall: 800 }),
      makePlayer({ id: 2, overall: 2000 }),
    ];
    const original = players.map((p) => p.id);

    sortSquad(players, DEFAULT_SQUAD_SORT);

    expect(players.map((p) => p.id)).toEqual(original);
  });

  it('exposes the roster facts before the skills', () => {
    expect(STAT_SORT_OPTIONS.map((option) => option.key)).toEqual([
      'overall',
      'age',
      'stamina',
      'form',
      'experience',
      'wage',
    ]);
    // 10 outfield + reflexes / handling / aerial — the six shared skills appear once.
    expect(SKILL_SORT_OPTIONS).toHaveLength(13);
  });
});
