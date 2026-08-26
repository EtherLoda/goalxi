"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface RenameStadiumDialogProps {
  teamId: string;
  /** Current stadium name, used to pre-fill the input. */
  currentName: string;
  onCancel: () => void;
  /**
   * Called with the new name on success so the parent
   * can refresh its summary (e.g. by re-running the
   * `getSummary` fetch). We pass the name back rather
   * than the full stadium row to keep the parent's
   * state model simple — it already has the row, it
   * just needs the new field.
   */
  onSuccess: (newName: string) => void;
}

/**
 * Inline edit dialog for the stadium name.
 *
 * The PATCH /teams/:teamId/stadium endpoint is the
 * full owner of the rename; this dialog is a thin
 * form that calls it and bubbles the new name back
 * to the page. Length validation mirrors the API's
 * DTO bounds (1-128 chars; @StringField in
 * `rename-stadium.req.dto.ts`).
 */
export function RenameStadiumDialog({
  teamId,
  currentName,
  onCancel,
  onSuccess,
}: RenameStadiumDialogProps) {
  const t = useTranslations("club.stadiumPage.renameDialog");

  // Local input state — initialised from `currentName`
  // but the user is free to clear and re-type. We
  // re-sync only if the prop changes (e.g. parent
  // re-fetches the summary after a backend update),
  // and only when the input is untouched — otherwise
  // we'd stomp on the user's typing.
  const [name, setName] = useState<string>(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setName(currentName);
  }, [currentName, touched]);

  const trimmed = name.trim();
  const isValid = trimmed.length >= 1 && trimmed.length <= 128;
  const isUnchanged = trimmed === currentName.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || isUnchanged) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await api.stadium.rename(teamId, trimmed);
      onSuccess(trimmed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("submitErrorFallback"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface-container border border-outline-variant/20 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline text-xl font-black text-on-surface mb-1">
          {t("title")}
        </h2>
        <p className="text-sm text-on-surface-variant mb-5">
          {t("subtitle")}
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="stadium-name-input"
            className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2"
          >
            {t("fieldLabel")}
          </label>
          <input
            id="stadium-name-input"
            type="text"
            value={name}
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
              setError(null);
            }}
            maxLength={128}
            autoFocus
            // The `Enter` key submits the form via the
            // button below; this is a small UX touch
            // (focus stays in the input on Tab cycle).
            className="w-full px-4 py-3 rounded-xl bg-surface border border-outline-variant/30 text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
            placeholder={t("placeholder")}
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between mt-2 text-xs text-on-surface-variant">
            <span>
              {t("charCount", { count: trimmed.length })}
            </span>
            {trimmed.length > 128 && (
              <span className="text-error">
                {t("maxLengthError")}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={!isValid || isUnchanged || isSubmitting}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-bold hover:bg-primary/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
