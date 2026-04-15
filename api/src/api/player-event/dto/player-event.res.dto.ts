import { Uuid } from '@/common/types/common.type';
import { PlayerEventType } from '@goalxi/database';

export class PlayerEventResDto {
  id!: Uuid;
  playerId!: Uuid;
  season!: number;
  date!: Date;
  eventType!: PlayerEventType;
  icon?: string;
  titleKey?: string;
  matchId?: Uuid;
  titleData?: Record<string, any>;
  details?: any;
  createdAt!: Date;
  updatedAt!: Date;
}
