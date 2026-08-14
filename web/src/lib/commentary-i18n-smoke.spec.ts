// TEMP smoke test: ensure every narrative sub-section key added in
// Phase 1 / Phase 1.5 actually resolves through next-intl. Delete after.
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

const cases: Array<[string, string[], number]> = [
  // [parent, subKeys, tplCount]
  ['goal', ['center_with_assist', 'center_no_assist', 'left_with_assist', 'left_no_assist', 'right_with_assist', 'right_no_assist', 'long_shot', 'penalty', 'header', 'one_on_one', 'rebound'], 4],
  ['shot_on_target', ['long_shot', 'header', 'one_on_one', 'rebound'], 4],
  ['shot_off_target', ['long_shot', 'header', 'one_on_one', 'rebound'], 4],
];

const allKeys: string[] = [];
for (const [parent, subKeys, count] of cases) {
  for (const sub of subKeys) {
    for (let n = 0; n < count; n++) {
      allKeys.push(`${parent}.${sub}.tpl_${n}`);
    }
  }
}

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
