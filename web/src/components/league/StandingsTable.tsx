"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import type { Standing } from "@/lib/api";
import type { LeagueZoneModel } from "@/lib/league-zones";
import { zoneForPosition, zonesPresent } from "@/lib/league-zones";
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

const ZONE_COLORS = {
  promote: "#00e479",
  promotePlayoff: "#a1ffc2",
  relPlayoff: "#ffcc66",
  rel: "#ffb4ab",
} as const;

const ZONE_ICONS: Record<keyof typeof ZONE_COLORS, MaterialIconName> = {
  promote: "expand_less",
  promotePlayoff: "swap_vert",
  relPlayoff: "swap_vert",
  rel: "expand_more",
};

const ZONE_LABEL_KEYS: Record<keyof typeof ZONE_COLORS, string> = {
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
    const isOwnTeam = clickedTeamId === userTeamId;
    setViewTeam(isOwnTeam ? userTeamId : clickedTeamId);
    router.push(`/${locale}/dashboard?team=${clickedTeamId}`);
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
          <h3 className="font-headline text-base font-black tracking-tight text-on-surface">
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
          <tbody className="text-sm">
            {standings.map((row) => {
              const zone = zoneForPosition(
                row.position,
                zones,
                standings.length,
              );
              const isUserTeam = row.teamId === userTeamId;
              const isViewingTeam = isCurrentViewTeam(row.teamId);

              const formResults: FormResult[] = (row.recentMatches ?? [])
                .slice(-5)
                .map((m) =>
                  m.result === "W" || m.result === "D" || m.result === "L"
                    ? m.result
                    : "pending",
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
                  {/* Position + the zone rail Hattrick made famous: a colour
                      stripe down the edge of the row, and an arrow that says
                      which way the club can move. */}
                  <td className="relative py-3 pl-4 pr-1">
                    {zone && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                        style={{ backgroundColor: ZONE_COLORS[zone] }}
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-flex w-3.5 shrink-0 justify-center"
                        style={zone ? { color: ZONE_COLORS[zone] } : undefined}
                      >
                        {zone && (
                          <AppIcon
                            name={ZONE_ICONS[zone]}
                            className="text-[13px]"
                          />
                        )}
                      </span>
                      <span
                        className={clsx(
                          "font-headline font-black text-sm tabular-nums",
                          !zone && "text-on-surface-variant",
                        )}
                        style={zone ? { color: ZONE_COLORS[zone] } : undefined}
                      >
                        {String(row.position).padStart(2, "0")}
                      </span>
                    </div>
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

function ZoneLegend({
  zone,
  label,
}: {
  zone: keyof typeof ZONE_COLORS;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex"
        style={{ color: ZONE_COLORS[zone] }}
        aria-hidden
      >
        <AppIcon name={ZONE_ICONS[zone]} className="text-[13px]" />
      </span>
      <span className="font-label text-kicker font-black uppercase tracking-[0.16em] text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}
