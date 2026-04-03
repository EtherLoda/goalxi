/**
 * Helper functions to get human-readable ratings for form and stamina
 */

export function getFormRating(form: number): string {
  if (form < 2.0) return 'Poor';
  if (form < 3.0) return 'Below Average';
  if (form < 4.0) return 'Average';
  if (form < 5.0) return 'Good';
  return 'Excellent';
}

export function getStaminaRating(stamina: number): string {
  if (stamina < 2.0) return 'Exhausted';
  if (stamina < 3.0) return 'Tired';
  if (stamina < 4.0) return 'Normal';
  if (stamina < 5.0) return 'Fresh';
  return 'Peak';
}

export const FORM_RATINGS = {
  POOR: { min: 1.0, max: 1.9, label: 'Poor' },
  BELOW_AVERAGE: { min: 2.0, max: 2.9, label: 'Below Average' },
  AVERAGE: { min: 3.0, max: 3.9, label: 'Average' },
  GOOD: { min: 4.0, max: 4.9, label: 'Good' },
  EXCELLENT: { min: 5.0, max: 5.0, label: 'Excellent' },
};

export const STAMINA_RATINGS = {
  EXHAUSTED: { min: 1.0, max: 1.9, label: 'Exhausted' },
  TIRED: { min: 2.0, max: 2.9, label: 'Tired' },
  NORMAL: { min: 3.0, max: 3.9, label: 'Normal' },
  FRESH: { min: 4.0, max: 4.9, label: 'Fresh' },
  PEAK: { min: 5.0, max: 5.0, label: 'Peak' },
};
