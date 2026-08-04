"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ScoutCandidate } from "@/lib/api";
import { useTilt } from "@/hooks/useTilt";
import { makeNarrativeRenderer, type Locale } from "@/lib/scout-narrative";
import styles from "./ScoutCard.module.css";

/**
 * ScoutCard — single-face narrative report for a scout candidate.
 *
 * Visual contract:
 *   • No tier badge in the header — the manager isn't told the
 *     candidate's `potentialTier` (would spoil the scouting game).
 *   • No "expires in N hours" footer line — the server's
 *     `cleanupExpired` cron purges rows after 7 days; the inbox
 *     simply forgets.
 *   • The avatar matches the senior-team `squad/page.tsx` look:
 *     rounded-2xl frame with a translucent gradient + dark inner
 *     tile and primary-coloured initials. The gradient is seeded
 *     from `nationality` so the inbox shows country at a glance
 *     without revealing ability.
 */
export function ScoutCard({
  c,
  tPos,
  t,
  index,
  busy,
  onSelect,
  onSkip,
}: {
  c: ScoutCandidate;
  tPos: ReturnType<typeof useTranslations>;
  t: ReturnType<typeof useTranslations>;
  index: number;
  busy: boolean;
  onSelect: () => void;
  onSkip: () => void;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const tilt = useTilt(cardRef, 4);
  const locale = (useLocale() as Locale) ?? "en";

  // Stagger the entry animation by index (capped so a long list doesn't
  // wait forever).
  const enterStyle = {
    ["--enter-delay" as string]: `${Math.min(index, 8) * 70}ms`,
  } as React.CSSProperties;

  const renderer = makeNarrativeRenderer(t, locale);

  // Age is surfaced in the header (right under the name) — pull it
  // out of the narrative stream so we don't render the same line twice.
  const ageSection = c.narrativeSections.find((s) => s.kind === "age");
  const ageLine = ageSection ? renderer(ageSection) : null;
  const bodyLines = c.narrativeSections
    .filter((s) => s.kind !== "age")
    .map((s) => renderer(s));

  const initials = getInitials(c.name);
  const gradient = avatarGradientFor(c.nationality);

  return (
    <div
      className={`${styles.scene}`}
      style={enterStyle}
      ref={cardRef}
      onPointerMove={tilt.onMove}
      onPointerEnter={tilt.onEnter}
      onPointerLeave={tilt.onLeave}
    >
      <div
        className={`${styles.tilt} ${tilt.lift ? styles.lift : ""}`}
        style={tilt.style}
      >
        <article className={styles.shell}>
          <div className={styles.shellPadding}>
            <header className={styles.header}>
              <div
                className={styles.avatar}
                style={{ background: gradient }}
                aria-hidden
              >
                <div className={styles.avatarInner}>{initials}</div>
              </div>
              <div className={styles.identity}>
                <h3 className={styles.name}>{c.name}</h3>
                {ageLine && (
                  <p className={styles.ageLine}>{ageLine.text}</p>
                )}
                <p className={styles.meta}>
                  {c.nationality} ·{" "}
                  {c.isGoalkeeper ? tPos("GK") : tPos("OUT")}
                </p>
              </div>
            </header>

            <ul className={styles.narrative}>
              {bodyLines.map((line, i) => (
                <li key={i} className={styles.narrativeLine}>
                  <span
                    className={`material-symbols-outlined ${styles.narrativeIcon}`}
                    aria-hidden
                  >
                    {line.icon}
                  </span>
                  <span className={styles.narrativeText}>{line.text}</span>
                </li>
              ))}
            </ul>

            <div className={styles.footer}>
              <div className={styles.actions}>
                <button
                  onClick={onSkip}
                  disabled={busy}
                  className={styles.btnSkip}
                >
                  {t("skip")}
                </button>
                <button
                  onClick={onSelect}
                  disabled={busy}
                  className={styles.btnSelect}
                >
                  {busy ? (
                    <span
                      className={`material-symbols-outlined ${styles.spinner}`}
                    >
                      progress_activity
                    </span>
                  ) : (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14 }}
                    >
                      add
                    </span>
                  )}
                  {t("select")}
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

// =============================== Subcomponents ===============================

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

/**
 * Gradient for the avatar frame, picked deterministically from
 * the candidate's nationality. Mirrors the senior-team squad page
 * look (`linear-gradient(135deg, primary30, primary10)`) but with
 * a fixed palette so the gradient is unique per country rather
 * than per team. Same country → same gradient across cards.
 */
const AVATAR_PALETTE: Array<[string, string]> = [
  ["#a1ffc2", "#0d3a26"], // green
  ["#fbbf24", "#3a2900"], // amber
  ["#60a5fa", "#0c2a4d"], // blue
  ["#f472b6", "#3a0c25"], // pink
  ["#a78bfa", "#1c0f3a"], // violet
  ["#34d399", "#0a3024"], // emerald
];

function avatarGradientFor(nationality?: string): string {
  if (!nationality) {
    return `linear-gradient(135deg, ${AVATAR_PALETTE[0][0]}30, ${AVATAR_PALETTE[0][1]}10)`;
  }
  const hash = nationality
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [a, b] = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  return `linear-gradient(135deg, ${a}30, ${b}10)`;
}
