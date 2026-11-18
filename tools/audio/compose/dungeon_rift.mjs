// Xích Tẫn Khích (`dungeon_rift`): phó bản trong hẻm núi than hồng của Giới Khích. Nghẹt, nóng, có thứ gì đó đang nuốt hơi thở; vách đá dội tiếng.
// 52 BPM, 4/4, thang tự đặt E F A B C (như `wild_rift`, bán âm E–F "lạ tai"). 32 ô nhịp ≈ 2:28. Không có giai điệu sáng: chỉ pedal, hợp xướng hẹp, nhịp tim timpani.
//
//   A  đàn ống pedal E thấp + chuông xa, hơi thở dây (vê rất khẽ)
//   B  hợp xướng hát chủ đề hẹp (E F E) trên pedal, đồng thau trầm đáp như tiếng lò
//   C  timpani nhịp tim, dây dâng chậm, thủy tinh lạnh lệch pha (khe mạch ngọc lam)
//   D  chủ đề lặp quãng tám dưới, thưa dần về A.
import { n, Scale, Song } from './lib.mjs';

export default function dungeonRift() {
  const s = new Song({ id: 'dungeon_rift', bpm: 52, bars: 32, seed: 52, reverb: { macro: 4, time: 132 } });
  const E = new Scale('E3', [0, 1, 5, 7, 8]);

  const organ = s.track('organ', { ch: 0, program: 19, vol: 60, pan: 0, reverb: 120, humanVel: 0 });
  const choir = s.track('choir', { ch: 1, program: 52, vol: 64, pan: 0, reverb: 140, humanVel: 2 });
  const brass = s.track('brass', { ch: 2, program: 57, vol: 54, pan: -0.2, reverb: 110 });
  const strings = s.track('strings', { ch: 3, program: 44, vol: 52, pan: 0.1, reverb: 110, humanVel: 0 });
  const bass = s.track('bass', { ch: 4, program: 43, vol: 68, pan: 0, reverb: 90 });
  const timp = s.track('timp', { ch: 5, program: 47, vol: 76, pan: 0, reverb: 110, humanTime: 0.008 });
  const bell = s.track('bell', { ch: 6, program: 14, vol: 40, pan: 0.45, reverb: 127, humanTime: 0 });
  const glass = s.track('glass', { ch: 7, program: 92, vol: 42, pan: -0.4, reverb: 127, humanVel: 0 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32);

  const CH = {
    E: [n('E1'), n('B1'), n('E2'), n('B2')],
    F: [n('F1'), n('C2'), n('F2'), n('C3')],
    Fm: [n('F1'), n('C2'), n('F2'), n('Ab2')],
    Am: [n('A1'), n('E2'), n('A2'), n('C3')],
  };
  const MAIN = ['E', 'E', 'F', 'E'];
  const DARK = ['E', 'F', 'Fm', 'Am'];
  const chordAt = (bar) => (bar >= 16 && bar < 24 ? DARK : MAIN)[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 32; b += 2) {
    const c = CH[chordAt(b)];
    organ.chord(s.bar(b), c.slice(1), 8, 56);
    bass.note(s.bar(b), c[0], 7.5, 68);
    if (b >= 16 && b < 24) {
      strings.chord(
        s.bar(b),
        c.slice(1).map((p) => p + 12),
        8,
        52,
      );
      strings.swell(s.bar(b), s.bar(b + 2), 54, 108);
    }
    if (b >= 8 && b < 16) brass.chord(s.bar(b) + 4, [c[1], c[2]], 4, 50);
  }
  for (let b = 0; b < 32; b += 4) bell.note(s.bar(b) + 3, b % 8 ? n('F5') : n('E5'), 6, 40);
  for (let b = 18; b < 24; b += 2) glass.note(s.bar(b) + 1.5, b % 4 ? n('C6') : n('B5'), 6, 40);
  // timpani nhịp tim: phách 1 và 2,5 ở C; D chỉ còn phách 1 thưa
  for (let b = 16; b < 32; b++) {
    timp.note(s.bar(b), n('E2'), 1.5, b % 2 ? 58 : 74);
    if (b < 24) timp.note(s.bar(b) + 1.5, n('E2'), 1, 46);
  }

  const THEME = ['0:3 1:1', '0:2 -1:2', '1:2 0:1 -1:1', '0~:4', '-1:2 0:2', '1:2 0:1 -1:1', '0:2 -1:2', '0~:4'].join(' | ');
  choir.phrase(s.bar(8), E, THEME, { vel: 62, vib: 0.4 });
  choir.phrase(s.bar(24), E, THEME, { oct: -1, vel: 58, vib: 0.4 });
  organ.phrase(s.bar(16), E, THEME, { oct: 1, vel: 54, vib: 0 });
  return s;
}
