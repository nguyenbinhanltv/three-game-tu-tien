// Nhạc chiến đấu phân lớp (M4-13): bài vùng + hai lớp giao chiến (nhịp, giai điệu căng) cùng tempo, cùng độ dài vòng.
// Cả ba là AudioBufferSourceNode `loop` bắt đầu cùng một thời điểm AudioContext với cùng offset nên đồng bộ tới
// từng mẫu; vào/ra giao tranh chỉ đổi âm lượng từng lớp (không đổi bài, không cắt nhịp).
//
// Bộ nhớ: mỗi lớp giải mã ra khoảng 50 MB (2 kênh float, 2 phút+), chỉ giữ bộ của một vùng. Chưa nạp xong
// hoặc nạp lỗi thì music.ts dùng đường cũ (stream bài vùng/`combat` crossfade).
import { decodeMusic, musicOutput, stemSources } from './audio';
import type { StemMix, StemZone } from './musicDirector';

interface Bufs {
  zone: StemZone;
  base: AudioBuffer;
  pulse: AudioBuffer;
  edge: AudioBuffer;
}

interface Playing {
  zone: StemZone;
  srcs: AudioBufferSourceNode[];
  gains: { base: GainNode; pulse: GainNode; edge: GainNode };
  out: GainNode;
  /** Thời điểm ctx của mẫu 0 vòng lặp (có thể âm: bắt đầu giữa vòng). */
  origin: number;
  length: number;
}

/** Lên nhanh để đòn đánh có nhạc ngay, xuống chậm để không hụt hơi giữa hai đợt quái. */
const ATTACK = 0.35;
const RELEASE = 3;

export class StemPlayer {
  private bufs: Bufs | null = null;
  private loading: StemZone | null = null;
  private failed = new Set<StemZone>();
  private cur: Playing | null = null;
  private mix: StemMix = { base: 1, pulse: 0, edge: 0 };

  /** Zone đang phát (không tính đang tắt dần). */
  get playing(): StemZone | null {
    return this.cur?.zone ?? null;
  }

  /** Đã có đủ ba lớp của `zone` trong bộ nhớ. */
  ready(zone: StemZone): boolean {
    return this.bufs?.zone === zone;
  }

  /** Nạp ba lớp (nền trước), không làm gì nếu đã có/đang nạp/đã lỗi. `done` gọi khi xong để music.ts chọn lại nguồn. */
  preload(zone: StemZone, done: () => void): void {
    if (this.ready(zone) || this.loading === zone || this.failed.has(zone)) return;
    if (!musicOutput()) return;
    const src = stemSources(zone);
    if (!src) return;
    this.loading = zone;
    if (this.bufs && this.cur?.zone !== this.bufs.zone) this.bufs = null;
    void (async () => {
      const [base, pulse, edge] = await Promise.all([decodeMusic(src.base), decodeMusic(src.pulse), decodeMusic(src.edge)]);
      if (this.loading !== zone) return;
      this.loading = null;
      if (!base || !pulse || !edge) {
        this.failed.add(zone);
        console.warn(`[music] stem ${zone}: nạp lỗi, dùng đường crossfade cũ`);
        return;
      }
      // Ba file phải đúng bằng nhau từng mẫu, nếu không thì vòng lệch dần: coi như lỗi.
      if (base.length !== pulse.length || base.length !== edge.length) {
        this.failed.add(zone);
        console.warn(`[music] stem ${zone}: độ dài lệch (${base.length}/${pulse.length}/${edge.length} mẫu), dùng đường cũ`);
        return;
      }
      this.bufs = { zone, base, pulse, edge };
      done();
    })();
  }

  /**
   * Bắt đầu phát bộ `zone` (đã `ready`), `offset` giây vào vòng (để nối đúng pha với bài đang stream), với âm lượng
   * ban đầu `mix` và crossfade vào `fade` giây. Bộ đang phát (nếu khác) tắt dần.
   */
  start(zone: StemZone, offset: number, mix: StemMix, fade: number): boolean {
    const o = musicOutput();
    const b = this.bufs;
    if (!o || !b || b.zone !== zone) return false;
    this.stop(fade);
    const c = o.ctx;
    const t0 = c.currentTime + 0.05;
    const length = b.base.duration;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + Math.max(0.05, fade));
    out.connect(o.out);
    const make = (buf: AudioBuffer, level: number) => {
      const g = c.createGain();
      g.gain.value = level;
      g.connect(out);
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(g);
      // Cả ba cùng thời điểm bắt đầu và cùng offset → đồng bộ mẫu.
      s.start(t0, ((offset % length) + length) % length);
      return { s, g };
    };
    const base = make(b.base, mix.base);
    const pulse = make(b.pulse, mix.pulse);
    const edge = make(b.edge, mix.edge);
    this.mix = { ...mix };
    this.cur = {
      zone,
      srcs: [base.s, pulse.s, edge.s],
      gains: { base: base.g, pulse: pulse.g, edge: edge.g },
      out,
      origin: t0 - offset,
      length,
    };
    return true;
  }

  /** Chỉnh âm lượng từng lớp (lên nhanh, xuống chậm). */
  setMix(mix: StemMix): void {
    const p = this.cur;
    const o = musicOutput();
    if (!p || !o) return;
    const t = o.ctx.currentTime;
    for (const k of ['base', 'pulse', 'edge'] as const) {
      if (Math.abs(mix[k] - this.mix[k]) < 1e-3) continue;
      const g = p.gains[k].gain;
      const dur = mix[k] > this.mix[k] ? ATTACK : RELEASE;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(mix[k], t + dur);
    }
    this.mix = { ...mix };
  }

  /** Vị trí hiện tại trong vòng (giây), cho test/gỡ lỗi. */
  position(): number | null {
    const p = this.cur;
    const o = musicOutput();
    if (!p || !o) return null;
    return (((o.ctx.currentTime - p.origin) % p.length) + p.length) % p.length;
  }

  stop(fade: number): void {
    const p = this.cur;
    if (!p) return;
    this.cur = null;
    const o = musicOutput();
    const stopAt = (o?.ctx.currentTime ?? 0) + fade + 0.1;
    if (o) {
      const t = o.ctx.currentTime;
      p.out.gain.cancelScheduledValues(t);
      p.out.gain.setValueAtTime(p.out.gain.value, t);
      p.out.gain.linearRampToValueAtTime(0, t + Math.max(0.05, fade));
    }
    for (const s of p.srcs) {
      try {
        s.stop(stopAt);
      } catch {
        // đã dừng
      }
      s.onended = () => s.disconnect();
    }
    setTimeout(() => p.out.disconnect(), (fade + 0.5) * 1000);
  }

  /** Bỏ bộ đệm (rời game, hoặc rời hẳn vùng). */
  dispose(fade: number): void {
    this.stop(fade);
    this.loading = null;
    this.bufs = null;
  }
}
