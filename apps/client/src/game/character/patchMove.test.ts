import { describe, expect, it } from 'vitest';
import {
  PatchMove,
  PATCH_DUR,
  rateFor,
  RUN_SPEED,
  SPRINT_SPEED,
  startClipOf,
  START_SEC,
  stopClipOf,
  STOP_SEC,
  TIRED_AFTER,
  type PatchEvent,
} from './patchMove';

const step = (m: PatchMove, sec: number, speed: number, busy = false): PatchEvent[] => {
  const out: PatchEvent[] = [];
  for (let i = 0; i < Math.round(sec * 60); i++) {
    const e = m.update(1 / 60, speed, busy);
    if (e) out.push(e);
  }
  return out;
};

describe('PatchMove (clip Patch nối locomotion)', () => {
  it('chọn clip theo tốc độ', () => {
    expect(startClipOf(1)).toBe('PM_Idle_To_Walk');
    expect(startClipOf(RUN_SPEED)).toBe('PM_Idle_To_Run');
    expect(startClipOf(SPRINT_SPEED)).toBe('PM_Idle_To_Sprint');
    expect(stopClipOf(2)).toBe('PM_Walk_To_Idle');
    expect(stopClipOf(5.4)).toBe('PM_Run_To_Idle');
    expect(stopClipOf(8)).toBe('PM_Sprint_To_Idle');
  });
  it('tốc độ phát làm clip dài đúng thời gian mong muốn', () => {
    expect(PATCH_DUR.PM_Idle_To_Run / rateFor('PM_Idle_To_Run', START_SEC)).toBeCloseTo(START_SEC, 9);
    expect(PATCH_DUR.PM_Run_To_Idle / rateFor('PM_Run_To_Idle', STOP_SEC)).toBeCloseTo(STOP_SEC, 9);
  });
  it('bắt đầu chạy: một sự kiện start với clip chạy, sau ~0,12 s', () => {
    const m = new PatchMove();
    step(m, 0.5, 0);
    const ev = step(m, 0.3, 5.4);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'start', clip: 'PM_Idle_To_Run' });
    expect(ev[0]!.rate).toBeGreaterThan(2);
  });
  it('đi bộ bắt đầu dùng clip đi, chạy nhanh dùng clip nước rút', () => {
    const w = new PatchMove();
    step(w, 0.3, 0);
    expect(step(w, 0.4, 1.2)[0]?.clip).toBe('PM_Idle_To_Walk');
    const s = new PatchMove();
    step(s, 0.3, 0);
    expect(step(s, 0.4, 8)[0]?.clip).toBe('PM_Idle_To_Sprint');
  });
  it('dừng sau chạy ngắn: clip dừng, KHÔNG thở dốc', () => {
    const m = new PatchMove();
    step(m, 0.3, 0);
    step(m, 2, 5.4);
    const ev = step(m, 3, 0);
    expect(ev.map((e) => e.kind)).toEqual(['stop']);
    expect(ev[0]!.clip).toBe('PM_Run_To_Idle');
  });
  it(`chạy ≥ ${TIRED_AFTER} s rồi dừng: clip dừng rồi thở dốc một lần`, () => {
    const m = new PatchMove();
    step(m, 0.3, 0);
    step(m, TIRED_AFTER + 1, 5.4);
    const ev = step(m, 4, 0);
    expect(ev.map((e) => e.kind)).toEqual(['stop', 'tired']);
    expect(ev[1]!.clip).toBe('PM_Idle_Tired');
    expect(step(m, 4, 0)).toHaveLength(0); // một lần
  });
  it('lại chạy trước khi thở dốc thì hủy thở dốc', () => {
    const m = new PatchMove();
    step(m, 0.3, 0);
    step(m, TIRED_AFTER + 1, 5.4);
    step(m, 0.3, 0);
    const ev = step(m, 3, 5.4);
    expect(ev.map((e) => e.kind)).not.toContain('tired');
  });
  it('bận (đòn đánh) thì không phát gì và xóa trạng thái chờ', () => {
    const m = new PatchMove();
    step(m, 0.3, 0);
    expect(step(m, 0.5, 5.4, true)).toHaveLength(0);
  });
  it('đứng yên không sinh sự kiện', () => {
    expect(step(new PatchMove(), 3, 0)).toHaveLength(0);
  });
});
