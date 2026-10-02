import { AuthService } from '@/api/auth/auth.service';
import { computeCurrentInGameMinute } from '@/api/match/match-current-minute';
import { MatchEventService } from '@/api/match/match-event.service';
import { MatchService } from '@/api/match/match.service';
import { MatchEventEntity, MatchStatus } from '@goalxi/database';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import {
  type RateLimitConfig,
  type RateLimiter,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './match-live-rate-limit';
import { MatchLiveRedisAdapter } from './match-live-redis.adapter';

// 比赛开始前5分钟才能看到首发阵容
const LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES = 5;

/**
 * Mirror the HTTP `corsOrigin` value for the Socket.IO gateway.
 * Reads the same `APP_CORS_ORIGIN` env the REST CORS uses (see
 * `api/src/config/app.config.ts`); defaults to `true` (allow all)
 * in dev to match the existing behaviour, but a deploy that sets
 * `APP_CORS_ORIGIN=https://goalxi.app` now also blocks rogue WS
 * origins.
 *
 * This has to be a module-load-time value because the
 * `@WebSocketGateway` decorator is evaluated before any
 * constructor runs. Keep the parsing rules in lockstep with
 * `app.config.ts` `getCorsOrigin()`.
 */
const socketCorsOrigin: string | string[] | boolean = (() => {
  const raw = process.env.APP_CORS_ORIGIN;
  if (raw === 'true') return true;
  if (raw === '*') return '*';
  if (raw === 'false') return false;
  if (!raw) return true; // dev default
  return raw.split(',').map((s) => s.trim());
})();

interface JoinMatchPayload {
  matchId: string;
}

interface MatchEventPayload {
  type: string;
  matchId: string;
  minute: number;
  teamId?: string;
  playerId?: number;
  playerName?: string;
  data?: any;
  eventScheduledTime?: number;
  /** [WAVE B4] Stable entity UUID — lets the frontend dedupe and key events
   *  across reconnect / replay without recomputing the legacy composite key. */
  id?: string;
  /** [WAVE B4] Backend-authoritative team side, computed at write time by the
   *  simulator. Frontend should treat this as the source of truth — falling back
   *  to `teamId` comparisons only when the backend omits it. */
  isHome?: boolean;
  /**
   * RFC 0003 — Specialty Attribution. Per-event list of which
   * player specialties actually moved a multiplier. Missing for
   * events with no specialty effect (~90% of all events). The FE
   * surfaces the entry with `isPrimary: true` for headline
   * attribution. `multiplier` is the tier-scaled final value —
   * FE must use the `formatSpecialtyBonus` helper, never display
   * the raw decimal.
   */
  specialtyContributions?: Array<{
    playerId: number;
    specialtyCode: string;
    tier: 'GOLD' | 'SILVER' | 'BRONZE';
    effectKey: string;
    multiplier: number;
    role: string;
    isPrimary: boolean;
  }>;
  /**
   * RFC 0002 — Two-Axis Event Coding (Phase 2). The new
   * (eventClassId, outcomeId, outcomeCode) tuple. Omitted when
   * the row was inserted before Phase 2 shipped (legacy
   * read-path) — the FE falls back to `typeName` (the
   * lower_snake string in `type`) for those rows.
   *
   * - `eventClassId`: stable SMALLINT into `event_class_def` (1-17 used)
   * - `outcomeId`:    stable SMALLINT into `event_outcome_def` (1-28 used)
   *                   (null when the class has no outcome, e.g. KICKOFF)
   * - `outcomeCode`:  denormalized stable string ('GOAL', 'SAVE', ...)
   *                   (null when outcomeId is null)
   */
  eventClassId?: number | null;
  outcomeId?: number | null;
  outcomeCode?: string | null;
}

interface MatchStatePayload {
  matchId: string;
  homeTeam: { id: string; name: string; logo: string | null };
  awayTeam: { id: string; name: string; logo: string | null };
  homeScore: number;
  awayScore: number;
  currentMinute: number;
  status: string;
  scheduledAt: string;
  isComplete: boolean;
}

@WebSocketGateway({
  cors: {
    origin: socketCorsOrigin,
    credentials: true,
  },
  namespace: '/matches',
})
export class MatchLiveGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MatchLiveGateway.name);

  // Track which match each socket is subscribed to
  private socketMatchMap = new Map<string, string>();
  // Track sockets per match for broadcasting
  private matchSocketsMap = new Map<string, Set<string>>();
  // S2: per-IP connection rate + active-socket cap. The pure rules
  // live in `match-live-rate-limit.ts`; the backend is injected via
  // the `MATCH_LIVE_RATE_LIMITER` token (in-memory in dev/CI, Redis
  // in production). The interface is the seam — gateway code never
  // touches a `Map` or `Redis` directly.
  private readonly rateLimiter: RateLimiter;
  private readonly rateLimitConfig: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG;

  constructor(
    private readonly authService: AuthService,
    private readonly matchEventService: MatchEventService,
    private readonly matchService: MatchService,
    @InjectRepository(MatchEventEntity)
    private readonly eventRepository: Repository<MatchEventEntity>,
    @Inject('MATCH_LIVE_RATE_LIMITER') rateLimiter: RateLimiter,
    private readonly redisAdapter: MatchLiveRedisAdapter,
  ) {
    this.rateLimiter = rateLimiter;
  }

  /**
   * Called by NestJS after the underlying socket.io `Server` is built.
   * This is the only hook where the gateway can replace `server.adapter`
   * with the Redis-backed one — before this point the server is still
   * using the default in-memory adapter, and once any client has
   * joined a room the adapter is effectively frozen. Idempotent so a
   * hot-reload (`nest start --watch`) won't double-attach.
   */
  afterInit(server: Server): void {
    this.redisAdapter.attachToServer(server);
  }

  async handleConnection(client: Socket) {
    // S2: per-IP rate limit BEFORE any auth work. An attacker opening
    // thousands of connections should be rejected before we touch the
    // DB or run JWT verify on every one of them. The decision now goes
    // through the injected `RateLimiter` (in-memory or Redis); the
    // gateway itself never reads or writes the underlying state.
    const ip = this.getClientIp(client);
    const verdict = await this.rateLimiter.tryConnect(ip);
    if (verdict.accept === false) {
      this.logger.warn(
        `[MatchLive] Rejecting connection from ${ip}: ${verdict.reason}`,
      );
      // `disconnect(true)` tears down the socket without going through
      // the disconnect handler, so we don't need to also decrement the
      // active-socket counter (it was never incremented).
      client.disconnect(true);
      return;
    }

    try {
      // Extract token from handshake
      const token = this.extractToken(client);
      if (token) {
        const payload = await this.authService.verifyAccessToken(token);
        (client as any).user = payload;
        this.logger.debug(
          `Client ${client.id} connected (user: ${payload.id})`,
        );
      } else {
        // Allow anonymous connections for public match viewing
        (client as any).user = null;
        this.logger.debug(`Client ${client.id} connected (anonymous)`);
      }
    } catch (error) {
      this.logger.warn(`Client ${client.id} auth failed: ${error.message}`);
      // Still allow connection but mark as unauthenticated
      (client as any).user = null;
    }
  }

  async handleDisconnect(client: Socket) {
    const matchId = this.socketMatchMap.get(client.id);
    if (matchId) {
      // Remove from match's socket set
      const sockets = this.matchSocketsMap.get(matchId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.matchSocketsMap.delete(matchId);
        }
      }
      this.socketMatchMap.delete(client.id);
    }

    // S2: decrement the per-IP active-socket counter. Goes through
    // the same injected `RateLimiter` so the in-memory and Redis
    // backends both see the disconnect. The backend is responsible
    // for flooring at 0 (RedisRateLimiter's `decr` + clamp; the
    // in-memory backend via `evaluateDisconnect`).
    const ip = this.getClientIp(client);
    await this.rateLimiter.noteDisconnect(ip);

    this.logger.debug(`Client ${client.id} disconnected`);
  }

  /**
   * Best-effort client IP extraction. Socket.io's `handshake.address`
   * is the address the socket connected from (post-proxy hop), so for
   * deployments behind nginx/cloudflare this still returns the
   * load-balancer IP unless the proxy is configured to forward
   * `X-Forwarded-For` via `client.request.headers['x-forwarded-for']`.
   * We deliberately do NOT trust `X-Forwarded-For` here without
   * knowing the proxy chain — accepting a spoofed header would let
   * an attacker bypass the rate limit by setting an arbitrary IP.
   */
  private getClientIp(client: Socket): string {
    return client.handshake.address ?? 'unknown';
  }

  @SubscribeMessage('join_match')
  async handleJoinMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinMatchPayload,
  ) {
    const { matchId } = payload;

    // Leave previous match if any
    const previousMatchId = this.socketMatchMap.get(client.id);
    if (previousMatchId) {
      await this.leaveMatch(client, previousMatchId);
    }

    // Subscribe-ability check before joining the room. Done in one
    // pass with the match fetch so we don't pay for a second
    // `matchService.findOne` (the previous split into a separate
    // `canSubscribeMatch` + `getMatchState` was a latent N+1 — one
    // query per join, scaling linearly with concurrent joins on a
    // hot match).
    //
    // We also bail before `client.join(...)` so a rejected socket
    // never appears in any room — keeps the per-room socket set
    // (`matchSocketsMap`) honest.
    let match: Awaited<ReturnType<typeof this.matchService.findOne>>;
    try {
      match = await this.matchService.findOne(matchId);
    } catch (error) {
      // `findOne` throws `NotFoundException` for unknown matchId; we
      // don't want to leak that into the error_msg payload because
      // it lets an attacker probe matchId existence. Treat any fetch
      // failure as "not allowed" with a generic message.
      this.logger.warn(
        `[MatchLive] join_match: match ${matchId} lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.emit('error_msg', { message: 'Match not available' });
      return;
    }

    if (!this.canSubscribeMatch(match)) {
      client.emit('error_msg', { message: 'Match not available' });
      return;
    }

    // Join new match room
    await client.join(`match:${matchId}`);
    this.socketMatchMap.set(client.id, matchId);

    if (!this.matchSocketsMap.has(matchId)) {
      this.matchSocketsMap.set(matchId, new Set());
    }
    this.matchSocketsMap.get(matchId)!.add(client.id);

    // Get match current state. Pass the already-fetched match in to
    // skip a second DB roundtrip (the N+1 fix referenced above).
    try {
      const matchState = await this.getMatchState(match);
      const events = await this.getVisibleEvents(matchId);

      // Send initial state to client
      client.emit('match_state', matchState);
      client.emit('match_events', { matchId, events });

      this.logger.debug(
        `Client ${client.id} joined match ${matchId} (${events.length} events visible)`,
      );
    } catch (error) {
      this.logger.error(
        `[MatchLive] Failed to load match ${matchId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // We already joined the room above so the client can see
      // future events; the initial-state failure path is best
      // surfaced to the user as a generic load error.
      client.emit('error_msg', { message: 'Failed to load match state' });
    }
  }

  @SubscribeMessage('leave_match')
  async handleLeaveMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinMatchPayload,
  ) {
    const { matchId } = payload;
    await this.leaveMatch(client, matchId);
    client.emit('match_left', { matchId });
  }

  private async leaveMatch(client: Socket, matchId: string) {
    await client.leave(`match:${matchId}`);
    this.socketMatchMap.delete(client.id);

    const sockets = this.matchSocketsMap.get(matchId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.matchSocketsMap.delete(matchId);
      }
    }

    this.logger.debug(`Client ${client.id} left match ${matchId}`);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: Date.now() });
  }

  // Called by scheduler to broadcast revealed events
  broadcastEvents(matchId: string, events: MatchEventPayload[]) {
    this.server.to(`match:${matchId}`).emit('match_events', {
      matchId,
      events,
      timestamp: Date.now(),
    });
  }

  // Called by scheduler to broadcast score updates
  broadcastScoreUpdate(
    matchId: string,
    homeScore: number,
    awayScore: number,
    currentMinute: number,
  ) {
    this.server.to(`match:${matchId}`).emit('score_update', {
      matchId,
      homeScore,
      awayScore,
      currentMinute,
      timestamp: Date.now(),
    });
  }

  // Called when match completes
  broadcastMatchEnd(
    matchId: string,
    homeScore: number,
    awayScore: number,
    isComplete: boolean,
  ) {
    this.server.to(`match:${matchId}`).emit('match_end', {
      matchId,
      homeScore,
      awayScore,
      isComplete,
      timestamp: Date.now(),
    });
  }

  // Called to broadcast lineup (when within 5 minutes of kickoff)
  broadcastLineup(matchId: string, lineup: any) {
    this.server.to(`match:${matchId}`).emit('lineup_update', {
      matchId,
      lineup,
      timestamp: Date.now(),
    });
  }

  private async getMatchState(
    match: NonNullable<Awaited<ReturnType<typeof this.matchService.findOne>>>,
  ): Promise<MatchStatePayload> {
    const matchId = match.id;

    // Derive currentMinute from the sim's published timing anchors
    // (`match.scheduledAt` + per-half injury times), NOT from the
    // event stream. The sim already published a per-event
    // `eventScheduledTime` that maps in-game minute to a real-world
    // instant relative to kickoff, encoding the half-time break
    // and injury time (see `match-current-minute.ts`). Inverting
    // that mapping gives a wall-clock-anchored minute that keeps
    // advancing in the gaps between event reveals — the previous
    // MAX(minute) approach got stuck at the last revealed event's
    // minute whenever the preprocessor went a few seconds without
    // revealing anything (e.g. 90' during 2H injury time, where
    // events at 91..93 were revealed one tick at a time).
    //
    // For COMPLETED matches we keep the previous behaviour: surface
    // a "FT" minute of at least 90, and preserve any >90 (extra
    // time) verbatim. `computeCurrentInGameMinute` already returns
    // the post-FT minute for a long-finished match, so we only need
    // the floor for the abandoned/short-simulated edge case.
    // Single aggregate per match — MAX(minute) for the COMPLETED
    // "last event crossed 90'?" clamp, plus two FILTER'd COUNTs for
    // the cumulative score. One row-trip beats two: the wall-clock
    // path for currentMinute is purely CPU, so the only DB hit here
    // is this aggregate.
    //
    // homeScore/awayScore are *cumulative revealed* counts, not the
    // pre-baked `match.homeScore`/`match.awayScore` columns. The
    // latter are written by the simulator at sim-completion time
    // with the *final* scoreline (see `simulation.processor.ts:1001`
    // — `match.homeScore = engine.homeScore`), which means an
    // IN_PROGRESS match has a pre-filled "2-2" sitting on the row
    // from the moment the sim finished, several minutes before the
    // goals are actually revealed to the client. Reading that
    // column for the initial `match_state` payload showed the final
    // scoreline on the live page the instant the WS connected — the
    // load-bearing "live page reads 2-2 at kickoff" bug.
    //
    // The aggregate is monotonic by construction (FILTER is per-row,
    // GROUP-less, so the totals never decrease as more events flip
    // isRevealed), so it's safe as the canonical score for both
    // IN_PROGRESS (partial reveal) and COMPLETED (all events
    // revealed, total == final scoreline). For COMPLETED the two
    // values are guaranteed equal so the choice is invisible to
    // the client; for IN_PROGRESS the aggregate stays at 0-0 until
    // the first goal event flips `isRevealed = true`.
    const agg = await this.eventRepository
      .createQueryBuilder('e')
      .select('MAX(e.minute)', 'maxMinute')
      .addSelect(
        `COUNT(*) FILTER (WHERE e.typeName IN ('goal', 'penalty_goal') AND e.isHome = true)`,
        'homeGoals',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE e.typeName IN ('goal', 'penalty_goal') AND e.isHome = false)`,
        'awayGoals',
      )
      .where('e.matchId = :matchId', { matchId })
      .andWhere('e.isRevealed = :revealed', { revealed: true })
      .getRawOne<{
        maxMinute: string | null;
        homeGoals: string;
        awayGoals: string;
      }>();
    const homeScore = Number(agg?.homeGoals ?? 0);
    const awayScore = Number(agg?.awayGoals ?? 0);

    // Derive currentMinute from the sim's published timing anchors
    // (`match.scheduledAt` + per-half injury times), NOT from the
    // event stream. The sim already published a per-event
    // `eventScheduledTime` that maps in-game minute to a real-world
    // instant relative to kickoff, encoding the half-time break
    // and injury time (see `match-current-minute.ts`). Inverting
    // that mapping gives a wall-clock-anchored minute that keeps
    // advancing in the gaps between event reveals — the previous
    // MAX(minute) approach got stuck at the last revealed event's
    // minute whenever the preprocessor went a few seconds without
    // revealing anything (e.g. 90' during 2H injury time, where
    // events at 91..93 were revealed one tick at a time).
    //
    // For COMPLETED matches we keep the previous behaviour: surface
    // a "FT" minute of at least 90, and preserve any >90 (extra
    // time) verbatim. The MAX(e.minute) above is the post-FT
    // minute for a long-finished match, so we only need the floor
    // for the abandoned/short-simulated edge case.
    let currentMinute: number;
    if (match.status === MatchStatus.COMPLETED) {
      const eventMinute = agg?.maxMinute ? Number(agg.maxMinute) : 0;
      currentMinute = Math.max(90, eventMinute);
    } else {
      currentMinute = computeCurrentInGameMinute(match);
    }

    return {
      matchId: match.id,
      homeTeam: {
        id: match.homeTeam!.id,
        name: match.homeTeam!.name,
        logo: (match.homeTeam as any)?.logoUrl || null,
      },
      awayTeam: {
        id: match.awayTeam!.id,
        name: match.awayTeam!.name,
        logo: (match.awayTeam as any)?.logoUrl || null,
      },
      homeScore,
      awayScore,
      currentMinute,
      status: match.status,
      scheduledAt: match.scheduledAt.toISOString(),
      isComplete: match.status === MatchStatus.COMPLETED,
    };
  }

  private async getVisibleEvents(
    matchId: string,
  ): Promise<MatchEventPayload[]> {
    const response = await this.matchEventService.getMatchEvents(matchId);

    return response.events.map((e) => ({
      // RFC 0002 Phase 3 — `e.type` (int) is gone. The wire
      // format is the `typeName` string (lower_snake, e.g.
      // 'goal' / 'yellow_card' / 'turnover'). The FE
      // uses this string directly in commentary templates
      // and EVENT_COLOR / EVENT_ICON lookups.
      type: e.typeName,
      matchId: e.matchId,
      minute: e.minute,
      teamId: e.teamId,
      playerId: e.playerId,
      playerName: (e.data as any)?.playerName,
      data: e.data,
      eventScheduledTime: e.eventScheduledTime?.getTime(),
      id: e.id,
      isHome: e.isHome ?? undefined,
      // RFC 0003 — pass the attribution array through verbatim. The
      // engine-side `SpecialtyAttributionRecorder` (see
      // `simulator/.../systems/specialty.attribution.ts`) is the only
      // writer; readers just forward the array.
      specialtyContributions: e.specialtyContributions,
      // RFC 0002 — Two-Axis Event Coding. Forward the new tuple
      // alongside the legacy `type` string. The FE picks which
      // to read; both stay in the wire for the 1-week Phase 2
      // soak period.
      eventClassId: e.eventClassId ?? null,
      outcomeId: e.outcomeId ?? null,
      outcomeCode: e.outcomeCode ?? null,
    }));
  }

  private extractToken(client: Socket): string | null {
    // Two accepted sources, in order:
    //   1. `Authorization: Bearer <token>` header (the standard path
    //      when the client is server-side or a native app)
    //   2. `auth.token` / `query.token` (the socket.io convention for
    //      browser clients that can't set custom headers on the
    //      WebSocket upgrade request)
    //
    // S7: the previous version also had a dead branch that returned
    // the raw `authHeader` value when it was a non-empty string but
    // didn't start with `Bearer `. That was a footgun — any garbage
    // header would be passed to `verifyAccessToken` and either be
    // rejected loudly or, worse, succeed in some upstream bug. We now
    // only return strings that look like a real Bearer token, and the
    // well-typed `auth.token` / `query.token` path as a fallback.
    const authHeader = client.handshake.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const token = client.handshake.auth?.token ?? client.handshake.query?.token;
    if (typeof token === 'string' && token.length > 0) {
      return token;
    }

    return null;
  }

  // Check if match is subscribeable (within lineup window or in progress).
  // Pure — takes the already-fetched match row to avoid a redundant
  // `matchService.findOne` (the caller — `handleJoinMatch` — needs the
  // match anyway for the state payload).
  canSubscribeMatch(
    match: NonNullable<Awaited<ReturnType<typeof this.matchService.findOne>>>,
  ): boolean {
    const now = Date.now();
    const kickoffMs = new Date(match.scheduledAt).getTime();
    const minutesBeforeKickoff = (kickoffMs - now) / (60 * 1000);

    // Can subscribe if:
    // 1. Match is in progress
    // 2. Within 5 minutes before kickoff
    // 3. Match is completed (for viewing replays)
    return (
      match.status === MatchStatus.IN_PROGRESS ||
      (match.status === MatchStatus.TACTICS_LOCKED &&
        minutesBeforeKickoff <= LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES &&
        minutesBeforeKickoff > 0) ||
      match.status === MatchStatus.COMPLETED
    );
  }
}
