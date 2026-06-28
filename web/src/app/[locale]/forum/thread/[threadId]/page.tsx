"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  forumApi,
  ForumThread,
  ForumPost,
  PaginatedResponse,
  PostSort,
} from "@/lib/forum-api";
import PostCard from "@/components/forum/PostCard";
import ReplyForm, { ReplyTarget } from "@/components/forum/ReplyForm";
import { useAuth } from "@/contexts/AuthContext";

export default function ThreadPage() {
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const threadId = params.threadId as string;
  const t = useTranslations("forum");
  const { user, isLoading: authLoading } = useAuth();

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [postsData, setPostsData] = useState<PaginatedResponse<ForumPost> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sort, setSort] = useState<PostSort>("oldest");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  const replyFormAnchorRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    try {
      const t = await forumApi.getThread(threadId);
      setThread(t);
      const posts = await forumApi.listPosts(threadId, {
        limit: 50,
        sort,
      });
      setPostsData(posts);
    } catch (err: any) {
      setError(err?.message ?? t("loadError"));
    }
  }, [threadId, sort, t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleReply(body: string) {
    await forumApi.createPost(threadId, { body });
    setReplyTarget(null);
    await loadAll();
  }

  function handleReplyButtonClick() {
    replyFormAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function handleQuoteClick(post: ForumPost) {
    setReplyTarget({
      postId: post.id,
      authorUsername: post.author?.username ?? "unknown",
      body: post.body,
      createdAt: post.createdAt,
    });
    requestAnimationFrame(() => {
      replyFormAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function handleClearReply() {
    setReplyTarget(null);
  }

  async function handleDeleteThread() {
    if (!confirm(t("deleteConfirmThread"))) return;
    setDeleting(true);
    try {
      await forumApi.deleteThread(threadId);
      window.location.href = `/${locale}/forum`;
    } catch (err) {
      console.error("Failed to delete thread", err);
      alert(t("deleteFailedThread"));
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="glass-panel p-6 rounded-2xl border border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        </div>
        <Link
          href={`/${locale}/forum`}
          className="font-label text-[10px] uppercase tracking-widest text-[#a1ffc2] hover:underline mt-4 inline-block"
        >
          {t("backToForum")}
        </Link>
      </div>
    );
  }

  if (!thread || !postsData) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block animate-pulse">
          hourglass_empty
        </span>
        <p className="font-headline text-on-surface-variant">{t("loading")}</p>
      </div>
    );
  }

  const isAuthor = user?.id === thread.authorId;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <nav className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mb-4">
        <Link
          href={`/${locale}/forum`}
          className="hover:text-[#a1ffc2] transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-xs">forum</span>
          {t("title")}
        </Link>
      </nav>

      <div className="mb-6 pb-4 border-b border-outline-variant/10">
        <div className="flex items-start gap-2 mb-2">
          {thread.isPinned && (
            <span
              className="material-symbols-outlined text-[#a1ffc2] mt-1"
              title="Pinned"
            >
              push_pin
            </span>
          )}
          <h1 className="font-headline font-black text-2xl uppercase tracking-tight text-[#d3f5e8] flex-1">
            {thread.title}
          </h1>
          {isAuthor && (
            <button
              onClick={handleDeleteThread}
              disabled={deleting}
              className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {deleting ? t("deleting") : t("delete")}
            </button>
          )}
        </div>
        <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-headline font-black text-[10px] text-[#a1ffc2]">
            {(thread.author?.username ?? "?").charAt(0).toUpperCase()}
          </div>
          <span className="text-[#d3f5e8]">{thread.author?.username ?? "unknown"}</span>
          <span className="text-on-surface-variant/40">•</span>
          <span>{new Date(thread.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Original post (the thread body) — Reply/Quote targetable */}
      <div className="glass-panel p-6 mb-8 rounded-2xl border border-outline-variant/10">
        <p className="font-body text-[#d3f5e8] whitespace-pre-wrap break-words leading-relaxed mb-3">
          {thread.body}
        </p>
        {user && (
          <div className="flex items-center gap-2 pt-3 border-t border-outline-variant/10">
            <button
              onClick={handleReplyButtonClick}
              className="flex items-center gap-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-[#a1ffc2] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">reply</span>
              {t("reply")}
            </button>
            <button
              onClick={() =>
                handleQuoteClick({
                  id: thread.id,
                  threadId: thread.id,
                  authorId: thread.authorId,
                  author: thread.author,
                  body: thread.body,
                  reactionCount: 0,
                  createdAt: thread.createdAt,
                  updatedAt: thread.updatedAt,
                })
              }
              className="flex items-center gap-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-[#a1ffc2] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">format_quote</span>
              {t("quote")}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-headline font-bold text-sm uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-base">forum</span>
          {thread.replyCount === 1
            ? t("replyCount_one")
            : t("replyCount_other", { count: thread.replyCount })}
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70">
            {t("sortLabel")}
          </span>
          {(["oldest", "newest"] as PostSort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`font-label text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md transition-colors ${
                sort === s
                  ? "bg-[#a1ffc2]/15 text-[#a1ffc2] border border-[#a1ffc2]/30"
                  : "bg-surface-container text-on-surface-variant border border-outline-variant/20 hover:text-[#a1ffc2] hover:border-[#a1ffc2]/30"
              }`}
            >
              {s === "oldest" ? t("sortOldest") : t("sortNewest")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {postsData.data.length === 0 ? (
          <div className="glass-panel p-8 rounded-2xl border border-outline-variant/10 text-center">
            <p className="font-body text-sm italic text-on-surface-variant">
              {t("emptyReplies")}
            </p>
          </div>
        ) : (
          postsData.data.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onDeleted={loadAll}
              onReply={user ? handleReplyButtonClick : undefined}
              onQuote={user ? handleQuoteClick : undefined}
            />
          ))
        )}
      </div>

      <div ref={replyFormAnchorRef}>
        {authLoading ? (
          <div className="mt-6 glass-panel p-6 rounded-2xl border border-outline-variant/10 text-center">
            <span className="font-body text-sm text-on-surface-variant">
              {t("loading")}
            </span>
          </div>
        ) : user ? (
          <ReplyForm
            onSubmit={handleReply}
            replyTarget={replyTarget}
            onClearReply={handleClearReply}
          />
        ) : (
          <div className="mt-6 glass-panel p-4 rounded-2xl border border-outline-variant/10 text-center">
            <p className="font-body text-sm text-on-surface-variant">
              <Link
                href={`/${locale}/auth/login`}
                className="text-[#a1ffc2] hover:underline"
              >
                {t("loginToReply").trim()}
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
