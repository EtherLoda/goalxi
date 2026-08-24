/**
 * Source-level tripwires for the player-facing help KB.
 *
 * The KB is the primary way the player learns how the engine works.
 * A wrong line here (e.g. "only the strongest specialty is applied,
 * no stacking" when in fact three of the four hook classes do
 * stack) propagates to every FAQ answer in the app, including the
 * in-app help assistant. Source-level checks catch the regressions
 * that behavioural tests would miss — the loader is dumb text, and
 * the help assistant matches intent, not claim-accuracy.
 *
 * Two guards today:
 *
 * 1. **Stacking semantics** — the `specialties-meaning` answer must
 *    not claim "only the strongest applies, no stacking" (or any
 *    close variant). The engine has 4 distinct stacking classes
 *    (decision / strength / accumulator / weighted-sample); see
 *    `simulator/src/engine/systems/specialty.system.ts` and
 *    `docs/specialty-v2-design.md` for the canonical split. A
 *    regression here would mean a future contributor reverts the
 *    answer to the v2.0 "team-max" wording without realizing the
 *    math has moved on.
 *
 * 2. **Position-pool disjointness** — the `specialties-meaning`
 *    answer must mention that GK and outfield pools are disjoint.
 *    The generator is position-aware as of v2.4
 *    (`libs/database/src/services/specialty-generator.ts`); a
 *    regression here would mislead readers about which pool a
 *    given player can roll from.
 *
 * To add a new guard, append a new `it()` below that loads the
 * relevant `*.json` and asserts the property holds. Keep guards
 * here narrow and high-signal — a generic "answer reads well"
 * check belongs in a content review, not in this spec.
 */

import * as fs from 'fs';
import * as path from 'path';

const HELP_DIR = path.resolve(__dirname);
const ZH_PATH = path.join(HELP_DIR, 'faq.zh.json');
const EN_PATH = path.join(HELP_DIR, 'faq.en.json');

type Locale = 'zh' | 'en';
interface FaqEntry {
  id?: string;
  answer?: string;
  // Other fields (intent, tags, questions, keywords, links,
  // followUp) exist on real entries but the tripwire only reads
  // `id` and `answer` so they're omitted here.
}
interface FaqFile {
  version: number;
  locale: string;
  entries: FaqEntry[];
}

function loadFaq(locale: Locale): {
  raw: string;
  parsed: FaqFile;
  entry: { id: string; answer: string };
} {
  const filePath = locale === 'zh' ? ZH_PATH : EN_PATH;
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as FaqFile;
  if (!Array.isArray(parsed.entries)) {
    throw new Error(
      `faq.${locale}.json is missing an 'entries' array at the top level`,
    );
  }
  const entry = parsed.entries.find((e) => e.id === 'specialties-meaning');
  if (!entry || !entry.answer) {
    throw new Error(
      `faq.${locale}.json is missing a 'specialties-meaning' entry with an 'answer' field`,
    );
  }
  return { raw, parsed, entry: { id: 'specialties-meaning', answer: entry.answer } };
}

describe('faq.zh.json — specialties-meaning (source-level tripwires)', () => {
  const { entry, raw } = loadFaq('zh');

  it('does NOT claim "only the strongest specialty applies, no stacking"', () => {
    // Phrases that signal the v2.0 "team-max" wording — every
    // variant below would be misleading after the v2.4 split. The
    // tripwire catches the exact phrase + a few close paraphrases.
    const forbidden = [
      '只取球队最强',
      '只取场上最强',
      '不叠加',
      '只算最强',
      '每个事件只取',
    ];
    for (const phrase of forbidden) {
      expect(entry.answer).not.toContain(phrase);
    }
  });

  it('mentions the v2.4 GK/outfield pool split', () => {
    // Position-aware generator (commit 74a289e) means a GK
    // player can only roll SAVING_MASTER or SWEEPER_KEEPER, and
    // an outfield player can only roll the 10 outfield codes.
    // A future contributor who edits this answer must keep that
    // fact visible.
    const requiredSignals = [
      'GK', // mentions the GK position
      'outfield', // mentions the outfield position class
      '互斥', // explicitly says "disjoint"
    ];
    for (const signal of requiredSignals) {
      expect(entry.answer).toContain(signal);
    }
  });

  it('mentions all 4 stacking classes so the player can tell them apart', () => {
    const classes = [
      '决策类', // decision class
      'Strength 类', // strength class
      '累加', // accumulator class (real stacking)
      '加权采样', // weighted sample (shooter/assister pick)
    ];
    for (const cls of classes) {
      expect(entry.answer).toContain(cls);
    }
  });

  it('is valid JSON (parse guard against a stray comma introduced by a contributor)', () => {
    // The tripwire reads the file via fs.readFileSync + JSON.parse.
    // A syntax error here would mask every other check in this
    // describe block, so this dedicated test makes the failure
    // mode obvious.
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe('faq.en.json — specialties-meaning (source-level tripwires)', () => {
  const { entry, raw } = loadFaq('en');

  it('does NOT claim "only the strongest specialty is applied, no stacking"', () => {
    const forbidden = [
      "only the team's strongest",
      'no stacking',
      'only count the strongest',
      'only the strongest specialty is applied',
    ];
    for (const phrase of forbidden) {
      expect(entry.answer).not.toContain(phrase);
    }
  });

  it('mentions the v2.4 GK/outfield pool split', () => {
    const requiredSignals = [
      'GK',
      'outfield',
      'disjoint',
    ];
    for (const signal of requiredSignals) {
      expect(entry.answer).toContain(signal);
    }
  });

  it('mentions all 4 stacking classes so the player can tell them apart', () => {
    const classes = [
      'Decision class',
      'Strength class',
      'Accumulator',
      'Weighted sample',
    ];
    for (const cls of classes) {
      expect(entry.answer).toContain(cls);
    }
  });

  it('is valid JSON (parse guard against a stray comma introduced by a contributor)', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
