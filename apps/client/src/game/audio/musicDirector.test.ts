import { describe, expect, it } from 'vitest';
import {
  AmbientPicker,
  ambientFor,
  BOSS_EXIT,
  COMBAT_ENTER,
  COMBAT_EXIT,
  ENGAGE_HOLD,
  isNightHour,
  isStemZone,
  MIN_HOLD,
  MusicDirector,
  type MusicInput,
  REGION_DWELL,
  regionTrack,
  STEM_MIX,
  STEM_ZONES,
} from './musicDirector';

const base: MusicInput = { dungeon: false, biome: 'sect', combat: false, boss: false, tribulation: false, meditating: false, dead: false };

/** Chạy director từ `t0` tới `t1` với bước 0,1 giây; trả về các lần đổi bài. */
function run(d: MusicDirector, t0: number, t1: number, inp: Partial<MusicInput>) {
  const out: { t: number; to: string; fade: number }[] = [];
  for (let t = t0; t <= t1 + 1e-9; t += 0.1) {
    const ch = d.update(Math.round(t * 10) / 10, { ...base, ...inp });
    if (ch) out.push({ t: Math.round(t * 10) / 10, to: ch.to, fade: ch.fade });
  }
  return out;
}

describe('regionTrack', () => {
  it('ánh xạ biome sang bài vùng', () => {
    expect(regionTrack(false, 'sect')).toBe('sect');
    expect(regionTrack(false, 'forest')).toBe('forest');
    expect(regionTrack(false, 'lake')).toBe('lake');
    expect(regionTrack(false, 'valley')).toBe('wild');
    expect(regionTrack(false, 'wild')).toBe('wild');
    expect(regionTrack(false, 'dungeon')).toBe('dungeon');
    expect(regionTrack(true, 'sect')).toBe('dungeon');
  });
});

describe('MusicDirector', () => {
  it('lần đầu phát ngay nhạc vùng', () => {
    const d = new MusicDirector();
    expect(d.update(0, base)).toMatchObject({ from: null, to: 'sect' });
    expect(d.update(0.1, base)).toBeNull();
  });

  it('vào combat sau khi tín hiệu giữ đủ lâu, chớp tắt ngắn không đổi bài', () => {
    const d = new MusicDirector();
    d.update(0, { ...base, biome: 'wild' });
    // Quái đuổi 0,3 giây rồi thôi: chưa đủ COMBAT_ENTER.
    expect(run(d, 0.1, 0.3, { biome: 'wild', combat: true })).toEqual([]);
    expect(run(d, 0.4, 5, { biome: 'wild' })).toEqual([]);
    const ch = run(d, 5.1, 8, { biome: 'wild', combat: true });
    expect(ch).toHaveLength(1);
    expect(ch[0].to).toBe('combat');
    expect(ch[0].t).toBeCloseTo(5.1 + COMBAT_ENTER, 5);
    expect(ch[0].fade).toBeLessThan(2);
  });

  it('engage (đòn đánh thật) vào combat ngay', () => {
    const d = new MusicDirector();
    d.update(0, base);
    d.engage(1, false);
    expect(d.update(1, base)).toMatchObject({ to: 'combat' });
  });

  it('ra combat có độ trễ, tín hiệu chập chờn giữa trận không làm đổi bài', () => {
    const d = new MusicDirector();
    d.update(0, { ...base, biome: 'forest' });
    run(d, 0.1, 2, { biome: 'forest', combat: true });
    expect(d.track).toBe('combat');
    // Quái chạy ra vào tầm liên tục mỗi 2 giây: vẫn là combat.
    const flaps: string[] = [];
    for (let k = 0; k < 5; k++) {
      flaps.push(...run(d, 2.1 + k * 4, 4 + k * 4, { biome: 'forest' }).map((c) => c.to));
      flaps.push(...run(d, 4.1 + k * 4, 6 + k * 4, { biome: 'forest', combat: true }).map((c) => c.to));
    }
    expect(flaps).toEqual([]);
    // Hết hẳn tín hiệu: về nhạc vùng sau COMBAT_EXIT.
    const out = run(d, 22.1, 40, { biome: 'forest' });
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe('forest');
    expect(out[0].t).toBeCloseTo(22 + COMBAT_EXIT, 5);
    expect(out[0].fade).toBeGreaterThanOrEqual(3);
  });

  it('đổi vùng phải ở lại đủ REGION_DWELL; đi dọc ranh giới không đổi bài', () => {
    const d = new MusicDirector();
    d.update(0, { ...base, biome: 'wild' });
    const jitter: string[] = [];
    for (let k = 0; k < 10; k++) {
      jitter.push(...run(d, 0.1 + k * 2, 1 + k * 2, { biome: 'lake' }).map((c) => c.to));
      jitter.push(...run(d, 1.1 + k * 2, 2 + k * 2, { biome: 'wild' }).map((c) => c.to));
    }
    expect(jitter).toEqual([]);
    const out = run(d, 20.1, 30, { biome: 'lake' });
    expect(out.map((c) => c.to)).toEqual(['lake']);
    expect(out[0].t).toBeCloseTo(20.1 + REGION_DWELL, 5);
  });

  it('boss ưu tiên hơn combat, và trong bí cảnh là dungeon_boss', () => {
    const d = new MusicDirector();
    d.update(0, base);
    expect(run(d, 0.1, 1, { boss: true }).map((c) => c.to)).toEqual(['boss']);
    const out = run(d, 1.1, 20, {});
    expect(out.map((c) => c.to)).toEqual(['sect']);
    expect(out[0].t).toBeCloseTo(1 + BOSS_EXIT, 5);

    const g = new MusicDirector();
    g.update(0, { ...base, dungeon: true });
    expect(g.track).toBe('dungeon');
    g.engage(0.5, true);
    expect(g.update(0.5, { ...base, dungeon: true })).toMatchObject({ to: 'dungeon_boss' });
  });

  it('boss trong Xích Tẫn Khích là dungeon_rift_boss (bài riêng của phó bản)', () => {
    const g = new MusicDirector();
    const inp = { ...base, dungeon: true, level: 'xich_tan_khich' };
    g.update(0, inp);
    expect(g.track).toBe('dungeon_rift');
    g.engage(0.5, true);
    expect(g.update(0.5, inp)).toMatchObject({ to: 'dungeon_rift_boss' });
  });

  it('độ kiếp đè mọi thứ, đả tọa chỉ khi không giao tranh', () => {
    const d = new MusicDirector();
    d.update(0, base);
    expect(d.update(0.1, { ...base, meditating: true })).toMatchObject({ to: 'meditate' });
    d.engage(0.2, false);
    expect(d.update(0.2, { ...base, meditating: true })).toMatchObject({ to: 'combat' });
    expect(d.update(0.3, { ...base, tribulation: true, combat: true })).toMatchObject({ to: 'tribulation', fade: 1 });
    // Hết độ kiếp (40 giây sau): về nhạc vùng (combat đã hết từ lâu).
    run(d, 0.4, 40, { tribulation: true });
    expect(d.update(40.1, base)).toMatchObject({ from: 'tribulation', to: 'sect' });
  });

  it('hạ ưu tiên phải chờ MIN_HOLD sau lần đổi bài trước', () => {
    const d = new MusicDirector();
    d.update(0, base);
    expect(d.update(0.1, { ...base, meditating: true })).toMatchObject({ to: 'meditate' });
    // Đứng dậy ngay: chưa đủ MIN_HOLD nên vẫn giữ bài đả tọa.
    expect(d.update(0.5, base)).toBeNull();
    const out = run(d, 0.6, 5, {});
    expect(out.map((c) => c.to)).toEqual(['sect']);
    expect(out[0].t).toBeCloseTo(0.1 + MIN_HOLD, 5);
  });

  it('tử vong thì bỏ combat; đổi room thì nhận vùng mới ngay', () => {
    const d = new MusicDirector();
    d.update(0, base);
    d.engage(0.1, false);
    d.update(0.1, base);
    expect(d.track).toBe('combat');
    const out = run(d, 3.2, 4, { dead: true, combat: true });
    expect(out.map((c) => c.to)).toEqual(['sect']);
    expect(d.update(4.1, { ...base, dungeon: true, biome: 'wild' })).toMatchObject({ from: 'sect', to: 'dungeon' });
  });
});

describe('ambientFor', () => {
  it('chọn âm môi trường theo vùng và đêm', () => {
    expect(ambientFor(false, 'wild', false)).toBe('wind');
    expect(ambientFor(false, 'valley', false)).toBe('wind');
    expect(ambientFor(false, 'forest', false)).toBe('forest');
    expect(ambientFor(false, 'sect', false)).toBe('forest');
    expect(ambientFor(false, 'lake', false)).toBe('stream');
    expect(ambientFor(false, 'lake', true)).toBe('stream');
    expect(ambientFor(false, 'forest', true)).toBe('night');
    expect(ambientFor(false, 'wild', true)).toBe('night');
    expect(ambientFor(false, 'dungeon', false)).toBe('cave');
    expect(ambientFor(true, 'sect', true)).toBe('cave');
  });

  it('đêm từ 19h tới trước 5h', () => {
    expect([18, 19, 23, 0, 4, 5, 12].map(isNightHour)).toEqual([false, true, true, true, true, false, false]);
  });
});

describe('AmbientPicker', () => {
  it('lần đầu đổi ngay, sau đó phải giữ đủ REGION_DWELL giây', () => {
    const p = new AmbientPicker();
    expect(p.update(0, 'forest')).toBe('forest');
    expect(p.update(1, 'wind')).toBeNull();
    expect(p.update(1 + REGION_DWELL - 0.1, 'wind')).toBeNull();
    expect(p.update(1 + REGION_DWELL, 'wind')).toBe('wind');
    expect(p.current).toBe('wind');
  });

  it('đi qua ranh giới rồi quay lại thì không đổi', () => {
    const p = new AmbientPicker();
    p.update(0, 'forest');
    expect(p.update(1, 'wind')).toBeNull();
    expect(p.update(2, 'forest')).toBeNull();
    expect(p.update(10, 'forest')).toBeNull();
    expect(p.current).toBe('forest');
  });
});

describe('nhạc phân lớp (M4-13)', () => {
  it('vùng có stem: tông môn, đồng hoang, Kiếm Trủng; rừng/hồ/boss thì không', () => {
    expect([...STEM_ZONES]).toEqual(['sect', 'wild', 'dungeon']);
    expect(isStemZone('sect')).toBe(true);
    expect(isStemZone('forest')).toBe(false);
    expect(isStemZone('combat')).toBe(false);
    expect(isStemZone(null)).toBe(false);
  });

  it('mức giao chiến: yên 0 → bị nhắm 1 → đang đánh 2 → hết đòn về 1 → hết quái về 0', () => {
    const d = new MusicDirector();
    d.update(0, { ...base, biome: 'wild' });
    expect(d.level(0)).toBe(0);
    // Quái nhắm mình nhưng chưa đánh nhau.
    run(d, 0.1, 1, { biome: 'wild', combat: true });
    expect(d.level(1)).toBe(1);
    // Đòn đánh thật: lên 2 ngay.
    d.engage(2, false);
    d.update(2, { ...base, biome: 'wild', combat: true });
    expect(d.level(2)).toBe(2);
    // Quái vẫn đuổi nhưng ngừng đánh quá ENGAGE_HOLD: hạ về 1.
    run(d, 2.1, 2 + ENGAGE_HOLD + 0.5, { biome: 'wild', combat: true });
    expect(d.level(2 + ENGAGE_HOLD + 0.5)).toBe(1);
    // Mất tín hiệu quá COMBAT_EXIT: về 0.
    const t = 2 + ENGAGE_HOLD + 0.6;
    run(d, t, t + COMBAT_EXIT + 0.5, { biome: 'wild' });
    expect(d.level(t + COMBAT_EXIT + 0.5)).toBe(0);
    // Bài vùng vẫn là vùng ở mọi mức (client giữ nguyên bài, chỉ chỉnh lớp).
    expect(d.regionNow).toBe('wild');
  });

  it('boss là mức 3; chết thì về 0', () => {
    const d = new MusicDirector();
    d.update(0, { ...base, biome: 'wild' });
    d.engage(1, true);
    d.update(1, { ...base, biome: 'wild', combat: true, boss: true });
    expect(d.level(1)).toBe(3);
    d.update(1.1, { ...base, biome: 'wild', dead: true });
    expect(d.level(1.1)).toBe(0);
  });

  it('bảng trộn: yên chỉ có nền; mọi mức giữ tổng năng lượng quanh 1 (nền hạ khi lớp vào)', () => {
    expect(STEM_MIX[0]).toEqual({ base: 1, pulse: 0, edge: 0 });
    for (const lv of [1, 2, 3] as const) {
      const m = STEM_MIX[lv];
      expect(m.base).toBeGreaterThanOrEqual(0.8);
      expect(m.pulse).toBeGreaterThan(0);
      expect(m.pulse).toBeLessThanOrEqual(1);
      expect(m.edge).toBeLessThanOrEqual(1);
    }
    // Lớp tăng đơn điệu theo mức.
    expect(STEM_MIX[2].pulse).toBeGreaterThanOrEqual(STEM_MIX[1].pulse);
    expect(STEM_MIX[2].edge).toBeGreaterThan(STEM_MIX[1].edge);
  });
});
