"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfileFormProps {
    user: User;
    onSaved?: (user: User) => void;
}

const MAX_BIO = 2000;
const MIN_NICK = 2;
const MAX_NICK = 50;

function isHttpsUrl(s: string): boolean {
    if (!s) return true;
    try {
        return new URL(s).protocol === "https:";
    } catch {
        return false;
    }
}

function stateFromUser(user: User): { nickname: string; avatar: string; bio: string } {
    return {
        nickname: user.nickname ?? "",
        avatar: user.avatar ?? "",
        bio: user.bio ?? "",
    };
}

export default function UserProfileForm({ user, onSaved }: UserProfileFormProps) {
    const t = useTranslations("settings.user.profile");
    const tCommon = useTranslations();
    const { refreshUser } = useAuth();

    const [state, setState] = useState(() => stateFromUser(user));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        setState(stateFromUser(user));
    }, [user]);

    const avatarValid = isHttpsUrl(state.avatar);
    const bioValid = state.bio.length <= MAX_BIO;
    const nicknameValid =
        state.nickname.length >= MIN_NICK && state.nickname.length <= MAX_NICK;

    const canSubmit = nicknameValid && avatarValid && bioValid && !isSaving;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        setIsSaving(true);
        try {
            const updated = await api.users.updateMe({
                nickname: state.nickname,
                avatar: state.avatar || null,
                bio: state.bio || null,
            });
            setSuccess(true);
            onSaved?.(updated);
            // Sync the AuthContext copy so other pages (forum avatar,
            // top-right user pill) see the new value without a refresh.
            await refreshUser?.();
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : tCommon("common.error"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                    {t("nickname")}
                    <span className="text-error ml-1">*</span>
                </label>
                <input
                    type="text"
                    value={state.nickname}
                    onChange={(e) => setState((s) => ({ ...s, nickname: e.target.value }))}
                    minLength={MIN_NICK}
                    maxLength={MAX_NICK}
                    required
                    className={inputClass}
                />
                <p className="mt-1 text-xs text-on-surface-variant">
                    {t("nicknameHint")}
                </p>
            </div>

            <div>
                <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                    {t("avatar")}
                </label>
                <input
                    type="url"
                    value={state.avatar}
                    onChange={(e) => setState((s) => ({ ...s, avatar: e.target.value }))}
                    placeholder="https://cdn.goalxi.com/your-avatar.png"
                    className={inputClass}
                />
                {!avatarValid && (
                    <p className="mt-1 text-xs text-error">{t("avatarInvalid")}</p>
                )}
                {state.avatar && avatarValid && (
                    <div className="mt-2 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-surface-container border border-outline-variant/20 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={state.avatar}
                                alt="avatar preview"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                )}
                {avatarValid && !state.avatar && (
                    <p className="mt-1 text-xs text-on-surface-variant">
                        {t("avatarHint")}
                    </p>
                )}
            </div>

            <div>
                <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                    {t("bio")}
                </label>
                <textarea
                    value={state.bio}
                    onChange={(e) => setState((s) => ({ ...s, bio: e.target.value }))}
                    maxLength={MAX_BIO}
                    rows={4}
                    className={`${inputClass} resize-y`}
                />
                <p className="mt-1 text-xs text-on-surface-variant">
                    {t("bioHint", { max: MAX_BIO, current: state.bio.length })}
                </p>
            </div>

            {error && (
                <div className="px-4 py-3 rounded-lg border border-error/30 bg-error/10 text-error text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="px-4 py-3 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm">
                    {t("saved")}
                </div>
            )}

            <div className="flex items-center gap-3 pt-2">
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-headline text-sm font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                    {isSaving ? t("saving") : t("save")}
                </button>
            </div>
        </form>
    );
}

const inputClass =
    "w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-lg font-body text-sm text-on-surface focus:outline-none focus:border-primary transition-colors";
