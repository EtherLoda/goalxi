import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n";
import { loadIndex, loadChapter, visibleChapters } from "@/lib/manual";
import { ManualRenderer } from "@/components/manual/ManualRenderer";
import { ManualToc } from "@/components/manual/ManualToc";

interface ManualChapterPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/**
 * Manual chapter reader — server-rendered two-column layout:
 *
 *   ┌──────────────────────────┬──────────────┐
 *   │  Chapter title           │              │
 *   │  (ManualRenderer)        │  ManualToc   │
 *   │  - H2/H3 anchors         │  (sticky)    │
 *   │  - paragraphs/lists/...  │              │
 *   │                          │              │
 *   │  prev / next nav         │              │
 *   └──────────────────────────┴──────────────┘
 *
 * Only chapters with `status: "full"` are served; everything else
 * 404s so a half-written chapter can never leak to players. The
 * `visibleChapters` order is also the prev/next sequence — stubs
 * are skipped.
 */
export default async function ManualChapterPage({ params }: ManualChapterPageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "manual" });

  // Build the visible sequence first — that gives us the prev/next
  // mapping and also lets us 404 early for any slug that isn't in it.
  const idx = await loadIndex(locale);
  const visible = visibleChapters(idx, locale);
  const currentIdx = visible.findIndex((c) => c.slug === slug);
  if (currentIdx === -1) {
    notFound();
  }
  const current = visible[currentIdx];

  // Wire up prev/next using the visible sequence. We pass the
  // localised title so the bottom nav reads naturally.
  const prevEntry = visible[currentIdx - 1];
  const nextEntry = visible[currentIdx + 1];
  const prevNext = {
    prev: prevEntry
      ? { slug: prevEntry.slug, title: prevEntry.titleLocalized }
      : undefined,
    next: nextEntry
      ? { slug: nextEntry.slug, title: nextEntry.titleLocalized }
      : undefined,
  };

  const chapter = await loadChapter(locale, slug, { prevNext });

  const orderLabel = current.isAppendix
    ? `A${current.order}`
    : current.order.toString().padStart(2, "0");

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* ── Top bar: back + crumb ── */}
      <div className="mb-6 flex items-center gap-2 text-xs">
        <Link
          href="/manual"
          className="font-label uppercase tracking-widest text-on-surface-variant/60 hover:text-primary transition-colors"
        >
          {t("title")}
        </Link>
        <span className="material-symbols-outlined text-[12px] text-on-surface-variant/40">
          chevron_right
        </span>
        <span className="font-label uppercase tracking-widest text-on-surface truncate">
          {chapter.frontmatter.title}
        </span>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-10">
        {/* ── Main: chapter content ── */}
        <article className="min-w-0">
          {/* Chapter header */}
          <header className="mb-6 pb-4 border-b border-outline-variant/20">
            <div className="flex items-center gap-3 mb-2">
              <div
                className={
                  "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-sm border " +
                  (current.isAppendix
                    ? "bg-secondary/10 border-secondary/30 text-secondary"
                    : "bg-primary/10 border-primary/30 text-primary")
                }
              >
                {orderLabel}
              </div>
              <div className="min-w-0">
                <p className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">
                  {t("eyebrow")}
                </p>
                <h1 className="font-headline font-black text-2xl md:text-3xl text-on-surface leading-tight">
                  {chapter.frontmatter.title}
                </h1>
              </div>
            </div>
            {current.hattrickEquivalent && (
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/50">
                ≈ {current.hattrickEquivalent}
              </p>
            )}
          </header>

          {/* Body — rendered from the MD parser's block tree */}
          <ManualRenderer blocks={chapter.blocks} />

          {/* ── Prev / Next nav ── */}
          <nav className="mt-12 pt-6 border-t border-outline-variant/20 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {chapter.prev ? (
              <Link
                href={`/manual/${chapter.prev.slug}`}
                className="group glass-panel p-4 rounded-2xl border border-outline-variant/15 hover:border-primary/40 transition-all"
              >
                <div className="flex items-center gap-2 mb-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">
                  <span className="material-symbols-outlined text-[14px]">
                    arrow_back
                  </span>
                  {t("prevChapter")}
                </div>
                <div className="font-headline font-bold text-sm text-on-surface group-hover:text-primary transition-colors line-clamp-1">
                  {chapter.prev.title}
                </div>
              </Link>
            ) : (
              <div />
            )}
            {chapter.next ? (
              <Link
                href={`/manual/${chapter.next.slug}`}
                className="group glass-panel p-4 rounded-2xl border border-outline-variant/15 hover:border-primary/40 transition-all text-right"
              >
                <div className="flex items-center justify-end gap-2 mb-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">
                  {t("nextChapter")}
                  <span className="material-symbols-outlined text-[14px]">
                    arrow_forward
                  </span>
                </div>
                <div className="font-headline font-bold text-sm text-on-surface group-hover:text-primary transition-colors line-clamp-1">
                  {chapter.next.title}
                </div>
              </Link>
            ) : (
              <div />
            )}
          </nav>
        </article>

        {/* ── Right: sticky TOC ── */}
        <aside className="hidden lg:block">
          <ManualToc items={chapter.toc} />
        </aside>
      </div>
    </div>
  );
}
