"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface ChangePasswordDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

const MIN_NEW = 8;

/**
 * Modal that collects the current + new password, runs client-side
 * validation, and calls `api.users.changePassword`. On success we
 * show a success banner inside the dialog and let the caller close
 * it — the server already kicked every other session, so the
 * caller does NOT need to navigate.
 */
export default function ChangePasswordDialog({
    open,
    onClose,
    onSuccess,
}: ChangePasswordDialogProps) {
    const t = useTranslations("settings.user.passwordDialog");
    const tCommon = useTranslations();

    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [pending, setPending] = useState(false);

    if (!open) return null;

    const validationError = (() => {
        if (!current) return t("currentRequired");
        if (next.length < MIN_NEW) return t("tooShort");
        if (next !== confirm) return t("mismatch");
        return null;
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (validationError) return;
        setError(null);
        setSuccess(false);
        setPending(true);
        try {
            await api.users.changePassword({
                currentPassword: current,
                newPassword: next,
            });
            setSuccess(true);
            setCurrent("");
            setNext("");
            setConfirm("");
            onSuccess?.();
        } catch (err: unknown) {
            // The server returns 401 on a wrong current password. We
            // sniff for the word "incorrect" in the message because
            // we don't want to add a string-equality check on
            // Nest's default 401 body which could be tweaked.
            const msg = err instanceof Error ? err.message : tCommon("common.error");
            if (/incorrect|invalid|unauthor/i.test(msg)) {
                setError(t("wrongCurrent"));
            } else {
                setError(msg);
            }
        } finally {
            setPending(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-pw-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-container-low shadow-2xl">
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <header>
                        <h2
                            id="change-pw-title"
                            className="font-headline text-lg font-bold text-on-surface"
                        >
                            {t("title")}
                        </h2>
                        <p className="text-sm text-on-surface-variant mt-1">
                            {t("subtitle")}
                        </p>
                    </header>

                    <div>
                        <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                            {t("current")}
                        </label>
                        <input
                            type="password"
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                            autoComplete="current-password"
                            className={inputClass}
                            disabled={pending}
                        />
                    </div>

                    <div>
                        <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                            {t("new")}
                        </label>
                        <input
                            type="password"
                            value={next}
                            onChange={(e) => setNext(e.target.value)}
                            autoComplete="new-password"
                            className={inputClass}
                            disabled={pending}
                        />
                    </div>

                    <div>
                        <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                            {t("confirm")}
                        </label>
                        <input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            className={inputClass}
                            disabled={pending}
                        />
                    </div>

                    {validationError && !pending && (
                        <p className="text-xs text-on-surface-variant">{validationError}</p>
                    )}
                    {error && (
                        <div className="px-3 py-2 rounded-lg border border-error/30 bg-error/10 text-error text-xs">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary text-xs">
                            {t("success")}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={pending}
                            className="px-4 py-2 rounded-lg text-on-surface-variant font-headline text-xs font-bold uppercase tracking-widest hover:text-on-surface hover:bg-white/5 transition-colors disabled:opacity-40"
                        >
                            {t("cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={!!validationError || pending || success}
                            className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                            {pending ? t("submitting") : t("submit")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const inputClass =
    "w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-lg font-body text-sm text-on-surface focus:outline-none focus:border-primary transition-colors";
