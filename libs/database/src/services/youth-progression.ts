import { getYouthSkillKeys } from '../constants/youth-keys.constants';

/** Minimal skill shape required by progression functions. */
export interface ProgressionSkills {
  isGoalkeeper: boolean;
  currentSkills: Record<string, any>;
  potentialSkills: Record<string, any>;
}

/**
 * Apply weekly growth to a youth player's current skills. Each tracked skill
 * advances by `Math.random() * maxGrowthPerWeek` toward the matching potential
 * value (capped). Pure function — mutates `currentSkills` and returns the
 * mutated object so callers can persist.
 *
 * @param random Inject a deterministic source for testing. Defaults to `Math.random`.
 */
export function applyWeeklyGrowth(
  youth: ProgressionSkills,
  random: () => number = Math.random,
  maxGrowthPerWeek = 0.1,
): ProgressionSkills {
  const keys = getYouthSkillKeys(youth.isGoalkeeper);
  for (const cat of Object.values(youth.currentSkills)) {
    if (cat && typeof cat === 'object') {
      for (const key of Object.keys(cat)) {
        if ((keys as readonly string[]).includes(key)) {
          const current = (cat as Record<string, number>)[key];
          const potential = findPotential(youth.potentialSkills, key);
          if (potential === null) continue;
          const growth = random() * maxGrowthPerWeek;
          const next = Math.min(potential, current + growth);
          (cat as Record<string, number>)[key] = parseFloat(next.toFixed(2));
        }
      }
    }
  }
  return youth;
}

export interface RevealState {
  isGoalkeeper: boolean;
  revealedSkills: string[];
}

/**
 * Reveal 1 or 2 previously-unrevealed skill keys (50/50 chance). Returns the
 * updated `revealedSkills` array; does not mutate input.
 */
export function pickNextRevealSkills(
  state: RevealState,
  random: () => number = Math.random,
): string[] {
  const keys = getYouthSkillKeys(state.isGoalkeeper);
  const remaining = (keys as readonly string[]).filter(
    (k) => !state.revealedSkills.includes(k),
  );
  if (remaining.length === 0) return state.revealedSkills;

  const count = Math.min(remaining.length, random() < 0.5 ? 1 : 2);
  const toReveal = remaining.sort(() => random() - 0.5).slice(0, count);
  return [...state.revealedSkills, ...toReveal];
}

function findPotential(
  potentialSkills: Record<string, any>,
  key: string,
): number | null {
  for (const pCat of Object.values(potentialSkills)) {
    if (pCat && typeof pCat === 'object' && key in pCat) {
      const v = (pCat as Record<string, number>)[key];
      if (typeof v === 'number') return v;
    }
  }
  return null;
}