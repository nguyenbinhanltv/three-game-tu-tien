import { describe, expect, it } from 'vitest';
import { CAST_TOL_MS, castRows, castSummary, type CastMark, type CastSfx } from './sfxCast';

const mark = (kind: CastMark['kind'], at: number, skill = 'skl_a', combo = -1, index = 0, planMs?: number): CastMark => ({ kind, at, skill, combo, index, planMs });
const snd = (name: string, at: number, why = 'mute', delayMs?: number): CastSfx => ({ name, at, why, delayMs });

describe('castRows (lệch tiếng so với khung trúng của từng lần ra chiêu)', () => {
  it('sát thương về trước khung trúng: tiếng trúng rơi đúng khung, tiếng vung đặt lịch trước đó', () => {
    const rows = castRows(
      [mark('windup', 1000, 'skl_a', -1, 0, 300), mark('dmg', 1180, ''), mark('hit', 1300), mark('end', 1700)],
      [snd('sword', 1000, 'mute', 170), snd('hit', 1301), snd('cast', 1010)],
    );
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.hitMs).toBe(300);
    expect(r.planMs).toBe(300);
    expect(r.dmgMs).toBe(-120);
    expect(r.swingMs).toBe(-130);
    expect(r.hitSndMs).toBe(1);
    expect(r.verdict).toBe('ok');
    expect(r.sounds.map((s) => s.name)).toEqual(['sword', 'hit', 'cast']);
  });

  it('sát thương về muộn hơn khung trúng quá dung sai thì báo muộn', () => {
    const late = CAST_TOL_MS + 40;
    const [r] = castRows([mark('windup', 0), mark('hit', 200), mark('dmg', 200 + late, '')], [snd('crit', 200 + late)]);
    expect(r!.hitSndMs).toBe(late);
    expect(r!.dmgMs).toBe(late);
    expect(r!.verdict).toBe('late');
  });

  it('phân biệt đánh hụt, có sát thương mà câm (tiếng bị giãn), và chiêu bị hủy trước khung trúng', () => {
    const miss = castRows([mark('windup', 0), mark('hit', 200)], [snd('sword', 0)]);
    expect(miss[0]!.verdict).toBe('miss');
    // Chiêu khiên: timeline phát `block` sau khung trúng nhưng không có sát thương, không phải tiếng trúng muộn.
    const shield = castRows([mark('windup', 0), mark('hit', 200)], [snd('block', 290)]);
    expect(shield[0]).toMatchObject({ verdict: 'miss', hitSndMs: null });
    const mute = castRows([mark('windup', 0), mark('hit', 200), mark('dmg', 210, '')], [snd('hit', 210, 'throttle')]);
    expect(mute[0]!.verdict).toBe('mute');
    const cut = castRows([mark('windup', 0), mark('cancel', 90)], []);
    expect(cut[0]!.verdict).toBe('cut');
    expect(cut[0]!.hitMs).toBeNull();
  });

  it('chuỗi đòn thường: tiếng của đòn sau không tính cho đòn trước', () => {
    const rows = castRows(
      [mark('windup', 0, 'basic', 0), mark('hit', 180, 'basic', 0), mark('dmg', 185, ''), mark('windup', 420, 'basic', 1), mark('hit', 600, 'basic', 1), mark('dmg', 700, '')],
      [snd('hit', 185), snd('hit', 700)],
    );
    expect(rows.map((r) => r.hitSndMs)).toEqual([5, 100]);
    expect(rows.map((r) => r.verdict)).toEqual(['ok', 'late']);
    const sum = castSummary(rows);
    expect(sum.map((s) => s.key)).toEqual(['basic#1', 'basic#2']);
    expect(sum[1]!.bad).toBe(1);
  });

  it('gộp theo chiêu: trung vị, lệch xấu nhất, sai khác so với dữ liệu chiêu', () => {
    const marks: CastMark[] = [];
    const sfx: CastSfx[] = [];
    [10, 30, 90].forEach((lag, i) => {
      const t = i * 5000;
      marks.push(mark('windup', t, 'skl_b', -1, 0, 250), mark('hit', t + 270, 'skl_b'), mark('dmg', t + 270 + lag, ''));
      sfx.push(snd('hit', t + 270 + lag));
    });
    const [s] = castSummary(castRows(marks, sfx));
    expect(s).toMatchObject({ key: 'skl_b', n: 3, hitSndMs: 30, hitSndWorst: 90, dmgMs: 30, planErrMs: 20, bad: 1 });
  });
});
