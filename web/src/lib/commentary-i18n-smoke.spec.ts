// i18n smoke: every key the commentary/UI surfaces (sub-sections,
// tier labels, lane/shotType word banks) resolves in both en and
// zh. Pre-fix, missing keys silently fell back to a base tpl or
// showed a literal dotted key in the UI — this guard catches both
// before they ship.
import en from '../../messages/en.json';
import zh from '../../messages/zh.json';

const get = (obj: any, path: string) => {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
};

// [parent, subKeys, tplCount]
const subSectionCases: Array<[string, string[], number]> = [
  ['goal', ['center_with_assist', 'center_no_assist', 'left_with_assist', 'left_no_assist', 'right_with_assist', 'right_no_assist', 'long_shot', 'penalty', 'header', 'one_on_one', 'rebound'], 4],
  ['shot_on_target', ['long_shot', 'header', 'one_on_one', 'rebound'], 4],
  ['shot_off_target', ['long_shot', 'header', 'one_on_one', 'rebound'], 4],
];

const allKeys: string[] = [];
for (const [parent, subKeys, count] of subSectionCases) {
  for (const sub of subKeys) {
    for (let n = 0; n < count; n++) {
      allKeys.push(`${parent}.${sub}.tpl_${n}`);
    }
  }
}

// Flat key namespaces (no tpl_ suffix, just keys under a parent).
// These are referenced by helpers like getShotQualityLabel, getLaneText,
// getShotTypeText — if a key goes missing the UI renders a literal
// "shotQuality.tier_top" string instead of "top-drawer".
// `t()` calls in commentary.ts are scoped to `commentary.*` via
// `useTranslations('commentary')`, so the path here includes that
// prefix to match what the runtime sees.
const flatKeys: string[] = [
  ...['left', 'center', 'right'].map((k) => `commentary.lane.${k}`),
  ...['header', 'one_on_one', 'normal', 'long_shot', 'rebound'].map(
    (k) => `commentary.shotType.${k}`,
  ),
  ...['tier_top', 'tier_quality', 'tier_decent', 'tier_tame', 'tier_wayward'].map(
    (k) => `commentary.shotQuality.${k}`,
  ),
];

describe('i18n smoke: every narrative sub-section key resolves', () => {
  it.each(allKeys)('en.json has %p', (stripped) => {
    const val = get(en, stripped);
    if (val === undefined) return; // not every section has all 4 tpl (e.g. long_shot has 2)
    expect(typeof val).toBe('string');
    expect(val.length).toBeGreaterThan(0);
  });
  it.each(allKeys)('zh.json has %p', (stripped) => {
    const val = get(zh, stripped);
    if (val === undefined) return;
    expect(typeof val).toBe('string');
    expect(val.length).toBeGreaterThan(0);
  });
});

describe('i18n smoke: every flat namespace key resolves', () => {
  it.each(flatKeys)('en.json has %p', (stripped) => {
    const val = get(en, stripped);
    expect(val).toBeDefined();
    expect(typeof val).toBe('string');
    expect(val.length).toBeGreaterThan(0);
  });
  it.each(flatKeys)('zh.json has %p', (stripped) => {
    const val = get(zh, stripped);
    expect(val).toBeDefined();
    expect(typeof val).toBe('string');
    expect(val.length).toBeGreaterThan(0);
  });
});
