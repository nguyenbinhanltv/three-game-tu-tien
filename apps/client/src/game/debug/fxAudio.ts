// Xưởng âm thanh của phòng thử (Diễn Võ Trường, V2d): đo từ DỮ LIỆU độ lệch giữa tiếng của một timeline hiệu ứng và mốc trúng đòn của chính nó.
// Mốc trúng = sự kiện `hitstop` / `impact` sớm nhất (lúc hình báo "trúng"); tiếng = các sự kiện `soundAt` / `sound`. Hàm thuần, không phát gì.
import type { FxEvent } from '@dtl/shared';

/** Lệch tiếng so với mốc trúng quá ngần này (ms) thì tai nghe ra tiếng và hình không khớp. */
export const FX_AUDIO_TOL_MS = 60;

export interface FxSoundRow {
  id: string;
  /** Mốc phát (giây từ đầu timeline). */
  t: number;
  /** Lệch so với mốc trúng (ms; âm = tiếng tới trước hình). null khi timeline không có mốc trúng. */
  offsetMs: number | null;
}

export type FxAudioVerdict = 'ok' | 'early' | 'late' | 'silent' | 'nohit';

export interface FxAudioReport {
  /** Mốc trúng (giây); null = timeline không có khựng hình hay khung va chạm. */
  impactT: number | null;
  sounds: FxSoundRow[];
  /** Lệch của tiếng GẦN mốc trúng nhất (ms); null khi thiếu tiếng hoặc thiếu mốc. */
  nearestMs: number | null;
  verdict: FxAudioVerdict;
}

export function fxAudioReport(events: readonly FxEvent[]): FxAudioReport {
  let impactT: number | null = null;
  const raw: { id: string; t: number }[] = [];
  for (const ev of events) {
    const t = typeof ev.t === 'number' ? ev.t : 0;
    if (ev.type === 'hitstop' || ev.type === 'impact') impactT = impactT === null ? t : Math.min(impactT, t);
    else if (ev.type === 'soundAt' || ev.type === 'sound') raw.push({ id: ev.id, t });
  }
  raw.sort((a, b) => a.t - b.t);
  const sounds = raw.map((s) => ({ ...s, offsetMs: impactT === null ? null : Math.round((s.t - impactT) * 1000) }));
  if (!sounds.length) return { impactT, sounds, nearestMs: null, verdict: 'silent' };
  if (impactT === null) return { impactT, sounds, nearestMs: null, verdict: 'nohit' };
  const nearestMs = sounds.reduce((best, s) => (Math.abs(s.offsetMs!) < Math.abs(best) ? s.offsetMs! : best), sounds[0]!.offsetMs!);
  const verdict: FxAudioVerdict = Math.abs(nearestMs) <= FX_AUDIO_TOL_MS ? 'ok' : nearestMs < 0 ? 'early' : 'late';
  return { impactT, sounds, nearestMs, verdict };
}
