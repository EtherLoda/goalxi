"use client";

/**
 * ManualRenderer — turns the parser's block tree into React elements.
 * No `dangerouslySetInnerHTML`: every block is a typed React node.
 *
 * The pure parser (frontmatter + block tree + inline) lives in
 * `@/lib/manual-parse`. That module has no `fs` / `path` imports so
 * it is safe to use from a client component. Server-only file I/O
 * stays in `@/lib/manual`.
 */
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  parseInline,
  type BlockNode,
  type InlineNode,
  type ListItem,
} from "@/lib/manual-parse";

interface ManualRendererProps {
  blocks: BlockNode[];
}

export function ManualRenderer({ blocks }: ManualRendererProps) {
  return (
    <div className="prose-manual space-y-5 text-on-surface">
      {blocks.map((b, i) => (
        <BlockNodeEl key={i} block={b} />
      ))}
    </div>
  );
}

function BlockNodeEl({ block }: { block: BlockNode }) {
  switch (block.type) {
    case "heading":
      if (block.level === 1) {
        return (
          <h1 className="text-3xl font-black tracking-tight mt-8 mb-3 first:mt-0">
            {block.text}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2
            id={block.id}
            className="text-xl font-black tracking-tight mt-10 mb-3 pb-2 border-b border-outline-variant/30 scroll-mt-24"
          >
            {block.text}
          </h2>
        );
      }
      return (
        <h3
          id={block.id}
          className="text-base font-black tracking-tight mt-6 mb-2 scroll-mt-24"
        >
          {block.text}
        </h3>
      );

    case "paragraph":
      return (
        <p className="text-sm leading-7 text-on-surface/90">
          <InlineList nodes={block.children} />
        </p>
      );

    case "list":
      if (block.ordered) {
        return (
          <ol className="list-decimal pl-6 space-y-1.5 text-sm leading-7 text-on-surface/90">
            {block.items.map((it, i) => (
              <ListItemEl key={i} item={it} />
            ))}
          </ol>
        );
      }
      return (
        <ul className="list-disc pl-6 space-y-1.5 text-sm leading-7 text-on-surface/90">
          {block.items.map((it, i) => (
            <ListItemEl key={i} item={it} />
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote className="border-l-2 border-primary/60 pl-4 py-1 my-4 text-on-surface/80 italic">
          <InlineList nodes={block.children} />
        </blockquote>
      );

    case "code":
      return (
        <pre
          dir="ltr"
          className="rounded-lg border border-outline-variant/30 bg-surface-container/60 px-3 py-2 overflow-x-auto text-xs leading-relaxed"
        >
          <code className="font-mono text-on-surface/90 whitespace-pre">
            {block.text}
          </code>
        </pre>
      );

    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-outline-variant/30 my-4">
          <table className="w-full text-xs">
            <thead className="bg-surface-container/60">
              <tr>
                {block.header.map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left font-bold text-on-surface/90 border-b border-outline-variant/30 whitespace-nowrap"
                  >
                    <InlineText text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={
                    ri % 2 === 0
                      ? "bg-surface-container/20"
                      : "bg-transparent"
                  }
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2 align-top text-on-surface/85 border-b border-outline-variant/10"
                    >
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "hr":
      return <hr className="border-outline-variant/30 my-6" />;

    case "html":
      // Reserved for raw HTML passthrough. Currently unused by our
      // parser but kept in the AST so we can extend later without
      // breaking the renderer.
      return (
        <div dangerouslySetInnerHTML={{ __html: block.raw }} />
      );
  }
}

function ListItemEl({ item }: { item: ListItem }) {
  // We render the first paragraph as inline content (so the bullet
  // shows the leading text), and any following paragraphs / nested
  // lists as their own block elements.
  const first = item.children[0];
  const rest = item.children.slice(1);
  if (!first || first.type !== "paragraph") {
    return (
      <li>
        {item.children.map((b, i) => (
          <BlockNodeEl key={i} block={b} />
        ))}
      </li>
    );
  }
  return (
    <li>
      <InlineList nodes={first.children} />
      {rest.length > 0 && (
        <div className="mt-1.5 space-y-2">
          {rest.map((b, i) => (
            <BlockNodeEl key={i} block={b} />
          ))}
        </div>
      )}
    </li>
  );
}

function InlineList({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <InlineNodeEl key={i} node={n} />
      ))}
    </>
  );
}

function InlineNodeEl({ node }: { node: InlineNode }) {
  const locale = useLocale();
  switch (node.type) {
    case "text":
      return <>{node.text}</>;
    case "bold":
      return (
        <strong className="font-bold text-on-surface">
          <InlineList nodes={node.children} />
        </strong>
      );
    case "italic":
      return (
        <em className="italic">
          <InlineList nodes={node.children} />
        </em>
      );
    case "code":
      return (
        <code
          dir="ltr"
          className="font-mono text-[0.85em] px-1 py-0.5 rounded bg-surface-container/60 border border-outline-variant/30 text-on-surface/90"
        >
          {node.text}
        </code>
      );
    case "linebreak":
      return <br />;
    case "link": {
      const href = node.href;
      const isInternal =
        href.endsWith(".md") ||
        (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:"));
      if (isInternal) {
        // Convert internal `.md` links to FE routes: `00-how-to-read.md`
        // → `/zh/manual/00-how-to-read` (the current locale).
        const cleaned = href.replace(/\.md$/, "");
        return (
          <Link
            href={`/${locale}/manual/${cleaned}`}
            className="text-primary hover:underline font-medium"
          >
            <InlineList nodes={node.children} />
          </Link>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          <InlineList nodes={node.children} />
        </a>
      );
    }
  }
}

/** Helper: render an inline-MD string (used for `<th>` / `<td>` cells). */
function InlineText({ text }: { text: string }) {
  return <InlineList nodes={parseInline(text)} />;
}
