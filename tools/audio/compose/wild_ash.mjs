// Bắc Hoang Tẫn Nguyên, bên này vết nứt (`wild_ash`, DV-3I): hoang nguyên tro dưới trời tro sớm, rừng chết, mạch ngọc lam tắt dần. Hoang vắng, gió, tiếc nuối; chưa phải đe dọa.
// 52 BPM, 4/4, vũ điệu D (D F G A C, thang yu). 36 ô nhịp ≈ 2:46. Không trống dày: trống da một tiếng xa mỗi bốn ô như bước chân vọng.
//
//   A  gió (kính cọ + dây) trải nền, chuông đồng xa
//   B  tiêu hát chủ đề (một câu hỏi dài), đàn tranh thưa như mạch ngọc còn nhỏ giọt
//   C  dây trầm dâng, tiêu đáp, trống da xa
//   D  chủ đề lặp quãng tám trên, chuông thủy tinh, thưa dần về A.
import { n, Scale, Song } from './lib.mjs';

export default function wildAsh() {
  const s = new Song({ id: 'wild_ash', bpm: 52, bars: 36, seed: 52, reverb: { macro: 4, time: 126 } });
  const D = new Scale('D3', 'yu');

  const xiao = s.track('xiao', { ch: 0, program: 77, vol: 78, pan: 0.2, reverb: 118, humanTime: 0.03 });
  const koto = s.track('koto', { ch: 1, program: 107, vol: 66, pan: -0.35, reverb: 104, humanTime: 0.03 });
  const strings = s.track('strings', { ch: 2, program: 49, vol: 54, pan: -0.05, reverb: 124, humanVel: 0 });
  const wind = s.track('wind', { ch: 3, program: 92, vol: 40, pan: 0.1, reverb: 127, chorus: 14, humanVel: 0 });
  const cello = s.track('cello', { ch: 4, program: 42, vol: 62, pan: 0.05, reverb: 90 });
  const bell = s.track('bell', { ch: 5, program: 14, vol: 46, pan: 0.45, reverb: 127, humanTime: 0 });
  const drum = s.track('drum', { ch: 6, program: 116, vol: 54, pan: 0, reverb: 110, humanTime: 0.01 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 36);

  const CH = {
    Dm: [n('D2'), n('A2'), n('D3'), n('F3')],
    C: [n('C2'), n('G2'), n('C3'), n('G3')],
    Bb: [n('Bb1'), n('F2'), n('Bb2'), n('D3')],
    A: [n('A1'), n('E2'), n('A2'), n('C3')],
  };
  const MAIN = ['Dm', 'C', 'Bb', 'A'];
  const chordAt = (bar) => MAIN[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 36; b += 2) {
    const c = CH[chordAt(b)];
    wind.chord(
      s.bar(b),
      c.slice(1).map((p) => p + 12),
      8,
      46,
    );
    cello.note(s.bar(b), c[0] + 12, 7, 60);
    if (b >= 16 && b < 32) strings.chord(s.bar(b), c.slice(1), 8, 56);
  }
  for (let b = 0; b < 32; b += 4) bell.note(s.bar(b) + 1, b % 8 ? n('A4') : n('D5'), 6, 44);
  // đàn tranh nhỏ giọt: vài nốt rời như mạch ngọc còn chảy
  for (let b = 8; b < 32; b++) {
    if (b % 3 === 0) continue;
    const c = CH[chordAt(b)].map((p) => p + 12);
    koto.note(s.bar(b) + (b % 2 ? 1.5 : 0.5), c[(b * 3) % 4], 2.5, 52 + (b % 4) * 3);
  }
  // trống da xa: một tiếng mỗi bốn ô từ C
  for (let b = 16; b < 32; b += 4) drum.note(s.bar(b), n('C2'), 2, 56);

  const THEME = ['2:3 r:1', '3:1 2:1 1:2', '4:2 3:1 2:1', '1~:4', '2:1 1:1 0:2', '-1~:3 r:1', '0:2 1:1 0:1', '-2:4'].join(' | ');
  xiao.phrase(s.bar(8), D, THEME, { vel: 76, vib: 1.4 });
  xiao.phrase(s.bar(24), D, THEME, { oct: 1, vel: 70, vib: 1.4 });
  const ANS = ['4:2 3:2', '2:3 r:1', '3:1 4:1 5:2', '4~:4', '3:2 2:1 1:1', '0:3 r:1', '1:2 0:2', '0~:4'].join(' | ');
  xiao.phrase(s.bar(16), D, ANS, { vel: 66, vib: 1.2 });
  koto.phrase(s.bar(33), D, '0:1/2 1:1/2 2:1/2 3:1/2 | 2:1 0:2', { vel: 48 });
  return s;
}
