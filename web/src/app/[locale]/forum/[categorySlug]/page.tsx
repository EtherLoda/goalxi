"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  forumApi,
  ForumCategory,
  ForumThread,
  ForumPagination,
  ThreadSort,
} from "@/lib/forum-api";
import ThreadList from "@/components/forum/ThreadList";

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params.locale as string) || "en";
  const slug = params.categorySlug as string;
  const t = useTranslations("forum");

  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [threads, setThreads] = useState<ForumThread[] | null>(null);
  const [pagination, setPagination] = useState<ForumPagination | null>(null);
  const [sort, setSort] = useState<ThreadSort>("latest");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCategory(null);
    setThreads(null);
    setError(null);

    forumApi
      .getCategoryBySlug(slug)
      .then(async (cat) => {
        if (cancelled) return;
        setCategory(cat);
        const result = await forumApi.listThreads(cat.id, { sort });
        if (cancelled) return;
        setThreads(result.data);
        setPagination(result.pagination);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? t("loadError"));
      });

    return () => {
      cancelled = true;
    };
  }, [slug, sort, t]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mb-4">
        <Link
          href={`/${locale}/forum`}
          className="hover:text-[#a1ffc2] transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-xs">forum</span>
          {t("title")}
        </Link>
        <span className="text-on-surface-variant/40">/</span>
        <span className="text-[#d3f5e8]">{category?.name ?? "..."}</span>
      </nav>

      {error && (
        <div className="glass-panel p-4 mb-6 rounded-2xl border border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        </div>
      )}

      {category && (
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="font-headline font-black text-3xl uppercase tracking-tight text-[#d3f5e8] mb-1">
              {category.name}
            </h1>
            {category.description && (
              <p className="font-body text-sm text-on-surface-variant">
                {category.description}
              </p>
            )}
          </div>
          <button
            onClick={() => router.push(`/${locale}/forum/${slug}/new`)}
            className="font-headline font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-lg bg-[#a1ffc2] text-[#003328] hover:bg-[#d3f5e8] transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {t("newThread")}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70">
          {t("sortLabel")}
        </span>
        {(["latest", "hot"] as ThreadSort[]).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`font-label text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md transition-colors ${
              sort === s
                ? "bg-[#a1ffc2]/15 text-[#a1ffc2] border border-[#a1ffc2]/30"
                : "bg-surface-container text-on-surface-variant border border-outline-variant/20 hover:text-[#a1ffc2] hover:border-[#a1ffc2]/30"
            }`}
          >
            {s === "latest" ? "Latest" : "Hot"}
          </button>
        ))}
      </div>

      {!threads && !error && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block animate-pulse">
            hourglass_empty
          </span>
          <p className="font-headline text-on-surface-variant">{t("loading")}</p>
        </div>
      )}
      {threads && threads.length === 0 && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block">
            article
          </span>
          <p className="font-headline text-[#d3f5e8] mb-1">
            {t("emptyThreadsCategory")}
          </p>
          <p className="font-body text-sm text-on-surface-variant">
            {t("startFirstInCategory")}
          </p>
        </div>
      )}
      {threads && threads.length > 0 && (
        <ThreadList threads={threads} pagination={pagination ?? undefined} />
      )}
    </div>
  );
}