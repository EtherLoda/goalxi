"use client";

import { AppIcon } from "@/components/icons/AppIcon";
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
          className="hover:text-accent transition-colors flex items-center gap-1"
        >
          <AppIcon name="forum" className="text-xs" />
          {t("title")}
        </Link>
        <span className="text-on-surface-variant/40">/</span>
        <span className="text-frost">{category?.name ?? "..."}</span>
      </nav>

      {error && (
        <div className="glass-panel p-4 mb-6 rounded-2xl border border-danger/30 bg-danger/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <AppIcon name="error" />
            {error}
          </div>
        </div>
      )}

      {category && (
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="font-headline font-black text-3xl uppercase tracking-tight text-frost mb-1">
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
            className="font-headline font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-lg bg-accent text-ink-500 hover:bg-frost transition-colors flex items-center gap-2"
          >
            <AppIcon name="add" className="text-sm" />
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
            className={`font-label text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${
              sort === s
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-surface-container text-on-surface-variant border border-outline-variant/20 hover:text-accent hover:border-accent/30"
            }`}
          >
            {s === "latest" ? "Latest" : "Hot"}
          </button>
        ))}
      </div>

      {!threads && !error && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <AppIcon name="hourglass_empty" className="text-4xl text-on-surface-variant/40 mb-3 block animate-pulse" />
          <p className="font-headline text-on-surface-variant">{t("loading")}</p>
        </div>
      )}
      {threads && threads.length === 0 && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <AppIcon name="article" className="text-4xl text-on-surface-variant/40 mb-3 block" />
          <p className="font-headline text-frost mb-1">
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