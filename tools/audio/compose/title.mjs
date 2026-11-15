// Đạp Thiên Lộ (`title`): chủ đề chính, màn đăng nhập và màn tải. Khoáng đạt, hy vọng, bắt đầu con đường tu tiên.
// Giai điệu sáo nhớ được; motif mở đầu (bậc 0-1-2-4, nhảy lên chủ âm quãng tám) dùng lại được cho sting.
// 70 BPM, 4/4, cung điệu D (D E F# A B). 24 ô nhịp ≈ 1:22.
//
// Cấu trúc (8 ô mỗi phần):
//   A  đàn tranh rải + dây ấm, sáo trúc nêu chủ đề
//   B  dây hát chủ đề đáp quãng tám thấp, sáo đối giai điệu, trống trầm thưa vào
//   C  cao trào nhẹ: chủ đề quãng tám trên + đàn hạc, kết treo về A.
import { n, Scale, Song } from './lib.mjs';

export default function title() {
  const s = new Song({ id: 'title', bpm: 70, bars: 24, seed: 70 * 3, reverb: { macro: 4, time: 96 } });
  const D = new Scale('D4', 'gong');

  const koto = s.track('koto', { ch: 0, program: 107, vol: 92, pan: -0.3, reverb: 76 });
  const dizi = s.track('dizi', { ch: 1, program: 73, vol: 98, pan: 0.1, reverb: 84, humanTime: 0.015 });
  const strings = s.track('strings', { ch: 2, program: 49, vol: 80, pan: -0.05, reverb: 96 });
  const pad = s.track('pad', { ch: 3, program: 89, vol: 52, pan: 0, reverb: 100, chorus: 20, humanVel: 0 });
  const cello = s.track('cello', { ch: 4, program: 42, vol: 72, pan: 0.15, reverb: 80 });
  const drum = s.track('drum', { ch: 5, program: 116, bank: 8, vol: 78, pan: 0, reverb: 90, humanTime: 0 });
  const harp = s.track('harp', { ch: 6, program: 46, vol: 74, pan: 0.35, reverb: 90 });
  const bell = s.track('bell', { ch: 7, program: 14, vol: 58, pan: 0.4, reverb: 120, humanTime: 0 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24);

  const CH = {
    D: [n('D3'), n('A3'), n('E4'), n('F#4')],
    G: [n('G2'), n('D3'), n('B3'), n('E4')],
    Bm: [n('B2'), n('F#3'), n('A3'), n('D4')],
    A: [n('A2'), n('E3'), n('B3'), n('C#4')],
    Em: [n('E3'), n('B3'), n('D4'), n('F#4')],
  };
  const PROG = ['D', 'G', 'Bm', 'A'];
  const PROG_C = ['G', 'A', 'Bm', 'A'];
  const chordAt = (bar) => (bar >= 16 ? PROG_C : PROG)[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 24; b += 2) {
    const c = CH[chordAt(b)];
    pad.chord(s.bar(b), c, 8, 58);
    cello.note(s.bar(b), c[0], 7.8, 70);
    if (b >= 8) strings.chord(s.bar(b), c.slice(1), 8, b >= 16 ? 64 : 56);
  }
  bell.note(0, n('D4'), 6, 66);
  bell.note(s.bar(16), n('A3'), 6, 60);
  // đàn tranh rải 8 móc đơn
  const ARP = [0, 1, 2, 3, 2, 1, 3, 2];
  for (let b = 0; b < 24; b++) {
    const c = CH[chordAt(b)].map((p) => p + 12);
    ARP.forEach((k, i) => koto.note(s.bar(b) + i / 2, c[k], 1.4, i === 0 ? 76 : 60));
  }
  // trống trầm thưa từ B
  for (let b = 8; b < 24; b++) {
    drum.note(s.bar(b), n('D2'), 2, b % 4 === 0 ? 92 : 72);
    if (b % 2 === 1) drum.note(s.bar(b) + 2.5, n('D2'), 1, 56);
  }

  // chủ đề
  const THEME = ['0:1 1:1/2 2:1/2 4:2', '5:3 4:1', '3:3/2 4:1/2 3:1 2:1', '1:4', '0:1 1:1/2 2:1/2 4:2', '5:1 6:1 7:2', '6:1 5:1/2 4:1/2 3:1 2:1', '3:4'].join(' | ');
  dizi.phrase(0, D, THEME, { vel: 92, vib: 1.5 });
  strings.phrase(s.bar(8), D, THEME, { oct: -1, vel: 78, legato: 1 });
  dizi.phrase(s.bar(9), D, ['r:2 7:1 6:1', '5:4', 'r:2 6:1 5:1', '4:4', 'r:2 9:1 8:1', '7:4', 'r:4'].join(' | '), { vel: 80, vib: 1.5 });
  dizi.phrase(s.bar(16), D, THEME, { oct: 1, vel: 86, vib: 1.5 });
  for (let b = 16; b < 24; b++) {
    const c = CH[chordAt(b)];
    [0, 1, 2, 3, 2, 1].forEach((k, i) => harp.note(s.bar(b) + i * (2 / 3), c[k] + 12, 2, 56));
  }

  return s;
}
