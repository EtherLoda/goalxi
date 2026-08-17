"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { contrastRatio } from "@/lib/color-contrast";

interface JerseyColorPickerProps {
    /** Hex color like "#FF0000". */
    primary: string;
    secondary: string;
    tertiary: string;
    onChange: (next: {
        primary: string;
        secondary: string;
        tertiary: string;
    }) => void;
    disabled?: boolean;
}

const SWATCH_CLASS =
    "w-12 h-12 rounded-lg border border-outline-variant/30 flex items-center justify-center font-mono text-[10px] uppercase cursor-pointer relative overflow-hidden";

const HEX_INPUT_CLASS =
    "absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed";

function normalizeHex(input: string): string {
    const trimmed = input.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
        // Expand #abc to #aabbcc
        const [r, g, b] = trimmed.slice(1).split("");
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return trimmed.toUpperCase();
}

function HexField({
    label,
    value,
    onCommit,
    disabled,
}: {
    label: string;
    value: string;
    onCommit: (next: string) => void;
    disabled?: boolean;
}) {
    return (
        <div>
            <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <div
                    className={SWATCH_CLASS}
                    style={{ backgroundColor: value }}
                    aria-label={`${label} ${value}`}
                >
                    <input
                        type="color"
                        value={value}
                        onChange={(e) => onCommit(normalizeHex(e.target.value))}
                        disabled={disabled}
                        className={HEX_INPUT_CLASS}
                    />
                </div>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onCommit(normalizeHex(e.target.value))}
                    disabled={disabled}
                    maxLength={7}
                    className="w-24 px-2 py-1.5 bg-surface-container-low border border-outline-variant/20 rounded font-mono text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
            </div>
        </div>
    );
}

export default function JerseyColorPicker({
    primary,
    secondary,
    tertiary,
    onChange,
    disabled,
}: JerseyColorPickerProps) {
    const t = useTranslations("settings.team.fields");

    const primarySecondaryRatio = useMemo(
        () => contrastRatio(primary, secondary),
        [primary, secondary],
    );
    const showContrastWarn = primarySecondaryRatio < 3;

    return (
        <div className="space-y-3">
            <div>
                <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                    {t("jerseyColors")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <HexField
                        label={t("jerseyColorPrimary")}
                        value={primary}
                        onCommit={(v) => onChange({ primary: v, secondary, tertiary })}
                        disabled={disabled}
                    />
                    <HexField
                        label={t("jerseyColorSecondary")}
                        value={secondary}
                        onCommit={(v) => onChange({ primary, secondary: v, tertiary })}
                        disabled={disabled}
                    />
                    <HexField
                        label={t("jerseyColorTertiary")}
                        value={tertiary}
                        onCommit={(v) => onChange({ primary, secondary, tertiary: v })}
                        disabled={disabled}
                    />
                </div>
            </div>

            {/* Live preview: a tiny strip showing all three colors. */}
            <div className="flex items-center gap-1.5">
                <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    {t("jerseyPreview")}
                </span>
                <div className="flex h-6 rounded overflow-hidden border border-outline-variant/20">
                    <div className="w-10" style={{ backgroundColor: primary }} />
                    <div className="w-6" style={{ backgroundColor: secondary }} />
                    <div className="w-3" style={{ backgroundColor: tertiary }} />
                </div>
            </div>

            {showContrastWarn && (
                <div className="px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-xs">
                    {t("jerseyContrastWarning", { ratio: primarySecondaryRatio.toFixed(2) })}
                </div>
            )}
        </div>
    );
}
