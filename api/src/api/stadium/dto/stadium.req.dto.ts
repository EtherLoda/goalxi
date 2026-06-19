import { NumberField } from '@/decorators/field.decorators';

export class BuildStadiumReqDto {
  @NumberField({ min: 1000 })
  capacity!: number;
}

export class ResizeStadiumReqDto {
  @NumberField({ min: 1000 })
  capacity!: number;
}

/**
 * §5 Stadium — 增量扩/缩座位
 * delta > 0 表示扩建(扣费),delta < 0 表示拆除(返还)。
 * 控制器会按符号路由到对应的 service 方法,避免两个端点共写一个 DTO 时容易出错。
 */
export class AdjustSeatsReqDto {
  @NumberField({ min: 500, max: 200000, int: true })
  delta!: number;
}
