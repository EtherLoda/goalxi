import fs from "fs";
import path from "path";

/**
 * Guards against the class of bug where a call site asks for a key that no
 * message file defines: next-intl renders `MISSING_MESSAGE: …` straight into
 * the page, and because both locales are missing it looks like a styling
 * problem rather than a typo. `pnpm build` does not catch it either — the
 * string only resolves at render time, and any branch behind a toggle or a
 * dialog is never rendered during prerender.
 *
 * Scope resolution is per declaration: a file may hold several translators
 * (`const t = useTranslations()` at module level, `const t = useTranslations("squad")`
 * inside a component), so the namespace is taken from the nearest PRECEDING
 * declaration of that variable, not from the first one in the file.
 */

const WEB_ROOT = path.resolve(__dirname, "../..");
const SRC_ROOT = path.join(WEB_ROOT, "src");
const MESSAGES = path.join(WEB_ROOT, "messages");

type Messages = Record<string, unknown>;

const locales = ["zh", "en"] as const;

function load(locale: string): Messages {
  return JSON.parse(
    fs.readFileSync(path.join(MESSAGES, `${locale}.json`), "utf8"),
  ) as Messages;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".spec.ts")) {
      out.push(full);
    }
  }
  return out;
}

function resolves(messages: Messages, key: string): boolean {
  let cursor: unknown = messages;
  for (const segment of key.split(".")) {
    if (cursor === null || typeof cursor !== "object") return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor !== undefined;
}

function flatten(value: unknown, prefix = "", out: string[] = []): string[] {
  if (value === null || typeof value !== "object") {
    out.push(prefix);
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

interface Usage {
  file: string;
  key: string;
}

function collectUsages(): Usage[] {
  const usages: Usage[] = [];
  for (const file of walk(SRC_ROOT)) {
    const source = fs.readFileSync(file, "utf8");
    const declarations = [
      ...source.matchAll(
        /(\w+)\s*=\s*(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)")?\s*\)/g,
      ),
    ].map((match) => ({
      at: match.index ?? 0,
      name: match[1],
      namespace: match[2] ?? "",
    }));
    if (declarations.length === 0) continue;

    for (const name of new Set(declarations.map((d) => d.name))) {
      // Only plain string literals: template literals and concatenations are
      // resolved at runtime and cannot be checked statically.
      const calls = source.matchAll(
        new RegExp(`\\b${name}\\(\\s*"([^"$]+)"`, "g"),
      );
      for (const call of calls) {
        const key = call[1];
        // `t("status." + value)` is a half key; skip the literal fragment.
        if (key.endsWith(".")) continue;
        const at = call.index ?? 0;
        const declaration = declarations
          .filter((d) => d.name === name && d.at < at)
          .pop();
        if (!declaration) continue;
        usages.push({
          file: path.relative(WEB_ROOT, file).replace(/\\/g, "/"),
          key: declaration.namespace
            ? `${declaration.namespace}.${key}`
            : key,
        });
      }
    }
  }
  return usages;
}

describe("i18n coverage", () => {
  const zh = load("zh");
  const en = load("en");

  it("resolves every translation key used in web/src", () => {
    const unresolved = collectUsages()
      .filter((usage) => !resolves(zh, usage.key) || !resolves(en, usage.key))
      .map((usage) => {
        const missing = [
          !resolves(zh, usage.key) ? "zh" : "",
          !resolves(en, usage.key) ? "en" : "",
        ]
          .filter(Boolean)
          .join("+");
        return `${usage.file} -> ${usage.key} (missing ${missing})`;
      });

    expect([...new Set(unresolved)]).toEqual([]);
  });

  it("keeps the two locales on the same key set", () => {
    const zhKeys = new Set(flatten(zh));
    const enKeys = new Set(flatten(en));

    const onlyZh = [...zhKeys].filter((key) => !enKeys.has(key));
    const onlyEn = [...enKeys].filter((key) => !zhKeys.has(key));

    expect({ onlyZh, onlyEn }).toEqual({ onlyZh: [], onlyEn: [] });
  });

  it("keeps both message files canonical 2-space JSON", () => {
    for (const locale of locales) {
      const raw = fs.readFileSync(
        path.join(MESSAGES, `${locale}.json`),
        "utf8",
      );
      const parsed = JSON.parse(raw) as Messages;
      expect(`${locale}:${raw === `${JSON.stringify(parsed, null, 2)}\n`}`).toBe(
        `${locale}:true`,
      );
    }
  });
});
