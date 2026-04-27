"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import type { LeagueNewsItem } from "@/lib/api";

interface RecentEventsProps {
  news: (LeagueNewsItem & { timeAgo: string })[];
}

const TYPE_STYLES = {
  TRANSFER: {
    border: "border-l-secondary",
    labelKey: "league.recentEvents.types.transfer",
    labelColor: "text-secondary",
  },
  MATCH_RESULT: {
    border: "border-l-primary",
    labelKey: "league.recentEvents.types.matchResult",
    labelColor: "text-primary",
  },
  PRIZE_MONEY: {
    border: "border-l-primary-dim",
    labelKey: "league.recentEvents.types.prizeMoney",
    labelColor: "text-primary-dim",
  },
};

export default function RecentEvents({ news }: RecentEventsProps) {
  const t = useTranslations();
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const hasNews = news.length > 0;

  return (
    <div className="space-y-4">
      <div className={!hasNews ? "pb-4 border-b border-white/10" : ""}>
        <h2 className="text-2xl font-headline font-extrabold tracking-tight text-on-surface">
          {t("league.recentEvents.title")}
        </h2>
      </div>

      <div className="space-y-3">
        {news.map((item) => {
          const style = TYPE_STYLES[item.type] || TYPE_STYLES.PRIZE_MONEY;
          return (
            <div
              key={item.id}
              className={`glass-panel p-4 rounded-xl border-l-2 ${style.border} group cursor-pointer hover:bg-surface-container-highest transition-all`}
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <span className={`text-[9px] font-headline uppercase font-black tracking-widest ${style.labelColor}`}>
                  {t(style.labelKey)}
                </span>
                <span className="text-[9px] font-label text-on-surface-variant">
                  {item.timeAgo}
                </span>
              </div>
              <h4 className="text-sm font-headline font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">
                {item.title}
              </h4>
              {/* Render description with embedded links for transfer events */}
              {item.type === 'TRANSFER' ? (
                <TransferDescription item={item} locale={locale} />
              ) : (
                <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              )}
              {/* Links for match result events */}
              {item.type === 'MATCH_RESULT' && item.matchId && (
                <div className="mt-2">
                  <Link
                    href={`/${locale}/matches?match=${item.matchId}`}
                    className="text-xs text-primary hover:text-primary/80 underline"
                  >
                    {t("league.recentEvents.viewMatch")}
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransferDescription({ item, locale }: { item: LeagueNewsItem; locale: string }) {
  const { playerId, playerName, fromTeam, toTeam } = item;

  // Build description with proper links using Next.js Link
  const parts: React.ReactNode[] = [];
  const text = item.description || '';
  let lastIndex = 0;

  // Collect all matches
  const matches: { name: string; id: string; type: 'player' | 'team'; start: number; end: number }[] = [];

  if (playerName && playerId) {
    const idx = text.indexOf(playerName);
    if (idx !== -1) {
      matches.push({ name: playerName, id: playerId, type: 'player', start: idx, end: idx + playerName.length });
    }
  }
  if (fromTeam?.name && fromTeam?.id) {
    const idx = text.indexOf(fromTeam.name);
    if (idx !== -1) {
      matches.push({ name: fromTeam.name, id: fromTeam.id, type: 'team', start: idx, end: idx + fromTeam.name.length });
    }
  }
  if (toTeam?.name && toTeam?.id) {
    const idx = text.indexOf(toTeam.name);
    if (idx !== -1) {
      matches.push({ name: toTeam.name, id: toTeam.id, type: 'team', start: idx, end: idx + toTeam.name.length });
    }
  }

  // Sort by start position
  matches.sort((a, b) => a.start - b.start);

  // Build parts
  for (const match of matches) {
    if (match.start > lastIndex) {
      parts.push(text.slice(lastIndex, match.start));
    }
    const href = match.type === 'player' ? `/${locale}/players/${match.id}` : `/${locale}/dashboard?team=${match.id}`;
    parts.push(
      <Link key={`${match.type}-${match.id}`} href={href} className="text-primary hover:text-primary/80 underline">
        {match.name}
      </Link>
    );
    lastIndex = match.end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
      {parts.length > 0 ? parts : text}
    </p>
  );
}
