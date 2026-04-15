import { PlayerEventEntity, PlayerEventType, Uuid } from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { CreatePlayerEventDto } from './dto/create-player-event.req.dto';
import { PlayerEventResDto } from './dto/player-event.res.dto';

@Injectable()
export class PlayerEventService {
  constructor(
    @InjectRepository(PlayerEventEntity)
    private readonly eventRepo: Repository<PlayerEventEntity>,
  ) {}

  async findByPlayer(
    playerId: Uuid,
    season?: number,
  ): Promise<PlayerEventResDto[]> {
    const query = this.eventRepo
      .createQueryBuilder('event')
      .where('event.playerId = :playerId', { playerId })
      .orderBy('event.date', 'DESC');

    if (season !== undefined) {
      query.andWhere('event.season = :season', { season });
    }

    const events = await query.getMany();
    return events.map((e) => plainToInstance(PlayerEventResDto, e));
  }

  async create(dto: CreatePlayerEventDto): Promise<PlayerEventResDto> {
    const event = this.eventRepo.create(dto as Partial<PlayerEventEntity>);
    const saved = await this.eventRepo.save(event);
    return plainToInstance(PlayerEventResDto, saved);
  }

  async createBatch(
    dtos: CreatePlayerEventDto[],
  ): Promise<PlayerEventResDto[]> {
    const events = this.eventRepo.create(dtos as Partial<PlayerEventEntity>[]);
    const saved = await this.eventRepo.save(events);
    return saved.map((e) => plainToInstance(PlayerEventResDto, e));
  }

  async createIfNotExists(
    playerId: Uuid,
    eventType: PlayerEventType,
    season: number,
    matchId?: Uuid,
  ): Promise<PlayerEventResDto | null> {
    // Check if event already exists for this player/match
    if (matchId) {
      const existing = await this.eventRepo.findOne({
        where: { playerId, eventType, matchId },
      });
      if (existing) {
        return plainToInstance(PlayerEventResDto, existing);
      }
    }

    return this.create({
      playerId,
      season,
      date: new Date(),
      eventType,
      matchId,
    });
  }
}
