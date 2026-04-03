import { NumberField, StringField } from '@/decorators/field.decorators';

export class CreateLeagueReqDto {
  @StringField()
  name: string;

  @NumberField({ required: false, min: 1 })
  tier?: number;

  @NumberField({ required: false, min: 1 })
  tierDivision?: number;

  @StringField({ required: false })
  status?: string;

  @NumberField({ required: false, min: 1 })
  maxTeams?: number;

  @NumberField({ required: false, min: 0 })
  promotionSlots?: number;

  @NumberField({ required: false, min: 0 })
  playoffSlots?: number;

  @NumberField({ required: false, min: 0 })
  relegationSlots?: number;

  @StringField({ required: false })
  parentLeagueId?: string;
}
