import { Uuid } from '../../types/common.type';
import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { ForumCategoryScope } from './forum.enums';

@Entity('forum_category')
@Index('IDX_forum_category_scope', ['scopeType'])
export class ForumCategoryEntity extends AbstractEntity {
  constructor(data?: Partial<ForumCategoryEntity>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_forum_category_id',
  })
  id!: Uuid;

  @Column({ length: 80 })
  @Index('UQ_forum_category_slug', {
    where: '"deleted_at" IS NULL',
    unique: true,
  })
  slug: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'scope_type',
    type: 'varchar',
    length: 20,
    default: ForumCategoryScope.PUBLIC,
  })
  scopeType: ForumCategoryScope;

  @Column({ name: 'thread_count', type: 'int', default: 0 })
  threadCount: number;

  @Column({ name: 'post_count', type: 'int', default: 0 })
  postCount: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletedAt: Date | null;
}
