import { AbstractEntity } from './abstract.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum AnnouncementType {
  GENERAL = 'GENERAL',
  FEATURE = 'FEATURE',
  EVENT = 'EVENT',
  MAINTENANCE = 'MAINTENANCE',
}

@Entity('announcement')
export class AnnouncementEntity extends AbstractEntity {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_announcement_id' })
  id!: string;
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'enum', enum: AnnouncementType, default: AnnouncementType.GENERAL })
  type!: AnnouncementType;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'priority', type: 'int', default: 0 })
  priority!: number;
}
