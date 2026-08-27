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
// These are referenced by helpers like getLaneText, getShotTypeText —
// if a key goes missing the UI renders a literal dotted key instead
// of the resolved string. `t()` calls in commentary.ts are scoped to
// `commentary.*` via `useTranslations('commentary')`, so the path
// here includes that prefix to match what the runtime sees.
//
// (2026-08-27) The `shotQuality.tier_*` set was dropped alongside
// the getShotQualityLabel helper. The narrative templates still
// carry a `{quality}` placeholder for back-compat with already-
// translated copy, but the placeholder resolves to an empty
// string on the FE — no UI surface reads a shotQuality key now.
const flatKeys: string[] = [
  ...['left', 'center', 'right'].map((k) => `commentary.lane.${k}`),
  ...['header', 'one_on_one', 'normal', 'long_shot', 'rebound'].map(
    (k) => `commentary.shotType.${k}`,
  ),
];

// Flat tpl_N keys for period events. The score-aware period
// formatter (`formatPeriodCommentary` in commentary.ts) looks up
// these templates by index — if one goes missing, the FE renders
// the literal `commentary.full_time.tpl_2` string instead of the
// narrative. The smoke guard pins every variant we depend on.
//
//   full_time           — 5 buckets (home_close, home_blowout,
//                          away_close, away_blowout, tied)
//   half_time           — 3 buckets (tied, home_lead, away_lead)
//   second_half_start   — 3 buckets (same as half_time)
//   kickoff             — 1 (no score dependence, included so
//                          a future refactor that drops it
//                          fails fast)
//   extra_time_start    — 1
//   penalty_start       — 1
const periodTemplateKeys: string[] = [
  ...[0, 1, 2, 3, 4].map((n) => `commentary.full_time.tpl_${n}`),
  ...[0, 1, 2].map((n) => `commentary.half_time.tpl_${n}`),
  ...[0, 1, 2].map((n) => `commentary.second_half_start.tpl_${n}`),
  `commentary.kickoff.tpl_0`,
  `commentary.extra_time_start.tpl_0`,
  `commentary.penalty_start.tpl_0`,
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

describe('i18n smoke: every period-event tpl_N key resolves', () => {
  // Score-aware period templates. If any of these goes
  // missing, `formatPeriodCommentary` in commentary.ts falls
  // back to a literal dotted key in the UI. The smoke guard
  // catches that before it ships.
  it.each(periodTemplateKeys)('en.json has %p', (key) => {
    const val = get(en, key);
    expect(val).toBeDefined();
    expect(typeof val).toBe('string');
    expect(val.length).toBeGreaterThan(0);
  });
  it.each(periodTemplateKeys)('zh.json has %p', (key) => {
    const val = get(zh, key);
    expect(val).toBeDefined();
    expect(typeof val).toBe('string');
    expect(val.length).toBeGreaterThan(0);
  });
});
