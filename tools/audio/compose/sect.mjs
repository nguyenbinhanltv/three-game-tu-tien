// Lạc Kiếm Tông (`sect`): nhạc "nhà" của tông môn. Thanh tịnh, trang nghiêm nhưng ấm; nắng sớm trên sân đá.
// 72 BPM, 4/4, cung điệu D (D E F# A B). 40 ô nhịp ≈ 2:13.
//
// Cấu trúc (8 ô mỗi phần): A  đàn tranh rải + nền ấm + chuông
//                           B  tiêu thổi chủ đề, đàn tranh thưa lại
//                           C  đàn tranh vê chủ đề quãng tám trên, đàn hạc đối, trống trầm khẽ
//                           D  màu vũ điệu (Bm): dây hát giai điệu phụ, sáo đáp
//                           B' tiêu trở lại chủ đề (biến tấu), đàn tranh đối, thưa dần về A.
import { n, Scale, Song } from './lib.mjs';

export default function sect() {
  const s = new Song({ id: 'sect', bpm: 72, bars: 40, seed: 72, reverb: { macro: 4, time: 92 } });
  const D = new Scale('D4', 'gong');
  const Dlow = new Scale('D3', 'gong');

  const koto = s.track('koto', { ch: 0, program: 107, vol: 96, pan: -0.25, reverb: 72 });
  const xiao = s.track('xiao', { ch: 1, program: 77, vol: 92, pan: 0.1, reverb: 88, humanTime: 0.02 });
  const pad = s.track('pad', { ch: 2, program: 89, vol: 54, pan: 0, reverb: 100, chorus: 24, humanVel: 0 });
  const cello = s.track('cello', { ch: 3, program: 42, vol: 66, pan: 0.15, reverb: 80 });
  const bell = s.track('bell', { ch: 4, program: 14, vol: 64, pan: 0.35, reverb: 120, humanTime: 0 });
  const harp = s.track('harp', { ch: 5, program: 46, vol: 74, pan: 0.3, reverb: 90 });
  const strings = s.track('strings', { ch: 6, program: 49, vol: 76, pan: -0.1, reverb: 96 });
  const flute = s.track('flute', { ch: 7, program: 75, vol: 80, pan: 0.4, reverb: 100, humanTime: 0.02 });
  const drum = s.track('drum', { ch: 8, program: 116, bank: 8, vol: 70, pan: 0, reverb: 90, humanTime: 0 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section("B'", 32, 40);

  // Hợp âm mỗi 2 ô: tiến trình chính D | Bm | G | Asus, phần D: Bm | G | Em | Asus.
  const CH = {
    D: [n('D3'), n('A3'), n('E4'), n('F#4')],
    Bm: [n('B2'), n('F#3'), n('A3'), n('D4')],
    G: [n('G2'), n('D3'), n('B3'), n('E4')],
    Em: [n('E3'), n('B3'), n('D4'), n('F#4')],
    Asus: [n('A2'), n('E3'), n('B3'), n('D4')],
  };
  const MAIN = ['D', 'Bm', 'G', 'Asus'];
  const MINOR = ['Bm', 'G', 'Em', 'Asus'];
  const chordAt = (bar) => (bar >= 24 && bar < 32 ? MINOR : MAIN)[Math.floor((bar % 8) / 2)];

  // ----- nền: pad + cello gốc hợp âm, chuông mỗi 8 ô -----
  for (let b = 0; b < 40; b += 2) {
    const c = CH[chordAt(b)];
    const t = s.bar(b);
    pad.chord(t, c, 8, b < 8 ? 52 : 60);
    cello.note(t, c[0], 7.8, b % 8 === 0 ? 72 : 62);
  }
  for (const b of [0, 8, 16, 24, 32]) {
    bell.note(s.bar(b), b === 24 ? n('B3') : n('D4'), 6, 70);
    bell.note(s.bar(b) + 2, n('A3'), 4, 46);
  }
  bell.note(s.bar(20), n('A4'), 4, 40);
  bell.note(s.bar(36), n('F#4'), 4, 40);

  // ----- đàn tranh rải hợp âm (A, B thưa hơn, D nhẹ) -----
  // Mẫu 8 móc đơn: chỉ số tông trong hợp âm (đã nâng một quãng tám), -1 = nghỉ.
  const ARP = [
    [0, 1, 2, 3, 2, 1, -1, 3],
    [0, 2, 1, 3, -1, 2, 3, -1],
  ];
  const SPARSE = [0, -1, 2, -1, 3, -1, -1, -1];
  for (let b = 0; b < 40; b++) {
    if (b >= 16 && b < 24) continue; // phần C đàn tranh chơi chủ đề
    const c = CH[chordAt(b)].map((p) => p + 12);
    const pat = b >= 8 && b < 16 ? SPARSE : b >= 32 ? (b % 2 ? SPARSE : ARP[1]) : ARP[b % 2];
    const base = b < 8 ? 74 : b >= 24 && b < 32 ? 62 : 68;
    pat.forEach((k, i) => {
      if (k < 0) return;
      koto.note(s.bar(b) + i / 2, c[k], 1.6, base - (i % 2) * 8);
    });
  }

  // ----- chủ đề (tiêu) -----
  const THEME = [
    '3:2 4:1 5:1', // A B D
    '4~:3 3:1', // B (vuốt) A
    '2:3/2 3:1/2 1:2', // F# A E
    '0:4', // D
    '3:2 5:1 6:1', // A D E
    '7~:3 6:1', // F# E
    '5:3/2 4:1/2 3:1 2:1', // D B A F#
    '3:4', // A (treo, về A)
  ].join(' | ');
  const THEME_END = ['3:2 4:1 5:1', '4~:3 3:1', '2:3/2 3:1/2 1:2', '0:4', '5:2 6:1 5:1', '4~:3 3:1', '2:1 3:1/2 2:1/2 1:2', '0:2 r:2'].join(
    ' | ',
  );
  xiao.phrase(s.bar(8), D, THEME, { vel: 84, vib: 1.5, legato: 0.98 });
  xiao.phrase(s.bar(32), D, THEME_END, { vel: 86, vib: 1.5, legato: 0.98 });
  xiao.swell(s.bar(8), s.bar(9), 100, 127);

  // ----- phần C: đàn tranh vê chủ đề quãng tám trên, đàn hạc đối -----
  const THEME_KOTO = ['3:2 4:1 5:1', '4*:3 3:1', '2:3/2 3:1/2 1:2', '0*:4', '3:2 5:1 6:1', '7*:3 6:1', '5:3/2 4:1/2 3:1 2:1', '3*:4'].join(
    ' | ',
  );
  koto.phrase(s.bar(16), D, THEME_KOTO, { oct: 1, vel: 80, trem: 8 });
  // Đàn hạc: lướt mở phần C, rồi rải chậm 4 móc đơn mỗi ô.
  for (let i = 0; i < 10; i++) harp.note(s.bar(16) - 0.5 + i * 0.05, Dlow.deg(i + 3), 3, 60 + i * 2, { human: false });
  for (let b = 16; b < 24; b++) {
    const c = CH[chordAt(b)];
    [0, 1, 2, 1].forEach((k, i) => harp.note(s.bar(b) + i, c[k] + 12, 2.5, 58));
  }
  // Trống trầm khẽ: phách 1 mỗi ô, phách 3 nhẹ hơn ở ô chẵn (phần C, D).
  for (let b = 16; b < 32; b++) {
    drum.note(s.bar(b), n('D2'), 2, b % 4 === 0 ? 70 : 56);
    if (b % 2 === 1) drum.note(s.bar(b) + 2.5, n('D2'), 1, 40);
  }

  // ----- phần D (Bm): dây hát, sáo đáp ở các ô ngân -----
  const MELO_D = ['2:2 1:1 0:1', '-1:4', '0:2 1:1 2:1', '1:4', '3:2 2:1 1:1', '2:3 1:1', '1:2 0:1 -1:1', '-2:4'].join(' | ');
  strings.phrase(s.bar(24), D, MELO_D, { vel: 80, legato: 1.0 });
  strings.swell(s.bar(24), s.bar(25), 90, 127);
  const ANSWERS = ['7:1/2 6:1/2 5:2', '5:1/2 6:1/2 7:2', '8:1/2 7:1/2 6:2', '6:1/2 5:1/2 3:2'];
  ANSWERS.forEach((a, i) => flute.phrase(s.bar(25 + i * 2) + 1, D, a, { vel: 72, vib: 1 }));

  // ----- B': đàn tranh đối giai điệu với tiêu (bè dưới, thưa) -----
  const COUNTER = ['r:2 0:1 1:1', '2:4', 'r:2 -1:2', '-2:4', 'r:2 1:1 2:1', '3:4', 'r:2 0:2', "r:3 -2':1/2 0':1/2"].join(' | ');
  harp.phrase(s.bar(32), D, COUNTER, { vel: 58 });

  return s;
}
