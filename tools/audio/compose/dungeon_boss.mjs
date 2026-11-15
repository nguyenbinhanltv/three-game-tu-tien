// Kiếm Trủng — Thủ Mộ (`dungeon_boss`): đợt boss bí cảnh (Kiếm Khôi, Huyết Lang Vương). Sắc lạnh, cơ khí, không ngừng.
// Khác `boss` ở âm sắc kim loại: mõ/agogo như bánh răng, chũm chọe như kiếm va, nhị (fiddle) gắt.
// 136 BPM, 4/4, vũ điệu F# (F# A B C# E). 48 ô nhịp ≈ 1:25.
//
// Cấu trúc (8 ô mỗi phần):
//   A  "bánh răng": agogo + mõ móc kép 3-3-2, trống trầm, dây trầm staccato
//   B  nhị gắt hát chủ đề, kiếm va mỗi 2 ô
//   C  dàn dây đồng âm đập 3-3-2, chuông ống như tiếng kiếm cổ
//   D  chủ đề quãng tám trên, đàn gảy vê
//   E  phá nhịp: trống gọi-đáp với dây, nhị đứt câu
//   F  dồn trống + chuông, nối về A.
import { n, Scale, Song } from './lib.mjs';

export default function dungeonBoss() {
  const s = new Song({ id: 'dungeon_boss', bpm: 136, bars: 48, seed: 136, reverb: { macro: 2, time: 72 }, tailSec: 5 });
  const Fs = new Scale('F#4', 'yu');

  const taiko = s.track('taiko', { ch: 0, program: 116, vol: 108, pan: 0, reverb: 50, humanTime: 0.004 });
  const tom = s.track('tom', { ch: 1, program: 117, vol: 84, pan: -0.25, reverb: 40, humanTime: 0.004 });
  const agogo = s.track('agogo', { ch: 2, program: 113, vol: 64, pan: 0.45, reverb: 40, humanTime: 0.003, humanVel: 6 });
  const block = s.track('block', { ch: 3, program: 115, vol: 66, pan: -0.45, reverb: 40, humanTime: 0.003, humanVel: 6 });
  const low = s.track('low', { ch: 4, program: 48, vol: 94, pan: -0.15, reverb: 40, humanTime: 0.003 });
  const fiddle = s.track('fiddle', { ch: 5, program: 110, vol: 100, pan: 0.05, reverb: 56, humanTime: 0.008 });
  const tube = s.track('tube', { ch: 6, program: 14, vol: 66, pan: 0.3, reverb: 90, humanTime: 0 });
  const shamisen = s.track('shamisen', { ch: 7, program: 106, vol: 86, pan: 0.35, reverb: 44 });
  const kit = s.track('kit', { ch: 9, program: 0, vol: 88, pan: 0, reverb: 56, humanTime: 0 });
  const bass = s.track('bass', { ch: 8, program: 43, vol: 86, pan: 0, reverb: 30, humanTime: 0.003 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40).section('F', 40, 48);

  const ROOT = { Fs: n('F#2'), D: n('D2'), E: n('E2'), B: n('B1'), Cs: n('C#2') };
  const PROG = ['Fs', 'Fs', 'D', 'E'];
  const PROG_C = ['B', 'D', 'Cs', 'Cs'];
  const chordAt = (bar) => (bar >= 16 && bar < 24 ? PROG_C : PROG)[Math.floor((bar % 8) / 2)];
  const G332 = [1, 0, 0, 1, 0, 0, 1, 0];

  for (let b = 0; b < 48; b++) {
    const t = s.bar(b);
    const r = ROOT[chordAt(b)];
    const E = b >= 32 && b < 40;
    // bánh răng: agogo 3-3-2 móc kép, mõ lấp chỗ trống
    for (let i = 0; i < 16; i++) {
      if (G332[i % 8]) agogo.note(t + i / 4, i % 8 === 0 ? n('C5') : n('G4'), 0.1, i % 8 === 0 ? 80 : 62);
      else if (!E) block.note(t + i / 4, n('E5'), 0.08, 36 + (i % 2) * 8);
    }
    // trống
    if (b === 47 || b === 15 || b === 31) {
      for (let i = 0; i < 16; i++) (i % 2 ? tom : taiko).note(t + i / 4, i % 2 ? n('C3') : n('C2'), 0.24, 66 + i * 3.5);
    } else if (E) {
      // gọi: trống 2 phách đầu; đáp: dây 2 phách sau
      taiko.pattern(t, t + 2, 1 / 4, [124, 0, 100, 0, 116, 90, 100, 0], n('C2'), 0.3);
    } else {
      taiko.pattern(t, t + 4, 1 / 4, [118, 0, 0, 96, 0, 0, 110, 0, 112, 0, 0, 96, 0, 0, 104, 70], n('C2'), 0.4);
      tom.pattern(t, t + 4, 1 / 2, [0, 70, 0, 64, 0, 70, 0, 80], (i) => (i % 4 === 3 ? n('G3') : n('D3')), 0.2);
    }
    // dây trầm staccato theo 3-3-2; E: chỉ nửa sau (đáp)
    for (let i = 0; i < 8; i++) {
      if (E && i < 4) continue;
      const acc = G332[i];
      low.note(t + i / 2, r + 12 + (i === 7 ? 7 : 0), 0.22, acc ? 116 : 76);
    }
    bass.note(t, r, 0.6, 104);
    bass.note(t + 1.5, r, 0.4, 88);
    bass.note(t + 3, r, 0.6, 96);
  }
  // kiếm va: crash + ride bell (Standard kit: 49 crash, 53 ride bell, 55 splash)
  for (let b = 0; b < 48; b += 2) kit.note(s.bar(b), b % 8 ? n('G3') : n('C#3'), 2, b % 8 ? 84 : 110);
  for (let b = 8; b < 16; b += 2) kit.note(s.bar(b) + 3.5, n('F3'), 1, 90);

  // nhị (fiddle) chủ đề
  const THEME = ['0>:1/2 0:1/2 2:1 1:1/2 0:1/2 -1:1', '0~:3 r:1', '2:1/2 3:1/2 4:1 3:1 2:1', '3~:3 r:1', '4>:1/2 4:1/2 5:1 4:1/2 3:1/2 2:1', '3:2 2:1 1:1', '2:1 1:1 0:1 -1:1', '0~:4'].join(' | ');
  fiddle.phrase(s.bar(8), Fs, THEME, { vel: 102, vib: 1, legato: 0.92 });
  fiddle.phrase(s.bar(24), Fs, THEME, { oct: 1, vel: 96, vib: 1, legato: 0.92 });
  // E: nhị đứt câu
  for (let b = 32; b < 40; b += 2) fiddle.phrase(s.bar(b) + 2, Fs, b % 4 ? "4>':1/2 3':1/2 2:1 | 1~:2 r:2" : "2>':1/2 3':1/2 4:1 | 5~:2 r:2", { vel: 98 });

  // C: dàn dây đồng âm + chuông ống
  for (let b = 16; b < 24; b++) {
    const r = ROOT[chordAt(b)] + 24;
    for (let i = 0; i < 8; i++) if (G332[i]) low.note(s.bar(b) + i / 2, r, 0.3, 96);
    if (b % 2 === 0) tube.note(s.bar(b), r + 12, 4, 80);
  }
  for (const b of [0, 40, 42, 44, 46]) tube.note(s.bar(b), n('F#4'), 4, 74);
  // D: đàn gảy vê
  for (let b = 24; b < 32; b++) shamisen.phrase(s.bar(b), Fs, b % 2 ? '2*:2 1*:2' : '0*:2 3*:2', { vel: 76, trem: 8, transpose: ROOT[chordAt(b)] - n('F#2') });
  // A, F: shamisen riff ngắn mỗi 2 ô
  for (const b of [1, 3, 5, 7, 41, 43, 45]) shamisen.phrase(s.bar(b) + 2, Fs, "0':1/4 0':1/4 2':1/2 1':1/2 0':1/2", { vel: 88, transpose: ROOT[chordAt(b)] - n('F#2') });

  return s;
}
