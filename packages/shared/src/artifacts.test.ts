import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_MAX_LEVEL,
  artifactLevelMods,
  artifactPassive,
  artifactQiGain,
  artifactQiNeed,
  clampArtifactLevel,
  drainMp,
  sealPosture,
  sealStun,
  shieldAmount,
  type ArtifactDef,
} from './artifacts';
import { buffMag, clampPillQuality, mergeBuff, pillPotency, rollPillQuality, type PillQualityCfg } from './alchemy';

const DEF: ArtifactDef = {
  id: 'itm_x',
  asset: 'prop_x',
  kind: 'drain',
  skill: 'art_x',
  cd: 24,
  mp: 0,
  radius: 12,
  power: 0.07,
  duration: 2.5,
  passive: { kind: 'mp', per: 0.04 },
  color: 'ffffff',
};

describe('pháp bảo phụ', () => {
  it('cấp bị kẹp trong 1..5, mỗi cấp mạnh hơn và hồi chiêu ngắn hơn', () => {
    expect(clampArtifactLevel(0)).toBe(1);
    expect(clampArtifactLevel(99)).toBe(ARTIFACT_MAX_LEVEL);
    expect(clampArtifactLevel(NaN)).toBe(1);
    expect(clampArtifactLevel('3')).toBe(1);
    let prev = artifactLevelMods(1);
    expect(prev).toEqual({ powerMul: 1, cdMul: 1 });
    for (let lv = 2; lv <= ARTIFACT_MAX_LEVEL; lv++) {
      const m = artifactLevelMods(lv);
      expect(m.powerMul).toBeGreaterThan(prev.powerMul);
      expect(m.cdMul).toBeLessThan(prev.cdMul);
      prev = m;
    }
    expect(prev.cdMul).toBeGreaterThan(0.8);
  });

  it('linh khí cần để lên cấp tăng dần; ngoài khoảng là null', () => {
    expect(artifactQiNeed(1)).toBeNull();
    expect(artifactQiNeed(6)).toBeNull();
    expect(artifactQiNeed(2.5)).toBeNull();
    const needs = [2, 3, 4, 5].map((lv) => artifactQiNeed(lv)!);
    expect([...needs].sort((a, b) => a - b)).toEqual(needs);
    // Tổng linh khí tới cấp 5 vẫn là mục tiêu dài hạn, không phải cày vô tận (≈ 1000 quái thường).
    expect(needs.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1200);
  });

  it('nạp linh khí: boss > tinh anh > thường; quái quá thấp cấp không nạp', () => {
    const base = { monLevel: 10, playerLevel: 10 };
    expect(artifactQiGain({ ...base, boss: false, elite: false })).toBe(1);
    expect(artifactQiGain({ ...base, boss: false, elite: true })).toBeGreaterThan(1);
    expect(artifactQiGain({ ...base, boss: true, elite: false })).toBeGreaterThan(artifactQiGain({ ...base, boss: false, elite: true }));
    expect(artifactQiGain({ monLevel: 2, playerLevel: 12, boss: false, elite: false })).toBe(0);
  });

  it('công thức kỹ năng tăng theo cấp', () => {
    expect(drainMp(DEF, 1, 1000, false)).toBe(70);
    expect(drainMp(DEF, 1, 1000, true)).toBe(140);
    expect(drainMp(DEF, 5, 1000, false)).toBeGreaterThan(70);
    expect(sealPosture(DEF, 5)).toBeGreaterThan(sealPosture(DEF, 1));
    expect(sealStun(DEF, 1)).toBe(2.5);
    expect(sealStun(DEF, 5)).toBeGreaterThan(2.5);
    expect(shieldAmount({ ...DEF, power: 0.18 }, 1, 1000)).toBe(180);
  });

  it('nội tại tăng tuyến tính theo cấp', () => {
    expect(artifactPassive(DEF, 1)).toBeCloseTo(0.04);
    expect(artifactPassive(DEF, 5)).toBeCloseTo(0.2);
  });
});

describe('phẩm chất đan', () => {
  const cfg: PillQualityCfg = { base: [0.6, 0.3, 0.1], support: [0.3, 0.4, 0.3], potency: [1, 1.2, 1.45] };
  it('roll theo ngưỡng xác suất, kể cả biên', () => {
    expect(rollPillQuality(cfg, false, 0)).toBe(0);
    expect(rollPillQuality(cfg, false, 0.59)).toBe(0);
    expect(rollPillQuality(cfg, false, 0.6)).toBe(1);
    expect(rollPillQuality(cfg, false, 0.9)).toBe(2);
    expect(rollPillQuality(cfg, false, 0.9999999)).toBe(2);
    expect(rollPillQuality(cfg, true, 0.35)).toBe(1);
  });
  it('mô phỏng: đan sư ra Thượng phẩm nhiều hơn', () => {
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
    let base = 0;
    let sup = 0;
    for (let i = 0; i < 4000; i++) {
      if (rollPillQuality(cfg, false, rnd()) === 2) base++;
      if (rollPillQuality(cfg, true, rnd()) === 2) sup++;
    }
    expect(sup).toBeGreaterThan(base * 2);
  });
  it('hiệu lực theo phẩm, phẩm lạ bị kẹp', () => {
    expect(pillPotency(cfg, 0)).toBe(1);
    expect(pillPotency(cfg, 2)).toBe(1.45);
    expect(pillPotency(cfg, 99)).toBe(1.45);
    expect(pillPotency(cfg, undefined)).toBe(1);
    expect(clampPillQuality(-3)).toBe(0);
  });
});

describe('buff đan', () => {
  it('chỉ tính khi chưa hết hạn', () => {
    const b = { def: { m: 0.15, until: 1000 } };
    expect(buffMag(b, 'def', 999)).toBe(0.15);
    expect(buffMag(b, 'def', 1000)).toBe(0);
    expect(buffMag(b, 'atk', 0)).toBe(0);
    expect(buffMag(undefined, 'def', 0)).toBe(0);
  });
  it('làm mới giữ mức cao hơn và hạn xa hơn, không cộng dồn', () => {
    expect(mergeBuff(undefined, 0.1, 500, 0)).toEqual({ m: 0.1, until: 500 });
    expect(mergeBuff({ m: 0.15, until: 900 }, 0.1, 500, 0)).toEqual({ m: 0.15, until: 900 });
    expect(mergeBuff({ m: 0.1, until: 400 }, 0.15, 700, 0)).toEqual({ m: 0.15, until: 700 });
    // Buff cũ đã hết hạn: thay hẳn bằng buff mới yếu hơn.
    expect(mergeBuff({ m: 0.3, until: 100 }, 0.1, 500, 200)).toEqual({ m: 0.1, until: 500 });
  });
});
