import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupRoundEntity,
  TeamEntity,
  type Uuid,
} from '@goalxi/database';
import { CupBracketResDto } from './dto/cup-bracket.res.dto';
import { CupMatchResDto, CupRoundResDto } from './dto/cup-round.res.dto';
import { CupResDto } from './dto/cup.res.dto';
import { ListCupReqDto } from './dto/list-cup.req.dto';

/**
 * Read-only API service for the cup competition. Phase 4
 * has no admin endpoints (cup creation, scheduling, etc. all
 * live in settlement's CupGenerator / CupSchedulerService);
 * the API just surfaces the data the FE needs to render
 * bracket / cup-list / team-cup-history views.
 *
 * Endpoints:
 *   - `findMany(req)`        — list cups (filter by season/type)
 *   - `findOne(id)`          — single cup meta
 *   - `findBracket(id)`      — cup + every round + every match
 */
@Injectable()
export class CupService {
  constructor(
    @InjectRepository(CupEntity)
    private readonly cupRepo: Repository<CupEntity>,
    @InjectRepository(CupRoundEntity)
    private readonly roundRepo: Repository<CupRoundEntity>,
    @InjectRepository(CupBracketSlotEntity)
    private readonly slotRepo: Repository<CupBracketSlotEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
  ) {}

  async findMany(req: ListCupReqDto): Promise<CupResDto[]> {
    const qb = this.cupRepo.createQueryBuilder('cup').orderBy(
      'cup.season',
      'DESC',
    );
    if (req.season !== undefined) {
      qb.andWhere('cup.season = :season', { season: req.season });
    }
    if (req.type) {
      qb.andWhere('cup.type = :type', { type: req.type });
    }
    const cups = await qb.getMany();
    return cups.map((c) => this.toResDto(c));
  }

  async findOne(id: Uuid): Promise<CupResDto> {
    const cup = await this.cupRepo.findOne({ where: { id } });
    if (!cup) {
      throw new NotFoundException(`Cup ${id} not found`);
    }
    return this.toResDto(cup);
  }

  async findBracket(id: Uuid): Promise<CupBracketResDto> {
    const cup = await this.cupRepo.findOne({ where: { id } });
    if (!cup) {
      throw new NotFoundException(`Cup ${id} not found`);
    }
    const rounds = await this.roundRepo.find({
      where: { cupId: id },
      order: { roundNumber: 'ASC' },
    });
    const slots = await this.slotRepo.find({
      where: { cupId: id },
      order: { roundId: 'ASC', slotIndex: 'ASC' },
    });

    // Fetch every team referenced by any slot in one query,
    // then index by id. Avoids N+1 (2000+ team lookups for
    // a 1024-slot round).
    const teamIds = new Set<string>();
    for (const s of slots) {
      if (s.homeTeamId) teamIds.add(s.homeTeamId);
      if (s.awayTeamId) teamIds.add(s.awayTeamId);
    }
    const teamRows = teamIds.size
      ? await this.teamRepo.find({
          where: { id: In(Array.from(teamIds)) },
        })
      : [];
    const teamById = new Map<string, TeamEntity>(
      teamRows.map((t) => [t.id, t]),
    );

    // Bucket slots by round for the per-round grouping.
    const slotsByRound = new Map<string, CupBracketSlotEntity[]>();
    for (const s of slots) {
      const list = slotsByRound.get(s.roundId) ?? [];
      list.push(s);
      slotsByRound.set(s.roundId, list);
    }

    const roundDtos: CupRoundResDto[] = rounds.map((r) => {
      const roundSlots = slotsByRound.get(r.id) ?? [];
      return {
        roundNumber: r.roundNumber,
        roundName: r.roundName,
        kind: r.kind,
        status: r.status,
        scheduledAt: r.scheduledAt?.toISOString() ?? null,
        matches: this.slotsToMatchDtos(roundSlots, teamById),
      };
    });

    return {
      cup: this.toResDto(cup),
      rounds: roundDtos,
    };
  }

  /**
   * Pair consecutive slots (slot[i], slot[i+1]) into one
   * match. A bye occupies a single slot; in that case the
   * pair is `(homeSlot, null)` with `isBye=true`.
   */
  private slotsToMatchDtos(
    slots: CupBracketSlotEntity[],
    teamById: Map<string, TeamEntity>,
  ): CupMatchResDto[] {
    const matches: CupMatchResDto[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      const homeSlot = slots[i];
      const awaySlot = slots[i + 1];
      // A single orphan slot (round with an odd number of
      // slots from bye math) is rendered as a bye match.
      if (!awaySlot) {
        matches.push(this.slotToMatchDto(homeSlot, null, teamById, true));
        continue;
      }
      // Two slots — the home slot is the "home perspective"
      // and the away slot is the "away perspective". They
      // share the same matchId. We pick the home perspective
      // for the primary record and skip the away slot.
      if (homeSlot.matchId && homeSlot.id !== awaySlot.id) {
        matches.push(
          this.slotToMatchDto(homeSlot, awaySlot, teamById, false),
        );
        // Skip the away slot on the next iteration.
        i++;
        continue;
      }
      // Standalone slot without a match (bye fallback).
      matches.push(this.slotToMatchDto(homeSlot, null, teamById, true));
    }
    return matches;
  }

  private slotToMatchDto(
    slot: CupBracketSlotEntity,
    partner: CupBracketSlotEntity | null,
    teamById: Map<string, TeamEntity>,
    isBye: boolean,
  ): CupMatchResDto {
    const home = slot.homeTeamId ? teamById.get(slot.homeTeamId) : null;
    const away = partner?.awayTeamId
      ? teamById.get(partner.awayTeamId)
      : null;
    return {
      matchId: slot.matchId ?? null,
      homeTeam: home
        ? { id: home.id, name: home.name, tier: 0 }
        : null,
      awayTeam: away
        ? { id: away.id, name: away.name, tier: 0 }
        : null,
      // The winner is the same in both slot perspectives
      // (the progress worker stamps both), so reading from
      // the primary slot is fine.
      winnerTeamId: slot.winnerTeamId ?? null,
      isBye: isBye || slot.isBye,
      scheduledAt: null, // match-level scheduledAt; the
      // round-level `scheduledAt` is on the round itself.
    };
  }

  private toResDto(cup: CupEntity): CupResDto {
    return {
      id: cup.id,
      season: cup.season,
      type: cup.type,
      name: cup.name,
      status: cup.status,
      prizeCurrency: cup.prizeCurrency,
      // bigint → number. Assumes the pool fits in 2^53; the
      // DB column is bigint for forward-compat with larger
      // prize pools but the MVP never crosses that line.
      prizePool: Number(cup.prizePool),
      createdAt: cup.createdAt.toISOString(),
      updatedAt: cup.updatedAt.toISOString(),
    };
  }
}
