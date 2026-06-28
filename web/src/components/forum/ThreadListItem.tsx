"use client";

import Link from "next/link";
import type { ForumThread } from "@/lib/forum-api";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

interface ThreadListItemProps {
  thread: ForumThread;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export default function ThreadListItem({ thread }: ThreadListItemProps) {
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const t = useTranslations("forum");

  return (
    <Link
      href={`/${locale}/forum/thread/${thread.id}`}
      className="flex items-start gap-4 p-4 border-b border-outline-variant/10 last:border-b-0 hover:bg-[#003328] transition-colors group"
    >
      {thread.isPinned ? (
        <span
          className="material-symbols-outlined text-[#a1ffc2] text-lg mt-0.5 shrink-0"
          title="Pinned"
        >
          push_pin
        </span>
      ) : (
        <span className="material-symbols-outlined text-on-surface-variant/40 text-lg mt-0.5 shrink-0 group-hover:text-[#a1ffc2] transition-colors">
          article
        </span>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="font-headline font-medium text-[#d3f5e8] truncate group-hover:text-[#a1ffc2] transition-colors">
          {thread.title}
        </h4>
        <div className="flex items-center gap-3 font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mt-1">
          <span>{thread.author?.username ?? "unknown"}</span>
          <span className="text-on-surface-variant/30">•</span>
          <span>{timeAgo(thread.createdAt)}</span>
          {thread.lastReplyUser && (
            <>
              <span className="text-on-surface-variant/30">•</span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[10px]">
                  reply
                </span>
                {thread.lastReplyUser.username ?? "unknown"}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="text-right font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 shrink-0">
        <div className="text-[#d3f5e8] font-headline text-sm font-bold">
          {thread.replyCount}
        </div>
        <div>{t("replyCount_other")}</div>
      </div>
    </Link>
  );
}