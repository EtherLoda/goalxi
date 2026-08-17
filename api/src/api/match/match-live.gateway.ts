import { AuthService } from '@/api/auth/auth.service';
import { MatchEventService } from '@/api/match/match-event.service';
import { MatchService } from '@/api/match/match.service';
import { MatchEventEntity, MatchStatus } from '@goalxi/database';
import { Inject, Logger, forwardRef } from '@nestjs/common';
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
    @Inject(forwardRef(() => MatchEventService))
    private readonly matchEventService: MatchEventService,
    @Inject(forwardRef(() => MatchService))
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

    // Derive currentMinute from the event stream, NOT from wall-clock.
    // S1 fix: the previous implementation computed `elapsed = now - kickoff`
    // and clamped to a 45/60/90 heuristic, which drifted from the actual
    // match timeline in two real cases:
    //   - paused matches: the sim stops emitting events but wall-clock
    //     keeps ticking, so the client thought the match was 60+ minutes
    //     in when it had only reached, say, 30'.
    //   - scheduler lag: if `processRevealableEvents` is a few seconds
    //     behind, the wall-clock minute jumps past the latest event
    //     and the client's `MatchLiveView` `visibleEvents` filter
    //     (`minute <= currentMinute`) drops in-flight events.
    // Pulling max revealed minute gives one source of truth that's
    // shared with the scheduler's `broadcastScoreUpdate` (which already
    // uses the same approach at `match-live.scheduler.ts:226-228`).
    //
    // N+1 fix: collapse the previous `findOne({ where: {matchId,
    // isRevealed:true}, order:{minute:'DESC'} })` (which returned
    // a full entity row) into a single `SELECT MAX(minute)`. The
    // `isRevealed = true` filter does not match the partial index
    // (which covers `is_revealed = false`), but on a per-match
    // matchEvent table a `WHERE matchId = ?` lookup is already
    // index-scoped via `(matchId, eventScheduledTime)`, so the
    // aggregate is fast in practice. The bigger win is that the
    // query now never returns a full row we don't need.
    const agg = await this.eventRepository
      .createQueryBuilder('e')
      .select('MAX(e.minute)', 'maxMinute')
      .where('e.matchId = :matchId', { matchId })
      .andWhere('e.isRevealed = :revealed', { revealed: true })
      .getRawOne<{ maxMinute: string | null }>();
    const eventMinute = agg?.maxMinute ? Number(agg.maxMinute) : 0;

    // For COMPLETED matches we surface a "FT" minute of at least 90 even
    // if no event crossed the 90' line (e.g. abandoned matches, or
    // simulator ran fewer minutes). Extra time (>90) is preserved
    // verbatim — it reflects reality, and the report page's
    // `getReportCurrentMinute` does the same `Math.max(90, max)` clamp.
    const currentMinute =
      match.status === MatchStatus.COMPLETED
        ? Math.max(90, eventMinute)
        : eventMinute;

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
      homeScore: match.homeScore || 0,
      awayScore: match.awayScore || 0,
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
      type: e.typeName || String(e.type),
      matchId: e.matchId,
      minute: e.minute,
      teamId: e.teamId,
      playerId: e.playerId,
      playerName: (e.data as any)?.playerName,
      data: e.data,
      eventScheduledTime: e.eventScheduledTime?.getTime(),
      id: e.id,
      isHome: e.isHome ?? undefined,
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
