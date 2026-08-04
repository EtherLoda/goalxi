"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ScoutCandidate } from "@/lib/api";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";
import { getSpecialtyLabel } from "@/lib/specialties";
import styles from "./ScoutCard.module.css";

/**
 * ScoutCard — single dossier for a 17–18 year-old candidate about
 * to be signed into the senior squad.
 *
 * Mirrors the senior player page (`app/[locale]/players/[id]/page.tsx`)
 * 1:1 — same shell, same hero, same 2-column skill matrix. The only
 * pieces the player page has that we drop:
 *   • tier / GK / on-transfer / youth chips (no spoilers, per
 *     product decision)
 *   • tabs (no career/events/matches to display)
 *   • wage / experience meta row (we don't surface those on a
 *     pre-signing dossier)
 *
 * We DO keep the Specialties row (one chip per assigned ability) —
 * abilities aren't a spoiler, they describe the player's profile.
 *
 * Footer carries SKIP / SIGN — the two manager actions. No
 * decorative motion: the player page is static, so this is too.
 */
const SKILL_MAX = 20;

type SkillView = Array<{
  key: "physical" | "technical" | "mental" | "setPieces";
  titleKey: string;
  color: string;
  items: Array<{ key: string; label: string; current: number; potential: number }>;
}>;

const COLOR_PHYSICAL = "#60a5fa";
const COLOR_TECHNICAL = "#a1ffc2";
const COLOR_MENTAL = "#abf853";
const COLOR_SETPIECES = "#f59e0b";

export function ScoutCard({
  c,
  tPos,
  t,
  busy,
  onSelect,
  onSkip,
}: {
  c: ScoutCandidate;
  tPos: ReturnType<typeof useTranslations>;
  t: ReturnType<typeof useTranslations>;
  busy: boolean;
  onSelect: () => void;
  onSkip: () => void;
}) {
  // Skill labels share the same dictionary the senior player page
  // uses (squad.skills.*), so we bind a fresh translator to that
  // namespace — keeps the strings in one place.
  const tSkills = useTranslations("squad");
  const locale = (useLocale() === "en" ? "en" : "zh") as "zh" | "en";

  const initials = getInitials(c.name);
  // Same "17y 12d" format as the senior player page header — manager
  // expects the dossier and the profile card to read identically.
  const ageText = `${c.age}y ${c.ageDays}d`;
  const leftCol = buildColumn(c, tSkills, false);
  const rightCol = buildColumn(c, tSkills, true);
  const groupTitle = (key: "physical" | "technical" | "mental" | "setPieces") =>
    tSkills(
      key === "physical"
        ? "skills.physicalAttributes"
        : key === "technical"
          ? c.isGoalkeeper
            ? "skills.goalkeeperSkills"
            : "skills.technicalSkills"
          : key === "mental"
            ? "skills.mentalProfile"
            : "skills.setPieces",
    );

  return (
    <div className={styles.shell}>
      <div className={styles.overlay} aria-hidden />

      {/* Header — same shape as the senior player card. */}
      <div className={styles.header}>
        <div className={styles.avatar}>
          <div className={styles.avatarInner}>{initials}</div>
        </div>
        <div className={styles.identity}>
          <h1 className={styles.name}>{c.name}</h1>
          <div className={styles.metaRow}>
            <span className={styles.meta}>
              {ageText} · {c.isGoalkeeper ? tPos("GK") : tPos("OUT")} · {c.nationality}
            </span>
          </div>
        </div>
      </div>

      {/* Specialties — one chip per ability, matching the player
          page's "Specialties" row. Only render when the candidate
          actually has abilities assigned (SCOUT_ABILITY_CHANCE
          gates this on the server). */}
      {c.abilities && c.abilities.length > 0 && (
        <div className={styles.specialties}>
          {c.abilities.map((code) => (
            <span key={code} className={styles.specialtyChip}>
              <SpecialtyIcon code={code} size="xs" className="text-[#a1ffc2]" />
              {getSpecialtyLabel(code, locale) || code}
            </span>
          ))}
        </div>
      )}

      {/* Skills matrix — 2 columns, same composition as the player
          page's "Attributes" tab so the card and the player profile
          read as the same visual language. */}
      <div className={styles.matrix}>
        <div className={styles.column}>
          {[leftCol[0], leftCol[1]].map((group) => (
            <SkillGroup
              key={group.key}
              title={groupTitle(group.key)}
              color={group.color}
              items={group.items}
            />
          ))}
        </div>
        <div className={styles.column}>
          {[rightCol[0], rightCol[1]].map((group) => (
            <SkillGroup
              key={group.key}
              title={groupTitle(group.key)}
              color={group.color}
              items={group.items}
            />
          ))}
        </div>
      </div>

      {/* Footer — the two manager actions. */}
      <div className={styles.footer}>
        <button
          onClick={onSkip}
          disabled={busy}
          className={styles.btnSkip}
        >
          {busy ? (
            <span className={`material-symbols-outlined ${styles.spinner}`}>
              progress_activity
            </span>
          ) : null}
          {t("skip")}
        </button>
        <button
          onClick={onSelect}
          disabled={busy}
          className={styles.btnSign}
        >
          {busy ? (
            <span className={`material-symbols-outlined ${styles.spinner}`}>
              progress_activity
            </span>
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              add
            </span>
          )}
          {t("select")}
        </button>
      </div>
    </div>
  );
}

// =============================== Subcomponents ===============================

function SkillGroup({
  title,
  color,
  items,
}: {
  title: string;
  color: string;
  items: Array<{ key: string; label: string; current: number; potential: number }>;
}) {
  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <span className={styles.groupBar} style={{ background: color }} />
        <h3 className={styles.groupTitle}>{title}</h3>
      </div>
      <div className={styles.skillList}>
        {items.map((it) => (
          <SkillBar
            key={it.key}
            label={it.label}
            value={it.current}
            potential={it.potential}
            color={color}
          />
        ))}
      </div>
    </section>
  );
}

function SkillBar({
  label,
  value,
  potential,
  color,
}: {
  label: string;
  value: number;
  potential: number;
  color: string;
}) {
  // Round to integer — the senior player page already displays
  // integer values, and the decimal-place precision on scout
  // candidates (a generator artefact) makes the cards noisy.
  // Cap + invariant are enforced server-side; rounding only
  // affects the visible number, not the underlying data.
  const v = Math.round(value);
  const p = Math.round(potential);
  const pct = Math.max(0, Math.min(100, (v / SKILL_MAX) * 100));
  return (
    <div className={styles.skill}>
      <div className={styles.skillHead}>
        <span className={styles.skillLabel}>{label}</span>
        <span className={styles.skillValue} style={{ color }}>
          {v}/{p}
        </span>
      </div>
      <div className={styles.skillTrack}>
        <div
          className={styles.skillFill}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// =============================== Helpers ===============================

/** Up to 2 leading letters of the name, uppercase. */
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type AnySkills = {
  physical?: { pace?: number; strength?: number };
  technical?: Record<string, number>;
  mental?: { positioning?: number; composure?: number };
  setPieces?: { freeKicks?: number; penalties?: number };
};

function readSkills(input: unknown): AnySkills {
  if (!input || typeof input !== "object") return {};
  return input as AnySkills;
}

function num(s: AnySkills, ...path: string[]): number {
  // Walk `s` along the dotted path; missing nodes return 0.
  let cur: unknown = s;
  for (const seg of path) {
    if (!cur || typeof cur !== "object") return 0;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : 0;
}

/** Build the two columns that populate the skill matrix.
 *  Left = Physical + Technical, Right = Mental + SetPieces — matches
 *  the senior player page's Attributes layout. */
function buildColumn(
  c: ScoutCandidate,
  t: ReturnType<typeof useTranslations>,
  right: boolean,
): SkillView {
  const cur = readSkills(c.currentSkills);
  const pot = readSkills(c.potentialSkills);
  const isGK = c.isGoalkeeper;

  const left: SkillView = [
    {
      key: "physical",
      titleKey: "physicalAttributes",
      color: COLOR_PHYSICAL,
      items: [
        {
          key: "pace",
          label: t("skills.pace"),
          current: num(cur, "physical", "pace"),
          potential: num(pot, "physical", "pace"),
        },
        {
          key: "strength",
          label: t("skills.strength"),
          current: num(cur, "physical", "strength"),
          potential: num(pot, "physical", "strength"),
        },
      ],
    },
    {
      key: "technical",
      titleKey: isGK ? "goalkeeperSkills" : "technicalSkills",
      color: COLOR_TECHNICAL,
      items: isGK
        ? [
            {
              key: "reflexes",
              label: t("skills.reflexes"),
              current: num(cur, "technical", "reflexes"),
              potential: num(pot, "technical", "reflexes"),
            },
            {
              key: "handling",
              label: t("skills.handling"),
              current: num(cur, "technical", "handling"),
              potential: num(pot, "technical", "handling"),
            },
            {
              key: "aerial",
              label: t("skills.aerial"),
              current: num(cur, "technical", "aerial"),
              potential: num(pot, "technical", "aerial"),
            },
          ]
        : [
            {
              key: "finishing",
              label: t("skills.finishing"),
              current: num(cur, "technical", "finishing"),
              potential: num(pot, "technical", "finishing"),
            },
            {
              key: "passing",
              label: t("skills.passing"),
              current: num(cur, "technical", "passing"),
              potential: num(pot, "technical", "passing"),
            },
            {
              key: "dribbling",
              label: t("skills.dribbling"),
              current: num(cur, "technical", "dribbling"),
              potential: num(pot, "technical", "dribbling"),
            },
            {
              key: "defending",
              label: t("skills.defending"),
              current: num(cur, "technical", "defending"),
              potential: num(pot, "technical", "defending"),
            },
          ],
    },
  ];

  const rightCol: SkillView = [
    {
      key: "mental",
      titleKey: "mentalProfile",
      color: COLOR_MENTAL,
      items: [
        {
          key: "positioning",
          label: t("skills.positioning"),
          current: num(cur, "mental", "positioning"),
          potential: num(pot, "mental", "positioning"),
        },
        {
          key: "composure",
          label: t("skills.composure"),
          current: num(cur, "mental", "composure"),
          potential: num(pot, "mental", "composure"),
        },
      ],
    },
    {
      key: "setPieces",
      titleKey: "setPieces",
      color: COLOR_SETPIECES,
      items: [
        {
          key: "freeKicks",
          label: t("skills.freeKicks"),
          current: num(cur, "setPieces", "freeKicks"),
          potential: num(pot, "setPieces", "freeKicks"),
        },
        {
          key: "penalties",
          label: t("skills.penalties"),
          current: num(cur, "setPieces", "penalties"),
          potential: num(pot, "setPieces", "penalties"),
        },
      ],
    },
  ];

  return right ? rightCol : left;
}
