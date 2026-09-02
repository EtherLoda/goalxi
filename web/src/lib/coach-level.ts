/**
 * coach-level.ts — coach/staff level (1-5) → S/A/B/C/D label + colour.
 *
 * Replaces the old `Lv.{level}` display in the Training page hire/upgrade
 * modals and the Medical page's doctor card. The underlying API contract
 * still uses the integer 1-5 (`StaffLevel` enum in libs/database), so the
 * mapping happens purely on display — no BE change.
 *
 * Mapping (engine level → player-facing grade, high → low):
 *   5 → S (top tier, orange)
 *   4 → A (high tier, purple)
 *   3 → B (mid tier, blue)
 *   2 → C (junior, green)
 *   1 → D (entry, white)
 *
 * Pure module — no React / no i18n — so unit tests can pin every
 * boundary case (level out of range, 0, negative).
 */
export type CoachGrade = 'S' | 'A' | 'B' | 'C' | 'D';

const LEVEL_TO_GRADE: Readonly<Record<number, CoachGrade>> = Object.freeze({
  1: 'D',
  2: 'C',
  3: 'B',
  4: 'A',
  5: 'S',
});

/** Tailwind text-colour classes — kept in sync with the previous inline
 *  `levelColors` array that lived in training/page.tsx. The order matches
 *  LEVEL_TO_GRADE so the same colour follows the same grade across pages. */
const GRADE_COLOR_CLASS: Readonly<Record<CoachGrade, string>> = Object.freeze({
  S: 'text-orange-400',
  A: 'text-purple-400',
  B: 'text-blue-400',
  C: 'text-green-400',
  D: 'text-white',
});

export function coachLevelLabel(level: number): CoachGrade {
  return LEVEL_TO_GRADE[level] ?? 'D';
}

export function coachLevelColorClass(level: number): string {
  return GRADE_COLOR_CLASS[coachLevelLabel(level)];
}
