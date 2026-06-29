import {
  PlayerAbility,
  PlayerEntity,
  PlayerEventType,
  TeamEntity,
  YouthPlayerEntity,
  YOUTH_PROMOTION_DEFAULT_WAGE,
  applyWeeklyGrowth,
  pickNextRevealSkills,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameStateService } from '../game/game-state.service';
import { PlayerEventService } from '../player-event/player-event.service';

@Injectable()
export class YouthService {
  constructor(
    @InjectRepository(YouthPlayerEntity)
    private youthRepo: Repository<YouthPlayerEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    private readonly playerEventService: PlayerEventService,
    private readonly gameStateService: GameStateService,
  ) {}

  /** Get all youth players for a team (with fog filtering) */
  async findByTeam(teamId: string): Promise<YouthPlayerEntity[]> {
    return this.youthRepo.find({
      where: { teamId, isPromoted: false },
      order: { joinedAt: 'DESC' },
    });
  }

  /** Get single youth player */
  async findOne(id: string): Promise<YouthPlayerEntity | null> {
    return this.youthRepo.findOne({ where: { id } });
  }

  /** Apply natural growth to youth players (very slow).
   *  [D2] Delegates to the shared progression utility. */
  async applyNaturalGrowth(youth: YouthPlayerEntity): Promise<void> {
    applyWeeklyGrowth(youth);
    await this.youthRepo.save(youth);
  }

  /** Reveal 1-2 next skills.
   *  [D3] Delegates to the shared reveal utility. */
  async revealNextSkills(youth: YouthPlayerEntity): Promise<void> {
    youth.revealedSkills = pickNextRevealSkills({
      isGoalkeeper: youth.isGoalkeeper,
      revealedSkills: youth.revealedSkills,
    });
    await this.youthRepo.save(youth);
  }

  /** Promote youth player to senior team */
  async promote(id: string): Promise<PlayerEntity> {
    const youth = await this.youthRepo.findOneByOrFail({ id });
    if (youth.isPromoted) {
      throw new Error('Player already promoted');
    }

    // [C3] Merge youth abilities into the senior player's storage:
    //  - PlayerEntity.specialty is a single string column; pick the first
    //    ability (deterministic order from JSONB storage) and store it.
    //  - Mirror the full list into `currentSkills.abilities` because the
    //    match engine reads abilities from there (see simulation-player.ts).
    const seniorAbilities: PlayerAbility[] = Array.isArray(youth.abilities)
      ? [...youth.abilities]
      : [];
    const seniorSpecialty = seniorAbilities[0] ?? null;
    const currentSkills = {
      ...youth.currentSkills,
      abilities: seniorAbilities,
    };

    const player = this.playerRepo.create({
      name: youth.name,
      nationality: youth.nationality,
      createdDay: youth.createdDay,
      teamId: youth.teamId,
      isGoalkeeper: youth.isGoalkeeper,
      isYouth: false,
      currentSkills,
      potentialSkills: youth.potentialSkills,
      specialty: seniorSpecialty,
      experience: 0,
      form: 3,
      stamina: 3,
      // [U3] Senior wage starts at the youth-promotion default. A full
      // contract system (wage progression, contractExpiry) is tracked under
      // Phase 4 (青训合同).
      currentWage: YOUTH_PROMOTION_DEFAULT_WAGE,
      onTransfer: false,
    } as any);

    const saved = await this.playerRepo.save(player);
    const savedPlayer = Array.isArray(saved) ? saved[0] : saved;
    youth.isPromoted = true;
    await this.youthRepo.save(youth);

    // [S3] Use the real current season instead of the previous hard-coded 1.
    const { season } = this.gameStateService.getCurrentSeasonWeek();

    // Record youth promotion event
    await this.playerEventService.create({
      playerId: savedPlayer.id,
      season,
      date: new Date(),
      eventType: PlayerEventType.YOUTH_PROMOTION,
      icon: 'trending_up',
      titleKey: 'player_events.youth_promotion',
      details: { youthName: youth.name },
    });

    return savedPlayer;
  }

  /** Get all active youth players for growth/reveal cron */
  async findAllActive(): Promise<YouthPlayerEntity[]> {
    return this.youthRepo.find({ where: { isPromoted: false } });
  }
}
