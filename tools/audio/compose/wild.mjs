// Vân Lam Sơn Mạch (`wild`): khám phá ngoài tông môn, đường núi, thung lũng, ngự kiếm. Khoáng đạt, phiêu lưu, gió núi.
// 84 BPM, 4/4, cung điệu E (E F# G# B C#). 48 ô nhịp ≈ 2:17.
//
// Cấu trúc (8 ô mỗi phần):
//   A  đàn gảy rải móc đơn + nền dây rộng + trống tay nhẹ
//   B  sáo trúc hát chủ đề
//   C  dây rộng hát đáp, sáo bè cao thưa
//   D  màu chủy (A-B-E…) đổi hợp âm, đàn gảy dẫn giai điệu, trống tay dày hơn
//   E  sáo trở lại chủ đề quãng tám trên (cao trào nhẹ)
//   F  thưa lại: dây + đàn gảy, câu nối về A.
import { n, Scale, Song } from './lib.mjs';

export default function wild() {
  const s = new Song({ id: 'wild', bpm: 84, bars: 48, seed: 84, reverb: { macro: 4, time: 84 } });
  const E = new Scale('E4', 'gong');

  const pipa = s.track('pipa', { ch: 0, program: 107, bank: 8, vol: 88, pan: -0.3, reverb: 70 });
  const dizi = s.track('dizi', { ch: 1, program: 73, vol: 96, pan: 0.15, reverb: 80, humanTime: 0.015 });
  const strings = s.track('strings', { ch: 2, program: 49, vol: 78, pan: -0.05, reverb: 96 });
  const pad = s.track('pad', { ch: 3, program: 89, vol: 52, pan: 0, reverb: 100, chorus: 20, humanVel: 0 });
  const bass = s.track('bass', { ch: 4, program: 42, vol: 70, pan: 0.1, reverb: 70 });
  const drum = s.track('drum', { ch: 5, program: 117, vol: 66, pan: 0.25, reverb: 60, humanTime: 0.008, humanVel: 8 });
  const harp = s.track('harp', { ch: 6, program: 46, vol: 70, pan: 0.35, reverb: 90 });
  const high = s.track('high', { ch: 7, program: 75, vol: 70, pan: 0.45, reverb: 100 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40).section('F', 40, 48);

  const CH = {
    E: [n('E3'), n('B3'), n('F#4'), n('G#4')],
    Cs: [n('C#3'), n('G#3'), n('B3'), n('E4')],
    A: [n('A2'), n('E3'), n('B3'), n('C#4')],
    B: [n('B2'), n('F#3'), n('C#4'), n('E4')],
    Fs: [n('F#2'), n('C#3'), n('G#3'), n('B3')],
  };
  const MAIN = ['E', 'Cs', 'A', 'B'];
  const ALT = ['A', 'B', 'Fs', 'B'];
  const chordAt = (bar) => (bar >= 24 && bar < 32 ? ALT : MAIN)[Math.floor((bar % 8) / 2)];

  // nền
  for (let b = 0; b < 48; b += 2) {
    const c = CH[chordAt(b)];
    pad.chord(s.bar(b), c, 8, 56);
    bass.note(s.bar(b), c[0], 4, 70);
    bass.note(s.bar(b) + 4, c[0] + 7, 3.8, 60);
    if (b >= 16 && b < 24)
      strings.chord(
        s.bar(b),
        c.slice(1).map((p) => p + 12),
        8,
        54,
      );
    if (b >= 40)
      strings.chord(
        s.bar(b),
        c.map((p) => p + 12),
        8,
        58,
      );
  }

  // đàn gảy rải: 8 móc đơn, nhảy quãng rộng cho cảm giác trời rộng
  const ARP = [0, 2, 3, 1, 3, 2, 3, 1];
  for (let b = 0; b < 48; b++) {
    if (b >= 24 && b < 32) continue;
    const c = CH[chordAt(b)].map((p) => p + 12);
    const thin = b >= 8 && b < 16 ? 0.6 : 1;
    ARP.forEach((k, i) => {
      if (thin < 1 && i % 2) return;
      pipa.note(s.bar(b) + i / 2, c[k] + (i === 4 ? 12 : 0), 1.2, (i === 0 ? 80 : 66) * (thin < 1 ? 0.95 : 1));
    });
  }

  // trống tay: phách 1, 2+, 3, 4+ (nhẹ); phần D dày hơn
  const HAND = [80, 0, 0, 0, 0, 0, 52, 0, 70, 0, 0, 0, 0, 0, 56, 40];
  const HAND_D = [86, 0, 40, 0, 60, 0, 56, 40, 76, 0, 40, 0, 64, 40, 60, 48];
  for (let b = 0; b < 48; b++) {
    if (b >= 40 && b % 2) continue;
    drum.pattern(s.bar(b), s.bar(b + 1), 1 / 4, b >= 24 && b < 32 ? HAND_D : HAND, (i) => (i % 8 === 0 ? n('G2') : n('C3')), 0.3);
  }

  // chủ đề sáo
  const THEME = [
    '0:1 1:1/2 2:1/2 4:2',
    '3:1 2:1 1:2',
    '2:3/2 3:1/2 4:1 5:1',
    '4~:3 r:1',
    '5:1 4:1/2 5:1/2 6:2',
    '7~:2 6:1 5:1',
    '4:1 3:1 2:1 1:1',
    '2:4',
  ].join(' | ');
  const THEME_END = [
    '0:1 1:1/2 2:1/2 4:2',
    '3:1 2:1 1:2',
    '2:3/2 3:1/2 4:1 5:1',
    '4~:3 r:1',
    '5:1 4:1/2 5:1/2 6:2',
    '7~:2 6:1 5:1',
    '4:1 2:1 1:1 -1:1',
    '0:4',
  ].join(' | ');
  dizi.phrase(s.bar(8), E, THEME, { vel: 90, vib: 1.5 });
  dizi.phrase(s.bar(32), E, THEME_END, { oct: 1, vel: 84, vib: 1.5 });

  // C: dây hát đáp (bè dưới) + sáo cao thưa
  strings.phrase(s.bar(16), E, ['2:4', '1:2 0:2', '-1:4', '0:2 1:2', '2:2 3:2', '4:4', '3:2 2:2', '1:4'].join(' | '), {
    vel: 76,
    legato: 1,
  });
  [17, 19, 21, 23].forEach((b) => high.phrase(s.bar(b) + 2, E, '7:1/2 8:1/2 9:1', { oct: 0, vel: 64, vib: 0.9 }));

  // D: đàn gảy (dàn hạc + koto) dẫn giai điệu màu chủy
  const DMEL = [
    '3:1/2 4:1/2 5:1 4:1 3:1',
    '1:2 3:2',
    '4:1/2 5:1/2 6:1 5:1 4:1',
    '5:4',
    '3:1/2 4:1/2 5:1 6:1 5:1',
    '4:2 3:2',
    '1:1 2:1 3:1 4:1',
    '4*:4',
  ].join(' | ');
  pipa.phrase(s.bar(24), E, DMEL, { vel: 84, trem: 8 });
  harp.phrase(s.bar(24), E, ['-2:2 0:2', '-1:4', '-2:2 0:2', '-1:4', '-4:2 -2:2', '-1:4', '-1:2 0:2', '-1:4'].join(' | '), { vel: 58 });

  // F: đàn hạc câu nối về A
  harp.phrase(s.bar(46), E, '0:1/2 1:1/2 2:1/2 3:1/2 4:1/2 5:1/2 6:1/2 7:1/2 | 8:2 r:2', { vel: 60 });

  return s;
}
