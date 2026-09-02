import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n";
import { Link } from "@/i18n/navigation";
import {
  loadIndex,
  visibleChapters,
  type IndexChapter,
} from "@/lib/manual";

interface ManualIndexPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Manual index — server-rendered chapter list. Only chapters with
 * `status: "full"` are shown (per the agreed IA: hide stub / partial /
 * not-applicable from the list so the page stays short; the user can
 * always re-enable them by widening the `visibleChapters` filter).
 *
 * Layout: two sections (Chapters / Appendix) with a 2-col card grid
 * on desktop, 1-col on mobile. Each card links to the chapter reader.
 */
export default async function ManualIndexPage({ params }: ManualIndexPageProps) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "manual" });
  const idx = await loadIndex(locale);
  const chapters = visibleChapters(idx, locale).filter((c) => !c.isAppendix);
  const appendices = visibleChapters(idx, locale).filter((c) => c.isAppendix);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* ── Header ── */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-primary text-3xl">
            menu_book
          </span>
          <p className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">
            {t("eyebrow")}
          </p>
        </div>
        <h1 className="font-headline font-black text-3xl md:text-4xl uppercase tracking-tight text-on-surface">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
          {t("subtitle")}
        </p>
      </div>

      {/* ── Chapters ── */}
      {chapters.length > 0 && (
        <section className="mb-12">
          <SectionHeading
            label={t("chaptersLabel")}
            count={chapters.length}
            icon="format_list_numbered"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {chapters.map((c) => (
              <ChapterCard key={c.slug} chapter={c} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* ── Appendices ── */}
      {appendices.length > 0 && (
        <section className="mb-12">
          <SectionHeading
            label={t("appendixLabel")}
            count={appendices.length}
            icon="library_books"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {appendices.map((a) => (
              <ChapterCard key={a.slug} chapter={a} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* ── Empty fallback (shouldn't happen — index.json always seeds ch 0) ── */}
      {chapters.length === 0 && appendices.length === 0 && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/20 text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3 block">
            inventory_2
          </span>
          <p className="text-sm text-on-surface-variant">{t("empty")}</p>
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  label,
  count,
  icon,
}: {
  label: string;
  count: number;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="material-symbols-outlined text-on-surface-variant/60 text-base">
        {icon}
      </span>
      <h2 className="font-label text-xs font-black uppercase tracking-[0.18em] text-on-surface-variant">
        {label}
      </h2>
      <span className="font-mono text-[10px] text-on-surface-variant/50">
        {count}
      </span>
      <div className="flex-1 h-px bg-outline-variant/20 ml-2" />
    </div>
  );
}

function ChapterCard({
  chapter,
  t,
}: {
  chapter: IndexChapter & { hasFile: boolean; localisedFile: string | null };
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const isAppendix = chapter.isAppendix;
  const orderLabel = isAppendix
    ? `A${chapter.order}`
    : chapter.order.toString().padStart(2, "0");

  return (
    <Link
      href={`/manual/${chapter.slug}`}
      className="group glass-panel block p-5 rounded-2xl border border-outline-variant/15 hover:border-primary/40 hover:bg-surface-container-high transition-all"
    >
      <div className="flex items-start gap-4">
        <div
          className={
            "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-sm border " +
            (isAppendix
              ? "bg-secondary/10 border-secondary/30 text-secondary"
              : "bg-primary/10 border-primary/30 text-primary")
          }
        >
          {orderLabel}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="font-headline font-bold text-base text-on-surface group-hover:text-primary transition-colors truncate">
              {chapter.titleLocalized}
            </h3>
            {chapter.hattrickEquivalent && (
              <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant/50 shrink-0">
                ≈ {chapter.hattrickEquivalent}
              </span>
            )}
          </div>
          {chapter.relatedChapters && chapter.relatedChapters.length > 0 && (
            <p className="font-mono text-[10px] text-on-surface-variant/50">
              {t("relatedCount", {
                count: chapter.relatedChapters.length,
              })}
            </p>
          )}
        </div>
        <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0">
          arrow_forward
        </span>
      </div>
    </Link>
  );
}
