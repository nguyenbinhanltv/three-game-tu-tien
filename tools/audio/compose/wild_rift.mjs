// Bắc Hoang Tẫn Nguyên, bên kia vết nứt (`wild_rift`, DV-3I): đồng than hồng, vườn vàng chết, trời tím thực. Uy áp của thế lực từ giới khác: đàn ống, hợp xướng tối, đồng thau trầm.
// 60 BPM, 4/4, thang tự đặt E F A B C (bán âm E–F: không thuộc ngũ cung Huyền Linh, cố ý "lạ tai"). 36 ô nhịp ≈ 2:24. Trống timpani thưa, nhịp tim chậm.
//
//   A  đàn ống pedal E + dây vê, chuông xa
//   B  hợp xướng hát chủ đề hẹp (E F E), đồng thau trầm đáp
//   C  timpani vào, dây dâng, đàn ống quãng tám
//   D  chủ đề lặp, đồng thau đầy, thưa dần về A.
import { n, Scale, Song } from './lib.mjs';

export default function wildRift() {
  const s = new Song({ id: 'wild_rift', bpm: 60, bars: 36, seed: 61, reverb: { macro: 4, time: 140 } });
  const E = new Scale('E3', [0, 1, 5, 7, 8]);

  const organ = s.track('organ', { ch: 0, program: 19, vol: 62, pan: 0, reverb: 127, humanVel: 0 });
  const choir = s.track('choir', { ch: 1, program: 52, vol: 70, pan: 0, reverb: 140, humanVel: 2 });
  const brass = s.track('brass', { ch: 2, program: 57, vol: 58, pan: -0.2, reverb: 110 });
  const strings = s.track('strings', { ch: 3, program: 44, vol: 58, pan: 0.1, reverb: 110, humanVel: 0 });
  const bass = s.track('bass', { ch: 4, program: 43, vol: 66, pan: 0, reverb: 90 });
  const timp = s.track('timp', { ch: 5, program: 47, vol: 74, pan: 0, reverb: 120, humanTime: 0.008 });
  const bell = s.track('bell', { ch: 6, program: 14, vol: 44, pan: 0.45, reverb: 127, humanTime: 0 });
  const glass = s.track('glass', { ch: 7, program: 92, vol: 40, pan: -0.4, reverb: 127, humanVel: 0 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 36);

  const CH = {
    E: [n('E1'), n('B1'), n('E2'), n('B2')],
    F: [n('F1'), n('C2'), n('F2'), n('C3')],
    Am: [n('A1'), n('E2'), n('A2'), n('C3')],
    Fm: [n('F1'), n('C2'), n('F2'), n('Ab2')],
  };
  const MAIN = ['E', 'F', 'E', 'Am'];
  const DARK = ['E', 'F', 'Fm', 'E'];
  const chordAt = (bar) => (bar >= 16 && bar < 32 ? DARK : MAIN)[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 36; b += 2) {
    const c = CH[chordAt(b)];
    organ.chord(s.bar(b), c.slice(1), 8, 58);
    bass.note(s.bar(b), c[0], 7.5, 66);
    if (b >= 16 && b < 32) {
      strings.chord(
        s.bar(b),
        c.slice(1).map((p) => p + 12),
        8,
        56,
      );
      strings.swell(s.bar(b), s.bar(b + 2), 64, 112);
    }
    if (b >= 24 && b < 32) brass.chord(s.bar(b), [c[1] + 12, c[2] + 12], 8, 56);
  }
  for (let b = 0; b < 32; b += 4) bell.note(s.bar(b) + 2, b % 8 ? n('F5') : n('E5'), 6, 44);
  for (let b = 2; b < 34; b += 4) glass.note(s.bar(b), n('B5'), 8, 36);
  // timpani: nhịp tim, phách 1 mỗi ô; C và D thêm phách 3
  for (let b = 16; b < 32; b++) {
    timp.note(s.bar(b), n('E2'), 1.5, b % 2 ? 62 : 76);
    if (b >= 24) timp.note(s.bar(b) + 2, n('B1'), 1, 56);
  }

  const THEME = ['0:3 1:1', '0:2 -1:2', '2:2 1:1 0:1', '0~:4', '1:2 2:2', '3:2 2:1 1:1', '0:2 -1:2', '0~:4'].join(' | ');
  choir.phrase(s.bar(8), E, THEME, { vel: 66, vib: 0.4 });
  choir.phrase(s.bar(24), E, THEME, { vel: 72, vib: 0.4 });
  organ.phrase(s.bar(16), E, THEME, { oct: 1, vel: 60, vib: 0 });
  brass.phrase(s.bar(10), E, ['-2:4', '-1:2 -2:2', '-3:4', '-2~:4'].join(' | '), { vel: 64 });
  return s;
}
