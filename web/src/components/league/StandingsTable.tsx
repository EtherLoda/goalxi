"use client";

import { useTranslations } from "next-intl";
import type { Standing, Team } from "@/lib/api";

interface StandingsTableProps {
  standings: Standing[];
  teams: Record<string, Team>;
  userTeamId?: string;
}

const ZONE_COLORS = {
  ucl: "#00e479",   // UCL zone - primary
  uel: "#ffdb9d",   // UEL zone - secondary
  rel: "#ffb4ab",   // Relegation - error
};

export default function StandingsTable({
  standings,
  teams,
  userTeamId,
}: StandingsTableProps) {
  const t = useTranslations();

  const getZone = (pos: number): keyof typeof ZONE_COLORS | null => {
    if (pos <= 4) return "ucl";
    if (pos <= 6) return "uel";
    if (pos >= 17) return "rel";
    return null;
  };

  const getZoneLabel = (zone: keyof typeof ZONE_COLORS | null): string => {
    if (zone === "ucl") return "UCL";
    if (zone === "uel") return "UEL";
    if (zone === "rel") return "REL";
    return "";
  };

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
                style={{ backgroundColor: ZONE_COLORS.ucl }}
              />
              <span className="text-[9px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
                {t("league.standings.ucl")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: ZONE_COLORS.uel }}
              />
              <span className="text-[9px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
                {t("league.standings.uel")}
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
