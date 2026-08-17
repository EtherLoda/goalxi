"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type Team } from "@/lib/api";
import JerseyColorPicker from "@/components/settings/JerseyColorPicker";

interface ClubInfoFormProps {
    team: Team;
    onSaved?: (team: Team) => void;
}

interface FormState {
    name: string;
    logoUrl: string;
    bio: string;
    jerseyColorPrimary: string;
    jerseyColorSecondary: string;
    jerseyColorTertiary: string;
}

const NATIONALITIES: Array<{ code: string; label: string }> = [
    { code: "GB", label: "England" },
    { code: "ES", label: "Spain" },
    { code: "DE", label: "Germany" },
    { code: "IT", label: "Italy" },
    { code: "FR", label: "France" },
    { code: "BR", label: "Brazil" },
    { code: "AR", label: "Argentina" },
    { code: "NL", label: "Netherlands" },
    { code: "PT", label: "Portugal" },
    { code: "CN", label: "China" },
    { code: "JP", label: "Japan" },
    { code: "US", label: "USA" },
];

const MAX_BIO = 2000;
const HEX_RE = /^#[0-9A-F]{6}$/i;

function stateFromTeam(team: Team): FormState {
    return {
        name: team.name,
        logoUrl: team.logoUrl ?? "",
        bio: team.bio ?? "",
        jerseyColorPrimary: team.jerseyColorPrimary ?? "#FF0000",
        jerseyColorSecondary: team.jerseyColorSecondary ?? "#FFFFFF",
        jerseyColorTertiary: team.jerseyColorTertiary ?? "#000000",
    };
}

function nationalityLabel(code: string | null | undefined): string {
    if (!code) return "—";
    return NATIONALITIES.find((n) => n.code === code)?.label ?? code;
}

export default function ClubInfoForm({ team, onSaved }: ClubInfoFormProps) {
    const t = useTranslations("settings.team.fields");
    const tLocked = useTranslations("settings.team.lockedFields");
    const tCommon = useTranslations();

    const [state, setState] = useState<FormState>(() => stateFromTeam(team));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Reset when team prop changes
    useEffect(() => {
        setState(stateFromTeam(team));
    }, [team]);

    const logoUrlValid = (() => {
        if (!state.logoUrl) return true;
        try {
            return new URL(state.logoUrl).protocol === "https:";
        } catch {
            return false;
        }
    })();

    const jerseyColorsValid =
        HEX_RE.test(state.jerseyColorPrimary) &&
        HEX_RE.test(state.jerseyColorSecondary) &&
        HEX_RE.test(state.jerseyColorTertiary);

    const bioValid = state.bio.length <= MAX_BIO;

    const canSubmit =
        state.name.length >= 2 &&
        state.name.length <= 32 &&
        logoUrlValid &&
        jerseyColorsValid &&
        bioValid &&
        !isSaving;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        setIsSaving(true);
        try {
            // Only the editable subset is sent. `nationality`,
            // `city`, and `foundedYear` are deliberately not in
            // the type — they were stamped at registration and
            // are read-only here.
            const updated = await api.teams.update(team.id, {
                name: state.name,
                logoUrl: state.logoUrl || undefined,
                bio: state.bio || null,
                jerseyColorPrimary: state.jerseyColorPrimary,
                jerseyColorSecondary: state.jerseyColorSecondary,
                jerseyColorTertiary: state.jerseyColorTertiary,
            });
            setSuccess(true);
            onSaved?.(updated);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : tCommon("common.error"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name — editable */}
            <Field label={t("name")} required>
                <input
                    type="text"
                    value={state.name}
                    onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                    minLength={2}
                    maxLength={32}
                    required
                    className={inputClass}
                />
            </Field>

            {/* Logo — editable */}
            <Field
                label={t("logoUrl")}
                hint={state.logoUrl && !logoUrlValid ? t("logoUrlInvalid") : t("logoUrlHint")}
                error={state.logoUrl && !logoUrlValid ? t("logoUrlInvalid") : null}
            >
                <input
                    type="url"
                    value={state.logoUrl}
                    onChange={(e) => setState((s) => ({ ...s, logoUrl: e.target.value }))}
                    placeholder="https://cdn.goalxi.com/your-logo.png"
                    className={inputClass}
                />
                {state.logoUrl && logoUrlValid && (
                    <div className="mt-2 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-surface-container border border-outline-variant/20 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={state.logoUrl}
                                alt="logo preview"
                                className="w-full h-full object-contain"
                            />
                        </div>
                    </div>
                )}
            </Field>

            {/* Locked identity: nationality / city / founded year.
                These were set at registration and never editable
                afterwards. The form renders them as read-only so
                the user knows what they are without being tempted
                to try to change them. */}
            <section className="rounded-lg border border-outline-variant/20 bg-surface-container/40 p-4 space-y-3">
                <p className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    {tLocked("sectionLabel")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <LockedField
                        label={t("nationality")}
                        value={nationalityLabel(team.nationality)}
                    />
                    <LockedField
                        label={t("city")}
                        value={team.city ?? "—"}
                    />
                    <LockedField
                        label={t("foundedYear")}
                        value={
                            team.foundedYear != null
                                ? String(team.foundedYear)
                                : "—"
                        }
                    />
                </div>
                <p className="text-xs text-on-surface-variant">
                    {tLocked("hint")}
                </p>
            </section>

            {/* Jersey colors — picker owns its own contrast check. */}
            <JerseyColorPicker
                primary={state.jerseyColorPrimary}
                secondary={state.jerseyColorSecondary}
                tertiary={state.jerseyColorTertiary}
                onChange={(c) =>
                    setState((s) => ({
                        ...s,
                        jerseyColorPrimary: c.primary,
                        jerseyColorSecondary: c.secondary,
                        jerseyColorTertiary: c.tertiary,
                    }))
                }
                disabled={isSaving}
            />

            {/* Bio — editable */}
            <Field
                label={t("bio")}
                hint={t("bioHint", { max: MAX_BIO, current: state.bio.length })}
                error={!bioValid ? t("bioTooLong") : null}
            >
                <textarea
                    value={state.bio}
                    onChange={(e) => setState((s) => ({ ...s, bio: e.target.value }))}
                    maxLength={MAX_BIO}
                    rows={4}
                    className={`${inputClass} resize-y`}
                />
            </Field>

            {/* Error / success */}
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

            {/* Actions */}
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

function Field({
    label,
    hint,
    error,
    required,
    children,
}: {
    label: string;
    hint?: string;
    error?: string | null;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                {label}
                {required && <span className="text-error ml-1">*</span>}
            </label>
            {children}
            {error ? (
                <p className="mt-1 text-xs text-error">{error}</p>
            ) : hint ? (
                <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>
            ) : null}
        </div>
    );
}

/**
 * Read-only display for a registration-locked field. Stays
 * inside the form layout (so the user can see *what* the
 * locked values are) but offers no input.
 */
function LockedField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                {label}
            </p>
            <p className="w-full px-3 py-2.5 bg-surface-container/60 border border-outline-variant/10 rounded-lg font-body text-sm text-on-surface-variant">
                {value}
            </p>
        </div>
    );
}
