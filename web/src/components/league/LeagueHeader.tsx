"use client";

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { clsx } from "clsx";
import type { LeagueContext, LeagueNeighbour } from "@/lib/api";

interface LeagueHeaderProps {
  leagueName: string;
  season: number;
  /**
   * Current MATCHDAY (1-based) within the season, not the matchweek.
   * A matchweek holds three matchdays, so "第 1 / 10 轮" was counting weeks
   * into a slot labelled as rounds.
   */
  matchweek: number;
  /** Total matchdays in the season. */
  totalMatchweeks: number;
  /** Matchdays already finished, for the progress bar. */
  matchdaysPlayed?: number;
  /** Optional: name of the team being viewed (when not on your own team). */
  /** Locale for menu hrefs. */
  locale: string;
  /** League id — used to build the /history href. */
  leagueId: string;
  /**
   * Pyramid position + neighbours. Absent while loading, in which case the
   * navigation strip renders as a row of disabled steps rather than
   * disappearing (a control that blinks in is worse than one that is
   * briefly unusable).
   */
  context?: LeagueContext | null;
}

/**
 * League hero header shown above the main league content.
 *
 * Carries league-level identity, the pyramid navigation strip (move between
 * divisions of the same tier, or up/down a tier) and matchweek progress.
 * The tab navigation lives in RightColumn.
 */
export default function LeagueHeader({
  leagueName,
  season,
  matchweek,
  totalMatchweeks,
  matchdaysPlayed,
  locale,
  leagueId,
  context,
}: LeagueHeaderProps) {
  const t = useTranslations();

  // Played/total, not current/total: a progress bar that counts the
  // matchday you are ON shows 1/30 before a single ball is kicked.
  const played = matchdaysPlayed ?? Math.max(0, matchweek - 1);
  const progressPct = Math.min(
    100,
    Math.round((played / Math.max(1, totalMatchweeks)) * 100),
  );

  return (
    <header className="relative overflow-hidden glass-panel rounded-2xl p-6">
      <div className="absolute top-3 right-3 z-20">
        <MoreMenu locale={locale} leagueId={leagueId} />
      </div>

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between pr-12">
        <div className="min-w-0 space-y-2">
          <span className="font-label text-kicker font-black uppercase tracking-[0.3em] text-primary">
            {t("league.hero.kicker")}
          </span>
          <h1 className="font-headline text-2xl md:text-3xl font-black tracking-tighter text-on-surface uppercase italic leading-none">
            {leagueName}
          </h1>

          <LeagueNav context={context} locale={locale} />

        </div>

        <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
          <span className="font-label text-kicker font-black uppercase tracking-[0.25em] text-on-surface-variant/70">
            {t("league.hero.round", { round: matchweek, total: totalMatchweeks })}
          </span>
          <span className="font-headline text-2xl font-black text-on-surface leading-none">
            S{season}
          </span>
        </div>
      </div>

      <div className="relative z-10 mt-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-label text-kicker font-black uppercase tracking-[0.2em] text-on-surface-variant/70">
            {t("league.hero.completed", {
              completed: played,
              total: totalMatchweeks,
            })}
          </span>
          <span className="font-label text-kicker font-black uppercase tracking-[0.2em] text-primary">
            {progressPct}%
          </span>
        </div>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary shadow-[0_0_10px_rgba(0,228,121,0.5)] transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * The pyramid strip: `‹ 48 | level 4 · 49 of 64 | 50 ›` for sideways moves,
 * then `▲ level 3` / `▼ level 5` for vertical ones.
 *
 * Sideways keeps you inside one tier — the thing you do when comparing your
 * own division against its siblings. Vertical is a jump in class, so it gets
 * a separator and a different glyph.
 */
function LeagueNav({
  context,
  locale,
}: {
  context?: LeagueContext | null;
  locale: string;
}) {
  const t = useTranslations();

  const href = (target: LeagueNeighbour) =>
    `/${locale}/league/${target.id}`;

  // Without the context row there is no pyramid position to report and no
  // neighbours to name, so the whole strip stays out of the layout rather
  // than rendering a row of dead arrows and a lone dash.
  if (!context) return null;

  return (
    <nav
      aria-label={t("league.nav.label")}
      className="flex flex-wrap items-center gap-1.5 pt-1"
    >
      <NavStep
        href={context?.prev ? href(context.prev) : null}
        icon="arrow_back"
        hint={t("league.nav.prev")}
        label={
          context?.prev
            ? t("league.nav.division", { n: context.prev.tierDivision })
            : t("league.nav.prevShort")
        }
        ariaLabel={
          context?.prev
            ? t("league.nav.goTo", {
                tier: context.prev.tier,
                n: context.prev.tierDivision,
              })
            : undefined
        }
      />

      <span
        className={clsx(
          "inline-flex h-7 items-center rounded-lg px-2.5",
          "bg-white/[0.04] font-label text-kicker font-black uppercase tracking-[0.14em]",
          "text-on-surface-variant tabular-nums",
        )}
      >
        {t("league.nav.position", {
          tier: context.league.tier,
          division: context.league.tierDivision,
          total: context.divisionsInTier,
        })}
      </span>

      <NavStep
        href={context?.next ? href(context.next) : null}
        icon="arrow_forward"
        hint={t("league.nav.next")}
        label={
          context?.next
            ? t("league.nav.division", { n: context.next.tierDivision })
            : t("league.nav.nextShort")
        }
        ariaLabel={
          context?.next
            ? t("league.nav.goTo", {
                tier: context.next.tier,
                n: context.next.tierDivision,
              })
            : undefined
        }
      />

      <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />

      <NavStep
        href={context?.up ? href(context.up) : null}
        icon="expand_less"
        hint={t("league.nav.up")}
        label={
          context?.up
            ? t("league.nav.tier", { tier: context.up.tier })
            : t("league.nav.upShort")
        }
        ariaLabel={
          context?.up
            ? t("league.nav.goTo", {
                tier: context.up.tier,
                n: context.up.tierDivision,
              })
            : undefined
        }
      />
      <NavStep
        href={context?.down ? href(context.down) : null}
        icon="expand_more"
        hint={t("league.nav.down")}
        label={
          context?.down
            ? t("league.nav.tier", { tier: context.down.tier })
            : t("league.nav.downShort")
        }
        ariaLabel={
          context?.down
            ? t("league.nav.goTo", {
                tier: context.down.tier,
                n: context.down.tierDivision,
              })
            : undefined
        }
      />
    </nav>
  );
}

/**
 * One step of the pyramid strip. Renders a link when the neighbour exists and
 * a disabled chip when the league is at the edge of the pyramid — the control
 * keeps its size either way so the row does not reflow as you move.
 */
function NavStep({
  href,
  icon,
  hint,
  label,
  ariaLabel,
}: {
  href: string | null;
  icon: MaterialIconName;
  hint: string;
  label: string;
  ariaLabel?: string;
}) {
  const base = clsx(
    "inline-flex h-7 items-center gap-1 rounded-lg px-2",
    "font-label text-kicker font-bold tabular-nums",
  );

  if (!href) {
    return (
      <span
        aria-disabled="true"
        title={hint}
        className={clsx(base, "text-outline/40 cursor-not-allowed")}
      >
        <AppIcon name={icon} className="text-[14px]" />
        <span className="hidden sm:inline">{label}</span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      title={hint}
      aria-label={ariaLabel ?? hint}
      className={clsx(
        base,
        "bg-white/[0.04] text-on-surface-variant",
        "hover:bg-white/[0.08] hover:text-on-surface transition-colors",
      )}
    >
      <AppIcon name={icon} className="text-[14px]" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

/**
 * "More" overflow menu — three-dot button in the top-right that opens
 * a glass dropdown. Currently exposes a single "History" item.
 */
function MoreMenu({ locale, leagueId }: { locale: string; leagueId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("league.hero.more")}
        className={clsx(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-full",
          "glass-panel border border-white/10",
          "font-label text-kicker font-black uppercase tracking-[0.2em]",
          "text-on-surface-variant hover:text-on-surface hover:border-white/20",
          "transition-colors",
        )}
        data-testid="league-more-menu-trigger"
      >
        <AppIcon name="more_horiz" className="text-base" />
        <span className="hidden sm:inline">{t("league.hero.more")}</span>
      </button>

      {open && (
        <div
          role="menu"
          className={clsx(
            "absolute right-0 top-full mt-2 min-w-[180px] z-30",
            "glass-panel rounded-xl border border-white/10 shadow-2xl",
            "py-1 overflow-hidden",
          )}
          data-testid="league-more-menu"
        >
          <Link
            href={`/${locale}/league/${leagueId}/history`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2.5",
              "font-headline text-xs font-bold uppercase tracking-wider",
              "text-on-surface hover:bg-white/5 transition-colors",
            )}
          >
            <AppIcon name="history" className="text-base text-primary" />
            <span>{t("league.hero.menu.history")}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
