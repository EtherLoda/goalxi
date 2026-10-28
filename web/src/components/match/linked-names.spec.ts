import { describe, expect, it } from '@jest/globals';
import { splitLinkedNames } from './linked-names';

describe('splitLinkedNames', () => {
  it('leaves prose untouched when the event carries no usable name', () => {
    const segments = splitLinkedNames('干净的抢断！球权易手。', []);
    expect(segments).toEqual([{ text: '干净的抢断！球权易手。' }]);
  });

  it('marks the acting player and keeps the prose around him', () => {
    const segments = splitLinkedNames('Jun Guo 低射破门！', [
      { name: 'Jun Guo', playerId: 100023854 },
    ]);
    expect(segments).toEqual([
      { text: 'Jun Guo', playerId: 100023854 },
      { text: ' 低射破门！' },
    ]);
  });

  it('links the assister as well as the scorer', () => {
    const segments = splitLinkedNames('Gang Xu 接到 Bin Zhu 的分球后推射入网。', [
      { name: 'Gang Xu', playerId: 1 },
      { name: 'Bin Zhu', playerId: 2 },
    ]);
    expect(segments.filter((s) => s.playerId != null).map((s) => s.playerId)).toEqual([1, 2]);
  });

  it('prefers the longer name when one contains the other', () => {
    const segments = splitLinkedNames('Kun Xu 和 Kun Xu-long', [
      { name: 'Kun Xu', playerId: 7 },
      { name: 'Kun Xu-long', playerId: 8 },
    ]);
    expect(segments.map((s) => s.playerId)).toEqual([7, undefined, 8]);
  });

  it('links every occurrence, not just the first', () => {
    const segments = splitLinkedNames('Tao Huang 传给 Tao Huang', [
      { name: 'Tao Huang', playerId: 3 },
    ]);
    expect(segments.filter((s) => s.playerId === 3)).toHaveLength(2);
  });

  it('ignores names that are too short or carry an unusable id', () => {
    const short = splitLinkedNames('Li 传球', [{ name: 'Li', playerId: 4 }]);
    expect(short).toEqual([{ text: 'Li 传球' }]);

    const badId = splitLinkedNames('Marcel Müller 传球', [
      { name: 'Marcel Müller', playerId: 0 },
    ]);
    expect(badId).toEqual([{ text: 'Marcel Müller 传球' }]);
  });

  it('escapes regex metacharacters in names', () => {
    const segments = splitLinkedNames('A.B 传球给 A.B', [{ name: 'A.B', playerId: 9 }]);
    expect(segments.filter((s) => s.playerId === 9)).toHaveLength(2);
  });
});
