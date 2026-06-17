"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type Team } from "@/lib/api";
import { contrastRatio } from "@/lib/color-contrast";

interface ClubInfoFormProps {
    team: Team;
    onSaved?: (team: Team) => void;
}

interface FormState {
    name: string;
    nationality: string;
    logoUrl: string;
    foundedYear: string; // string for input, parsed to number on submit
    city: string;
    bio: string;
}

const NATIONALITIES = [
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
const MIN_YEAR = 1850;
const MAX_YEAR = new Date().getFullYear();

export default function ClubInfoForm({ team, onSaved }: ClubInfoFormProps) {
    const t = useTranslations("club.settings");
    const tCommon = useTranslations();

    const [state, setState] = useState<FormState>({
        name: team.name,
        nationality: team.nationality ?? "GB",
        logoUrl: team.logoUrl ?? "",
        foundedYear: team.foundedYear != null ? String(team.foundedYear) : "",
        city: team.city ?? "",
        bio: team.bio ?? "",
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Reset when team prop changes
    useEffect(() => {
        setState({
            name: team.name,
            nationality: team.nationality ?? "GB",
            logoUrl: team.logoUrl ?? "",
            foundedYear: team.foundedYear != null ? String(team.foundedYear) : "",
            city: team.city ?? "",
            bio: team.bio ?? "",
        });
    }, [team]);

    const jerseyContrast = useMemo(() => {
        if (!team.jerseyColorPrimary || !team.jerseyColorSecondary) return null;
        return contrastRatio(team.jerseyColorPrimary, team.jerseyColorSecondary);
    }, [team.jerseyColorPrimary, team.jerseyColorSecondary]);

    const logoUrlValid = useMemo(() => {
        if (!state.logoUrl) return true;
        try {
            const u = new URL(state.logoUrl);
            return u.protocol === "https:";
        } catch {
            return false;
        }
    }, [state.logoUrl]);

    const foundedYearValid = useMemo(() => {
        if (!state.foundedYear) return true;
        const n = Number(state.foundedYear);
        return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR;
    }, [state.foundedYear]);

    const bioValid = state.bio.length <= MAX_BIO;

    const canSubmit =
        state.name.length >= 2 &&
        state.name.length <= 32 &&
        logoUrlValid &&
        foundedYearValid &&
        bioValid &&
        !isSaving;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        setIsSaving(true);
        try {
            const updated = await api.teams.update(team.id, {
                name: state.name,
                nationality: state.nationality,
                logoUrl: state.logoUrl || undefined,
                foundedYear: state.foundedYear ? Number(state.foundedYear) : null,
                city: state.city || null,
                bio: state.bio || null,
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
            {/* Name + Nationality */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Field label={t("nationality")}>
                    <select
                        value={state.nationality}
                        onChange={(e) => setState((s) => ({ ...s, nationality: e.target.value }))}
                        className={inputClass}
                    >
                        {NATIONALITIES.map((n) => (
                            <option key={n.code} value={n.code}>
                                {n.label}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>

            {/* Logo */}
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

            {/* Founded year + City */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                    label={t("foundedYear")}
                    hint={t("foundedYearHint", { min: MIN_YEAR, max: MAX_YEAR })}
                    error={!foundedYearValid ? t("foundedYearInvalid") : null}
                >
                    <input
                        type="number"
                        value={state.foundedYear}
                        onChange={(e) => setState((s) => ({ ...s, foundedYear: e.target.value }))}
                        min={MIN_YEAR}
                        max={MAX_YEAR}
                        step={1}
                        className={inputClass}
                    />
                </Field>
                <Field label={t("city")}>
                    <input
                        type="text"
                        value={state.city}
                        onChange={(e) => setState((s) => ({ ...s, city: e.target.value }))}
                        maxLength={64}
                        className={inputClass}
                    />
                </Field>
            </div>

            {/* Bio */}
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

            {/* Jersey contrast warning (read-only info) */}
            {jerseyContrast != null && jerseyContrast < 3 && (
                <div className="px-4 py-3 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm">
                    {t("jerseyContrastWarning", { ratio: jerseyContrast.toFixed(2) })}
                </div>
            )}

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
