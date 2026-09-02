/**
 * Manual MD parser — pure-TypeScript block + inline parser for the
 * game manual under `web/src/data/manual/{zh,en}/*.md`.
 *
 * This module has **no Node imports** (no `fs`, no `path`). It is
 * safe to import from client components. The file I/O + index loader
 * live in `lib/manual.ts`, which is server-only.
 *
 * Why no `gray-matter` / `remark`? MVP-stage content has a small,
 * known set of features (headers, lists, tables, blockquotes, inline
 * code, links, hr). A hand-written parser:
 *   - keeps the dep footprint at zero,
 *   - returns React-ready node trees (no HTML string + dangerouslySetInnerHTML),
 *   - gives us free anchor IDs on h2 / h3 for the right-side TOC.
 *
 * Once content grows past ~50 chapters, swap this for `remark` +
 * `rehype-slug`. The exported AST shape is the seam — call sites
 * won't change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Locale = "zh" | "en";

export type ChapterStatus =
  | "full"
  | "partial"
  | "stub"
  | "not-applicable";

export interface ChapterFrontmatter {
  order: number;
  slug: string;
  title: string;
  status: ChapterStatus;
  lastUpdated?: string;
  relatedChapters?: number[];
  relatedEntries?: string[];
}

export interface AppendixFrontmatter extends ChapterFrontmatter {
  order: number; // always 1 / 2 / 3 for the three appendices
  slug: string;
}

export type Frontmatter = ChapterFrontmatter | AppendixFrontmatter;

export type BlockNode =
  | { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "code"; lang?: string; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "hr" }
  | { type: "html"; raw: string };

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "linebreak" };

export type ListItem = { children: BlockNode[] };

export interface TocItem {
  id: string;
  level: 2 | 3;
  text: string;
}

export interface ParsedChapter {
  frontmatter: Frontmatter;
  /** All blocks, with the leading `# h1` stripped (we render it as the page title). */
  blocks: BlockNode[];
  /** `## h2` + `### h3` items, in source order. */
  toc: TocItem[];
  /** Next / prev chapter, for the bottom navigation. Populated by `loadChapter`. */
  prev?: { slug: string; title: string };
  next?: { slug: string; title: string };
}

// ---------------------------------------------------------------------------
// Frontmatter parser (minimal YAML, hand-rolled — no `js-yaml` dep)
// ---------------------------------------------------------------------------

/**
 * Parses the YAML frontmatter at the top of an MD file. Supports the
 * small set of keys our chapters use — `order`, `slug`, `title`,
 * `status`, `lastUpdated`, `relatedChapters`, `relatedEntries` —
 * and ignores everything else. The output is a plain object keyed
 * by the YAML key; we cast it to `Frontmatter` at the call site.
 */
export function parseFrontmatter(source: string): { fm: Frontmatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("MD file is missing YAML frontmatter");
  }
  const [, yamlRaw, body] = match;
  const fm: Record<string, unknown> = {};
  for (const line of yamlRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    fm[key] = coerceYamlValue(rawValue.trim());
  }
  return { fm: fm as unknown as Frontmatter, body };
}

function coerceYamlValue(raw: string): unknown {
  if (raw === "" || raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return Number.parseFloat(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((v) => coerceYamlValue(v.trim()))
      .filter((v) => v !== "");
  }
  // Strip surrounding quotes
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Markdown → block tree
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s*---\s*$/;
const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_RE = /^(\s*)\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const CODE_FENCE_RE = /^```([A-Za-z0-9_-]*)\s*$/;
const TABLE_RE = /^\|(.+)\|\s*$/;
const TABLE_SEP_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

export function parseMarkdown(md: string): { blocks: BlockNode[]; toc: TocItem[] } {
  const lines = md.split(/\r?\n/);
  const blocks: BlockNode[] = [];
  const toc: TocItem[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines at the top of a block
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Headings (h1, h2, h3)
    const hm = line.match(HEADING_RE);
    if (hm) {
      const level = hm[1].length as 1 | 2 | 3;
      const text = hm[2].trim();
      const id = slugifyHeading(text);
      if (level === 1) {
        // Skip the leading h1 — the page renders it as the title.
        if (blocks.length > 0) {
          blocks.push({ type: "heading", level, text, id });
        }
      } else {
        blocks.push({ type: "heading", level, text, id });
        toc.push({ id, level, text });
      }
      i += 1;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Code fence
    const cm = line.match(CODE_FENCE_RE);
    if (cm) {
      const lang = cm[1] || undefined;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !CODE_FENCE_RE.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing fence
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Table
    if (TABLE_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = splitTableRow(lines[i]);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && TABLE_RE.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Blockquote (collect until blank line)
    if (QUOTE_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && (QUOTE_RE.test(lines[i]) || lines[i].trim() === "")) {
        if (QUOTE_RE.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ""));
        } else if (lines[i].trim() !== "") {
          // blank line ends the quote
          break;
        }
        i += 1;
      }
      const inner = parseMarkdown(buf.join("\n"));
      blocks.push({ type: "quote", children: inlineFromBlocks(inner.blocks) });
      continue;
    }

    // Lists
    const ulm = line.match(UL_RE);
    const olm = line.match(OL_RE);
    if (ulm || olm) {
      const ordered = !!olm;
      const re = ordered ? OL_RE : UL_RE;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const lm = lines[i].match(re);
        if (!lm) break;
        const content = lm[2];
        // Collect any continuation lines (indented under this bullet)
        const baseIndent = lm[1]?.length ?? 0;
        i += 1;
        const inner: string[] = [content];
        while (
          i < lines.length &&
          lines[i].trim() !== "" &&
          (lines[i].startsWith(" ".repeat(baseIndent + 1)) ||
            lines[i].startsWith("\t"))
        ) {
          inner.push(lines[i].slice(baseIndent + 1));
          i += 1;
        }
        // Allow a single trailing blank line between items
        if (i < lines.length && lines[i].trim() === "") {
          const peek = lines[i + 1] ?? "";
          if (re.test(peek)) {
            i += 1;
          } else if (peek.trim() === "") {
            i += 1;
          }
        }
        const parsed = parseMarkdown(inner.join("\n"));
        items.push({ children: parsed.blocks });
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Default: paragraph (collect until blank line)
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !TABLE_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i]) &&
      !CODE_FENCE_RE.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(buf.join("\n")) });
  }

  return { blocks, toc };
}

/**
 * Pull inline nodes out of blocks — used when we want to render a
 * quote's children as inline (not as another set of blocks).
 */
function inlineFromBlocks(blocks: BlockNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph") {
      out.push(...b.children);
      // Preserve line breaks between successive paragraphs
      out.push({ type: "linebreak" });
    } else if (b.type === "list") {
      // We don't usually hit this; just flatten
      for (const item of b.items) {
        for (const cb of item.children) {
          if (cb.type === "paragraph") out.push(...cb.children);
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline parser (bold / italic / code / link / linebreak)
// ---------------------------------------------------------------------------

/**
 * Pure parser: input text → `InlineNode[]`. No DOM, no `fs` — safe
 * for client components (used by `ManualRenderer` for table cells).
 */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      nodes.push({ type: "text", text: buf });
      buf = "";
    }
  };
  while (i < text.length) {
    const ch = text[i];

    // Inline code: `…`
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        nodes.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Escape: \* or \_
    if (ch === "\\" && i + 1 < text.length) {
      flush();
      buf = text[i + 1];
      i += 2;
      continue;
    }

    // Bold: **…**
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 1) {
        flush();
        nodes.push({ type: "bold", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // Italic: *…* or _…_ (no leading/trailing space)
    if (ch === "*" || ch === "_") {
      const end = text.indexOf(ch, i + 1);
      if (end > i + 1 && text[end - 1] !== " " && text[i + 1] !== " ") {
        flush();
        nodes.push({ type: "italic", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    // Link: [text](href)
    if (ch === "[") {
      const closeText = text.indexOf("]", i + 1);
      const openParen = closeText + 1;
      if (
        closeText > i &&
        text[openParen] === "(" &&
        text.indexOf(")", openParen) > openParen
      ) {
        const closeParen = text.indexOf(")", openParen);
        const linkText = text.slice(i + 1, closeText);
        const href = text.slice(openParen + 1, closeParen);
        flush();
        nodes.push({
          type: "link",
          href: href.trim(),
          children: parseInline(linkText),
        });
        i = closeParen + 1;
        continue;
      }
    }

    // Hard linebreak: two trailing spaces + newline OR backslash + newline
    if (ch === "\n") {
      flush();
      nodes.push({ type: "linebreak" });
      i += 1;
      continue;
    }
    if (ch === " " && text[i + 1] === " " && text[i + 2] === "\n") {
      flush();
      nodes.push({ type: "linebreak" });
      i += 3;
      continue;
    }

    buf += ch;
    i += 1;
  }
  flush();
  return nodes;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitTableRow(line: string): string[] {
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

/**
 * Stable id for a heading — used as the anchor target and the TOC key.
 * Keeps CJK characters; lower-cases ASCII; collapses whitespace to `-`.
 */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    // Strip characters that are not safe in an id; keep CJK
    .replace(/[^\p{Letter}\p{Number}\-_]/gu, "")
    .toLowerCase()
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
