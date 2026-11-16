import { describe, expect, it } from 'vitest';
import { CamFrame, CHAPTER, firstTime, gongPartials, seenKey } from './chapter';

function run(f: CamFrame, secs: number, dt = 1 / 60): void {
  for (let t = 0; t < secs; t += dt) f.update(dt);
}

describe('CamFrame', () => {
  it('đứng yên khi chưa bắt đầu', () => {
    const f = new CamFrame();
    f.update(0.016);
    expect(f.distMul).toBe(1);
    expect(f.pitchAdd).toBe(0);
    expect(f.active).toBe(false);
  });

  it('vào dần, đạt đỉnh rồi tự trả về đúng góc người chơi sau ~2 giây', () => {
    const f = new CamFrame();
    const p = CHAPTER.sect;
    f.start(p);
    f.update(0.05);
    expect(f.distMul).toBeGreaterThan(1);
    expect(f.distMul).toBeLessThan(1.05);
    run(f, 1.0);
    expect(f.distMul).toBeCloseTo(p.dist, 2);
    expect(f.pitchAdd).toBeCloseTo(p.pitch, 3);
    run(f, p.cam);
    expect(f.active).toBe(false);
    expect(f.distMul).toBe(1);
    expect(f.pitchAdd).toBe(0);
  });

  it('người chơi chạm camera thì độ lệch tan trong 0,25 giây, không giật', () => {
    const f = new CamFrame();
    f.start(CHAPTER.trib);
    run(f, 1.0);
    const before = f.pitchAdd;
    expect(before).toBeLessThan(0);
    f.cancel();
    f.update(0.05);
    expect(f.pitchAdd).toBeLessThan(0);
    expect(Math.abs(f.pitchAdd)).toBeLessThanOrEqual(Math.abs(before));
    run(f, 0.25);
    expect(f.active).toBe(false);
    expect(f.pitchAdd).toBe(0);
  });

  it('khung camera ngắn (2–3 giây), thẻ chữ 2–3 giây', () => {
    for (const p of Object.values(CHAPTER)) {
      expect(p.cam).toBeGreaterThanOrEqual(2);
      expect(p.cam).toBeLessThanOrEqual(3);
      expect(p.card).toBeGreaterThanOrEqual(2000);
      expect(p.card).toBeLessThanOrEqual(3000);
      expect(p.dist).toBeLessThanOrEqual(1.35);
      expect(Math.abs(p.pitch)).toBeLessThanOrEqual(0.15);
    }
  });
});

describe('cờ đã xem', () => {
  it('chỉ lần đầu theo từng nhân vật', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(firstTime(store, 'sect', 'A')).toBe(true);
    expect(firstTime(store, 'sect', 'A')).toBe(false);
    expect(firstTime(store, 'sect', 'B')).toBe(true);
    expect(m.get(seenKey('sect', 'A'))).toBe('1');
  });

  it('localStorage bị chặn thì không hiện (không lặp mỗi lần vào sân)', () => {
    const store = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(firstTime(store, 'sect', 'A')).toBe(false);
  });
});

it('chiêng có bồi âm trầm, tần số hợp lệ', () => {
  const g = gongPartials();
  expect(g.length).toBeGreaterThan(3);
  expect(Math.min(...g.map((p) => p.freq))).toBeLessThan(150);
  for (const p of g) {
    expect(p.freq).toBeGreaterThan(20);
    expect(p.dur).toBeGreaterThan(0);
  }
});

describe('thẻ chương E2-D', () => {
  it('có preset cho Kết Đan và Chương 2, mỗi cái có chữ i18n đủ ba dòng', async () => {
    const { hasString } = await import('@dtl/content');
    for (const k of ['ascend_kd', 'ascend_na', 'ch2', 'ch3'] as const) {
      expect(CHAPTER[k].card).toBeGreaterThan(2000);
      for (const part of ['kicker', 'title', 'sub']) expect(hasString(`ui.chapter.${k}.${part}`)).toBe(true);
    }
  });
});
