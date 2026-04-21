import { AuthService } from '@/api/auth/auth.service';
import { MatchEventService } from '@/api/match/match-event.service';
import { MatchService } from '@/api/match/match.service';
import { MatchStatus } from '@goalxi/database';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// 比赛开始前5分钟才能看到首发阵容
const LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES = 5;

interface JoinMatchPayload {
  matchId: string;
}

interface MatchEventPayload {
  type: string;
  matchId: string;
  minute: number;
  teamId?: string;
  playerId?: string;
  playerName?: string;
  data?: any;
  eventScheduledTime?: number;
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
    origin: '*',
    credentials: true,
  },
  namespace: '/matches',
})
export class MatchLiveGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MatchLiveGateway.name);

  // Track which match each socket is subscribed to
  private socketMatchMap = new Map<string, string>();
  // Track sockets per match for broadcasting
  private matchSocketsMap = new Map<string, Set<string>>();

  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => MatchEventService))
    private readonly matchEventService: MatchEventService,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
  ) {}

  async handleConnection(client: Socket) {
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

  handleDisconnect(client: Socket) {
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
    this.logger.debug(`Client ${client.id} disconnected`);
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

    // Join new match room
    await client.join(`match:${matchId}`);
    this.socketMatchMap.set(client.id, matchId);

    if (!this.matchSocketsMap.has(matchId)) {
      this.matchSocketsMap.set(matchId, new Set());
    }
    this.matchSocketsMap.get(matchId)!.add(client.id);

    // Get match current state
    try {
      const matchState = await this.getMatchState(matchId);
      const events = await this.getVisibleEvents(matchId);

      // Send initial state to client
      client.emit('match_state', matchState);
      client.emit('match_events', { matchId, events });

      this.logger.debug(
        `Client ${client.id} joined match ${matchId} (${events.length} events visible)`,
      );
    } catch (error) {
      this.logger.error(`Failed to load match ${matchId}: ${error.message}`);
      client.emit('error', { message: 'Match not found' });
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

  private async getMatchState(matchId: string): Promise<MatchStatePayload> {
    const match = await this.matchService.findOne(matchId);
    const now = new Date();
    const kickoffTime = new Date(match.scheduledAt);

    // Calculate current minute based on real elapsed time
    let currentMinute = 0;
    if (match.status === MatchStatus.IN_PROGRESS && now >= kickoffTime) {
      const elapsedMs = now.getTime() - kickoffTime.getTime();
      const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));

      if (elapsedMinutes <= 45) {
        currentMinute = elapsedMinutes;
      } else if (elapsedMinutes <= 60) {
        currentMinute = 45; // Halftime
      } else {
        currentMinute = Math.min(elapsedMinutes - 15, 90);
      }
    } else if (match.status === MatchStatus.COMPLETED) {
      currentMinute = 90;
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
    }));
  }

  private extractToken(client: Socket): string | null {
    // Try Authorization header first
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try token in handshake query
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    if (typeof token === 'string') {
      return token;
    }

    // Try token from handshake headers
    if (typeof authHeader === 'string') {
      return authHeader;
    }

    return null;
  }

  // Check if match is subscribeable (within lineup window or in progress)
  async canSubscribeMatch(matchId: string): Promise<boolean> {
    const match = await this.matchService.findOne(matchId);
    const now = new Date();
    const kickoffTime = new Date(match.scheduledAt);
    const minutesBeforeKickoff =
      (kickoffTime.getTime() - now.getTime()) / (60 * 1000);

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
