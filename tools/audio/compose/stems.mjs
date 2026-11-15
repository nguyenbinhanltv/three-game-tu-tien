// Lớp giao chiến (stem) cho nhạc vùng (M4-13): `<vùng>_pulse` (nhịp: trống, dây trầm 3-3-2) và `<vùng>_edge`
// (giai điệu căng: dây vê + nhị). Mỗi lớp cùng tempo, cùng khóa, cùng số ô nhịp và cùng phần A/B/C… với bài vùng,
// nên client phát đồng bộ mẫu với bài vùng rồi chỉ tăng/giảm âm lượng theo mức giao chiến.
// Hợp âm mỗi ô lấy từ chính bài vùng (sao chép ở ZONES, đổi bài vùng thì sửa cả hai chỗ).
import { n, Scale, Song } from './lib.mjs';

export const ZONES = {
  sect: {
    bpm: 72,
    bars: 40,
    reverb: { macro: 4, time: 92 },
    scale: ['D4', 'gong'],
    sections: [['A', 0, 8], ['B', 8, 16], ['C', 16, 24], ['D', 24, 32], ["B'", 32, 40]],
    chords: {
      D: [n('D3'), n('A3'), n('E4'), n('F#4')],
      Bm: [n('B2'), n('F#3'), n('A3'), n('D4')],
      G: [n('G2'), n('D3'), n('B3'), n('E4')],
      Em: [n('E3'), n('B3'), n('D4'), n('F#4')],
      Asus: [n('A2'), n('E3'), n('B3'), n('D4')],
    },
    chordAt: (bar, C) => C[(bar >= 24 && bar < 32 ? ['Bm', 'G', 'Em', 'Asus'] : ['D', 'Bm', 'G', 'Asus'])[Math.floor((bar % 8) / 2)]],
    drum: { program: 116, low: 48 },
  },
  wild: {
    bpm: 84,
    bars: 48,
    reverb: { macro: 4, time: 84 },
    scale: ['E4', 'gong'],
    sections: [['A', 0, 8], ['B', 8, 16], ['C', 16, 24], ['D', 24, 32], ['E', 32, 40], ['F', 40, 48]],
    chords: {
      E: [n('E3'), n('B3'), n('F#4'), n('G#4')],
      Cs: [n('C#3'), n('G#3'), n('B3'), n('E4')],
      A: [n('A2'), n('E3'), n('B3'), n('C#4')],
      B: [n('B2'), n('F#3'), n('C#4'), n('E4')],
      Fs: [n('F#2'), n('C#3'), n('G#3'), n('B3')],
    },
    chordAt: (bar, C) => C[(bar >= 24 && bar < 32 ? ['A', 'B', 'Fs', 'B'] : ['E', 'Cs', 'A', 'B'])[Math.floor((bar % 8) / 2)]],
    drum: { program: 117, low: 43, taikoToo: true },
  },
  dungeon: {
    bpm: 70,
    bars: 32,
    reverb: { macro: 4, time: 116 },
    scale: ['A3', 'yu'],
    sections: [['A', 0, 8], ['B', 8, 16], ['C', 16, 24], ['D', 24, 32]],
    chords: {
      Am: [n('A1'), n('E2'), n('A2'), n('E3')],
      G: [n('G1'), n('D2'), n('G2'), n('D3')],
      F: [n('F1'), n('C2'), n('F2'), n('C3')],
      Bb: [n('Bb1'), n('F2'), n('Bb2'), n('F3')],
      Esus: [n('E1'), n('B1'), n('E2'), n('A2')],
    },
    chordAt: (bar, C) => C[(bar >= 16 && bar < 24 ? ['F', 'Bb', 'F', 'Esus'] : ['Am', 'Am', 'G', 'Am'])[Math.floor((bar % 8) / 2)]],
    drum: { program: 116, low: 43, sparse: true },
  },
};

const song = (zone, role, seed) => {
  const z = ZONES[zone];
  const s = new Song({ id: `${zone}_${role}`, bpm: z.bpm, bars: z.bars, seed, reverb: z.reverb, tailSec: 6 });
  for (const [name, a, b] of z.sections) s.section(name, a, b);
  return { s, z };
};

/** Nhịp: trống chiến 3-3-2, trống bass phách 1/3, dây trầm ostinato, mõ gỗ; chũm chọe đầu mỗi phần. */
export function pulse(zone) {
  const { s, z } = song(zone, 'pulse', ZONES[zone].bpm + 1000);
  const taiko = s.track('taiko', { ch: 0, program: z.drum.program, vol: 100, pan: 0, reverb: 50, humanTime: 0.006, humanVel: 5 });
  const bassdrum = s.track('bassdrum', { ch: 1, program: 116, bank: 8, vol: 88, pan: 0, reverb: 40, humanTime: 0 });
  const low = s.track('low', { ch: 2, program: 48, vol: 92, pan: -0.2, reverb: 40, humanTime: 0.004 });
  const contra = s.track('contra', { ch: 3, program: z.drum.low, vol: 80, pan: 0.1, reverb: 30, humanTime: 0.004 });
  const block = s.track('block', { ch: 4, program: 115, vol: 56, pan: 0.45, reverb: 30, humanTime: 0.004, humanVel: 8 });
  const kit = s.track('kit', { ch: 9, program: 0, vol: 82, pan: 0, reverb: 50, humanTime: 0 });
  let tom = null;
  if (z.drum.taikoToo) tom = s.track('tom', { ch: 5, program: 116, vol: 84, pan: 0.2, reverb: 50, humanTime: 0.006 });

  const T1 = [110, 0, 0, 70, 0, 0, 92, 0, 100, 0, 0, 62, 0, 70, 0, 0];
  const T2 = [110, 0, 0, 70, 0, 0, 98, 0, 0, 0, 100, 0, 70, 0, 92, 80];
  const FILL = [110, 0, 70, 0, 80, 0, 90, 0, 100, 80, 100, 90, 110, 100, 115, 127];
  const SPARSE = [110, 0, 0, 0, 0, 0, 80, 0, 96, 0, 0, 0, 0, 0, 70, 0];
  const OST = [96, 0, 0, 84, 0, 0, 90, 0];
  for (let b = 0; b < z.bars; b++) {
    const t = s.bar(b);
    const last = b % 8 === 7;
    const pat = z.drum.sparse ? (last ? FILL : SPARSE) : last ? FILL : b % 4 === 3 ? T2 : T1;
    taiko.pattern(t, t + 4, 1 / 4, pat, (i) => (i % 4 === 2 ? n('G2') : n('C2')), 0.4);
    bassdrum.note(t, n('C2'), 1, 108);
    bassdrum.note(t + 2, n('C2'), 1, 88);
    if (tom && b % 2 === 1) tom.pattern(t + 2, t + 4, 1 / 2, [90, 78, 100, 110], n('D3'), 0.3);
    let root = z.chordAt(b, z.chords)[0];
    while (root < 38) root += 12;
    if (!last) {
      low.pattern(t, t + 4, 1 / 2, OST, root, 0.45);
      if (!z.drum.sparse || b % 2) contra.note(t, root - 12 >= 28 ? root - 12 : root, 3.6, 70);
    }
    if (!z.drum.sparse) block.pattern(t, t + 4, 1 / 4, [66, 28, 42, 28], n('E5'), 0.1);
  }
  for (const [, a] of z.sections) kit.note(s.bar(a), n('C#3'), 2, 96);
  for (let b = 7; b < z.bars; b += 8) kit.pattern(s.bar(b) + 3, s.bar(b) + 4, 1 / 8, [40, 46, 52, 58, 64, 70, 76, 84], n('D2'), 0.1);
  return s;
}

const MOTIF = [
  '5:1 4:1/2 3:1/2 4:2 | 6:1 5:1/2 4:1/2 3:2',
  '3:1 3:1/2 4:1/2 5:2 | 7:1 6:1/2 5:1/2 4:1 3:1',
  '5:1/2 5:1/2 6:1 5:1 4:1 | 3:1 4:1 5:2',
  '6:2 5:1 4:1 | 3:2 r:2',
];

/** Giai điệu căng: dây vê dâng theo hợp âm, nhị đi câu ngắn gấp, nốt cao lẻ loi ở đầu phần. */
export function edge(zone) {
  const { s, z } = song(zone, 'edge', ZONES[zone].bpm + 2000);
  const sc = new Scale(...z.scale);
  const trem = s.track('trem', { ch: 0, program: 44, vol: 84, pan: -0.3, reverb: 70 });
  const erhu = s.track('erhu', { ch: 1, program: 40, vol: 96, pan: -0.05, reverb: 70, humanTime: 0.01 });
  const high = s.track('high', { ch: 2, program: 72, vol: 70, pan: 0.35, reverb: 80, humanTime: 0.008 });
  for (let b = 0; b < z.bars; b += 2) {
    const c = z.chordAt(b, z.chords);
    trem.chord(s.bar(b), [c[1] + 12, c[2] + 12, c[3] + 12], 8, 74);
    trem.swell(s.bar(b), s.bar(b + 2), 62, 127);
    const i = b / 2;
    erhu.phrase(s.bar(b), sc, MOTIF[i % 4], { vel: 84, vib: 1, oct: i % 4 === 1 ? 0 : 0 });
    erhu.swell(s.bar(b), s.bar(b + 1), 96, 127);
  }
  // Sáo/piccolo điểm một nốt cao ở đầu mỗi phần (trừ phần đầu), gợi chuông báo động.
  z.sections.slice(1).forEach(([, a], k) => high.note(s.bar(a), sc.deg(7 + (k % 2)), 3, 70));
  return s;
}
