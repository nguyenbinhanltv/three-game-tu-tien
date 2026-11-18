import { heightAt, LAKE, mulberry32, SECT, WATER_Y } from '@dtl/shared';
import type { SpatialLoop, SpatialOpts } from './audio';

/**
 * Nguồn âm theo vị trí (P2-D3): đèn lồng đá cháy lách tách nhẹ dọc lối vào tông môn, nước vỗ ven hồ, chuông xa ở tông môn.
 * Mỗi loại có tầm nghe, số nguồn tối đa cùng lúc (chỉ các nguồn gần nhất được dựng) và độ suy giảm theo khoảng cách riêng;
 * suy giảm theo mô hình nghịch đảo của PannerNode (xa nhỏ dần, lệch trái/phải theo hướng camera nhờ `setListener`).
 * Phần chọn nguồn và dựng âm là hàm thuần để test; phần phát nhận các hàm của audio.ts qua `SpatialApi`, nên test không cần Web Audio.
 */
type SourceKind = 'lantern' | 'water' | 'bell';

interface SoundSource {
  id: string;
  kind: SourceKind;
  x: number;
  z: number;
}

interface KindSpec extends SpatialOpts {
  /** Ngoài tầm này nguồn không được dựng. */
  range: number;
  /** Số nguồn cùng loại tối đa phát cùng lúc. */
  cap: number;
  /** Độ to (0..1+) của nguồn trước khi qua bus môi trường. */
  gain: number;
}

export const KINDS: Record<SourceKind, KindSpec> = {
  lantern: { range: 22, cap: 3, ref: 2.5, rolloff: 1.3, gain: 1.6 },
  water: { range: 70, cap: 2, ref: 7, rolloff: 1, gain: 2 },
  bell: { range: 280, cap: 1, ref: 30, rolloff: 1, gain: 2.5 },
};

/** Chuông ở chính điện Lạc Kiếm Tông (sect.ts: chính điện ở z = 2004). */
const BELL_POS = { x: SECT.x, z: 2004 };

/**
 * Điểm bờ quanh hồ (16 điểm): đi từ ngoài vào theo từng tia từ tâm hồ, lấy chỗ đầu tiên mặt đất thấp hơn mặt nước + 0,3 m.
 * Tất định (phụ thuộc heightAt).
 */
export function shorePoints(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const n = 16;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI + (k * 2 * Math.PI) / n;
    for (let r = 300; r > 90; r -= 2) {
      const x = LAKE.x + Math.cos(a) * r;
      const z = LAKE.z + Math.sin(a) * r;
      if (heightAt(x, z) < WATER_Y + 0.3) {
        out.push({ x, z });
        break;
      }
    }
  }
  return out;
}

/** Toàn bộ nguồn của bản đồ ngoài trời. `lanterns` là vị trí bầu đèn (SECT_LANTERNS). */
export function buildSources(lanterns: readonly { x: number; z: number }[]): SoundSource[] {
  const out: SoundSource[] = lanterns.map((l, i) => ({ id: `lantern#${i}`, kind: 'lantern', x: l.x, z: l.z }));
  shorePoints().forEach((p, i) => out.push({ id: `water#${i}`, kind: 'water', x: p.x, z: p.z }));
  out.push({ id: 'bell#0', kind: 'bell', x: BELL_POS.x, z: BELL_POS.z });
  return out;
}

/** Các nguồn cần phát khi người nghe ở (lx, lz): mỗi loại lấy tối đa `cap` nguồn gần nhất trong tầm. Sắp theo khoảng cách. */
export function pickActive(sources: readonly SoundSource[], lx: number, lz: number): { s: SoundSource; d: number }[] {
  const out: { s: SoundSource; d: number }[] = [];
  for (const kind of Object.keys(KINDS) as SourceKind[]) {
    const k = KINDS[kind];
    const near: { s: SoundSource; d: number }[] = [];
    for (const s of sources) {
      if (s.kind !== kind) continue;
      const d = Math.hypot(s.x - lx, s.z - lz);
      if (d <= k.range) near.push({ s, d });
    }
    near.sort((a, b) => a.d - b.d);
    out.push(...near.slice(0, k.cap));
  }
  return out;
}

/**
 * Lách tách của lửa đèn: những tiếng nổ nhỏ rất ngắn (nhiễu tắt theo hàm mũ, lọc thông cao nhẹ) thưa và mạnh yếu rất khác nhau,
 * trên nền xì xào thấp. 6 giây, chuẩn hóa đỉnh về 0,85 (RMS ra khoảng −22 dBFS) để đặt mức bằng hệ số của nguồn. Tất định theo `seed`.
 */
export function makeCrackle(sampleRate: number, seed = 7, seconds = 6): Float32Array {
  const rnd = mulberry32(seed);
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  // Nền xì xào: nhiễu thông thấp rất nhẹ, chậm thở.
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += 0.08 * (rnd() * 2 - 1 - lp);
    out[i] = lp * 0.5 * (0.7 + 0.3 * Math.sin((i / sampleRate) * 2.1));
  }
  // Tiếng nổ: ~7/giây, biên độ lệch về nhỏ (u^1.8).
  const pops = Math.round(seconds * 7);
  for (let k = 0; k < pops; k++) {
    const t0 = Math.floor(rnd() * (n - sampleRate * 0.05));
    const amp = 0.12 + 0.88 * Math.pow(rnd(), 1.8);
    const tau = sampleRate * (0.002 + rnd() * 0.006);
    let prev = 0;
    for (let i = 0; i < tau * 7 && t0 + i < n; i++) {
      const x = rnd() * 2 - 1;
      // Vi phân bậc một = thông cao: tiếng giòn, không ù.
      const hp = x - prev * 0.6;
      prev = x;
      out[t0 + i]! += hp * amp * Math.exp(-i / tau);
    }
  }
  // Nén mềm: tiếng nổ lớn nhất không được nhọn hơn nền quá nhiều (crest cao sẽ làm RMS quá thấp khi chuẩn hóa theo đỉnh).
  let pk = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh(out[i]! * 2.4);
    pk = Math.max(pk, Math.abs(out[i]!));
  }
  const g = 0.85 / (pk || 1);
  for (let i = 0; i < n; i++) out[i]! *= g;
  // Vòng lặp liền mạch: trộn đầu/cuối 40 ms.
  const f = Math.floor(sampleRate * 0.04);
  for (let i = 0; i < f; i++) {
    const t = i / f;
    out[i] = out[i]! * t + out[n - f + i]! * (1 - t);
  }
  return out.subarray(0, n - f);
}

/** Bồi âm chuông chùa: nốt trầm 220 Hz, tắt chậm 4–6 s, thêm tiếng thứ hai nhẹ hơn nối theo. Hàm thuần. */
export function templeBellPartials(): { freq: number; gain: number; dur: number; delay: number }[] {
  const ratios = [0.5, 1, 1.19, 1.5, 2, 2.52, 2.66, 3.01];
  const out: { freq: number; gain: number; dur: number; delay: number }[] = [];
  for (const [delay, vol] of [
    [0, 0.3],
    [1.1, 0.12],
  ] as const) {
    ratios.forEach((r, i) => out.push({ freq: 220 * r, gain: vol / (1 + i * 0.6), dur: 5.5 / (0.6 + r * 0.45), delay }));
  }
  return out;
}

/** Các hàm của audio.ts mà bộ phát dùng; tách ra để test thay bằng bản giả. */
export interface SpatialApi {
  ready(): boolean;
  loop(kind: 'crackle' | 'water', x: number, z: number, o: SpatialOpts, rate: number): Promise<SpatialLoop | null>;
  bell(x: number, z: number, o: SpatialOpts, volume: number): boolean;
}

interface Voice {
  kind: SourceKind;
  d: number;
  loop: SpatialLoop | null;
  /** Đang chờ dựng (tải bộ đệm hoặc chưa mở khóa âm thanh). */
  pending: boolean;
  /** Dựng lỗi (thiếu file...) thì thử lại sau mốc này (giây), không thử mỗi khung. */
  retryAt: number;
}

/** Quãng chờ chuông kế tiếp (giây): lần đầu sớm để nghe được, sau đó thưa. */
export const BELL_FIRST = [10, 22] as const;
const BELL_EVERY = [40, 70] as const;

export class Soundscape {
  private voices = new Map<string, Voice>();
  private nextBell = -1;
  private rnd = Math.random;
  readonly stats = { started: 0, stopped: 0, bells: 0, bellsHeard: 0 };

  constructor(
    private sources: readonly SoundSource[],
    private api: SpatialApi,
    private onLog: (msg: string) => void = () => {},
  ) {}

  /** Đặt nguồn ngẫu nhiên (test). */
  seed(rnd: () => number): this {
    this.rnd = rnd;
    return this;
  }

  /** Nguồn đang hoạt động (kể cả khi tắt tiếng: là quyết định, còn phát hay không tùy bật tiếng) cùng khoảng cách. */
  state(): { id: string; kind: SourceKind; d: number; playing: boolean }[] {
    return [...this.voices].map(([id, v]) => ({ id, kind: v.kind, d: Math.round(v.d * 10) / 10, playing: !!v.loop }));
  }

  /** Gọi mỗi khung (hoặc ~10 lần/giây) với vị trí người nghe và thời gian (giây). */
  update(lx: number, lz: number, nowSec: number): void {
    const want = pickActive(this.sources, lx, lz);
    const keep = new Set<string>();
    for (const { s, d } of want) {
      keep.add(s.id);
      const v = this.voices.get(s.id);
      if (v) {
        v.d = d;
        if (!v.loop && !v.pending && nowSec >= v.retryAt && s.kind !== 'bell' && this.api.ready()) this.start(s, v, nowSec);
      } else {
        const nv: Voice = { kind: s.kind, d, loop: null, pending: false, retryAt: 0 };
        this.voices.set(s.id, nv);
        this.stats.started++;
        this.onLog(`nguồn vị trí +${s.id} (${d.toFixed(0)} m)`);
        if (s.kind !== 'bell' && this.api.ready()) this.start(s, nv, nowSec);
      }
    }
    for (const [id, v] of this.voices) {
      if (keep.has(id)) continue;
      v.loop?.stop(0.8);
      this.voices.delete(id);
      this.stats.stopped++;
      this.onLog(`nguồn vị trí -${id}`);
    }
    this.tickBell(nowSec);
  }

  private start(s: SoundSource, v: Voice, nowSec: number): void {
    const spec = KINDS[s.kind];
    v.pending = true;
    const rate = s.kind === 'lantern' ? 0.9 + this.rnd() * 0.2 : 0.97 + this.rnd() * 0.06;
    void this.api.loop(s.kind === 'lantern' ? 'crackle' : 'water', s.x, s.z, spec, rate).then((loop) => {
      v.pending = false;
      // Nguồn đã bị bỏ trong lúc chờ tải: dọn ngay.
      if (!loop) {
        v.retryAt = nowSec + 3;
        return;
      }
      if (this.voices.get(s.id) !== v) {
        loop.stop(0.1);
        return;
      }
      v.loop = loop;
      loop.fade(spec.gain, 1.2);
    });
  }

  private tickBell(nowSec: number): void {
    const bell = [...this.voices.entries()].find(([, v]) => v.kind === 'bell');
    if (!bell) {
      // Ngoài tầm: hẹn lại từ đầu khi quay lại.
      this.nextBell = -1;
      return;
    }
    if (this.nextBell < 0) this.nextBell = nowSec + this.span(BELL_FIRST);
    if (nowSec < this.nextBell) return;
    this.nextBell = nowSec + this.span(BELL_EVERY);
    this.stats.bells++;
    const src = this.sources.find((s) => s.id === bell[0])!;
    const ok = this.api.bell(src.x, src.z, KINDS.bell, KINDS.bell.gain);
    if (ok) this.stats.bellsHeard++;
    this.onLog(`chuông xa ${ok ? 'ngân' : '(tắt tiếng/chưa mở khóa)'} cách ${bell[1].d.toFixed(0)} m`);
  }

  private span(r: readonly [number, number]): number {
    return r[0] + this.rnd() * (r[1] - r[0]);
  }

  dispose(): void {
    for (const v of this.voices.values()) v.loop?.stop(0.3);
    this.voices.clear();
  }
}
