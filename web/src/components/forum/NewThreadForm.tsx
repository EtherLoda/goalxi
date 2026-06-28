"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { forumApi } from "@/lib/forum-api";
import { useTranslations } from "next-intl";

interface NewThreadFormProps {
  categoryId: string;
  categorySlug: string;
  locale: string;
}

const TITLE_MIN = 5;
const TITLE_MAX = 200;
const BODY_MIN = 10;
const BODY_MAX = 10000;

export default function NewThreadForm({
  categoryId,
  categorySlug,
  locale,
}: NewThreadFormProps) {
  const t = useTranslations("forum");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleError =
    title.length > 0 && title.length < TITLE_MIN
      ? t("errTitleTooShort", { min: TITLE_MIN })
      : title.length > TITLE_MAX
        ? t("errTitleTooLong", { max: TITLE_MAX })
        : null;
  const bodyError =
    body.length > 0 && body.length < BODY_MIN
      ? t("errBodyTooShort", { min: BODY_MIN })
      : body.length > BODY_MAX
        ? t("errBodyTooLong", { max: BODY_MAX })
        : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (titleError || bodyError) return;
    setSubmitting(true);
    setError(null);
    try {
      const thread = await forumApi.createThread(categoryId, {
        title: title.trim(),
        body: body.trim(),
      });
      router.push(`/${locale}/forum/thread/${thread.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create thread.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="glass-panel p-4 rounded-2xl border border-outline-variant/10">
        <label className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 block">
          {t("fieldTitle")}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("placeholderThreadTitle")}
          className="w-full p-3 bg-surface-container border border-outline-variant/20 rounded-lg font-headline text-[#d3f5e8] placeholder-on-surface-variant/50 focus:outline-none focus:border-[#a1ffc2]/50 transition-colors"
          disabled={submitting}
        />
        <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mt-2 flex items-center justify-between">
          <span>
            {title.length} / {TITLE_MAX}
          </span>
          {titleError && (
            <span className="text-yellow-400 normal-case">{titleError}</span>
          )}
        </div>
      </div>

      <div className="glass-panel p-4 rounded-2xl border border-outline-variant/10">
        <label className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 block">
          {t("fieldBody")}
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("placeholderThreadBody")}
          rows={10}
          className="w-full p-3 bg-surface-container border border-outline-variant/20 rounded-lg font-body text-[#d3f5e8] placeholder-on-surface-variant/50 focus:outline-none focus:border-[#a1ffc2]/50 resize-y transition-colors"
          disabled={submitting}
        />
        <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mt-2 flex items-center justify-between">
          <span>
            {body.length} / {BODY_MAX}
          </span>
          {bodyError && (
            <span className="text-yellow-400 normal-case">{bodyError}</span>
          )}
        </div>
      </div>

      {error && (
        <p className="font-body text-sm text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={
            submitting ||
            !!titleError ||
            !!bodyError ||
            title.length < TITLE_MIN ||
            body.length < BODY_MIN
          }
          className="font-headline font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg bg-[#a1ffc2] text-[#003328] hover:bg-[#d3f5e8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? t("posting") : t("postThread")}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/${locale}/forum/${categorySlug}`)}
          disabled={submitting}
          className="font-headline font-bold text-xs uppercase tracking-widest px-4 py-3 text-on-surface-variant hover:text-[#d3f5e8] transition-colors"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}