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

    // Extract skills array from currentSkills
    const skills = this.extractSkills(player.currentSkills);
    const oldWage = player.currentWage;
    const newWage = calculatePlayerWage(skills);

    if (oldWage !== newWage) {
      player.currentWage = newWage;
      await this.playerRepo.save(player);
      this.logger.log(
        `[PlayerWageProcessor] Player ${player.name} birthday wage update: ${oldWage} -> ${newWage}`,
      );
    }
  }

  /**
   * Extract skills array from PlayerSkills object
   */
  private extractSkills(currentSkills: PlayerSkills): number[] {
    const skills: number[] = [];

    // Physical skills
    if (currentSkills.physical) {
      skills.push(currentSkills.physical.pace);
      skills.push(currentSkills.physical.strength);
    }

    // Technical skills (could be GK or outfield)
    if (currentSkills.technical) {
      if ('reflexes' in currentSkills.technical) {
        // GK skills
        skills.push(currentSkills.technical.reflexes);
        skills.push(currentSkills.technical.handling);
        skills.push(currentSkills.technical.distribution);
      } else {
        // Outfield skills
        skills.push(currentSkills.technical.finishing);
        skills.push(currentSkills.technical.passing);
        skills.push(currentSkills.technical.dribbling);
        skills.push(currentSkills.technical.defending);
      }
    }

    // Mental skills
    if (currentSkills.mental) {
      skills.push(currentSkills.mental.positioning);
      skills.push(currentSkills.mental.composure);
    }

    // Set pieces
    if (currentSkills.setPieces) {
      skills.push(currentSkills.setPieces.freeKicks);
      skills.push(currentSkills.setPieces.penalties);
    }

    return skills;
  }
}
