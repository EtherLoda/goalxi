import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EventClassDefEntity,
  EventOutcomeDefEntity,
} from '@goalxi/database';

/**
 * RFC 0002 — Phase 1 dictionary lookup service.
 *
 * The `event_class_def` and `event_outcome_def` tables are
 * reference data: a 17-row class table + a 28-row outcome
 * table. The FE fetches them on app load to render the
 * (class_id, outcome_id) → display-label maps without
 * shipping hardcoded id tables in the JS bundle.
 *
 * Both endpoints are `@Public()` and the response is safe to
 * cache aggressively (1h+ TTL) because the data only changes
 * when a deploy updates the migration. We don't add server-side
 * caching in Phase 1 — the FE's fetch-once-on-mount pattern is
 * enough and keeps the API surface small. A Redis cache lands
 * with the broader `match-cache.service` rework (out of scope
 * here).
 */
@Injectable()
export class EventDefinitionsService {
  constructor(
    @InjectRepository(EventClassDefEntity)
    private readonly classRepo: Repository<EventClassDefEntity>,
    @InjectRepository(EventOutcomeDefEntity)
    private readonly outcomeRepo: Repository<EventOutcomeDefEntity>,
  ) {}

  /** Sorted by `sort_order` so the FE renders in stable order. */
  async findAllClasses(): Promise<EventClassDefEntity[]> {
    return this.classRepo.find({ order: { sortOrder: 'ASC' } });
  }

  /** Sorted by `sort_order` so the FE renders in stable order. */
  async findAllOutcomes(): Promise<EventOutcomeDefEntity[]> {
    return this.outcomeRepo.find({ order: { sortOrder: 'ASC' } });
  }
}
