import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Type-scale floor.
 *
 * The editor had drifted into 8px and 9px text for real information (slot
 * labels, skill captions), which at 1440p is unreadable and flattens every
 * hierarchy to the same grey smear. `globals.css` now names the scale —
 * kicker 10 / label 11 / body 13 / title 14 — and this test fails the build
 * if an arbitrary size below the kicker reappears anywhere in the editor.
 *
 * It is a source scan rather than a rendered check because the web jest
 * project runs in a node environment with `.spec.ts` only: there is no DOM to
 * measure, so the only enforceable rule is "this class does not exist".
 */
describe('tactics type scale', () => {
  const ROOT = __dirname;

  function collectTsx(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collectTsx(full, out);
      else if (entry.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  const files = collectTsx(ROOT);

  it('finds the editor sources', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no arbitrary font size below the kicker step', () => {
    const tooSmall = /text-\[(\d+)px\]/g;
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(tooSmall)) {
        if (Number(match[1]) < 10) {
          offenders.push(`${file.replace(ROOT, '.')}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('styles kicker text with the token, not an arbitrary value', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/font-label[^"'`]*text-\[10px\]/.test(source)) {
        offenders.push(file.replace(ROOT, '.'));
      }
    }

    expect(offenders).toEqual([]);
  });
});
