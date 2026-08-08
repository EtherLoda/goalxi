import { applyPromotionReward, applyRelegationReward } from './fan-rewards';
import { FanEntity } from '../entities/fan.entity';

const makeFan = (overrides: Partial<FanEntity> = {}): FanEntity =>
  ({
    totalFans: 10_000,
    fanEmotion: 50,
    recentForm: 'WWDL',
    ...overrides,
  }) as FanEntity;

describe('fan-rewards', () => {
  describe('applyPromotionReward', () => {
    it('grows totalFans by 10% (floored)', () => {
      const fan = makeFan({ totalFans: 10_000 });
      applyPromotionReward(fan);
      expect(fan.totalFans).toBe(11_000);
    });

    it('floors fractional percentages (10_001 → 11_001)', () => {
      const fan = makeFan({ totalFans: 10_001 });
      applyPromotionReward(fan);
      // 10_001 * 1.1 = 11_001.1 → floor = 11_001
      expect(fan.totalFans).toBe(11_001);
    });

    it('bumps fanEmotion by 20', () => {
      const fan = makeFan({ fanEmotion: 50 });
      applyPromotionReward(fan);
      expect(fan.fanEmotion).toBe(70);
    });

    it('clamps fanEmotion to 100 when it would otherwise overflow', () => {
      const fan = makeFan({ fanEmotion: 95 });
      applyPromotionReward(fan);
      expect(fan.fanEmotion).toBe(100);
    });

    it('clears recentForm so the new tier starts with a clean slate', () => {
      const fan = makeFan({ recentForm: 'WWDLW' });
      applyPromotionReward(fan);
      expect(fan.recentForm).toBe('');
    });

    it('returns the same fan reference (mutates in place)', () => {
      const fan = makeFan();
      const ret = applyPromotionReward(fan);
      expect(ret).toBe(fan);
    });
  });

  describe('applyRelegationReward', () => {
    it('shrinks totalFans by 10% (floored)', () => {
      const fan = makeFan({ totalFans: 10_000 });
      applyRelegationReward(fan);
      expect(fan.totalFans).toBe(9_000);
    });

    it('floors fractional percentages (10_001 → 9_000)', () => {
      const fan = makeFan({ totalFans: 10_001 });
      applyRelegationReward(fan);
      // 10_001 * 0.9 = 9_000.9 → floor = 9_000
      expect(fan.totalFans).toBe(9_000);
    });

    it('drops fanEmotion by 20', () => {
      const fan = makeFan({ fanEmotion: 50 });
      applyRelegationReward(fan);
      expect(fan.fanEmotion).toBe(30);
    });

    it('clamps fanEmotion to 0 when it would otherwise go negative', () => {
      const fan = makeFan({ fanEmotion: 10 });
      applyRelegationReward(fan);
      expect(fan.fanEmotion).toBe(0);
    });

    it('clears recentForm so the new tier starts with a clean slate', () => {
      const fan = makeFan({ recentForm: 'LLDLW' });
      applyRelegationReward(fan);
      expect(fan.recentForm).toBe('');
    });

    it('returns the same fan reference (mutates in place)', () => {
      const fan = makeFan();
      const ret = applyRelegationReward(fan);
      expect(ret).toBe(fan);
    });
  });

  describe('promote + relegate is not perfectly reversible', () => {
    // Documents the asymmetry: flooring both directions means a
    // 10_000 → promote(11_000) → relegate(9_900) sequence loses
    // 100 fans. Acceptable — the ±10% swing is meant to be felt,
    // not transactional.
    it('loses 100 fans over a promote→relegate round trip', () => {
      const fan = makeFan({ totalFans: 10_000 });
      applyPromotionReward(fan);
      applyRelegationReward(fan);
      expect(fan.totalFans).toBe(9_900);
    });
  });
});
