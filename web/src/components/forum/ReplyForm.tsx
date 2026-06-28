"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export interface ReplyTarget {
  postId: string;
  authorUsername: string;
  body: string;
  createdAt: string;
}

interface ReplyFormProps {
  onSubmit: (body: string) => Promise<void>;
  disabled?: boolean;
  replyTarget?: ReplyTarget | null;
  onClearReply?: () => void;
}

const MIN = 10;
const MAX = 10000;

/**
 * Build the quoted-prefix that prepends the target post's content to the
 * user's reply. Plain-text format (no Markdown), kept human-readable:
 *
 *   @alice wrote (2h ago):
 *   "quoted body here, exactly as the original."
 *
 *   ───────────────
 *   <user types their reply here>
 */
function buildQuotedBody(target: ReplyTarget): string {
  const ago = formatAgo(target.createdAt);
  const safeBody = target.body.replace(/"/g, '"');
  return (
    `@${target.authorUsername} wrote${ago ? ` (${ago})` : ""}:\n` +
    `"${safeBody}"\n\n` +
    `────────────────\n`
  );
}

function formatAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ReplyForm({
  onSubmit,
  disabled,
  replyTarget,
  onClearReply,
}: ReplyFormProps) {
  const t = useTranslations("forum");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When a reply target is set (Reply or Quote button click), prefill the
  // textarea and focus it.
  useEffect(() => {
    if (replyTarget) {
      const prefix = replyTarget.body.startsWith("@")
        ? buildQuotedBody(replyTarget)
        : "";
      setBody(prefix);
      // Defer to next tick so the textarea is mounted with the new value
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const len = textareaRef.current?.value.length ?? 0;
        textareaRef.current?.setSelectionRange(len, len);
      });
    }
  }, [replyTarget]);

  const tooShort = body.length > 0 && body.length < MIN;
  const tooLong = body.length > MAX;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || submitting) return;
    if (body.length < MIN) {
      setError(t("errReplyTooShort", { min: MIN }));
      return;
    }
    if (body.length > MAX) {
      setError(t("errReplyTooLong", { max: MAX }));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(body);
      setBody("");
      onClearReply?.();
    } catch (err: any) {
      setError(err?.message ?? t("deleteFailedReply"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClearTarget() {
    setBody("");
    onClearReply?.();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      {replyTarget && (
        <div className="flex items-center justify-between mb-2 px-4 py-2 rounded-lg bg-[#003328] border border-[#a1ffc2]/30">
          <span className="font-label text-[10px] uppercase tracking-widest text-[#a1ffc2] flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">format_quote</span>
            {t("replyingTo", { username: replyTarget.authorUsername })}
          </span>
          <button
            type="button"
            onClick={handleClearTarget}
            className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">close</span>
            {t("cancel")}
          </button>
        </div>
      )}
      <div className="glass-panel p-4 rounded-2xl border border-outline-variant/10">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            replyTarget ? t("placeholderTypeReply") : t("placeholderReply")
          }
          rows={4}
          className="w-full p-3 bg-transparent font-body text-[#d3f5e8] placeholder-on-surface-variant/50 focus:outline-none resize-y"
          disabled={disabled || submitting}
        />
        <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
          <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70">
            {body.length} / {MAX}
            {tooShort && (
              <span className="text-yellow-400 ml-2">
                ({t("errReplyTooShort", { min: MIN }).replace(".", "")})
              </span>
            )}
            {tooLong && <span className="text-red-400 ml-2">(too long)</span>}
          </div>
          <button
            type="submit"
            disabled={disabled || submitting || tooShort || tooLong}
            className="font-headline font-bold text-xs uppercase tracking-widest px-5 py-2 rounded-lg bg-[#a1ffc2] text-[#003328] hover:bg-[#d3f5e8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? t("posting") : t("postReply")}
          </button>
        </div>
      </div>
      {error && (
        <p className="font-body text-sm text-red-400 mt-2">{error}</p>
      )}
    </form>
  );
}
