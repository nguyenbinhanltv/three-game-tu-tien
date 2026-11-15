// Giao Phong (`combat`): bật khi quái nhắm mình. Gấp, dứt khoát, khí thế; căng nhưng không hoành tráng như boss.
// 128 BPM, 4/4, vũ điệu B (B D E F# A). 40 ô nhịp = 75 s.
//
// Cấu trúc (8 ô mỗi phần, năng lượng đều để lặp):
//   A  trống chiến + dây trầm ostinato (3-3-2) + đàn gảy riff kiểu tỳ bà, sáo điểm
//   B  nhị (violin) hát chủ đề, đàn gảy vê nền
//   C  trống gọi-đáp, dây vê dâng, sáo độc tấu
//   D  chủ đề quãng tám trên, đàn gảy đối, chũm chọe
//   E  riff trở lại, nhị bè trầm vuốt dài, ô cuối dồn trống về A.
import { n, Scale, Song } from './lib.mjs';

export default function combat() {
  const s = new Song({ id: 'combat', bpm: 128, bars: 40, seed: 128, reverb: { macro: 3, time: 64 }, tailSec: 5 });
  const B3 = new Scale('B3', 'yu');
  const B4 = new Scale('B4', 'yu');

  const taiko = s.track('taiko', { ch: 0, program: 116, vol: 112, pan: 0, reverb: 50, humanTime: 0.006, humanVel: 5 });
  const bassdrum = s.track('bassdrum', { ch: 1, program: 116, bank: 8, vol: 104, pan: 0, reverb: 40, humanTime: 0 });
  const low = s.track('low', { ch: 2, program: 48, vol: 96, pan: -0.2, reverb: 40, humanTime: 0.004 });
  const contra = s.track('contra', { ch: 3, program: 43, vol: 92, pan: 0.1, reverb: 30, humanTime: 0.004 });
  const pipa = s.track('pipa', { ch: 4, program: 106, vol: 92, pan: 0.35, reverb: 45, humanTime: 0.006 });
  const erhu = s.track('erhu', { ch: 5, program: 40, vol: 100, pan: -0.1, reverb: 60, humanTime: 0.01 });
  const dizi = s.track('dizi', { ch: 6, program: 72, vol: 84, pan: 0.3, reverb: 60, humanTime: 0.008 });
  const trem = s.track('trem', { ch: 7, program: 44, vol: 80, pan: -0.35, reverb: 60 });
  const kit = s.track('kit', { ch: 9, program: 0, vol: 90, pan: 0, reverb: 50, humanTime: 0 });
  const block = s.track('block', { ch: 10, program: 115, vol: 66, pan: 0.45, reverb: 30, humanTime: 0.004, humanVel: 8 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40);

  // Hợp âm mỗi 2 ô: Bm | Bm | G | A  (i i VI VII)
  const ROOT = { Bm: n('B1'), G: n('G1'), A: n('A1') };
  const PROG = ['Bm', 'Bm', 'G', 'A'];
  const chordAt = (bar) => PROG[Math.floor((bar % 8) / 2)];

  // ----- trống -----
  const T_A = [110, 0, 0, 0, 0, 0, 70, 0, 100, 0, 0, 60, 0, 0, 80, 0];
  const T_B = [118, 0, 0, 70, 0, 0, 96, 0, 0, 70, 0, 0, 104, 0, 64, 50];
  const T_C = [120, 0, 60, 0, 90, 0, 60, 0, 0, 0, 0, 0, 100, 70, 90, 70];
  for (let b = 0; b < 40; b++) {
    const t = s.bar(b);
    const pat = b >= 16 && b < 24 ? T_C : b >= 8 && b < 32 ? T_B : T_A;
    if (b === 39) {
      // dồn về đầu vòng: 16 nốt móc kép tăng dần, hai trống luân phiên
      for (let i = 0; i < 16; i++) taiko.note(t + i / 4, i % 2 ? n('G2') : n('C2'), 0.24, 60 + i * 4);
    } else taiko.pattern(t, t + 4, 1 / 4, pat, (i) => (i % 4 === 2 ? n('G2') : n('C2')), 0.4);
    // C: trống đáp ở nửa sau ô lẻ bằng trống cao
    if (b >= 16 && b < 24 && b % 2 === 1) taiko.pattern(t + 2, t + 4, 1 / 2, [90, 80, 100, 110], n('D3'), 0.3);
    bassdrum.note(t, n('C2'), 1, 112);
    if (b % 2 === 1 || (b >= 8 && b < 32)) bassdrum.note(t + 2, n('C2'), 1, 92);
    // mõ gỗ móc kép nhẹ ở A, E giữ mạch
    if (b < 8 || b >= 32) block.pattern(t, t + 4, 1 / 4, [70, 30, 45, 30], n('E5'), 0.1);
  }
  // chũm chọe: đầu mỗi phần; chũm chọe Tàu như tiếng la ở C, E
  for (const b of [0, 8, 16, 24, 32]) kit.note(s.bar(b), n('C#3'), 2, 100); // crash 1 (49)
  for (const b of [16, 32]) kit.note(s.bar(b) + 0.02, n('E3'), 2, 90); // chinese (52)
  for (const b of [28]) kit.note(s.bar(b), n('A3'), 2, 92); // crash 2 (57)
  // trống lẫy vê nhẹ cuối mỗi phần
  for (const b of [7, 15, 23, 31]) kit.pattern(s.bar(b) + 3, s.bar(b) + 4, 1 / 8, [40, 46, 52, 58, 64, 70, 76, 84], n('D2'), 0.1);

  // ----- dây trầm ostinato 3-3-2 -----
  const OST = [0, 0, 7, 0, 0, 12, 0, 7];
  const ACC = [112, 70, 74, 104, 70, 76, 102, 80];
  for (let b = 0; b < 40; b++) {
    const r = ROOT[chordAt(b)] + 12;
    OST.forEach((o, i) => low.note(s.bar(b) + i / 2, r + o, 0.32, ACC[i] - (b >= 16 && b < 24 ? 10 : 0)));
    contra.note(s.bar(b), r - 12, 1.3, 100);
    contra.note(s.bar(b) + 1.5, r - 12, 0.4, 86);
    contra.note(s.bar(b) + 3, r - 12, 0.8, 92);
  }

  // ----- đàn gảy (riff kiểu tỳ bà) -----
  const RIFF = "0':1/2 0':1/4 1':1/4 2':1/2 3':1/2 2':1/4 1':1/4 0':1/2 r:1 | 3*:1 2':1/2 1':1/2 0*:2";
  const RIFF_G = "-1':1/2 -1':1/4 0':1/4 1':1/2 2':1/2 1':1/4 0':1/4 -1':1/2 r:1 | 2*:1 1':1/2 0':1/2 -1*:2";
  const RIFF_A = "-1':1/2 -1':1/4 1':1/4 2':1/2 4':1/2 3':1/4 2':1/4 1':1/2 r:1 | 4*:1 3':1/2 2':1/2 -1*:2";
  const riffFor = (b) => ({ Bm: RIFF, G: RIFF_G, A: RIFF_A })[chordAt(b)];
  for (const b of [0, 2, 4, 6, 32, 34, 36, 38]) pipa.phrase(s.bar(b), B3, riffFor(b), { vel: 96, trem: 8 });
  // B: vê nền theo gốc hợp âm (nửa ô)
  for (let b = 8; b < 16; b++) pipa.phrase(s.bar(b), B3, b % 2 ? '3*:2 2*:2' : '0*:2 r:2', { vel: 70, trem: 8, transpose: ROOT[chordAt(b)] - n('B1') });
  // D: đàn gảy đối, móc đơn nhảy quãng
  const COUNTER = "5':1/2 3':1/2 4':1/2 2':1/2 3':1/2 1':1/2 2':1/2 0':1/2";
  for (let b = 24; b < 32; b++) pipa.phrase(s.bar(b), B3, COUNTER, { vel: 74, transpose: chordAt(b) === 'G' ? -4 : chordAt(b) === 'A' ? -2 : 0 });

  // ----- nhị (violin): chủ đề -----
  const THEME = [
    '0~:3/2 1:1/2 2:1 3:1',
    '4>:3 3:1',
    '3:1/2 4:1/2 5:1 4:1 3:1',
    '2:2 1:1 0:1',
    '-1:1 0:1 1:1 2:1',
    '3~:3 2:1',
    '4:1 3:1/2 4:1/2 5:1 6:1',
    "5>:2 r:1 4':1/2 3':1/2",
  ].join(' | ');
  erhu.phrase(s.bar(8), B4, THEME, { vel: 96, vib: 1, legato: 0.97 });
  erhu.phrase(s.bar(24), B4, THEME, { oct: 1, vel: 92, vib: 1, legato: 0.97 });
  // E: bè trầm vuốt dài
  erhu.phrase(s.bar(32), B3, '0~:4 | -1:4 | 1~:4 | 0:4 | -2~:4 | -1:4 | -1:2 0:2 | 1~:4', { vel: 84, vib: 2, legato: 1 });

  // ----- sáo: điểm ở A, độc tấu ở C -----
  for (const b of [1, 3, 5, 7]) dizi.phrase(s.bar(b) + 2, B4, "5>':1/2 4':1/2 5:1", { vel: 82 });
  const DIZI_SOLO = [
    '5:1/2 6:1/2 7:1 6:1/2 5:1/2 4:1',
    '3:2 4:1 5:1',
    '7:1/2 6:1/2 5:1/2 4:1/2 3:1 4:1',
    '5:4',
    '3:1/2 4:1/2 5:1 6:1 5:1',
    '4~:3 3:1',
    '2:1/2 3:1/2 4:1 3:1 2:1',
    "0:2 r:1 5':1/2 6':1/2",
  ].join(' | ');
  dizi.phrase(s.bar(16), B4, DIZI_SOLO, { vel: 90, vib: 1 });

  // ----- dây vê dâng ở C (mỗi 2 ô một hợp âm, lên dần) -----
  const TREM = [
    [n('B3'), n('F#4'), n('B4')],
    [n('B3'), n('F#4'), n('D5')],
    [n('G3'), n('D4'), n('B4')],
    [n('A3'), n('E4'), n('C#5')],
  ];
  TREM.forEach((c, i) => {
    trem.chord(s.bar(16 + i * 2), c, 8, 70 + i * 8);
    trem.swell(s.bar(16 + i * 2), s.bar(18 + i * 2), 80, 120);
  });
  trem.cc(s.bar(24), 11, 127); // trả biểu cảm về mặc định trước khi vòng nối lại
  // D, E: dây vê giữ nền mỏng
  for (let b = 24; b < 40; b += 2) trem.chord(s.bar(b), [ROOT[chordAt(b)] + 24, ROOT[chordAt(b)] + 31], 8, 60);

  return s;
}
