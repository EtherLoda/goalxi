"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import type { Standing } from "@/lib/api";
import { useGameStore } from "@/stores/gameStore";
import { FormChipStrip, type FormResult } from "@/components/match/FormChipStrip";

interface StandingsTableProps {
  standings: Standing[];
  userTeamId?: string;
  locale?: string;
}

const ZONE_COLORS = {
  promote: "#00e479",
  promotePlayoff: "#a3e635",
  relPlayoff: "#fbbf24",
  rel: "#ffb4ab",
};

export default function StandingsTable({
  standings,
  userTeamId,
  locale = "en",
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

  const getZone = (pos: number): keyof typeof ZONE_COLORS | null => {
    if (pos === 1) return "promote";
    if (pos === 2) return "promotePlayoff";
    if (pos >= 9 && pos <= 12) return "relPlayoff";
    if (pos >= 13) return "rel";
    return null;
  };

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="font-headline text-base font-black tracking-tight text-on-surface">
            {t("league.standings.title")}
          </h3>

          {/* Zone legend */}
          <div className="flex items-center gap-3 flex-wrap">
            <ZoneLegend color={ZONE_COLORS.promote} label={t("league.standings.promote")} />
            <ZoneLegend color={ZONE_COLORS.promotePlayoff} label={t("league.standings.promotePlayoff")} />
            <ZoneLegend color={ZONE_COLORS.relPlayoff} label={t("league.standings.relPlayoff")} />
            <ZoneLegend color={ZONE_COLORS.rel} label={t("league.standings.rel")} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10">
            <tr className="text-[9px] font-label font-black uppercase tracking-[0.2em] text-on-surface-variant/70 border-b border-white/5 bg-surface-container/80 backdrop-blur-md">
              <th className="pb-2 pl-5 pr-2 w-10">#</th>
              <th className="pb-2 pr-4">{t("league.standings.club")}</th>
              <th className="pb-2 text-center w-10">{t("league.standings.pl")}</th>
              <th className="pb-2 text-center w-8">{t("league.standings.w")}</th>
              <th className="pb-2 text-center w-8">{t("league.standings.d")}</th>
              <th className="pb-2 text-center w-8">{t("league.standings.l")}</th>
              <th className="pb-2 text-center w-10">{t("league.standings.gd")}</th>
              <th className="pb-2 text-center w-10 font-black text-on-surface">
                {t("league.standings.pts")}
              </th>
              <th className="pb-2 pl-4 text-center w-32">{t("league.standings.form")}</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {standings.map((row) => {
              const zone = getZone(row.position);
              const isUserTeam = row.teamId === userTeamId;
              const isViewingTeam = isCurrentViewTeam(row.teamId);

              const formResults: FormResult[] = (row.recentMatches ?? [])
                .slice(-5)
                .map((m) => (m.result === 'W' || m.result === 'D' || m.result === 'L' ? m.result : 'pending'));

              return (
                <tr
                  key={row.teamId}
                  className={clsx(
                    'border-b border-white/5 transition-colors',
                    isViewingTeam && 'bg-primary/10',
                    isUserTeam && !isViewingTeam && 'bg-primary/5',
                  )}
                >
                  {/* Position */}
                  <td
                    className={clsx(
                      'py-3 pl-5 pr-2 font-headline font-black text-sm',
                      !zone && 'text-on-surface-variant',
                    )}
                    style={zone ? { color: ZONE_COLORS[zone] } : {}}
                  >
                    {String(row.position).padStart(2, '0')}
                  </td>

                  {/* Club */}
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1 h-5 rounded-full shrink-0"
                        style={{ backgroundColor: zone ? ZONE_COLORS[zone] : 'transparent' }}
                      />
                      <span
                        className={clsx(
                          'font-bold cursor-pointer hover:text-primary transition-colors truncate',
                          isViewingTeam
                            ? 'text-primary'
                            : isUserTeam
                              ? 'text-primary/80'
                              : 'text-on-surface',
                        )}
                        onClick={() => handleTeamClick(row.teamId)}
                      >
                        {row.teamName || `Club ${row.teamId.slice(0, 6)}`}
                      </span>
                      {isViewingTeam && !isUserTeam && (
                        <span className="font-label text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-primary/20 text-primary rounded shrink-0">
                          {t('league.viewing')}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Played */}
                  <td className="py-3 text-center font-headline text-on-surface-variant">
                    {row.played}
                  </td>

                  {/* Wins */}
                  <td className="py-3 text-center">{row.wins}</td>

                  {/* Draws */}
                  <td className="py-3 text-center">{row.draws}</td>

                  {/* Losses */}
                  <td className="py-3 text-center">{row.losses}</td>

                  {/* Goal Difference */}
                  <td className="py-3 text-center font-headline">
                    <span
                      className={clsx(
                        row.goalDifference > 0 && 'text-primary',
                        row.goalDifference < 0 && 'text-error',
                        row.goalDifference === 0 && 'text-on-surface-variant',
                      )}
                    >
                      {row.goalDifference > 0 ? '+' : ''}
                      {row.goalDifference}
                    </span>
                  </td>

                  {/* Points */}
                  <td className="py-3 text-center font-headline font-black text-primary">
                    {row.points}
                  </td>

                  {/* Recent Form */}
                  <td className="py-3 pl-4">
                    {formResults.length > 0 ? (
                      <FormChipStrip results={formResults} highlightLatest={false} />
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

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/5 flex justify-between items-center">
        <span className="font-label text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant/70">
          {t('league.standings.lastUpdated')}
        </span>
        <div className="flex gap-2">
          <button className="px-3 h-8 bg-surface-container-lowest text-[10px] font-headline font-black uppercase tracking-widest rounded-full hover:bg-surface-container-low transition-colors border border-white/5 text-on-surface-variant">
            {t('league.standings.expand')}
          </button>
          <button className="px-4 h-8 bg-primary text-on-primary text-[10px] font-headline font-black uppercase tracking-widest rounded-full hover:bg-primary-fixed transition-colors shadow-[0_0_14px_rgba(0,228,121,0.35)]">
            {t('league.standings.export')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZoneLegend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-label text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}
