import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { hashPassword as hashPass } from '../utils/password.util';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('user')
export class UserEntity extends AbstractEntity {
  constructor(data?: Partial<UserEntity>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_user_id' })
  id!: Uuid;

  @Column({
    length: 50,
    nullable: true,
  })
  @Index('UQ_user_username', {
    where: '"deleted_at" IS NULL',
    unique: true,
  })
  username: string;

  @Column()
  @Index('UQ_user_email', { where: '"deleted_at" IS NULL', unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column({ default: '' })
  bio?: string;

  // Football Manager specific fields
  @Column({ name: 'nickname', length: 50, nullable: true })
  nickname?: string;

  @Column({ name: 'avatar', default: '' })
  avatar?: string;

  @Column({ name: 'supporter_level', type: 'int', default: 0 })
  supporterLevel: number; // 0 = no, 1 = tier1, 2 = tier2, 3 = tier3

  /**
   * RBAC role used by `RolesGuard` to gate administrative endpoints
   * (e.g. match CRUD). Default `user`; flip a row to `admin` via SQL
   * or `PATCH /auth/users/:id/role` once that endpoint is added.
   */
  @Column({
    name: 'role',
    type: 'varchar',
    length: 20,
    default: 'user',
  })
  role: UserRole;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    default: null,
  })
  deletedAt: Date;

  @OneToMany(() => SessionEntity, (session) => session.user)
  sessions?: SessionEntity[];

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password) {
      this.password = await hashPass(this.password);
    }
  }
}

/**
 * RBAC role. Single source of truth shared by `UserEntity.role`,
 * `JwtPayloadType.role`, and `RolesGuard`. Extend this enum when
 * adding a new privileged tier (e.g. `MODERATOR` for forum mods).
 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}
