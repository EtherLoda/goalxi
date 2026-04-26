"use client";

import { useTranslations } from "next-intl";

interface NewsItem {
  id: string;
  type: "manager" | "transfer" | "general";
  title: string;
  excerpt: string;
  timeAgo: string;
}

interface RecentEventsProps {
  news: NewsItem[];
}

const TYPE_STYLES = {
  manager: {
    border: "border-l-primary-container",
    label: "Manager Update",
    labelColor: "text-primary",
  },
  transfer: {
    border: "border-l-secondary",
    label: "Transfer News",
    labelColor: "text-secondary",
  },
  general: {
    border: "border-l-primary-dim",
    label: "News",
    labelColor: "text-primary-dim",
  },
};

export default function RecentEvents({ news }: RecentEventsProps) {
  const t = useTranslations();
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
          const style = TYPE_STYLES[item.type];
          return (
            <div
              key={item.id}
              className={`glass-panel p-4 rounded-xl border-l-2 ${style.border} group cursor-pointer hover:bg-surface-container-highest transition-all`}
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <span className={`text-[9px] font-headline uppercase font-black tracking-widest ${style.labelColor}`}>
                  {style.label}
                </span>
                <span className="text-[9px] font-label text-on-surface-variant">
                  {item.timeAgo}
                </span>
              </div>
              <h4 className="text-sm font-headline font-bold text-on-surface mb-1 group-hover:text-primary transition-colors">
                {item.title}
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
                {item.excerpt}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
