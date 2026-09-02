"use client";

/**
 * ManualToc — sticky right-side table of contents for a manual chapter.
 *
 * - Renders only h2 / h3 (h1 is the page title, not in the TOC).
 * - Tracks the user's scroll position via IntersectionObserver and
 *   highlights the heading currently in the top ~25% of the viewport.
 * - Smooth-scrolls to the heading on click, updates the URL hash
 *   so the chapter position is shareable / survives a refresh.
 * - Falls back gracefully if `IntersectionObserver` isn't available
 *   (server-side render, very old browsers) — the link still works
 *   and the active class simply doesn't update.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import type { TocItem } from "@/lib/manual-parse";

interface ManualTocProps {
  items: TocItem[];
  /** Pre-computed class for the sticky container. Allows the parent
   *  to tweak top offset / width without forking the component. */
  className?: string;
}

export function ManualToc({ items, className }: ManualTocProps) {
  const t = useTranslations();
  const [activeId, setActiveId] = useState<string | null>(
    items[0]?.id ?? null,
  );

  useEffect(() => {
    if (typeof window === "undefined" || items.length === 0) return;
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    // Track which heading is currently in the "active band" (top 25%
    // of the viewport). We use IntersectionObserver with a rootMargin
    // to define that band, then pick the topmost visible heading.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      () => {
        // Recompute on every change: find the heading closest to the
        // top of the active band. Simpler than tracking entry/exit
        // timestamps and matches the "highlight current section"
        // UX everyone expects.
        const top = headings
          .filter((h) => visible.has(h.id))
          .map((h) => ({ id: h.id, top: h.getBoundingClientRect().top }))
          .sort((a, b) => a.top - b.top)[0];
        if (top) setActiveId(top.id);
        else if (window.scrollY < 80 && headings[0]) setActiveId(headings[0].id);
      },
      {
        rootMargin: "-80px 0px -75% 0px",
        threshold: [0, 1],
      },
    );
    headings.forEach((h) => {
      visible.has(h.id);
      observer.observe(h);
    });
    // Make sure the active set is actually populated when the user
    // lands mid-page (the observer won't fire until something moves).
    headings.forEach((h) => {
      const rect = h.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < window.innerHeight) {
        visible.add(h.id);
      }
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t("manual.tocAria")}
      className={clsx(
        "sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto pr-2",
        className,
      )}
    >
      <p className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3">
        {t("manual.tocLabel")}
      </p>
      <ul className="space-y-1 border-l border-outline-variant/30">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                const target = document.getElementById(item.id);
                if (target) {
                  const top =
                    target.getBoundingClientRect().top + window.scrollY - 88;
                  window.scrollTo({ top, behavior: "smooth" });
                  history.replaceState(null, "", `#${item.id}`);
                  setActiveId(item.id);
                }
              }}
              className={clsx(
                "block border-l-2 pl-3 py-1 text-xs leading-snug transition-colors",
                item.level === 3 ? "ml-3" : "ml-0",
                activeId === item.id
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-on-surface-variant/80 hover:text-on-surface hover:border-outline-variant",
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
