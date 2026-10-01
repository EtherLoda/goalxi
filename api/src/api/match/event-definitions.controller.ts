import { Public } from '@/decorators/public.decorator';
import { EventClassDefEntity, EventOutcomeDefEntity } from '@goalxi/database';
import { Controller, Get } from '@nestjs/common';
import { EventDefinitionsService } from './event-definitions.service';

/**
 * RFC 0002 — Phase 1 dictionary endpoints. Both routes are
 * `@Public()` (no auth) and the response is static reference
 * data — the FE caches it on first load.
 *
 * Path: `GET /v1/matches/event-class-def` and
 *       `GET /v1/matches/event-outcome-def`
 *
 * The match controller already owns `matches/*` paths; these
 * two are hung off the same controller prefix to avoid a new
 * `event-dictionary` module for two static endpoints.
 *
 * If a future split is needed (e.g. a dedicated
 * `reference-data` module), this can move without API breaking
 * because the paths stay stable.
 */
@Controller({
  path: 'matches/event-class-def',
  version: '1',
})
export class EventClassDefController {
  constructor(private readonly service: EventDefinitionsService) {}

  @Public()
  @Get()
  list(): Promise<EventClassDefEntity[]> {
    return this.service.findAllClasses();
  }
}

@Controller({
  path: 'matches/event-outcome-def',
  version: '1',
})
export class EventOutcomeDefController {
  constructor(private readonly service: EventDefinitionsService) {}

  @Public()
  @Get()
  list(): Promise<EventOutcomeDefEntity[]> {
    return this.service.findAllOutcomes();
  }
}
