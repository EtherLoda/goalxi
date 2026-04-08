import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import {
  PlayerEntity,
  PlayerSkills,
  Uuid,
  calculatePlayerWage,
} from '@goalxi/database';

interface BirthdayWageJobData {
  playerId: string;
}

@Injectable()
@Processor('player-wage')
export class PlayerWageProcessor extends WorkerHost {
  private readonly logger = new Logger(PlayerWageProcessor.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
  ) {
    super();
  }

  async process(job: Job<BirthdayWageJobData>): Promise<void> {
    if (job.name === 'birthday-wage-update') {
      await this.processBirthdayWageUpdate(job.data.playerId);
    }
  }

  private async processBirthdayWageUpdate(playerId: string): Promise<void> {
    const where: FindOptionsWhere<PlayerEntity> = { id: playerId as Uuid };
    const player = await this.playerRepo.findOne({ where });
    if (!player) {
      this.logger.warn(`[PlayerWageProcessor] Player not found: ${playerId}`);
      return;
    }

    // Extract skills with keys for weighted calculation
    const { values, keys } = this.extractSkillsWithKeys(player.currentSkills);
    const oldWage = player.currentWage;
    const newWage = calculatePlayerWage(values, keys);

    if (oldWage !== newWage) {
      player.currentWage = newWage;
      await this.playerRepo.save(player);
      this.logger.log(
        `[PlayerWageProcessor] Player ${player.name} birthday wage update: ${oldWage} -> ${newWage}`,
      );
    }
  }

  /**
   * Extract skills with keys from PlayerSkills object for weighted wage calculation
   */
  private extractSkillsWithKeys(currentSkills: PlayerSkills): {
    values: number[];
    keys: string[];
  } {
    const values: number[] = [];
    const keys: string[] = [];

    // Physical skills (same for all outfield players)
    values.push(currentSkills.physical.pace, currentSkills.physical.strength);
    keys.push('pace', 'strength');

    // Technical skills: GK has different structure than outfield
    if ('reflexes' in currentSkills.technical) {
      values.push(
        currentSkills.technical.reflexes,
        currentSkills.technical.handling,
        currentSkills.technical.aerial,
      );
      keys.push('gk_reflexes', 'gk_handling', 'gk_aerial');
    } else {
      values.push(
        currentSkills.technical.finishing,
        currentSkills.technical.passing,
        currentSkills.technical.dribbling,
        currentSkills.technical.defending,
      );
      keys.push('finishing', 'passing', 'dribbling', 'defending');
    }

    // Mental skills (same for all players)
    values.push(currentSkills.mental.positioning, currentSkills.mental.composure);
    keys.push('positioning', 'composure');

    // Set pieces (same for all players)
    values.push(currentSkills.setPieces.freeKicks, currentSkills.setPieces.penalties);
    keys.push('freeKicks', 'penalties');

    return { values, keys };
  }
}
