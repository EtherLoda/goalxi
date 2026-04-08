import { PlayerEntity, TeamEntity, YouthPlayerEntity } from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

const OUTFIELD_KEYS = [
  'pace',
  'strength',
  'finishing',
  'passing',
  'dribbling',
  'defending',
  'positioning',
  'composure',
  'freeKicks',
  'penalties',
];
const GK_KEYS = [
  'pace',
  'strength',
  'reflexes',
  'handling',
  'aerial',
  'positioning',
  'composure',
  'freeKicks',
  'penalties',
];

@Injectable()
export class YouthService {
  constructor(
    @InjectRepository(YouthPlayerEntity)
    private youthRepo: Repository<YouthPlayerEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
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

  /** Apply natural growth to youth players (very slow) */
  async applyNaturalGrowth(youth: YouthPlayerEntity): Promise<void> {
    const keys = youth.isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
    for (const cat of Object.values(youth.currentSkills)) {
      if (cat && typeof cat === 'object') {
        for (const key of Object.keys(cat as object)) {
          if (keys.includes(key)) {
            const current = (cat as any)[key] as number;
            // Find corresponding potential value
            let potential = current;
            for (const pCat of Object.values(youth.potentialSkills)) {
              if (pCat && (pCat as any)[key] !== undefined) {
                potential = (pCat as any)[key];
                break;
              }
            }
            // Growth rate: 0.05 per week (very slow)
            const growth = Math.random() * 0.1;
            const newVal = Math.min(potential, current + growth);
            (cat as any)[key] = parseFloat(newVal.toFixed(2));
          }
        }
      }
    }
    await this.youthRepo.save(youth);
  }

  /** Reveal 1-2 next skills */
  async revealNextSkills(youth: YouthPlayerEntity): Promise<void> {
    const keys = youth.isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
    const remaining = keys.filter((k) => !youth.revealedSkills.includes(k));
    if (remaining.length === 0) return;

    const count = Math.min(remaining.length, Math.random() < 0.5 ? 1 : 2);
    const toReveal = remaining.sort(() => Math.random() - 0.5).slice(0, count);
    youth.revealedSkills = [...youth.revealedSkills, ...toReveal];
    await this.youthRepo.save(youth);
  }

  /** Promote youth player to senior team */
  async promote(id: string): Promise<PlayerEntity> {
    const youth = await this.youthRepo.findOneByOrFail({ id });
    if (youth.isPromoted) {
      throw new Error('Player already promoted');
    }

    const player = this.playerRepo.create({
      name: youth.name,
      nationality: youth.nationality,
      birthday: youth.birthday,
      teamId: youth.teamId,
      isGoalkeeper: youth.isGoalkeeper,
      isYouth: false,
      currentSkills: youth.currentSkills,
      potentialSkills: youth.potentialSkills,
      experience: 0,
      form: 3,
      stamina: 3,
      onTransfer: false,
    } as any);

    const saved = await this.playerRepo.save(player);
    const savedPlayer = Array.isArray(saved) ? saved[0] : saved;
    youth.isPromoted = true;
    await this.youthRepo.save(youth);
    return savedPlayer;
  }

  /** Get all active youth players for growth/reveal cron */
  async findAllActive(): Promise<YouthPlayerEntity[]> {
    return this.youthRepo.find({ where: { isPromoted: false } });
  }
}
