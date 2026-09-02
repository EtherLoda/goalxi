/**
 * Manual loader — server-only I/O for the game manual under
 * `web/src/data/manual/{zh,en}/*.md`. The pure parser (frontmatter +
 * block tree + inline) lives in `lib/manual-parse.ts` so it can also
 * be imported from client components like `ManualRenderer`.
 *
 * `loadIndex` and `loadChapter` are async because they read from
 * disk. Call them from server components only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  parseFrontmatter,
  parseMarkdown,
  type ChapterStatus,
  type Locale,
  type ParsedChapter,
} from "./manual-parse";

// Re-export the parser API + types so existing call sites that
// imported everything from `@/lib/manual` keep working.
export {
  parseFrontmatter,
  parseMarkdown,
  parseInline,
  slugifyHeading,
} from "./manual-parse";
export type {
  Locale,
  ChapterStatus,
  ChapterFrontmatter,
  AppendixFrontmatter,
  Frontmatter,
  BlockNode,
  InlineNode,
  ListItem,
  TocItem,
  ParsedChapter,
} from "./manual-parse";

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

export interface IndexChapter {
  order: number;
  slug: string;
  title: string;
  /** Localised. Falls back to `en` then `zh` for the chosen locale. */
  titleLocalized: string;
  status: ChapterStatus;
  file: { zh?: string; en?: string } | null;
  hattrickEquivalent?: string | null;
  relatedChapters?: number[];
  relatedEntries?: string[];
  isAppendix: boolean;
}

export interface ManualIndex {
  version: number;
  lastUpdated: string;
  chapters: IndexChapter[];
  appendices: IndexChapter[];
}

// ---------------------------------------------------------------------------
// File layout
// ---------------------------------------------------------------------------

const MANUAL_ROOT = path.join(process.cwd(), "src", "data", "manual");

function chapterPath(locale: Locale, file: string): string {
  return path.join(MANUAL_ROOT, locale, file);
}

// ---------------------------------------------------------------------------
// Index loader (uses index.json — single source of truth for the order)
// ---------------------------------------------------------------------------

export async function loadIndex(locale: Locale): Promise<ManualIndex> {
  const raw = await fs.readFile(
    path.join(MANUAL_ROOT, "index.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as {
    version: number;
    lastUpdated: string;
    chapters: Array<{
      order: number;
      slug: string;
      title: { zh: string; en: string };
      file?: { zh?: string; en?: string };
      status: ChapterStatus;
      hattrickEquivalent?: string | null;
      relatedChapters?: number[];
      relatedEntries?: string[];
    }>;
    appendices: Array<{
      order: number;
      slug: string;
      title: { zh: string; en: string };
      file?: { zh?: string; en?: string };
      status: ChapterStatus;
      hattrickEquivalent?: string | null;
      relatedChapters?: number[];
      relatedEntries?: string[];
    }>;
  };

  const toIndexChapter = (
    c: (typeof parsed.chapters)[number],
    isAppendix: boolean,
  ): IndexChapter => ({
    order: c.order,
    slug: c.slug,
    title: c.title.en,
    titleLocalized: c.title[locale] ?? c.title.en,
    status: c.status,
    file: c.file ?? null,
    hattrickEquivalent: c.hattrickEquivalent ?? null,
    relatedChapters: c.relatedChapters,
    relatedEntries: c.relatedEntries,
    isAppendix,
  });

  return {
    version: parsed.version,
    lastUpdated: parsed.lastUpdated,
    chapters: parsed.chapters.map((c) => toIndexChapter(c, false)),
    appendices: parsed.appendices.map((a) => toIndexChapter(a, true)),
  };
}

// ---------------------------------------------------------------------------
// Chapter loader
// ---------------------------------------------------------------------------

export async function loadChapter(
  locale: Locale,
  slug: string,
  options?: {
    prevNext?: { prev?: { slug: string; title: string }; next?: { slug: string; title: string } };
  },
): Promise<ParsedChapter> {
  const idx = await loadIndex(locale);
  const all = [...idx.chapters, ...idx.appendices];
  const entry = all.find((c) => c.slug === slug);
  if (!entry) {
    throw new Error(`Unknown chapter: ${slug}`);
  }
  if (!entry.file) {
    throw new Error(`Chapter ${slug} has no file (status=${entry.status})`);
  }
  const file = entry.file[locale] ?? entry.file.zh ?? entry.file.en;
  if (!file) {
    throw new Error(`Chapter ${slug} has no file for locale ${locale}`);
  }
  const source = await fs.readFile(chapterPath(locale, file), "utf8");
  const { fm, body } = parseFrontmatter(source);
  const { blocks, toc } = parseMarkdown(body);
  return {
    frontmatter: fm,
    blocks,
    toc,
    prev: options?.prevNext?.prev,
    next: options?.prevNext?.next,
  };
}

// ---------------------------------------------------------------------------
// List of chapters the FE should show (only `status: full`).
// Hides stub / not-applicable / partial so the index page stays
// short — the user can always re-enable them by changing the filter.
// ---------------------------------------------------------------------------

export interface VisibleChapter extends IndexChapter {
  hasFile: boolean;
  localisedFile: string | null;
}

export function visibleChapters(idx: ManualIndex, locale: Locale): VisibleChapter[] {
  const all = [...idx.chapters, ...idx.appendices];
  return all
    .filter((c) => c.status === "full")
    .map((c) => {
      const file = c.file?.[locale] ?? c.file?.zh ?? c.file?.en ?? null;
      return {
        ...c,
        hasFile: Boolean(file),
        localisedFile: file,
      };
    });
}
