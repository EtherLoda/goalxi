/**
 * What a visit can be attached to.
 *
 * Deliberately a small closed union: the key space in Redis is derived
 * from these strings, so an unknown value would write to a key nothing
 * ever reads. `POST /visits` also uses this to pick which table to
 * verify the id against.
 */
export const VISIT_SUBJECT_TYPES = ['team', 'league', 'user'] as const;

export type VisitSubjectType = (typeof VISIT_SUBJECT_TYPES)[number];
