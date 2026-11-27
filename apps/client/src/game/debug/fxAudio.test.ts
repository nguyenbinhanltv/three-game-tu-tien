import { describe, expect, it } from 'vitest';
import type { FxEvent } from '@dtl/shared';
import { FX_TIMELINE } from '@dtl/content';
import { FX_AUDIO_TOL_MS, fxAudioReport } from './fxAudio';

const ev = (list: unknown[]): FxEvent[] => list as FxEvent[];

describe('fxAudioReport (lệch tiếng so với mốc trúng của một timeline)', () => {
  it('tiếng trùng mốc khựng hình thì đạt', () => {
    const r = fxAudioReport(ev([{ type: 'hitstop', t: 0.2, ms: 60 }, { type: 'soundAt', t: 0.22, id: 'hit_a' }]));
    expect(r.impactT).toBe(0.2);
    expect(r.nearestMs).toBe(20);
    expect(r.verdict).toBe('ok');
  });

  it('lấy tiếng GẦN mốc trúng nhất, báo sớm/muộn khi quá dung sai', () => {
    const late = fxAudioReport(ev([{ type: 'impact', t: 0.1, frames: 2 }, { type: 'soundAt', t: 0.4, id: 'a' }, { type: 'soundAt', t: 0.25, id: 'b' }]));
    expect(late.nearestMs).toBe(150);
    expect(late.verdict).toBe('late');
    expect(late.sounds.map((s) => s.id)).toEqual(['b', 'a']);
    const early = fxAudioReport(ev([{ type: 'hitstop', t: 0.5, ms: 60 }, { type: 'sound', t: 0, id: 'a' }]));
    expect(early.nearestMs).toBe(-500);
    expect(early.verdict).toBe('early');
  });

  it('không tiếng → silent; có tiếng mà không có mốc trúng → nohit', () => {
    expect(fxAudioReport(ev([{ type: 'hitstop', t: 0, ms: 60 }])).verdict).toBe('silent');
    const r = fxAudioReport(ev([{ type: 'soundAt', t: 0.1, id: 'a' }]));
    expect(r.verdict).toBe('nohit');
    expect(r.sounds[0]!.offsetMs).toBeNull();
  });

  it('chạy được trên mọi timeline thật và dung sai là số dương', () => {
    expect(FX_AUDIO_TOL_MS).toBeGreaterThan(0);
    for (const [, tl] of FX_TIMELINE) expect(['ok', 'early', 'late', 'silent', 'nohit']).toContain(fxAudioReport(tl.events).verdict);
  });
});
