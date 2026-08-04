import { ScoutCandidatePlayerData } from '@goalxi/database';
import { currentGameDay } from '@goalxi/database';

/**
 * NarrativeSection — structured, frontend-rendered description of a
 * scout candidate. The backend never produces localized strings here:
 * each section carries just the data needed to render a line of
 * narrative, and the web app maps that to a localized string via
 * next-intl. This keeps a single source of truth for i18n.
 *
 * Every section also carries a `variant` index (0..VARIANT_COUNT-1)
 * chosen at generation time. The frontend uses it to pick one of
 * several localised phrasings for the same underlying data, so a
 * batch of 3 cards never reads as a copy-paste — each line sounds
 * like a different scout wrote it.
 *
 * Sections are emitted in a fixed order: age → abilities → physical
 * → 3 skills → tendency → ceiling. The frontend renders them as a
 * vertical list of one-line statements.
 */
export const VARIANT_COUNT = 3;

export type NarrativeSection =
  | { kind: 'age'; data: { years: number; days: number }; variant: number }
  | { kind: 'abilities'; data: { list: string[] }; variant: number }
  | {
      kind: 'skill';
      data: {
        skillKey: string;
        current: number;
        potential: number;
        /**
         * Which side the narrative line should report:
         *  - "current"   — the line reads "X currently Y"
         *  - "potential" — the line reads "X potential Y"
         * Decided by `pickSkillMode` below (growth-gap threshold).
         */
        mode: 'current' | 'potential';
      };
      variant: number;
    }
  | {
      kind: 'tendency';
      data: { tendencyKey: 'physical' | 'technical' | 'mental' | 'balanced' };
      variant: number;
    }
  | {
      /** Body-shape profile: pace- vs strength-led, balanced, etc. */
      kind: 'physical';
      data: {
        profile:
          | 'balanced'
          | 'pace'
          | 'lean-pace'
          | 'strength'
          | 'lean-strength';
      };
      variant: number;
    }
  | {
      /**
       * Projected ceiling. When the candidate's tier has been
       * revealed we surface a numeric level so the manager can plan
       * long-term. When it hasn't, we just say the ceiling is still
       * unclear (no number — that itself is information, not a leak).
       */
      kind: 'ceiling';
      data: { revealed: boolean; level: number | null };
      variant: number;
    };

/** Age displayed in years + leftover days (1 year = 112 game days). */
const DAYS_PER_YEAR = 112;

/**
 * Growth-gap threshold: if the potential is at least this many points
 * above the current, we lead with the potential (the upside is the
 * story). Otherwise we lead with the current (the player is already
 * close to their ceiling — what you see is what you get).
 */
const SKILL_MODE_POTENTIAL_GAP = 4;

/**
 * Choose which side of a skill's range the narrative should surface.
 *   gap >= threshold → "potential" (room to grow, sell the upside)
 *   gap <  threshold → "current"  (already near ceiling, sell the now)
 */
function pickSkillMode(current: number, potential: number): 'current' | 'potential' {
  return potential - current >= SKILL_MODE_POTENTIAL_GAP
    ? 'potential'
    : 'current';
}

/**
 * Probability that the abilities line shows up in the narrative when
 * the candidate actually has abilities. The intent is variety — every
 * refresh the report may or may not mention the specialty. 50% keeps
 * it unpredictable without making specialties feel reliably hidden.
 */
const ABILITIES_REVEAL_CHANCE = 0.5;

/**
 * Pick a variant index for a section, in [0, VARIANT_COUNT).
 * Generation-time only (not during render), so the same candidate
 * always renders the same wording — but two siblings in a batch
 * will almost certainly diverge on at least one line.
 */
function pickVariant(): number {
  return Math.floor(Math.random() * VARIANT_COUNT);
}

/**
 * Build a 5-6 line narrative for a candidate. The lines are emitted in
 * a fixed order; if the candidate has no abilities the skill section
 * is allowed to grow up to 4 entries so the total still hits 5-6.
 */
export function buildNarrative(
  playerData: ScoutCandidatePlayerData,
): NarrativeSection[] {
  const sections: NarrativeSection[] = [];

  // 1. Age (always).
  const totalDays = currentGameDay() - playerData.createdDay;
  const years = Math.floor(totalDays / DAYS_PER_YEAR);
  const days = totalDays - years * DAYS_PER_YEAR;
  sections.push({ kind: 'age', data: { years, days }, variant: pickVariant() });

  // 2. Abilities (optional, ~50% chance when present). Each candidate
  //    is generated once and the narrative is stored with the row, so
  //    Math.random() here is safe — it doesn't run during hydration.
  if (
    playerData.abilities &&
    playerData.abilities.length > 0 &&
    Math.random() < ABILITIES_REVEAL_CHANCE
  ) {
    sections.push({
      kind: 'abilities',
      data: { list: playerData.abilities },
      variant: pickVariant(),
    });
  }

  // 3. Physical profile — body shape from pace vs strength.
  sections.push({
    kind: 'physical',
    data: { profile: derivePhysicalProfile(playerData.currentSkills) },
    variant: pickVariant(),
  });

  // 4-N. Skills — top entries by potential. We pick 3 normally; if
  // there are fewer than 3 revealed skills we still pad with whatever
  // is available (revealed list is 3-5 entries on average).
  const sorted = [...playerData.revealedSkills].sort((a, b) => {
    return (
      extractSkill(playerData.potentialSkills, b) -
      extractSkill(playerData.potentialSkills, a)
    );
  });
  const skillCount = playerData.abilities?.length ? 3 : 4;
  for (const key of sorted.slice(0, skillCount)) {
    const current = extractSkill(playerData.currentSkills, key);
    const potential = extractSkill(playerData.potentialSkills, key);
    sections.push({
      kind: 'skill',
      data: {
        skillKey: key,
        current,
        potential,
        mode: pickSkillMode(current, potential),
      },
      variant: pickVariant(),
    });
  }

  // Tendency — always.
  sections.push({
    kind: 'tendency',
    data: { tendencyKey: deriveTendency(playerData.currentSkills) },
    variant: pickVariant(),
  });

  // Ceiling — always, but the surfaced number only when the tier is
  // already revealed. Otherwise we just say "ceiling unclear", which
  // is honest without leaking the un-revealed number.
  sections.push({
    kind: 'ceiling',
    data: buildCeilingData(playerData),
    variant: pickVariant(),
  });

  return sections;
}

/**
 * Decide the candidate's body-shape profile from raw pace / strength.
 * We treat the bigger gap as the dominant axis and split the result
 * into a "developed" / "lean" half so the same archetype can read
 * differently at age 15 vs age 18.
 */
function derivePhysicalProfile(
  skills: unknown,
): 'balanced' | 'pace' | 'lean-pace' | 'strength' | 'lean-strength' {
  const pace = extractSkill(skills, 'pace');
  const strength = extractSkill(skills, 'strength');
  const diff = pace - strength;
  if (Math.abs(diff) <= 1.5) return 'balanced';
  if (diff > 0) {
    // Pace-led.
    return pace >= 14 ? 'pace' : 'lean-pace';
  }
  return strength >= 14 ? 'strength' : 'lean-strength';
}

/**
 * Pick the highest revealed potential on the candidate. Used by the
 * "ceiling" line. Returns null when nothing is revealed yet.
 */
function buildCeilingData(playerData: ScoutCandidatePlayerData): {
  revealed: boolean;
  level: number | null;
} {
  if (!playerData.potentialRevealed) {
    return { revealed: false, level: null };
  }
  let max = 0;
  for (const key of playerData.revealedSkills) {
    const v = extractSkill(playerData.potentialSkills, key);
    if (v > max) max = v;
  }
  return { revealed: true, level: max };
}

/**
 * Same skill-flattening helper used by the controller's DTO mapper.
 * PlayerSkills is a 3-category object (physical / technical / mental);
 * a top-level skill key like `pace` lives under `physical.pace`. We
 * walk the categories so the caller can pass any top-level key from
 * the OUTFIELD_KEYS / GK_KEYS lists.
 */
function extractSkill(skills: unknown, key: string): number {
  if (!skills || typeof skills !== 'object') return 0;
  for (const cat of Object.values(skills as Record<string, unknown>)) {
    if (cat && typeof cat === 'object' && key in (cat as Record<string, unknown>)) {
      const v = (cat as Record<string, unknown>)[key];
      if (typeof v === 'number') return v;
    }
  }
  return 0;
}

export type TendencyKey = 'physical' | 'technical' | 'mental' | 'balanced';

/**
 * Mirror of the controller's `buildTendencyHint` so the narrative
 * carries the same tendency key the hint used. We normalize the four
 * buckets to keep the i18n table finite.
 */
function deriveTendency(skills: unknown): TendencyKey {
  if (!skills || typeof skills !== 'object') return 'balanced';
  const s = skills as {
    physical?: { pace?: number; strength?: number };
    technical?: Record<string, number>;
    mental?: { positioning?: number; composure?: number };
  };
  const phys = ((s.physical?.pace ?? 0) + (s.physical?.strength ?? 0)) / 2;
  const techEntries = s.technical ? Object.values(s.technical) : [];
  const tech =
    techEntries.length > 0
      ? techEntries.reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0) /
        techEntries.length
      : 0;
  const ment = ((s.mental?.positioning ?? 0) + (s.mental?.composure ?? 0)) / 2;

  if (phys > tech && phys > ment) return 'physical';
  if (tech > phys && tech > ment) return 'technical';
  if (ment > phys && ment > tech) return 'mental';
  return 'balanced';
}
