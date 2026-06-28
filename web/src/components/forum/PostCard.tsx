"use client";

import { useState } from "react";
import type { ForumPost } from "@/lib/forum-api";
import { forumApi } from "@/lib/forum-api";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import ReactionButton from "./ReactionButton";

interface PostCardProps {
  post: ForumPost;
  onDeleted?: () => void;
  onReply?: () => void;
  onQuote?: (post: ForumPost) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function timeAgo(iso: string): string {
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

export default function PostCard({
  post,
  onDeleted,
  onReply,
  onQuote,
}: PostCardProps) {
  const t = useTranslations("forum");
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(false);
  const isAuthor = user?.id === post.authorId;

  async function handleDelete() {
    if (!confirm(t("deleteConfirmReply"))) return;
    setDeleting(true);
    try {
      await forumApi.deletePost(post.id);
      setRemoved(true);
      onDeleted?.();
    } catch (err) {
      console.error("Failed to delete post", err);
      alert(t("deleteFailedReply"));
    } finally {
      setDeleting(false);
    }
  }

  if (removed) {
    return (
      <div className="glass-panel p-4 rounded-2xl border border-outline-variant/10 italic text-on-surface-variant/60 font-body text-sm">
        {t("deletedLabel")}
      </div>
    );
  }

  return (
    <div className="glass-panel p-5 rounded-2xl border border-outline-variant/10">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-headline font-black text-[10px] text-[#a1ffc2]">
            {(post.author?.username ?? "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-headline font-bold text-sm text-[#d3f5e8]">
              {post.author?.username ?? "unknown"}
            </div>
            <div
              className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70"
              title={formatTime(post.createdAt)}
            >
              {timeAgo(post.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReactionButton
            postId={post.id}
            initialCount={post.reactionCount}
          />
          {isAuthor && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {deleting ? "…" : t("delete")}
            </button>
          )}
        </div>
      </div>
      <p className="font-body text-[#d3f5e8] whitespace-pre-wrap break-words leading-relaxed mb-3">
        {post.body}
      </p>
      {(onReply || onQuote) && (
        <div className="flex items-center gap-2 pt-3 border-t border-outline-variant/10">
          {onReply && (
            <button
              onClick={onReply}
              className="flex items-center gap-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-[#a1ffc2] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">reply</span>
              {t("reply")}
            </button>
          )}
          {onQuote && (
            <button
              onClick={() => onQuote(post)}
              className="flex items-center gap-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-[#a1ffc2] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">format_quote</span>
              {t("quote")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}