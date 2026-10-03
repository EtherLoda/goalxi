"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import type { ForumThread, ForumPagination } from "@/lib/forum-api";
import { useTranslations } from "next-intl";
import ThreadListItem from "./ThreadListItem";

interface ThreadListProps {
  threads: ForumThread[];
  pagination?: ForumPagination;
}

export default function ThreadList({ threads, pagination }: ThreadListProps) {
  const t = useTranslations("forum");
  if (threads.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
        <AppIcon name="article" className="text-4xl text-on-surface-variant/40 mb-3 block" />
        <p className="font-headline text-frost mb-1">{t("emptyThreads")}</p>
        <p className="font-body text-sm text-on-surface-variant">
          {t("startFirstThread")}
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="glass-panel rounded-2xl border border-outline-variant/10 overflow-hidden">
        {threads.map((t) => (
          <ThreadListItem key={t.id} thread={t} />
        ))}
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 text-center mt-4">
          Page {pagination.currentPage} of {pagination.totalPages} ·{" "}
          {pagination.totalRecords} total
        </div>
      )}
    </div>
  );
}