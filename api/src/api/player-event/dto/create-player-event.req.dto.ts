import { Uuid } from '@/common/types/common.type';
import { PlayerEventType } from '@goalxi/database';

export class CreatePlayerEventDto {
  playerId!: Uuid;
  season!: number;
  date!: Date;
  eventType!: PlayerEventType;
  icon?: string;
  titleKey?: string;
  matchId?: Uuid;
  titleData?: Record<string, any>;
  details?: any;
}
