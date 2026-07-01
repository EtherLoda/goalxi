import { AbstractEntity } from "./abstract.entity";
import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import { LeagueEntity } from "./league.entity";

@Entity("youth_league")
export class YouthLeagueEntity extends AbstractEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  /** 母队联赛等级 (1-4)，对应 II1, II2, II3, II4 */
  @Column({ type: "int" })
  parentTier!: number;

  @Column({ type: "int", default: 16 })
  maxTeams!: number;

  @Column({ type: "varchar", default: "active" })
  status!: string;

  /**
   * 1:1 link to the parent senior league. Set by
   * `YouthStructureGenerator` during bootstrap so the schedule
   * generator can pair the two halves of the pyramid.
   */
  @Column({ name: "senior_league_id", type: "uuid", nullable: true })
  seniorLeagueId?: string | null;

  @ManyToOne(() => LeagueEntity, { nullable: true })
  @JoinColumn({ name: "senior_league_id" })
  seniorLeague?: LeagueEntity | null;
}
