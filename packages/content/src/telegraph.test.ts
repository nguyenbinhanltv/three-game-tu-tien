import { describe, expect, it } from 'vitest';
import { DODGE_CD_MS, DODGE_IFRAME_MS, RUN_SPEED } from '@dtl/shared';
import { MONSTER } from './index';

/**
 * Thiên Nhãn P5a: vòng cảnh báo của tinh anh/boss phải đủ thời gian để người chơi thấy và né bằng Space.
 * Cửa sổ né hợp lệ là `DODGE_IFRAME_MS` cuối của thời gian nạp; cộng ~0,5 s phản xạ nên nạp tối thiểu = khung né + 0,5 s.
 * Đòn không có vòng (`combo` đánh thường, `chant` niệm chú phải ngắt) không tính.
 */
const REACT_S = 0.5;
const MIN_DELAY = DODGE_IFRAME_MS / 1000 + REACT_S - 0.05;
const NO_TELEGRAPH = new Set(['combo', 'chant']);
/** Ngoại lệ có chủ ý: vồ bán kính nhỏ (3 m) chạy ra kịp trong ~0,43 s; báo 0,8 s là thiết kế (doanmach.mobs.test.ts). */
const ALLOWED = new Set(['elite_liet_cot_bao.leap']);

function* moves(): Generator<{ mon: string; key: string; v: Record<string, number> }> {
  for (const m of MONSTER.values() as Iterable<{
    id: string;
    boss?: boolean;
    ai?: Record<string, unknown>;
    phases?: { ai?: Record<string, unknown> }[];
  }>) {
    const sets: [string, Record<string, unknown> | undefined][] = [
      ['', m.ai],
      ...(m.phases ?? []).map((p, i) => [`p${i + 1}.`, p.ai] as [string, Record<string, unknown> | undefined]),
    ];
    for (const [tag, ai] of sets)
      for (const [k, v] of Object.entries(ai ?? {}))
        if (v && typeof v === 'object' && typeof (v as { delay?: unknown }).delay === 'number')
          yield { mon: m.id, key: tag + k, v: v as Record<string, number> };
  }
}

describe('vòng cảnh báo đủ thời gian né', () => {
  it('mọi đòn có vạch báo nạp ≥ khung né + phản xạ', () => {
    const bad = [...moves()]
      .filter((x) => !NO_TELEGRAPH.has(x.key.replace(/^p\d+\./, '')) && !ALLOWED.has(`${x.mon}.${x.key}`) && x.v.delay < MIN_DELAY)
      .map((x) => `${x.mon}.${x.key}=${x.v.delay}`);
    expect(bad).toEqual([]);
  });
  it('hồi né dài hơn khung bất tử và đủ để thở giữa hai đòn cùng loại', () => {
    expect(DODGE_CD_MS).toBeGreaterThan(DODGE_IFRAME_MS);
    // Đòn cùng loại của một quái không lặp nhanh hơn hồi né + nạp (nếu không không thể né cả hai).
    const quick = [...moves()].filter((x) => typeof x.v.cd === 'number' && x.v.cd * 1000 < DODGE_CD_MS - DODGE_IFRAME_MS);
    expect(quick.map((x) => `${x.mon}.${x.key}`)).toEqual([]);
  });
  it('chạy thoát vòng nhỏ kịp trong thời gian nạp thì không cần né; vòng lớn thì buộc phải né', () => {
    // r / RUN_SPEED: thời gian chạy ra khỏi vòng bán kính r từ tâm.
    expect(3 / RUN_SPEED).toBeLessThan(MIN_DELAY);
    expect(14 / RUN_SPEED).toBeGreaterThan(MIN_DELAY);
  });
});
