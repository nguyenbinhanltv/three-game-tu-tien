import type { Manifest } from './audio';

const DEV = (import.meta as unknown as { env: { DEV: boolean } }).env.DEV;

/** Phần trạng thái của audio.ts mà deck cần đọc (giá trị đổi theo thời gian nên truyền hàm đọc, không import ngược). */
export interface DeckEnv {
  muted(): boolean;
  manifest(): Manifest | null;
  playable(src: string | string[] | undefined): string[];
}

export interface Channel {
  g: GainNode;
  el: HTMLAudioElement | null;
  node: MediaElementAudioSourceNode | null;
}

/** Mức gió tổng hợp (trước bus ambient); chỉnh theo âm môi trường file ở level -22 dB. */
export const WIND_GAIN = 0.35;

export function ramp(g: GainNode, to: number, t: number, dur: number): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(to, t + dur);
}

/**
 * Gió tổng hợp: nhiễu 4 giây lặp → thông dải → thông thấp có tần số cắt và âm lượng thở theo 2 LFO chậm.
 * Chỉ dựng đồ thị khi cần và gỡ hẳn khi tắt để không tốn CPU lúc đã có file.
 */
export class SynthWind {
  private g: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  on = false;

  constructor(
    private c: AudioContext,
    out: AudioNode,
  ) {
    this.g = c.createGain();
    this.g.gain.value = 0;
    this.g.connect(out);
  }

  start(fade: number): void {
    if (this.on) return;
    this.on = true;
    const c = this.c;
    if (!this.nodes.length) {
      const len = c.sampleRate * 4;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      // Nhiễu nâu nhẹ (tích phân có rò) cho tiếng gió trầm, không rít.
      let y = 0;
      for (let i = 0; i < len; i++) {
        y = 0.985 * y + 0.15 * (Math.random() * 2 - 1);
        d[i] = y;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 0.5;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      const amp = c.createGain();
      amp.gain.value = 0.7;
      const lfo1 = c.createOscillator();
      lfo1.frequency.value = 0.063;
      const l1 = c.createGain();
      l1.gain.value = 380;
      lfo1.connect(l1).connect(lp.frequency);
      const lfo2 = c.createOscillator();
      lfo2.frequency.value = 0.17;
      const l2 = c.createGain();
      l2.gain.value = 0.3;
      lfo2.connect(l2).connect(amp.gain);
      src.connect(bp).connect(lp).connect(amp).connect(this.g);
      src.start(0, Math.random() * 4);
      lfo1.start();
      lfo2.start();
      this.nodes = [src, lfo1, lfo2];
    }
    ramp(this.g, WIND_GAIN, c.currentTime, fade);
    if (DEV) console.info('[audio] ambient: gió tổng hợp');
  }

  stop(fade: number): void {
    if (!this.on) return;
    this.on = false;
    ramp(this.g, 0, this.c.currentTime, fade);
    setTimeout(
      () => {
        if (this.on) return;
        for (const n of this.nodes) {
          n.stop();
          n.disconnect();
        }
        this.nodes = [];
      },
      fade * 1000 + 150,
    );
  }
}

export class StreamDeck {
  private ch: [Channel, Channel];
  private active = 0;
  /** Bài đang được yêu cầu (kể cả khi chưa phát được vì chưa có file/chưa mở khóa). */
  want: string | null = null;
  playing: string | null = null;
  private fade = 2;
  /** Gió tổng hợp dự phòng (chỉ deck âm môi trường). */
  readonly wind: SynthWind | null;

  /** Bài đang ra tiếng và vị trí phát (giây) trong vòng, để lớp stem nối đúng pha khi tiếp quản. */
  position(): { id: string; time: number } | null {
    const el = this.ch[this.active].el;
    return this.playing && el ? { id: this.playing, time: el.currentTime } : null;
  }

  constructor(
    private c: AudioContext,
    out: AudioNode,
    private kind: 'music' | 'ambient',
    private env: DeckEnv,
  ) {
    this.wind = kind === 'ambient' ? new SynthWind(c, out) : null;
    const mk = (): Channel => {
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(out);
      return { g, el: null, node: null };
    };
    this.ch = [mk(), mk()];
  }

  request(id: string | null, fade: number): void {
    this.want = id;
    this.fade = Math.max(0.05, fade);
    this.sync();
  }

  /** Đưa trạng thái phát về đúng `want` khi đủ điều kiện (đã mở khóa, có manifest, không tắt tiếng). */
  sync(): void {
    const id = this.env.muted() || this.c.state !== 'running' ? null : this.want;
    if (!id) this.wind?.stop(this.fade);
    if (id === this.playing) return;
    if (id && !this.env.manifest()) {
      // Chờ manifest: âm môi trường tạm bằng gió tổng hợp (nhạc thì im lặng, music.ts tự lo bài giữ chỗ).
      this.wind?.start(this.fade);
      return;
    }
    const entry = id ? this.env.manifest()?.[this.kind]?.[id] : undefined;
    // Mọi định dạng trình duyệt nhận là phát được, theo thứ tự ưu tiên: định dạng đầu lỗi khi nạp
    // (canPlayType nói có nhưng không giải mã được, ví dụ WebM/Opus trên Safari cũ) thì thử định dạng kế tiếp.
    const urls = entry ? this.env.playable(entry.src) : [];
    const url = urls[0] ?? null;
    if (id && !url && this.playing === null) {
      // Không có file: nhạc im lặng, âm môi trường dùng gió tổng hợp.
      this.wind?.start(this.fade);
      return;
    }
    const t = this.c.currentTime;
    const fade = this.fade;
    // Tắt dần kênh đang phát.
    const old = this.ch[this.active];
    ramp(old.g, 0, t, fade);
    const oldEl = old.el;
    if (oldEl) setTimeout(() => this.release(old, oldEl), fade * 1000 + 100);
    this.playing = id;
    if (!id || !url || !entry) {
      if (id) this.wind?.start(fade);
      return;
    }
    // Bật kênh còn lại.
    this.active = 1 - this.active;
    const ch = this.ch[this.active];
    if (ch.el) this.release(ch, ch.el);
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.loop = entry.loop ?? true;
    el.src = url;
    let tried = 0;
    el.addEventListener('error', () => {
      // Kênh đã bị thả hoặc đã đổi bài (release() xóa src cũng bắn 'error'): bỏ qua.
      if (ch.el !== el || this.playing !== id) return;
      console.warn('[audio] không phát được', urls[tried]);
      tried++;
      if (tried < urls.length) {
        el.src = urls[tried];
        el.play().catch((err) => console.warn('[audio] play() bị từ chối', urls[tried], err));
        return;
      }
      this.wind?.start(fade);
    });
    // File đã ra tiếng: tắt dần gió tổng hợp (nếu đang chạy) cùng nhịp crossfade.
    el.addEventListener('playing', () => ch.el === el && this.wind?.stop(fade), { once: true });
    ch.el = el;
    ch.node = this.c.createMediaElementSource(el);
    ch.node.connect(ch.g);
    ch.g.gain.cancelScheduledValues(t);
    ch.g.gain.setValueAtTime(0, t);
    ramp(ch.g, entry.gain ?? 1, t, fade);
    if (DEV) console.info(`[audio] ${this.kind}: ${id} (${url})`);
    el.play().catch((err) => console.warn('[audio] play() bị từ chối', url, err));
  }

  private release(ch: Channel, el: HTMLAudioElement): void {
    if (ch.el !== el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
    ch.node?.disconnect();
    ch.el = null;
    ch.node = null;
  }
}
