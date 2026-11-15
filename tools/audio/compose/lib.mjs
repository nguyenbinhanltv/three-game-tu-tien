// Thư viện soạn nhạc bằng code cho Đạp Thiên Lộ: thang ngũ cung, giai điệu viết bằng chuỗi ngắn, phân lớp nhạc cụ,
// xuất Standard MIDI File (format 1). Bài cụ thể nằm ở tools/audio/compose/<id>.mjs, render bằng render.mjs.
//
// Đơn vị thời gian là PHÁCH (beat, nốt đen), số thực. Một bài lặp là một vòng `bars` ô nhịp; nốt bị cắt ở cuối vòng
// (đuôi ngân/reverb vẫn chảy sang vòng sau khi render), nên render 2 vòng rồi lấy vòng thứ hai là được vòng lặp liền.
//
// Cú pháp giai điệu (phrase): các token cách nhau bằng khoảng trắng, `|` chỉ để dễ đọc (bỏ qua).
//   <bậc>:<độ dài>   bậc trong thang (0 = chủ âm, âm = quãng tám dưới, 5 = chủ âm quãng tám trên với ngũ cung)
//   r:<độ dài>       lặng
//   hậu tố của bậc:  >  nhấn (vel +18)     ~  vuốt lên từ dưới một cung (pitch bend, cho nhị/sáo)
//                    *  vê (tremolo, lặp nốt 1/16 phách đôi; tỳ bà/shamisen)     '  ngắt (staccato)
//                    #/b  thăng/giáng nửa cung (nốt lướt ngoài thang)
//   độ dài có thể viết phân số: 1/2, 3/4, 1.5
// Ví dụ: "0:1 2:1/2 4:1/2 | 5>:2 4~:2"

export const PPQ = 480;
/** Một phách dạo đầu cho GS reset + thiết lập nhạc cụ; vòng thứ nhất bắt đầu sau đó. */
export const PRE_TICKS = PPQ;
export const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "D4" → 62, "F#3" → 54, "Bb2" → 46. */
export function n(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`tên nốt sai: ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Ngũ cung: cung (trưởng), thương, giốc, chủy, vũ (thứ). */
export const MODES = {
  gong: [0, 2, 4, 7, 9],
  shang: [0, 2, 5, 7, 10],
  jue: [0, 3, 5, 8, 10],
  zhi: [0, 2, 5, 7, 9],
  yu: [0, 3, 5, 7, 10],
};

export class Scale {
  constructor(root, mode = 'gong') {
    this.root = typeof root === 'string' ? n(root) : root;
    this.steps = Array.isArray(mode) ? mode : MODES[mode];
    if (!this.steps) throw new Error(`thang lạ: ${mode}`);
  }
  /** Bậc `d` (số nguyên, có thể âm) → số MIDI. */
  deg(d) {
    const k = this.steps.length;
    const o = Math.floor(d / k);
    return this.root + 12 * o + this.steps[d - o * k];
  }
  /** Nhiều bậc → mảng số MIDI (cho hợp âm). */
  chord(...ds) {
    return ds.map((d) => this.deg(d));
  }
}

/** PRNG có hạt (mulberry32): cùng hạt ra cùng bản nhạc. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseLen(s) {
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return a / b;
  }
  return Number(s);
}

const clamp7 = (v) => Math.max(1, Math.min(127, Math.round(v)));

export class Track {
  constructor(song, name, o) {
    this.song = song;
    this.name = name;
    this.ch = o.ch;
    this.program = o.program ?? 0;
    this.bank = o.bank ?? 0;
    this.vol = o.vol ?? 100;
    this.pan = o.pan ?? 0; // -1 trái .. 1 phải
    this.reverb = o.reverb ?? 40;
    this.chorus = o.chorus ?? 0;
    this.expr = o.expr ?? 127;
    this.humanTime = o.humanTime ?? 0.012; // phách
    this.humanVel = o.humanVel ?? 6;
    this.events = []; // { beat, kind: 'on'|'off'|'cc'|'bend', a, b }
  }

  /** Nốt `pitch` (số MIDI) ở phách `beat`, dài `dur` phách. Cắt ở cuối vòng. */
  note(beat, pitch, dur, vel = 90, { human = true } = {}) {
    const s = this.song;
    if (beat < 0 || beat >= s.beats) return this;
    let b = beat;
    let v = vel;
    if (human) {
      b = Math.max(0, beat + (s.rand() * 2 - 1) * this.humanTime);
      v = vel + (s.rand() * 2 - 1) * this.humanVel;
    }
    const end = Math.min(beat + dur, s.beats);
    if (end <= b) return this;
    this.events.push({ beat: b, kind: 'on', a: pitch, b: clamp7(v) });
    this.events.push({ beat: end, kind: 'off', a: pitch, b: 0 });
    return this;
  }

  /** Hợp âm, `strum` phách giữa các nốt (rải từ thấp lên). */
  chord(beat, pitches, dur, vel = 80, strum = 0) {
    pitches.forEach((p, i) => this.note(beat + i * strum, p, dur - i * strum, vel - i * 3));
    return this;
  }

  cc(beat, num, val) {
    this.events.push({ beat: Math.max(0, Math.min(beat, this.song.beats)), kind: 'cc', a: num, b: clamp7(val) });
    return this;
  }

  /** Đổi biểu cảm (CC11) tuyến tính từ `from` sang `to` trong [b0, b1]. */
  swell(b0, b1, from, to, steps = 12) {
    for (let i = 0; i <= steps; i++) this.cc(b0 + ((b1 - b0) * i) / steps, 11, from + ((to - from) * i) / steps);
    return this;
  }

  /** Pitch bend −1..1 (tầm ±2 cung). */
  bend(beat, v) {
    this.events.push({ beat: Math.max(0, beat), kind: 'bend', a: Math.max(-1, Math.min(1, v)), b: 0 });
    return this;
  }

  /** Vuốt từ `semis` nửa cung (âm = dưới) về đúng cao độ trong `len` phách, bắt đầu ở `beat`. */
  slide(beat, semis, len = 0.18, steps = 8) {
    for (let i = 0; i <= steps; i++) this.bend(beat + (len * i) / steps, (semis / 2) * (1 - i / steps) ** 1.6);
    return this;
  }

  /** Ngân rung (vibrato) bằng pitch bend nhẹ từ `beat` tới `end`. */
  vibrato(beat, end, depth = 0.08, rate = 5.5) {
    const sec = 60 / this.song.bpm;
    const step = 1 / 16;
    for (let t = beat; t < end; t += step) {
      const ramp = Math.min(1, (t - beat) / 0.75);
      this.bend(t, depth * ramp * Math.sin(2 * Math.PI * rate * (t - beat) * sec));
    }
    this.bend(end, 0);
    return this;
  }

  /**
   * Chơi giai điệu viết bằng chuỗi (xem đầu file) theo thang `scale` từ phách `beat`. Trả phách kết thúc.
   * Tùy chọn: oct (dịch quãng tám), vel, legato (tỉ lệ độ dài nốt), vib (ngân rung nốt ≥ vib phách), trem (tốc độ vê, nốt/phách).
   */
  phrase(beat, scale, str, o = {}) {
    const { oct = 0, vel = 88, legato = 0.96, vib = 0, trem = 6, transpose = 0 } = o;
    let t = beat;
    for (const tok of str.trim().split(/\s+/)) {
      if (tok === '|' || tok === '') continue;
      const m = /^(r|-?\d+)([>~*'#b]*):([\d./]+)$/.exec(tok);
      if (!m) throw new Error(`token giai điệu sai "${tok}" trong "${str}"`);
      const len = parseLen(m[3]);
      if (m[1] !== 'r') {
        const mods = m[2];
        let p = scale.deg(Number(m[1])) + 12 * oct + transpose;
        if (mods.includes('#')) p += 1;
        if (mods.includes('b')) p -= 1;
        const v = vel + (mods.includes('>') ? 18 : 0);
        const d = mods.includes("'") ? Math.min(len, 0.3) : len * legato;
        if (mods.includes('*')) {
          const k = Math.max(1, Math.round(len * trem));
          for (let i = 0; i < k; i++) this.note(t + i / trem, p, (1 / trem) * 0.9, v - 10 + (i % 2) * 6 - (i === 0 ? -8 : 0));
        } else {
          if (mods.includes('~')) this.slide(t, -2, Math.min(0.25, len * 0.3));
          this.note(t, p, d, v);
          if (vib && len >= vib) this.vibrato(t + Math.min(0.5, len * 0.3), t + d);
        }
      }
      t += len;
    }
    return t;
  }

  /** Lặp mẫu nhịp: `pattern` là mảng vel (0 = nghỉ) mỗi ô `step` phách, nốt `pitch` (số hoặc hàm (i) => số). */
  pattern(beat, end, step, pattern, pitch, dur = step * 0.9) {
    let i = 0;
    for (let t = beat; t < end - 1e-9; t += step, i++) {
      const v = pattern[i % pattern.length];
      if (v > 0) this.note(t, typeof pitch === 'function' ? pitch(i) : pitch, dur, v);
    }
    return this;
  }
}

export class Song {
  /**
   * @param {{ id: string, bpm: number, bars: number, beatsPerBar?: number, seed?: number, loop?: boolean,
   *           reverb?: { macro?: number, time?: number }, tailSec?: number }} o
   * reverb.macro theo GS: 0 Room1, 1 Room2, 2 Room3, 3 Hall1, 4 Hall2, 5 Plate. tailSec: thời gian ngân sau vòng (để đuôi reverb đủ).
   */
  constructor(o) {
    this.id = o.id;
    this.bpm = o.bpm;
    this.beatsPerBar = o.beatsPerBar ?? 4;
    this.bars = o.bars;
    this.loop = o.loop !== false;
    this.reverb = { macro: 4, time: 80, ...(o.reverb ?? {}) };
    this.tailSec = o.tailSec ?? 8;
    this.rand = rng(o.seed ?? 1);
    this.tracks = [];
    this.sections = [];
  }

  get beats() {
    return this.bars * this.beatsPerBar;
  }

  /** Phách đầu của ô nhịp `b` (đếm từ 0). */
  bar(b) {
    return b * this.beatsPerBar;
  }

  /** Ghi tên phần (A/B/C…) để in báo cáo và kiểm cấu trúc. */
  section(name, fromBar, toBar) {
    this.sections.push({ name, fromBar, toBar });
    return this;
  }

  track(name, o) {
    const t = new Track(this, name, o);
    this.tracks.push(t);
    return t;
  }

  /** Tempo theo micro giây mỗi nốt đen (số nguyên, đúng như trong file MIDI). */
  get tempoUs() {
    return Math.round(60e6 / this.bpm);
  }

  /** Số mẫu của một vòng ở `sr` (theo BPM chính xác; bộ render tự lập lịch sự kiện theo mẫu). */
  cycleSamples(sr) {
    return this.tickToSample(this.beats * PPQ, sr);
  }

  /** Số mẫu của phách dạo đầu (PRE_TICKS, chỗ đặt GS reset và thiết lập nhạc cụ) trước vòng đầu tiên. */
  preSamples(sr) {
    return this.tickToSample(PRE_TICKS, sr);
  }

  /**
   * Dòng sự kiện tuyệt đối: `repeats` vòng liền nhau sau phách dạo đầu, rồi `tailSec` giây im (cho đuôi ngân/reverb).
   * Trả { tracks: [[tick, msg][]] (track 0 = tempo/GS), endTick }. msg là byte MIDI thô (meta FF…, sysex F0…).
   */
  timeline({ repeats = 1 } = {}) {
    const cycleTicks = this.beats * PPQ;
    const tailTicks = Math.ceil((this.tailSec * 1e6 * PPQ) / this.tempoUs);
    const endTick = PRE_TICKS + cycleTicks * repeats + tailTicks;
    const tracks = [];
    // Track 0: tempo, nhịp, GS reset + reverb.
    const t0 = [];
    t0.push([0, meta(0x03, ascii(this.id))]);
    t0.push([0, meta(0x51, [(this.tempoUs >> 16) & 255, (this.tempoUs >> 8) & 255, this.tempoUs & 255])]);
    t0.push([0, meta(0x58, [this.beatsPerBar, 2, 24, 8])]);
    t0.push([0, sysex([0x41, 0x10, 0x42, 0x12], [0x40, 0x00, 0x7f], [0x00])]); // GS reset
    t0.push([1, sysex([0x41, 0x10, 0x42, 0x12], [0x40, 0x01, 0x30], [this.reverb.macro])]);
    t0.push([2, sysex([0x41, 0x10, 0x42, 0x12], [0x40, 0x01, 0x34], [this.reverb.time])]);
    t0.push([endTick, meta(0x2f, [])]);
    tracks.push(t0);
    for (const tr of this.tracks) {
      const ev = [];
      const ch = tr.ch;
      const setup = [
        [0xb0 | ch, 0, tr.bank],
        [0xb0 | ch, 32, 0],
        [0xc0 | ch, tr.program],
        [0xb0 | ch, 7, tr.vol],
        [0xb0 | ch, 10, Math.max(0, Math.min(127, Math.round(64 + tr.pan * 63)))],
        [0xb0 | ch, 91, tr.reverb],
        [0xb0 | ch, 93, tr.chorus],
        // Tầm pitch bend ±2 cung (RPN 0), rồi khóa RPN.
        [0xb0 | ch, 101, 0],
        [0xb0 | ch, 100, 0],
        [0xb0 | ch, 6, 2],
        [0xb0 | ch, 38, 0],
        [0xb0 | ch, 101, 127],
        [0xb0 | ch, 100, 127],
      ];
      ev.push([0, meta(0x03, ascii(tr.name)), -1]);
      // Thiết lập ở tick 10 (sau GS reset ở track 0) để reset không xóa mất; vòng đầu bắt đầu ở PRE_TICKS.
      for (const m of setup) ev.push([10, m, -1]);
      for (let r = 0; r < repeats; r++) {
        const off = PRE_TICKS + r * cycleTicks;
        // Đầu mỗi vòng đặt lại trạng thái liên tục (biểu cảm, bend) để vòng sau giống hệt vòng trước.
        ev.push([off, [0xb0 | ch, 11, tr.expr], 1]);
        ev.push([off, bendMsg(ch, 0), 1]);
        for (const e of tr.events) {
          const tick = off + Math.round(e.beat * PPQ);
          if (e.kind === 'on') ev.push([tick, [0x90 | ch, e.a, e.b], 3]);
          else if (e.kind === 'off') ev.push([tick, [0x80 | ch, e.a, 0], 0]);
          else if (e.kind === 'cc') ev.push([tick, [0xb0 | ch, e.a, e.b], 2]);
          else ev.push([tick, bendMsg(ch, e.a), 2]);
        }
      }
      // Cùng tick: tắt nốt trước, rồi CC/bend, rồi bật nốt (sort ổn định giữ thứ tự ghi).
      ev.sort((x, y) => x[0] - y[0] || x[2] - y[2]);
      ev.push([endTick, meta(0x2f, []), 9]);
      tracks.push(ev.map(([t, m]) => [t, m]));
    }
    return { tracks, endTick };
  }

  /** Xuất Standard MIDI File (format 1) của `timeline({ repeats })`. */
  toMidi({ repeats = 1 } = {}) {
    const chunks = this.timeline({ repeats }).tracks.map(trackChunk);
    const head = [...ascii('MThd'), ...u32(6), 0, 1, ...u16(chunks.length), ...u16(PPQ)];
    return new Uint8Array([...head, ...chunks.flat()]);
  }

  /** Tick → mẫu theo BPM chính xác (không làm tròn tempo như trong file MIDI). */
  tickToSample(tick, sr) {
    return Math.round((tick * 60 * sr) / (this.bpm * PPQ));
  }

  /** Tóm tắt để in khi render. */
  summary() {
    const secs = (this.beats * this.tempoUs) / 1e6;
    const notes = this.tracks.reduce((s, t) => s + t.events.filter((e) => e.kind === 'on').length, 0);
    return `${this.id}: ${this.bpm} BPM, ${this.bars} ô nhịp ${this.beatsPerBar}/4 = ${secs.toFixed(1)} s, ${this.tracks.length} bè, ${notes} nốt, phần ${this.sections.map((s) => s.name).join(' ') || '—'}`;
  }
}

// ---------- SMF ----------

function ascii(s) {
  return [...Buffer.from(s, 'utf8')];
}
function u32(v) {
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}
function u16(v) {
  return [(v >> 8) & 255, v & 255];
}
function vlq(v) {
  const out = [v & 0x7f];
  v >>>= 7;
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return out;
}
function meta(type, data) {
  return [0xff, type, ...vlq(data.length), ...data];
}
/** SysEx Roland có checksum: header (máy, id, model, lệnh), địa chỉ, dữ liệu. */
function sysex(head, addr, data) {
  const sum = [...addr, ...data].reduce((a, b) => a + b, 0);
  const body = [...head, ...addr, ...data, (128 - (sum % 128)) % 128, 0xf7];
  return [0xf0, ...vlq(body.length), ...body];
}
function bendMsg(ch, v) {
  const x = Math.max(0, Math.min(16383, Math.round(8192 + v * 8191)));
  return [0xe0 | ch, x & 0x7f, x >> 7];
}
function trackChunk(events) {
  let last = 0;
  const bytes = [];
  for (const [tick, msg] of events) {
    bytes.push(...vlq(tick - last), ...msg);
    last = tick;
  }
  return [...ascii('MTrk'), ...u32(bytes.length), ...bytes];
}
