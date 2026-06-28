"use client";

import Link from "next/link";
import type { ForumCategory } from "@/lib/forum-api";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

interface CategoryCardProps {
  category: ForumCategory;
}

export default function CategoryCard({ category }: CategoryCardProps) {
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const t = useTranslations("forum");

  return (
    <Link
      href={`/${locale}/forum/${category.slug}`}
      className="glass-panel group block p-6 rounded-2xl border border-outline-variant/10 hover:border-[#a1ffc2]/40 hover:bg-[#003328] transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center justify-center shrink-0 group-hover:border-[#a1ffc2]/40 transition-colors">
          <span className="material-symbols-outlined text-[#a1ffc2]">forum</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-headline font-bold text-lg text-[#d3f5e8] leading-tight mb-1 group-hover:text-[#a1ffc2] transition-colors">
            {category.name}
          </h3>
          {category.description && (
            <p className="font-body text-sm text-on-surface-variant mb-3 line-clamp-2">
              {category.description}
            </p>
          )}
          <div className="flex items-center gap-4 font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">chat_bubble</span>
              {t("threadCount_other", { count: category.threadCount })}
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">forum</span>
              {t("postCount_other", { count: category.postCount })}
            </span>
          </div>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-[#a1ffc2] group-hover:translate-x-1 transition-all">
          chevron_right
        </span>
      </div>
    </Link>
  );
}