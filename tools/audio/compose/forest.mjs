// Rừng Linh Thảo (`forest`): hái linh thảo, đánh quái trong rừng. Nắng lọt kẽ lá, hơi bí ẩn, có sức sống.
// 80 BPM, 4/4, vũ điệu E trên nền cung G (E G A B D). 40 ô nhịp = 2:00.
//
// Cấu trúc (8 ô mỗi phần):
//   A  đàn tranh rải 16 nốt nhẹ + mõ gỗ + dây gảy pizzicato
//   B  sáo trầm (pan flute) hát chủ đề tò mò
//   C  dây ấm nâng nền, đàn tranh vê, chuông pha lê lấp lánh
//   D  đổi sang màu G trưởng (cung): sáo + đàn tranh đối, sáng hơn
//   A' đàn tranh và mõ trở lại, sáo trầm điểm câu ngắn, về đầu vòng.
import { n, Scale, Song } from './lib.mjs';

export default function forest() {
  const s = new Song({ id: 'forest', bpm: 80, bars: 40, seed: 80, reverb: { macro: 1, time: 76 } });
  const Em = new Scale('E4', 'yu');
  const G = new Scale('G4', 'gong');

  const koto = s.track('koto', { ch: 0, program: 107, vol: 86, pan: -0.25, reverb: 70 });
  const flute = s.track('flute', { ch: 1, program: 75, vol: 92, pan: 0.15, reverb: 84, humanTime: 0.015 });
  const pizz = s.track('pizz', { ch: 2, program: 45, vol: 76, pan: 0.3, reverb: 60 });
  const strings = s.track('strings', { ch: 3, program: 49, vol: 70, pan: -0.1, reverb: 90 });
  const block = s.track('block', { ch: 4, program: 115, vol: 62, pan: 0.4, reverb: 50, humanTime: 0.006, humanVel: 10 });
  const glass = s.track('glass', { ch: 5, program: 98, vol: 56, pan: 0.5, reverb: 110 });
  const bass = s.track('bass', { ch: 6, program: 32, vol: 70, pan: 0, reverb: 50 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section("A'", 32, 40);

  const CH = {
    Em: [n('E3'), n('B3'), n('D4'), n('G4')],
    C: [n('C3'), n('G3'), n('B3'), n('E4')],
    D: [n('D3'), n('A3'), n('D4'), n('E4')],
    G: [n('G2'), n('D3'), n('B3'), n('E4')],
    Am: [n('A2'), n('E3'), n('B3'), n('D4')],
  };
  const MAIN = ['Em', 'C', 'Em', 'D'];
  const BRIGHT = ['G', 'Em', 'C', 'D'];
  const chordAt = (bar) => (bar >= 24 && bar < 32 ? BRIGHT : MAIN)[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 40; b++) {
    const c = CH[chordAt(b)];
    const t = s.bar(b);
    // bass gảy (acoustic bass) phách 1 và 3+
    bass.note(t, c[0], 1.4, 76);
    bass.note(t + 2.5, c[0] + 7, 1, 62);
    // đàn tranh 16 nốt móc kép nhẹ, thưa khi sáo hát
    if (!(b >= 16 && b < 24)) {
      const step = b >= 8 && b < 16 ? 1 / 2 : 1 / 4;
      let i = 0;
      for (let x = 0; x < 4; x += step, i++) {
        const k = [0, 2, 1, 3, 2, 1, 3, 2][i % 8];
        koto.note(t + x, c[k] + 12, 0.9, (i % 4 === 0 ? 72 : 56) - (step < 0.5 ? 0 : 4));
      }
    }
    // pizzicato phách 2 và 4
    pizz.note(t + 1, c[2], 0.4, 70);
    pizz.note(t + 3, c[3], 0.4, 64);
    // mõ gỗ: mẫu lẻ cho chút tinh nghịch (bỏ trong C)
    if (!(b >= 16 && b < 24)) block.pattern(t, t + 4, 1 / 4, [66, 0, 0, 40, 0, 0, 52, 0, 0, 40, 0, 0, 58, 0, 34, 0], n('E5'), 0.1);
  }
  for (let b = 16; b < 32; b += 2) strings.chord(s.bar(b), CH[chordAt(b)].slice(1), 8, 58);

  // chủ đề: tò mò, nhảy quãng, đuôi hỏi
  const THEME = [
    '0:1 2:1/2 3:1/2 4:1 3:1',
    '2:3 r:1',
    '1:1/2 2:1/2 3:1 2:1 1:1',
    '0:3 r:1',
    '3:1 4:1/2 5:1/2 6:1 5:1',
    '4~:2 3:2',
    '2:1 1:1 0:1 -1:1',
    '0:4',
  ].join(' | ');
  flute.phrase(s.bar(8), Em, THEME, { vel: 88, vib: 1.5 });

  // C: đàn tranh vê giai điệu dài, chuông pha lê lấp lánh mỗi ô
  koto.phrase(s.bar(16), Em, ['4*:4', '3*:2 2*:2', '3*:4', '1*:4', '2*:2 3*:2', '4*:4', '5*:2 4*:2', '3*:4'].join(' | '), {
    vel: 72,
    trem: 8,
  });
  for (let b = 16; b < 24; b++) glass.phrase(s.bar(b) + 1.5, Em, b % 2 ? '7:1/2 9:1/2 8:1' : '9:1/2 8:1/2 6:1', { vel: 60 });

  // D: G trưởng, sáo (cao hơn) + đàn tranh đối
  flute.phrase(
    s.bar(24),
    G,
    ['2:1 3:1 4:2', '5:1 4:1/2 3:1/2 2:2', '3:1 2:1 1:1 0:1', '1:4', '2:1 3:1 4:1 5:1', '6~:2 5:2', '4:1 3:1 2:1 1:1', '2:4'].join(' | '),
    { vel: 84, vib: 1.5 },
  );
  // A': câu sáo trầm ngắn
  for (const b of [33, 35, 37]) flute.phrase(s.bar(b) + 2, Em, '2:1/2 1:1/2 0:1', { vel: 74 });
  flute.phrase(s.bar(39), Em, '0:1/2 1:1/2 2:1/2 3:1/2 4:2', { vel: 70 });

  return s;
}
