"use client";

import { useTranslations } from "next-intl";
import type { Standing, Team } from "@/lib/api";

interface StandingsTableProps {
  standings: Standing[];
  teams: Record<string, Team>;
  userTeamId?: string;
}

const ZONE_COLORS = {
  promote: "#00e479",   // Promotion - primary
  promotePlayoff: "#a3e635",   // Promotion playoffs - lime
  relPlayoff: "#fbbf24",   // Relegation playoffs - amber
  rel: "#ffb4ab",   // Relegation - error
};

export default function StandingsTable({
  standings,
  teams,
  userTeamId,
}: StandingsTableProps) {
  const t = useTranslations();

  const getZone = (pos: number): keyof typeof ZONE_COLORS | null => {
    if (pos === 1) return "promote";
    if (pos === 2) return "promotePlayoff";
    if (pos >= 9 && pos <= 12) return "relPlayoff";
    if (pos >= 13) return "rel";
    return null;
  };

  const getZoneLabel = (zone: keyof typeof ZONE_COLORS | null): string => {
    if (zone === "promote") return "PROMO";
    if (zone === "promotePlayoff") return "P.PLAYOFF";
    if (zone === "relPlayoff") return "R.PLAYOFF";
    if (zone === "rel") return "RELEG";
    return "";
  };

  // Recent form icons with hover showing scores
  function RecentFormIcons({ recentMatches }: { recentMatches: Standing['recentMatches'] }) {
    if (!recentMatches || recentMatches.length === 0) {
      return <span className="text-on-surface-variant text-xs">-</span>;
    }

    const icons: Record<string, string> = {
      W: "✓",
      D: "-",
      L: "×",
    };

    const colors: Record<string, string> = {
      W: "#00e479", // win - green
      D: "#8b928f", // draw - gray
      L: "#ffb4ab", // loss - red
    };

    return (
      <div className="flex items-center gap-0.5">
        {recentMatches.slice(0, 5).map((m, i) => (
          <div
            key={i}
            className="relative group"
          >
            <div
              className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-headline font-black cursor-pointer"
              style={{
                backgroundColor: colors[m.result] || "#8b928f",
                color: "#fff",
              }}
            >
              {icons[m.result]}
            </div>
            {/* Hover tooltip for single match */}
            <div className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-surface-container rounded text-[10px] whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <span className="text-on-surface">
                {m.isHome ? 'vs' : '@'} {m.opponentName}
              </span>
              <span className="ml-2 font-mono text-on-surface-variant">
                {m.homeScore} - {m.awayScore}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-black text-base tracking-tight text-on-surface">
            {t("league.standings.title")}
          </h3>

          {/* Zone legend */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ZONE_COLORS.promote }}
              />
              <span className="text-[9px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
                {t("league.standings.promote")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ZONE_COLORS.promotePlayoff }}
              />
              <span className="text-[9px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
                {t("league.standings.promotePlayoff")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ZONE_COLORS.relPlayoff }}
              />
              <span className="text-[9px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
                {t("league.standings.relPlayoff")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ZONE_COLORS.rel }}
              />
              <span className="text-[9px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
                {t("league.standings.rel")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-surface-container z-10">
            <tr className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant/60 border-b border-white/5">
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
              <th className="pb-2 pl-4 text-center w-28">{t("league.standings.form")}</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {standings.map((row, idx) => {
              const zone = getZone(row.position);
              const isUserTeam = row.teamId === userTeamId;
              const isLast = idx === standings.length - 1;

              return (
                <tr
                  key={row.teamId}
                  className={`
                    border-b border-white/5 transition-colors
                    ${isUserTeam ? "bg-primary/5" : ""}
                    ${!isLast ? "" : ""}
                  `}
                >
                  {/* Position */}
                  <td
                    className={`py-3 pl-5 pr-2 font-headline font-black ${
                      zone ? "" : "text-on-surface-variant"
                    }`}
                    style={zone ? { color: ZONE_COLORS[zone] } : {}}
                  >
                    {String(row.position).padStart(2, "0")}
                  </td>

                  {/* Club */}
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {/* Zone indicator bar */}
                      {zone && (
                        <span
                          className="w-1 h-4 rounded-full"
                          style={{ backgroundColor: ZONE_COLORS[zone] }}
                        />
                      )}
                      {!zone && <span className="w-1 h-4" />}

                      <span
                        className={`font-bold ${isUserTeam ? "text-primary" : "text-on-surface"}`}
                      >
                        {row.teamName || `Club ${row.teamId.slice(0, 6)}`}
                      </span>
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
                    <span className={row.goalDifference > 0 ? "text-primary" : row.goalDifference < 0 ? "text-error" : "text-on-surface-variant"}>
                      {row.goalDifference > 0 ? "+" : ""}
                      {row.goalDifference}
                    </span>
                  </td>

                  {/* Points */}
                  <td className="py-3 text-center font-headline font-black text-primary">
                    {row.points}
                  </td>

                  {/* Recent Form */}
                  <td className="py-3 pl-4">
                    {row.recentMatches && row.recentMatches.length > 0 ? (
                      <RecentFormIcons recentMatches={row.recentMatches} />
                    ) : (
                      <span className="text-on-surface-variant text-xs">-</span>
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
        <span className="font-label text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
          {t("league.standings.lastUpdated")}
        </span>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-surface-container-lowest text-[10px] font-headline font-bold uppercase tracking-widest rounded-lg hover:bg-surface-container-low transition-colors border border-white/5">
            {t("league.standings.expand")}
          </button>
          <button className="px-3 py-1.5 bg-primary text-on-primary text-[10px] font-headline font-bold uppercase tracking-widest rounded-lg hover:opacity-90 transition-opacity">
            {t("league.standings.export")}
          </button>
        </div>
      </div>
    </div>
  );
}
