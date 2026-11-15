// Hàn Giao (`boss`): giao chiến yêu giao trấn giữ Hồ Sương Mù. Lạnh buốt, đáng sợ, gấp, cường độ cao suốt vòng.
// 140 BPM, 4/4, vũ điệu G (G Bb C D F). 48 ô nhịp ≈ 1:22.
//
// Cấu trúc (8 ô mỗi phần):
//   A  trống lớn + dây trầm móc kép dồn + kim loại lạnh (pha lê) rắc
//   B  nhị gắt hát chủ đề, kèn đồng trầm đỡ
//   C  "giao trồi lên": hợp âm Eb/F, la cuộn, dây vê cao
//   D  chủ đề quãng tám trên + đàn gảy vê
//   E  đứt quãng 3-3-2 trên cả dàn (đòn đánh), nhị đối đáp với sáo
//   F  dồn lại về A (trống lẫy, la).
import { n, Scale, Song } from './lib.mjs';

export default function boss() {
  const s = new Song({ id: 'boss', bpm: 140, bars: 48, seed: 140, reverb: { macro: 4, time: 70 }, tailSec: 5 });
  const G = new Scale('G4', 'yu');

  const taiko = s.track('taiko', { ch: 0, program: 116, vol: 96, pan: 0, reverb: 56, humanTime: 0.005 });
  const bigdrum = s.track('bigdrum', { ch: 1, program: 116, bank: 8, vol: 80, pan: 0, reverb: 50, humanTime: 0 });
  const timp = s.track('timp', { ch: 2, program: 47, vol: 90, pan: -0.1, reverb: 60, humanTime: 0 });
  const low = s.track('low', { ch: 3, program: 48, vol: 96, pan: -0.25, reverb: 44, humanTime: 0.004 });
  const brass = s.track('brass', { ch: 4, program: 61, vol: 72, pan: 0.2, reverb: 70 });
  const erhu = s.track('erhu', { ch: 5, program: 40, vol: 104, pan: -0.05, reverb: 60, humanTime: 0.008 });
  const ice = s.track('ice', { ch: 6, program: 96, vol: 60, pan: 0.45, reverb: 90, humanTime: 0.01 });
  const trem = s.track('trem', { ch: 7, program: 44, vol: 78, pan: 0.3, reverb: 64 });
  const pipa = s.track('pipa', { ch: 8, program: 106, vol: 84, pan: 0.4, reverb: 50 });
  const kit = s.track('kit', { ch: 9, program: 0, vol: 92, pan: 0, reverb: 60, humanTime: 0 });
  const dizi = s.track('dizi', { ch: 10, program: 72, vol: 80, pan: 0.35, reverb: 60 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40).section('F', 40, 48);

  const ROOT = { Gm: n('G2'), Eb: n('Eb2'), F: n('F2'), Cm: n('C2'), D: n('D2') };
  const MAIN = ['Gm', 'Eb', 'Cm', 'D'];
  const RISE = ['Eb', 'F', 'Gm', 'D'];
  const chordAt = (bar) => (bar >= 16 && bar < 24 ? RISE : MAIN)[Math.floor((bar % 8) / 2)];
  const isE = (b) => b >= 32 && b < 40;

  // ----- trống -----
  const DR = [120, 0, 70, 0, 100, 0, 70, 50, 110, 0, 70, 0, 104, 60, 80, 60];
  const DR_E = [124, 0, 0, 110, 0, 0, 116, 0, 120, 0, 0, 110, 0, 0, 100, 80]; // 3-3-2 ×2
  for (let b = 0; b < 48; b++) {
    const t = s.bar(b);
    if (b === 47 || b === 23) {
      for (let i = 0; i < 16; i++) taiko.note(t + i / 4, i % 2 ? n('G2') : n('C2'), 0.24, 64 + i * 4);
      timp.pattern(t + 2, t + 4, 1 / 8, [70, 76, 82, 88, 94, 100, 108, 116, 120, 120, 120, 120, 120, 120, 120, 120], n('G2'), 0.12);
    } else taiko.pattern(t, t + 4, 1 / 4, isE(b) ? DR_E : DR, (i) => (i % 4 === 2 ? n('G2') : n('C2')), 0.4);
    bigdrum.note(t, n('C2'), 1, 112);
    bigdrum.note(t + 2, n('C2'), 1, 96);
    if (b % 4 === 0) timp.note(t, n('G2'), 1.5, 104);
  }
  // chũm chọe (Standard kit: 57 = crash 2) và chũm chọe Tàu như la ngắn (52)
  for (const b of [0, 8, 16, 24, 32, 40]) kit.note(s.bar(b), n('A3'), 3, 110);
  for (const b of [16, 18, 20, 22]) kit.note(s.bar(b) + 0.01, n('E3'), 3, 96);
  for (const b of [12, 28, 44]) kit.pattern(s.bar(b) + 2, s.bar(b) + 4, 1 / 8, [30, 40, 50, 60, 70, 80, 92, 104], n('A3'), 0.1);

  // ----- dây trầm móc kép dồn -----
  const OST = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 10, 0, 7, 0];
  for (let b = 0; b < 48; b++) {
    const r = ROOT[chordAt(b)];
    OST.forEach((o, i) => {
      const accent = isE(b) ? [0, 3, 6, 8, 11, 14].includes(i) : i % 4 === 0;
      low.note(s.bar(b) + i / 4, r + o, 0.2, accent ? 112 : 72);
    });
  }
  // kèn đồng trầm đỡ ở B, D (nốt dài theo gốc)
  for (let b = 8; b < 32; b += 2) {
    if (b >= 16 && b < 24) continue;
    const r = ROOT[chordAt(b)] + 12;
    brass.chord(s.bar(b), [r, r + 7], 7.6, 76);
  }

  // ----- kim loại lạnh: rắc nốt cao -----
  for (let b = 0; b < 48; b += 2) {
    if (b >= 8 && b < 16) continue;
    ice.phrase(s.bar(b) + 1, G, b % 4 ? '9:1/2 8:1/2 7:1' : '10:1/2 9:1/2 8:1/2 6:1/2', { vel: 58 });
  }

  // ----- nhị: chủ đề -----
  const THEME = ['0~:1 1:1/2 2:1/2 3:1 2:1', '1:2 0:1 -1:1', '0:1/2 1:1/2 2:1 3:1 4:1', '3~:4', '5:1 4:1 3:1 2:1', '3:2 2:1 1:1', '2:1 1:1/2 0:1/2 -1:1 0:1', '0~:4'].join(' | ');
  erhu.phrase(s.bar(8), G, THEME, { vel: 100, vib: 1, legato: 0.95 });
  erhu.phrase(s.bar(24), G, THEME, { oct: 1, vel: 96, vib: 1, legato: 0.95 });
  // E: nhị đối đáp với sáo, mỗi bên 2 ô
  ['5>:1 4:1/2 3:1/2 4:2 | 3:1 2:1 1:2', '6>:1 5:1/2 4:1/2 5:2 | 4:1 3:1 2:2'].forEach((p, i) => {
    erhu.phrase(s.bar(32 + i * 4), G, p, { vel: 100, vib: 1 });
    dizi.phrase(s.bar(34 + i * 4), G, '7:1/2 6:1/2 5:1/2 6:1/2 7:2 | 8:1 7:1 5:2', { vel: 88 });
  });
  // F: nhị giữ dài dồn
  erhu.phrase(s.bar(40), G, ['3~:4', '4:4', '5~:4', '4:2 3:2', '2~:4', '3:4', '4:2 5:2', '6>:4'].join(' | '), { vel: 96, vib: 1, legato: 1 });

  // ----- C: dây vê cao, đàn gảy vê ở D -----
  for (let b = 16; b < 24; b += 2) {
    const r = ROOT[chordAt(b)] + 36;
    trem.chord(s.bar(b), [r, r + 7, r + 12], 8, 74 + (b - 16) * 3);
  }
  for (let b = 24; b < 32; b++) pipa.phrase(s.bar(b), G, b % 2 ? '2*:2 1*:2' : '0*:2 2*:2', { vel: 74, trem: 8, transpose: ROOT[chordAt(b)] - n('G2') });

  return s;
}
