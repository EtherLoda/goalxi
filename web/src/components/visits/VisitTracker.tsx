'use client';

import { useEffect } from 'react';
import { api, type VisitSubjectType } from '@/lib/api';

interface VisitTrackerProps {
  subjectType: VisitSubjectType;
  subjectId: string;
}

/**
 * Records one page view. Renders nothing.
 *
 * Logged-out visitors never call the API — that is how "don't record
 * anonymous visits" is enforced, rather than by trusting a 204.
 *
 * The ping is fire-and-forget on purpose: a visit is telemetry, so a
 * failure (offline, expired token, API down) must be invisible.
 */
export function VisitTracker({ subjectType, subjectId }: VisitTrackerProps) {
  useEffect(() => {
    if (!subjectId) return;
    void api.visits
      .record(subjectType, subjectId)
      .catch(() => undefined);
  }, [subjectType, subjectId]);

  return null;
}
