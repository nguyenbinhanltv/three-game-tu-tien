// Kiếm Trủng (`dungeon`): bí cảnh, mộ của vạn thanh kiếm cổ, 4 đợt quái. Căng âm ỉ, u tịch, trang nghiêm, kiếm ý còn sót.
// 70 BPM, 4/4, vũ điệu A (A C D E G). 32 ô nhịp ≈ 1:50.
//
// Cấu trúc (8 ô mỗi phần):
//   A  drone trầm (dây + kính cọ) + chuông đồng ngân xa + trống khung chậm
//   B  đàn tranh thưa (kiểu cổ cầm) + tiếng kim khí ngân (chuông ống, pha lê) như lưỡi kiếm
//   C  hợp âm F/Bb lệch màu, dây vê khẽ dâng, trống dày hơn (căng lên)
//   D  tiêu trầm một câu, drone lại, về A.
import { n, Scale, Song } from './lib.mjs';

export default function dungeon() {
  const s = new Song({ id: 'dungeon', bpm: 70, bars: 32, seed: 70, reverb: { macro: 4, time: 116 } });
  const A = new Scale('A3', 'yu');

  const drone = s.track('drone', { ch: 0, program: 49, vol: 74, pan: -0.1, reverb: 100, humanVel: 0 });
  const glass = s.track('glass', { ch: 1, program: 92, vol: 58, pan: 0.2, reverb: 120, humanVel: 0 });
  const bell = s.track('bell', { ch: 2, program: 14, bank: 8, vol: 60, pan: 0.4, reverb: 127, humanTime: 0 });
  const koto = s.track('koto', { ch: 3, program: 107, vol: 74, pan: -0.35, reverb: 96, humanTime: 0.03 });
  const blade = s.track('blade', { ch: 4, program: 14, vol: 50, pan: 0.5, reverb: 120, humanTime: 0.02 });
  const drum = s.track('drum', { ch: 5, program: 116, vol: 72, pan: 0, reverb: 80, humanTime: 0 });
  const trem = s.track('trem', { ch: 6, program: 44, vol: 62, pan: -0.3, reverb: 100 });
  const xiao = s.track('xiao', { ch: 7, program: 77, vol: 78, pan: 0.25, reverb: 110, humanTime: 0.02 });
  const bass = s.track('bass', { ch: 8, program: 43, vol: 70, pan: 0, reverb: 80 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32);

  const CH = {
    Am: [n('A1'), n('E2'), n('A2'), n('E3')],
    G: [n('G1'), n('D2'), n('G2'), n('D3')],
    F: [n('F1'), n('C2'), n('F2'), n('C3')],
    Bb: [n('Bb1'), n('F2'), n('Bb2'), n('F3')],
    Esus: [n('E1'), n('B1'), n('E2'), n('A2')],
  };
  const MAIN = ['Am', 'Am', 'G', 'Am'];
  const TENSE = ['F', 'Bb', 'F', 'Esus'];
  const chordAt = (bar) => (bar >= 16 && bar < 24 ? TENSE : MAIN)[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 32; b += 2) {
    const c = CH[chordAt(b)];
    drone.chord(
      s.bar(b),
      c.slice(1).map((p) => p + 12),
      8,
      64,
    );
    glass.chord(s.bar(b), [c[2] + 24, c[3] + 24], 8, 54);
    bass.note(s.bar(b), c[0] + 12, 8, 66);
    if (b >= 16 && b < 24) {
      trem.chord(s.bar(b), [c[2] + 24, c[3] + 24, c[2] + 36], 8, 60);
      trem.swell(s.bar(b), s.bar(b + 2), 70, 115);
    }
  }
  trem.cc(s.bar(24), 11, 127);
  // chuông đồng xa đầu mỗi 4 ô
  for (let b = 0; b < 32; b += 4) bell.note(s.bar(b), b === 16 ? n('F3') : n('A3'), 8, b % 8 ? 54 : 66);

  // trống khung chậm: phách 1 và "lời đáp" ở 3+, C dày hơn
  for (let b = 0; b < 32; b++) {
    const t = s.bar(b);
    drum.note(t, n('C2'), 2, b % 2 ? 60 : 74);
    if (b % 2 === 1) drum.note(t + 2.5, n('G2'), 1, 48);
    if (b >= 16 && b < 24) {
      drum.note(t + 2, n('C2'), 1, 58);
      drum.note(t + 3.5, n('G2'), 0.5, 50);
    }
  }

  // B: đàn tranh thưa kiểu cổ cầm (nốt rời, nhiều lặng) + tiếng lưỡi kiếm ngân
  koto.phrase(
    s.bar(8),
    A,
    ['0:2 r:1 2:1', '1:3 r:1', '4:1 r:1 3:1 2:1', '0:4', '2:2 r:1 3:1', '4:3 r:1', '5:1 4:1 2:1 1:1', '0:4'].join(' | '),
    { vel: 72 },
  );
  for (const [b, x, d] of [
    [9, 2.5, 12],
    [11, 1, 13],
    [13, 3, 11],
    [15, 2, 14],
    [26, 1.5, 12],
    [30, 2.5, 13],
  ])
    blade.note(s.bar(b) + x, A.deg(d), 4, 52);
  // A, D: đàn tranh rất thưa giữ mạch
  for (const b of [1, 3, 5, 7, 25, 27, 31]) koto.phrase(s.bar(b) + 2, A, "0':1/2 2':1/2 0':1", { oct: -1, vel: 56 });

  // D: tiêu trầm
  xiao.phrase(s.bar(24), A, ['2~:3 1:1', '0:4', '1:2 2:1 3:1', '2~:4', '1:2 0:2', '-1~:4'].join(' | '), {
    oct: 1,
    vel: 74,
    vib: 1.5,
    legato: 1,
  });

  return s;
}
