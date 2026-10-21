"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import type { Standing } from "@/lib/api";
import type { LeagueZone, LeagueZoneModel } from "@/lib/league-zones";
import { zoneForPosition, zonesPresent } from "@/lib/league-zones";
import { clubHref } from "@/lib/team-view";
import { useGameStore } from "@/stores/gameStore";
import { FormChipStrip, type FormResult } from "@/components/match/FormChipStrip";

interface StandingsTableProps {
  standings: Standing[];
  userTeamId?: string;
  locale?: string;
  /**
   * Where the promotion / relegation cut-offs sit for THIS league. Without
   * it the table falls back to the default 16-team shape, which is a guess —
   * every real caller passes it.
   */
  zones?: LeagueZoneModel | null;
}


/**
 * Rank badge per zone. A club outside every zone gets no badge at all — the
 * badge is the zone marker, so printing one for "9th, nothing happens" would
 * mean colouring a shape for the absence of news.
 */
const ZONE_BADGE: Record<LeagueZone, string> = {
  promote: "bg-primary text-on-primary",
  promotePlayoff:
    "bg-primary/20 text-primary ring-1 ring-inset ring-primary/40",
  relPlayoff:
    "bg-signal-gold/25 text-signal-gold ring-1 ring-inset ring-signal-gold/40",
  rel: "bg-error-dim text-white",
};

const ZONE_SWATCH: Record<LeagueZone, string> = {
  promote: "bg-primary",
  promotePlayoff: "bg-primary/30 ring-1 ring-inset ring-primary/50",
  relPlayoff: "bg-signal-gold/40 ring-1 ring-inset ring-signal-gold/50",
  rel: "bg-error-dim",
};

const ZONE_LABEL_KEYS: Record<LeagueZone, string> = {
  promote: "league.standings.promote",
  promotePlayoff: "league.standings.promotePlayoff",
  relPlayoff: "league.standings.relPlayoff",
  rel: "league.standings.rel",
};

export default function StandingsTable({
  standings,
  userTeamId,
  locale = "en",
  zones = null,
}: StandingsTableProps) {
  const t = useTranslations();
  const router = useRouter();
  const { viewTeamId, setViewTeam } = useGameStore();

  const handleTeamClick = (clickedTeamId: string) => {
    setViewTeam(clickedTeamId);
    router.push(clubHref(locale, clickedTeamId));
  };

  const isCurrentViewTeam = (teamId: string) => {
    return viewTeamId ? viewTeamId === teamId : teamId === userTeamId;
  };

  // Only advertise the zones this league actually has: 晋级 means nothing in
  // the top flight, and 降级 means nothing in the bottom tier.
  const legendZones = zonesPresent(zones, standings.length);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="font-headline text-sm font-black tracking-tight text-on-surface">
            {t("league.standings.title")}
          </h3>

          <div className="flex items-center gap-3 flex-wrap">
            {legendZones.map((zone) => (
              <ZoneLegend
                key={zone}
                zone={zone}
                label={t(ZONE_LABEL_KEYS[zone])}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-y-auto custom-scrollbar">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10">
            <tr className="font-label text-kicker font-black uppercase tracking-[0.2em] text-on-surface-variant/70 border-b border-white/5 bg-surface-container/80 backdrop-blur-md">
              <th className="pb-2 pl-4 pr-1 w-14">#</th>
              <th className="pb-2 pr-4">{t("league.standings.club")}</th>
              <th className="pb-2 text-center w-10">{t("league.standings.pl")}</th>
              <th className="pb-2 text-center w-8">{t("league.standings.w")}</th>
              <th className="pb-2 text-center w-8">{t("league.standings.d")}</th>
              <th className="pb-2 text-center w-8">{t("league.standings.l")}</th>
              <th className="pb-2 text-center w-10">{t("league.standings.gd")}</th>
              <th className="pb-2 text-center w-10 font-black text-on-surface">
                {t("league.standings.pts")}
              </th>
              <th className="pb-2 pl-4 text-center w-32">
                {t("league.standings.form")}
              </th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {standings.map((row) => {
              const zone = zoneForPosition(
                row.position,
                zones,
                standings.length,
              );
              const isUserTeam = row.teamId === userTeamId;
              const isViewingTeam = isCurrentViewTeam(row.teamId);

              const recent = (row.recentMatches ?? []).slice(-5);

              const formResults: FormResult[] = recent.map((m) =>
                m.result === "W" || m.result === "D" || m.result === "L"
                  ? m.result
                  : "pending",
              );

              // Each chip links to its match and carries the fixture as a
              // hover card: the result alone says who won, not against whom,
              // and the strip has no room for names.
              const formLinks = recent.map((m) =>
                m.matchId
                  ? {
                      href: `/${locale}/matches/${m.matchId}`,
                      fixture: m.isHome
                        ? `${row.teamName} ${m.homeScore} - ${m.awayScore} ${m.opponentName}`
                        : `${m.opponentName} ${m.homeScore} - ${m.awayScore} ${row.teamName}`,
                      date: formatMatchDate(m.scheduledAt),
                    }
                  : null,
              );

              return (
                <tr
                  key={row.teamId}
                  className={clsx(
                    "border-b border-white/5 transition-colors",
                    isViewingTeam && "bg-primary/10",
                    isUserTeam && !isViewingTeam && "bg-primary/5",
                  )}
                >
                  {/* Position, as a zone-coloured badge: the rank itself
                      carries the promotion / relegation information, so the
                      row needs no separate rail or arrow. */}
                  <td className="py-2 pl-4 pr-1">
                    <RankBadge position={row.position} zone={zone} />
                  </td>

                  {/* Club */}
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          "font-bold cursor-pointer hover:text-primary transition-colors truncate",
                          isViewingTeam
                            ? "text-primary"
                            : isUserTeam
                              ? "text-primary/80"
                              : "text-on-surface",
                        )}
                        onClick={() => handleTeamClick(row.teamId)}
                      >
                        {row.teamName || `Club ${row.teamId.slice(0, 6)}`}
                      </span>
                      {isViewingTeam && !isUserTeam && (
                        <span className="font-label text-kicker font-black uppercase tracking-widest px-1.5 py-0.5 bg-primary/20 text-primary rounded shrink-0">
                          {t("league.viewing")}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 text-center font-headline text-on-surface-variant">
                    {row.played}
                  </td>

                  <td className="py-3 text-center">{row.wins}</td>

                  <td className="py-3 text-center">{row.draws}</td>

                  <td className="py-3 text-center">{row.losses}</td>

                  <td className="py-3 text-center font-headline">
                    <span
                      className={clsx(
                        row.goalDifference > 0 && "text-primary",
                        row.goalDifference < 0 && "text-error",
                        row.goalDifference === 0 && "text-on-surface-variant",
                      )}
                    >
                      {row.goalDifference > 0 ? "+" : ""}
                      {row.goalDifference}
                    </span>
                  </td>

                  <td className="py-3 text-center font-headline font-black text-primary">
                    {row.points}
                  </td>

                  <td className="py-3 pl-4">
                    {formResults.length > 0 ? (
                      <FormChipStrip
                        results={formResults}
                        highlightLatest={false}
                        variant="glyph"
                        size="sm"
                        links={formLinks}
                      />
                    ) : (
                      <span className="text-on-surface-variant text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatMatchDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

function RankBadge({
  position,
  zone,
}: {
  position: number;
  zone: LeagueZone | null;
}) {
  // No zone, no badge: an unmarked rank is not a state, it is the absence of
  // one, and a grey badge for it would compete with the four that mean
  // something.
  if (!zone) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center font-headline text-xs font-black tabular-nums text-on-surface-variant/70">
        {position}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "relative inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-md",
        "font-headline text-xs font-black tabular-nums",
        ZONE_BADGE[zone],
      )}
    >
      {/* The leader's badge carries the diagonal cut from the reference:
          same zone colour, but it also says "this is the top of the table",
          which a promotion colour alone does not. */}
      {position === 1 && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.30) 46%, transparent 46%)",
          }}
        />
      )}
      <span className="relative">{position}</span>
    </span>
  );
}

function ZoneLegend({
  zone,
  label,
}: {
  zone: LeagueZone;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={clsx("inline-flex h-3 w-3 rounded-sm", ZONE_SWATCH[zone])}
        aria-hidden
      />
      <span className="font-label text-kicker font-black uppercase tracking-[0.16em] text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}
