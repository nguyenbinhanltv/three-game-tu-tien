// Đoạn Mạch Cổ Cốc (`wild_ochre`): cốc đứt mạch, đất son, gió khô, đá sa thạch, linh mạch đã cạn. Hoang vắng, trầm, bi tráng nhẹ.
// 68 BPM, 4/4, vũ điệu D (D F G A C). 40 ô nhịp ≈ 2:21. Thưa hơn Vân Lam: nhiều khoảng lặng, nhị hồ làm giọng chính, trống khung xa.
//
// Cấu trúc (8 ô mỗi phần):
//   A  drone trầm + đàn gảy thưa mỗi hai phách + chuông gió xa
//   B  nhị hồ hát chủ đề (câu hỏi, rơi xuống)
//   C  đàn tranh dẫn giai điệu, dây nền dâng, trống khung chậm
//   D  nhị hồ trở lại quãng tám trên, sáo bè đáp
//   E  thưa dần: drone + đàn gảy, câu nối về A.
import { n, Scale, Song } from './lib.mjs';

export default function wildOchre() {
  const s = new Song({ id: 'wild_ochre', bpm: 68, bars: 40, seed: 68, reverb: { macro: 4, time: 100 } });
  const D = new Scale('D4', 'yu');

  const erhu = s.track('erhu', { ch: 0, program: 110, vol: 90, pan: 0.1, reverb: 90, humanTime: 0.02 });
  const koto = s.track('koto', { ch: 1, program: 107, vol: 78, pan: -0.3, reverb: 90, humanTime: 0.02 });
  const strings = s.track('strings', { ch: 2, program: 49, vol: 66, pan: -0.05, reverb: 100, humanVel: 0 });
  const pad = s.track('pad', { ch: 3, program: 89, vol: 44, pan: 0, reverb: 110, chorus: 16, humanVel: 0 });
  const bass = s.track('bass', { ch: 4, program: 42, vol: 66, pan: 0.1, reverb: 70 });
  const drum = s.track('drum', { ch: 5, program: 116, vol: 62, pan: 0.2, reverb: 70, humanTime: 0.01, humanVel: 8 });
  const bell = s.track('bell', { ch: 6, program: 14, bank: 8, vol: 52, pan: 0.4, reverb: 120, humanTime: 0 });
  const dizi = s.track('dizi', { ch: 7, program: 77, vol: 70, pan: 0.3, reverb: 100, humanTime: 0.02 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40);

  const CH = {
    D: [n('D3'), n('A3'), n('F4'), n('C4')],
    G: [n('G2'), n('D3'), n('A3'), n('C4')],
    F: [n('F2'), n('C3'), n('G3'), n('A3')],
    C: [n('C3'), n('G3'), n('D4'), n('F4')],
  };
  const MAIN = ['D', 'F', 'G', 'D'];
  const ALT = ['G', 'F', 'C', 'D'];
  const chordAt = (bar) => (bar >= 24 && bar < 32 ? ALT : MAIN)[Math.floor((bar % 8) / 2)];

  // nền: drone dài + bè bass nửa nhịp
  for (let b = 0; b < 40; b += 2) {
    const c = CH[chordAt(b)];
    pad.chord(s.bar(b), c, 8, 52);
    bass.note(s.bar(b), c[0], 6, 68);
    if (b >= 16 && b < 32)
      strings.chord(
        s.bar(b),
        c.slice(1).map((p) => p + 12),
        8,
        56,
      );
  }

  // đàn gảy thưa: mỗi hai phách một nốt, nhảy quãng rộng cho cảm giác cốc trống
  const ARP = [0, 2, 3, 1];
  for (let b = 0; b < 40; b++) {
    if (b >= 24 && b < 32) continue;
    const c = CH[chordAt(b)].map((p) => p + 12);
    const thin = b >= 32 ? 0.6 : 1;
    ARP.forEach((k, i) => {
      if (thin < 1 && i % 2) return;
      koto.note(s.bar(b) + i, c[k] + (i === 2 ? 12 : 0), 2.2, (i === 0 ? (b === 0 ? 56 : 74) : 60) * thin);
    });
  }

  // chuông gió xa: một nốt cao mỗi bốn ô
  for (let b = 2; b < 36; b += 4) bell.note(s.bar(b) + 1.5, n('A5') - (b % 8 === 2 ? 0 : 5), 4, 48);

  // trống khung: chỉ từ phần C, rất thưa
  const FRAME = [78, 0, 0, 0, 0, 0, 0, 0, 56, 0, 0, 0, 0, 0, 40, 0];
  for (let b = 16; b < 32; b++) drum.pattern(s.bar(b), s.bar(b + 1), 1 / 4, FRAME, (i) => (i === 0 ? n('G2') : n('C3')), 0.3);

  // chủ đề nhị hồ (câu hỏi, rơi xuống)
  const THEME = ['2:2 1:1 0:1', '1:3 r:1', '2:1 3:1 4:2', '3~:3 r:1', '4:1 3:1 2:1 1:1', '2~:3 r:1', '1:2 0:1 -1:1', '0:4'].join(' | ');
  erhu.phrase(s.bar(8), D, THEME, { vel: 88, vib: 1.8 });
  erhu.phrase(s.bar(24), D, THEME, { oct: 1, vel: 82, vib: 1.8 });

  // C: đàn tranh dẫn giai điệu (đáp chủ đề, nhịp dày hơn)
  const KMEL = [
    '0:1/2 1:1/2 2:1 1:1 0:1',
    '-1:2 0:2',
    '1:1/2 2:1/2 3:1 2:1 1:1',
    '2:4',
    '3:1/2 4:1/2 5:1 4:1 3:1',
    '2:2 1:2',
    '0:1 1:1 2:1 1:1',
    '0*:4',
  ].join(' | ');
  koto.phrase(s.bar(16), D, KMEL, { vel: 84, trem: 6 });

  // D: sáo bè đáp, thưa
  [25, 27, 29, 31].forEach((b) => dizi.phrase(s.bar(b) + 2, D, '4:1 5:1/2 4:1/2 3:2', { vel: 62, vib: 1 }));

  // E: câu nối về A
  koto.phrase(s.bar(38), D, '0:1/2 1:1/2 2:1/2 3:1/2 4:1/2 3:1/2 2:1/2 1:1/2 | 0:4', { vel: 56 });

  return s;
}
