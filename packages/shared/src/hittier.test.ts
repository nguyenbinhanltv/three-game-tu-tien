import { describe, expect, it } from 'vitest';
import {
  BOSS_STAGGER_GAP_MS,
  HIT_TIER,
  HIT_TIER_ORDER,
  MONSTER_KNOCKDOWN_MS,
  PLAYER_KNOCK_MAX_M,
  PLAYER_STAGGER_MAX_MS,
  hitTierOfPower,
  monsterHitTier,
  monsterReaction,
  playerReaction,
  poiseOf,
  pvpReaction,
  resolveTier,
  tierRank,
} from './hittier';

const small = { boss: false, elite: false } as const;
const elite = { boss: false, elite: true } as const;
const boss = { boss: true, elite: false } as const;

describe('bảng cấp đòn', () => {
  it('tăng dần theo cấp', () => {
    for (const k of ['stopMs', 'shakeAmp', 'shakeMs', 'knockM', 'staggerMs'] as const) {
      for (let i = 1; i < HIT_TIER_ORDER.length; i++)
        expect(HIT_TIER[HIT_TIER_ORDER[i]!][k]).toBeGreaterThanOrEqual(HIT_TIER[HIT_TIER_ORDER[i - 1]!][k]);
    }
    expect(HIT_TIER.light.stopMs).toBe(0);
    expect(HIT_TIER.finisher.stopMs).toBe(110);
  });
  it('cấp theo hệ số chiêu; dữ liệu ghi rõ thì thắng', () => {
    expect(hitTierOfPower(0.9)).toBe('light');
    expect(hitTierOfPower(1.7)).toBe('medium');
    expect(hitTierOfPower(2.3)).toBe('heavy');
    expect(hitTierOfPower(4.6)).toBe('finisher');
    expect(resolveTier('light', 4.6)).toBe('light');
    expect(resolveTier(undefined, 4.6)).toBe('finisher');
  });
});

describe('phản ứng của quái', () => {
  it('quái thường khựng/lùi theo bảng, đòn nhẹ không gì', () => {
    expect(monsterReaction(small, 'light')).toEqual({ knockM: 0, staggerMs: 0, knockdownMs: 0 });
    expect(monsterReaction(small, 'heavy')).toEqual({ knockM: HIT_TIER.heavy.knockM, staggerMs: HIT_TIER.heavy.staggerMs, knockdownMs: 0 });
  });
  it('chiêu cuối làm quái thường ngã, tinh anh nửa', () => {
    expect(monsterReaction(small, 'finisher').knockdownMs).toBe(MONSTER_KNOCKDOWN_MS);
    expect(monsterReaction(elite, 'finisher').knockdownMs).toBe(MONSTER_KNOCKDOWN_MS / 2);
    expect(monsterReaction(elite, 'finisher').knockM).toBeCloseTo(HIT_TIER.finisher.knockM / 2);
    expect(monsterReaction(elite, 'light').staggerMs).toBe(0);
  });
  it('thủ lĩnh miễn khựng nhẹ/vừa, không bao giờ bị đẩy hay ngã', () => {
    expect(poiseOf(boss)).toBe('heavy');
    for (const t of ['light', 'medium'] as const) expect(monsterReaction(boss, t)).toEqual({ knockM: 0, staggerMs: 0, knockdownMs: 0 });
    for (const t of ['heavy', 'finisher'] as const) {
      const r = monsterReaction(boss, t);
      expect(r.knockM).toBe(0);
      expect(r.knockdownMs).toBe(0);
      expect(r.staggerMs).toBeGreaterThan(0);
    }
    expect(BOSS_STAGGER_GAP_MS).toBeGreaterThan(0);
  });
  it('poise ghi trong dữ liệu thắng mặc định', () => {
    expect(monsterReaction({ ...small, poise: 'finisher' }, 'heavy').staggerMs).toBe(0);
    expect(tierRank(poiseOf({ ...boss, poise: 'finisher' }))).toBe(3);
  });
});

describe('phản ứng của người chơi', () => {
  it('khựng không vượt 0,6 s và lùi không vượt trần ở mọi cấp', () => {
    for (const t of HIT_TIER_ORDER) {
      const r = playerReaction(t);
      expect(r.staggerMs).toBeLessThanOrEqual(PLAYER_STAGGER_MAX_MS);
      expect(r.knockM).toBeLessThanOrEqual(PLAYER_KNOCK_MAX_M);
    }
    expect(playerReaction('light')).toEqual({ knockM: 0, staggerMs: 0 });
  });
  it('PvP chặt: không đẩy lùi, khựng ≤ 150 ms', () => {
    for (const t of HIT_TIER_ORDER) {
      const r = pvpReaction(t);
      expect(r.knockM).toBe(0);
      expect(r.staggerMs).toBeLessThanOrEqual(150);
    }
  });
  it('cấp đòn của quái: thường light, hv medium, thủ lĩnh hv heavy, dữ liệu thắng', () => {
    expect(monsterHitTier(small, false)).toBe('light');
    expect(monsterHitTier(small, true)).toBe('medium');
    expect(monsterHitTier(boss, true)).toBe('heavy');
    expect(monsterHitTier({ boss: true, tier: 'finisher' }, true)).toBe('finisher');
  });
});
