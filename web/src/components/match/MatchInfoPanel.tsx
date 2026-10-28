/**
 * MatchInfoPanel — the fixture's dossier: which competition and matchday it
 * is, when it kicks off, where it is played, in what weather, and how many
 * people turned up.
 *
 * Rendered INSIDE the caller's GlassPanel, so it draws no panel of its own.
 *
 * The card is built from three weights, not six equal rows:
 *   1. a header — the competition title alone, in the display face, on its own
 *      line (no id chip: at a 268px rail an id crowds exactly the long league
 *      names that need the width, and the URL already carries the id);
 *   2. a one-line meta strip — `[2026 season · Round 4] 10/27/2026, 02:00 PM`.
 *      The season and matchday are one fact ("which game in the calendar"), so
 *      they share a pill and the kickoff sits beside it; the strip wraps as two
 *      clean units when the rail is too narrow for both. The fact sheet below
 *      is then free to answer "where" and "what weather";
 *   3. an attendance block that carries a shape — big count, fill percentage,
 *      and a bar — so "4,724 / 47%" is read without parsing a number pair.
 *
 * The label-left / value-right table keeps every number on one right-hand
 * column (4,724 / 10,000 / 47% / £151,168), so magnitudes compare directly
 * instead of the eye re-finding the baseline on each row.
 *
 * Every field is optional and rows drop out when absent, so a sparse fixture
 * reads as sparse rather than printing zeros — and the hairlines go with them
 * so an empty fixture never ends on a stray rule.
 */
'use client';

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import React from 'react';

/** The subset of `Match` this card reads. */
export interface MatchInfoSource {
  type?: string | null;
  /** Competition row id — league table / bracket target for the title link. */
  leagueId?: string | null;
  /** Cup bracket id, present on single-match fetches of cup ties. */
  cupId?: string | null;
  leagueName?: string | null;
  /** Season number (1-based). Rendered next to the matchday. */
  season?: number | null;
  round?: number | null;
  cupRound?: number | null;
  scheduledAt?: string | Date | null;
  venue?: string | null;
  /** The venue stadium's own id — the venue link target. */
  stadiumId?: string | null;
  weather?: string | null;
  attendance?: number | null;
  capacity?: number | null;
  ticketRevenue?: number | null;
}

type TFn = ReturnType<typeof useTranslations<'matchInfo'>>;

function weatherIconName(w: string): MaterialIconName {
  switch (w.toLowerCase()) {
    case 'sunny':
      return 'wb_sunny';
    case 'cloudy':
      return 'cloud';
    case 'rainy':
      return 'rainy';
    case 'windy':
      return 'air';
    case 'foggy':
      return 'foggy';
    case 'snowy':
      return 'ac_unit';
    case 'stormy':
      return 'thunderstorm';
    default:
      return 'cloud';
  }
}

/**
 * Competition split into the card's title and its matchday, rather than the
 * single "League · Round 4" string the old rows printed. The title is set in
 * the display face and can wrap; the round moves to its own chip so a long
 * league name never has to share a line with a number.
 */
function competitionParts(
  m: MatchInfoSource,
  t: TFn,
): { title: string; round: number | null } {
  const kind = (m.type ?? 'league') as string;

  switch (kind) {
    case 'cup':
      return { title: t('competitionCup'), round: m.cupRound ?? null };
    case 'playoff':
      return { title: t('competitionPlayoff'), round: null };
    case 'tournament':
      return { title: t('competitionTournament'), round: null };
    case 'friendly':
      return { title: t('competitionFriendly'), round: null };
    case 'national_team':
      return { title: t('competitionNationalTeam'), round: null };
    default:
      // `leagueName` already carries the division in most leagues
      // ("China League One · South"), so it becomes the title verbatim.
      return { title: m.leagueName ?? t('competitionLeague'), round: m.round ?? null };
  }
}

function weatherLabel(w: string, t: TFn): string {
  // Per-type names are flat leaves so the lookup stays type-safe.
  const map: Record<string, string> = {
    sunny: 'weatherSunny',
    cloudy: 'weatherCloudy',
    rainy: 'weatherRainy',
    windy: 'weatherWindy',
    foggy: 'weatherFoggy',
    snowy: 'weatherSnowy',
    stormy: 'weatherStormy',
  };
  const k = map[w.toLowerCase()];
  return k ? t(k) : w;
}

const KICKER = 'text-kicker uppercase tracking-[0.14em] text-muted';

/** Hairline between blocks. The panel border is white/5, so a divider has
 *  to sit a shade above it to read at all on the glass. */
function Rule() {
  return <div className="my-3 h-px bg-white/[0.07]" aria-hidden="true" />;
}

/** One label-left / value-right line of the fact sheet. */
function FactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className={`shrink-0 ${KICKER}`}>{label}</span>
      <span className="min-w-0 break-words text-right text-body leading-snug text-on-surface">
        {children}
      </span>
    </div>
  );
}

export function MatchInfoPanel({ match }: { match?: MatchInfoSource | null }) {
  const t = useTranslations('matchInfo');
  const locale = useLocale();

  if (!match) return null;

  const kickoff =
    match.scheduledAt == null
      ? null
      : new Date(match.scheduledAt).toLocaleString(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

  const hasCapacity = match.capacity != null && match.capacity > 0;
  const fillPct =
    match.attendance != null && hasCapacity
      ? Math.round((match.attendance / (match.capacity as number)) * 100)
      :null;
  // A 0% bar is a legitimate reading (nobody came) and still gets the track;
  // clamp only the upper end so a mis-seeded capacity can't overfill it.
  const barPct = fillPct == null ? null : Math.max(0, Math.min(100, fillPct));

  const competition = competitionParts(match, t);

  // "Which season, which matchday" is one thought, so both live in the same
  // pill and one missing half simply drops its separator.
  const seasonLabel =
    match.season != null ? t('season', { season: match.season }) :null;
  const roundLabel =
    competition.round != null
      ? t('matchday', { round: competition.round })
      :null;
  const calendarLabel = [seasonLabel, roundLabel].filter(Boolean).join(' · ');

  // A cup tie's `leagueId` is the cup's own competition record, not a league
  // table — link by `cupId` so the bracket opens instead of a table page.
  const competitionHref =
    match.type === 'cup'
      ? match.cupId
        ? `/${locale}/cup/${match.cupId}`
        : null
      : match.leagueId
        ? `/${locale}/league/${match.leagueId}`
        : null;
  const venueHref = match.stadiumId
    ? `/${locale}/stadium/${match.stadiumId}`
    :null;

  const hasMeta = calendarLabel.length > 0 || kickoff !=null;
  const hasFacts = Boolean(match.weather || match.venue);
  const hasCrowd = match.attendance !=null;
  const hasRevenue = match.ticketRevenue !=null;

  return (
    <div className="flex flex-col">
      {/* ---------- header: the card's own headline ----------------
          The panel header above already says "Match info", so repeating a
          "Competition" kicker here would stack two labels on one thought —
          the competition *is* the headline. */}
      <h4 className="font-headline text-title font-semibold leading-snug text-on-surface">
        {competitionHref ? (
          <Link
            href={competitionHref}
            className="rounded-sm transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
          >
            {competition.title}
          </Link>
        ) : (
          competition.title
        )}
      </h4>

      {/* ---------- meta strip: season + matchday + kickoff -------------- */}
      {hasMeta && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {calendarLabel && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-[1px] text-label tracking-wide text-on-surface-variant">
              {calendarLabel}
            </span>
          )}
          {kickoff && (
            <time
              dateTime={match.scheduledAt ? String(match.scheduledAt) : undefined}
              className="text-label tabular-nums text-on-surface-variant"
            >
              {kickoff}
            </time>
          )}
        </div>
      )}

      {(hasFacts || hasCrowd) && <Rule />}

      {/* ---------- fact sheet: where, and in what weather -------------- */}
      {hasFacts && (
        <div className="flex flex-col">
          {match.weather && (
            <FactRow label={t('weather')}>
              <span className="inline-flex items-center gap-1.5">
                <AppIcon
                  name={weatherIconName(match.weather)}
                  className="text-label text-muted"
                />
                {weatherLabel(match.weather, t)}
              </span>
            </FactRow>
          )}
          {match.venue && (
            <FactRow label={t('venue')}>
              {venueHref ? (
                <Link
                  href={venueHref}
                  className="rounded-sm transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:outline-none"
                >
                  {match.venue}
                </Link>
              ) : (
                match.venue
              )}
            </FactRow>
          )}
        </div>
      )}

      {/* ---------- attendance: the one block with a shape -------------- */}
      {hasCrowd && (
        <div>
          {hasFacts && <Rule />}
          <div className="flex items-baseline justify-between gap-3">
            <span className={KICKER}>{t('attendance')}</span>
            {fillPct != null && (
              <span className="text-label font-medium tabular-nums text-primary">
                {fillPct}%
              </span>
            )}
          </div>

          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-title font-semibold tabular-nums text-on-surface">
              {match.attendance?.toLocaleString()}
            </span>
            {hasCapacity && (
              <span className="text-label tabular-nums text-muted">
                {'/ ' + (match.capacity as number).toLocaleString()}
              </span>
            )}
          </div>

          {barPct != null && (
            <div
              role="progressbar"
              aria-label={t('attendance')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={barPct}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${barPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ---------- gate receipts -------------------------------------- */}
      {hasRevenue && (
        <div className="mt-3 border-t border-white/[0.07] pt-2.5">
          <FactRow label={t('revenue')}>
            <span className="font-medium tabular-nums">
              {'£' + (match.ticketRevenue as number).toLocaleString()}
            </span>
          </FactRow>
        </div>
      )}
    </div>
  );
}
