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
    accent: "border-l-secondary",
    bg: "bg-secondary/10",
    icon: "swap_horiz",
    labelKey: "league.recentEvents.types.transfer",
    labelColor: "text-secondary",
  },
  MATCH_RESULT: {
    accent: "border-l-primary",
    bg: "bg-primary/10",
    icon: "sports_score",
    labelKey: "league.recentEvents.types.matchResult",
    labelColor: "text-primary",
  },
  PRIZE_MONEY: {
    accent: "border-l-tertiary",
    bg: "bg-tertiary/10",
    icon: "emoji_events",
    labelKey: "league.recentEvents.types.prizeMoney",
    labelColor: "text-tertiary",
  },
} as const;

export default function RecentEvents({ news }: RecentEventsProps) {
  const t = useTranslations();
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const hasNews = news.length > 0;

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="font-label text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            {t('league.sections.recentEvents')}
          </span>
          {hasNews && (
            <span className="font-label text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
              · {news.length}
            </span>
          )}
        </div>
      </div>

      {hasNews ? (
        <div className="space-y-2.5">
          {news.map((item) => {
            const style = TYPE_STYLES[item.type] || TYPE_STYLES.PRIZE_MONEY;
            return (
              <article
                key={item.id}
                className={`glass-panel rounded-2xl p-4 border-l-2 ${style.accent} group cursor-pointer hover:border-white/15 transition-all`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-lg ${style.bg} flex items-center justify-center ${style.labelColor}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {style.icon}
                      </span>
                    </div>
                    <span
                      className={`font-label text-[9px] font-headline uppercase font-black tracking-[0.25em] ${style.labelColor}`}
                    >
                      {t(style.labelKey)}
                    </span>
                  </div>
                  <span className="font-label text-[9px] text-on-surface-variant/70 mt-1">
                    {item.timeAgo}
                  </span>
                </div>
                <h4 className="font-headline text-sm font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">
                  {item.title}
                </h4>
                {/* Render description with embedded links for transfer events */}
                {item.type === 'TRANSFER' ? (
                  <TransferDescription item={item} locale={locale} />
                ) : (
                  <p className="font-body text-xs text-on-surface-variant leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                )}
                {/* Links for match result events */}
                {item.type === 'MATCH_RESULT' && item.matchId && (
                  <div className="mt-2.5 pt-2 border-t border-white/5">
                    <Link
                      href={`/${locale}/matches/${item.matchId}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-fixed font-medium transition-colors"
                    >
                      {t("league.recentEvents.viewMatch")}
                      <span className="material-symbols-outlined text-sm">
                        arrow_forward
                      </span>
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 mb-3">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
              inbox
            </span>
          </div>
          <p className="font-headline text-sm font-bold text-on-surface mb-1">
            {t('league.sections.noEvents')}
          </p>
        </div>
      )}
    </section>
  );
}

function TransferDescription({ item, locale }: { item: LeagueNewsItem; locale: string }) {
  const { playerId, playerName, fromTeam, toTeam } = item;

  const parts: React.ReactNode[] = [];
  const text = item.description || '';
  let lastIndex = 0;

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

  matches.sort((a, b) => a.start - b.start);

  for (const match of matches) {
    if (match.start > lastIndex) {
      parts.push(text.slice(lastIndex, match.start));
    }
    const href = match.type === 'player' ? `/${locale}/players/${match.id}` : `/${locale}/dashboard?team=${match.id}`;
    parts.push(
      <Link key={`${match.type}-${match.id}`} href={href} className="text-primary hover:text-primary-fixed underline">
        {match.name}
      </Link>,
    );
    lastIndex = match.end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <p className="font-body text-xs text-on-surface-variant leading-relaxed line-clamp-2">
      {parts.length > 0 ? parts : text}
    </p>
  );
}
