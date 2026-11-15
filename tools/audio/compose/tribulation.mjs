// Độ Kiếp (`tribulation`): thiên lôi giáng xuống khoảng 40 giây khi độ kiếp Trúc Cơ. Cao trào của cả MVP:
// trời đất nổi giận, căng tột độ, bi tráng. Giữ cường độ cao từ đầu tới cuối để lặp không hụt.
// 100 BPM, 4/4, vũ điệu D (D F G A C). 24 ô nhịp = 57,6 s.
//
// Cấu trúc (8 ô mỗi phần):
//   A  trống dồn + sấm rền nền + dây vê đi lên theo nửa cung + la cuộn
//   B  kèn đồng + dây hát chủ đề bi tráng, tiêu cao xé
//   C  cao trào: cả dàn, trống móc kép, hợp âm Bb–C–Dm, ô cuối cuộn la dồn về A.
import { n, Scale, Song } from './lib.mjs';

export default function tribulation() {
  const s = new Song({ id: 'tribulation', bpm: 100, bars: 24, seed: 100, reverb: { macro: 4, time: 90 }, tailSec: 6 });
  const D = new Scale('D4', 'yu');

  const taiko = s.track('taiko', { ch: 0, program: 116, vol: 112, pan: 0, reverb: 60, humanTime: 0.004 });
  const bigdrum = s.track('bigdrum', { ch: 1, program: 116, bank: 8, vol: 96, pan: 0, reverb: 60, humanTime: 0 });
  const timp = s.track('timp', { ch: 2, program: 47, vol: 92, pan: -0.15, reverb: 70, humanTime: 0 });
  const thunder = s.track('thunder', { ch: 3, program: 122, bank: 2, vol: 70, pan: 0.1, reverb: 80, humanVel: 0, humanTime: 0 });
  const trem = s.track('trem', { ch: 4, program: 44, vol: 86, pan: -0.3, reverb: 70 });
  const brass = s.track('brass', { ch: 5, program: 61, vol: 84, pan: 0.25, reverb: 80 });
  const strings = s.track('strings', { ch: 6, program: 48, vol: 92, pan: -0.1, reverb: 76 });
  const xiao = s.track('xiao', { ch: 7, program: 72, vol: 82, pan: 0.35, reverb: 90, humanTime: 0.01 });
  const low = s.track('low', { ch: 8, program: 43, vol: 90, pan: 0.05, reverb: 50 });
  const kit = s.track('kit', { ch: 9, program: 0, vol: 92, pan: 0, reverb: 70, humanTime: 0 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24);

  const ROOT = { Dm: n('D2'), Bb: n('Bb1'), C: n('C2'), A: n('A1'), F: n('F1') };
  const PROG = ['Dm', 'Bb', 'C', 'A'];
  const PROG_C = ['Bb', 'C', 'Dm', 'A'];
  const chordAt = (bar) => (bar >= 16 ? PROG_C : PROG)[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 24; b++) {
    const t = s.bar(b);
    const r = ROOT[chordAt(b)];
    const C = b >= 16;
    // trống dồn; C móc kép
    taiko.pattern(t, t + 4, 1 / 4, C ? [124, 60, 90, 60, 110, 60, 90, 70, 120, 60, 90, 60, 110, 80, 100, 90] : [120, 0, 0, 80, 100, 0, 70, 0, 116, 0, 0, 80, 104, 0, 90, 70], (i) => (i % 4 === 2 ? n('G2') : n('C2')), 0.4);
    bigdrum.note(t, n('C2'), 1.5, 118);
    bigdrum.note(t + 2, n('C2'), 1.5, 104);
    // timpani cuộn nửa sau mỗi ô chẵn
    if (b % 2 === 1 || b === 23) timp.pattern(t + 2, t + 4, 1 / 8, [60, 66, 72, 80, 88, 96, 106, 118, 118, 118, 118, 118, 118, 118, 118, 118], r + 12 < n('C2') ? r + 24 : r + 12, 0.12);
    // dây trầm
    low.note(t, r, 1.8, 104);
    low.note(t + 2, r, 1.4, 96);
    low.note(t + 3.5, r + 7, 0.4, 86);
    // dây móc đơn dồn ở B, C
    if (b >= 8) for (let i = 0; i < 8; i++) strings.note(t + i / 2, r + 24 + (i % 4 === 3 ? 7 : 0), 0.3, i % 2 ? 76 : 100);
  }
  // sấm rền: hai cú mỗi phần, xen kẽ (preset Thunder)
  for (const b of [0, 4, 8, 12, 16, 20]) thunder.note(s.bar(b) + 0.5, n('C4'), 7, 96);
  // chũm chọe / chũm chọe Tàu như la cuộn
  for (const b of [0, 8, 16]) kit.note(s.bar(b), n('C#3'), 3, 116);
  for (const b of [4, 12, 20]) kit.note(s.bar(b), n('E3'), 3, 104);
  kit.pattern(s.bar(23), s.bar(24), 1 / 8, [40, 50, 60, 70, 80, 92, 104, 118], n('A3'), 0.1);

  // A: dây vê đi lên từng nửa cung mỗi 2 ô (căng dần trong phần, rồi kết nối B)
  for (let k = 0; k < 4; k++) {
    const p = n('D4') + k;
    trem.chord(s.bar(k * 2), [p, p + 7, p + 12], 8, 80 + k * 8);
  }
  // B, C: dây vê giữ hợp âm cao
  for (let b = 8; b < 24; b += 2) {
    const r = ROOT[chordAt(b)] + 36;
    trem.chord(s.bar(b), [r, r + 7, r + 12], 8, 84);
  }

  // B: kèn đồng + chủ đề bi tráng
  const THEME = ['0:2 2:1 3:1', '4:3 3:1', '2:2 3:1 2:1', '1:4', '2:2 3:1 4:1', '5:3 4:1', '3:1 2:1 1:1 0:1', '-1:4'].join(' | ');
  brass.phrase(s.bar(8), D, THEME, { oct: -1, vel: 96, legato: 1 });
  xiao.phrase(s.bar(9) + 2, D, '7:1/2 8:1/2 7:1 | 6~:4', { oct: 0, vel: 92, vib: 1 });
  xiao.phrase(s.bar(13) + 2, D, '8:1/2 9:1/2 8:1 | 7~:4', { oct: 0, vel: 96, vib: 1 });
  // C: chủ đề quãng tám trên, tiêu xé cao
  brass.phrase(s.bar(16), D, ['2:2 3:1 4:1', '5:3 4:1', '5:2 6:1 5:1', '4:4', '3:2 4:1 5:1', '6:3 5:1', '4:1 3:1 2:1 1:1', '0:4'].join(' | '), { vel: 100, legato: 1 });
  xiao.phrase(s.bar(16), D, ['r:2 9>:2', '10~:4', 'r:2 9:1 8:1', '7~:4', 'r:2 8>:2', '9~:4', '8:1 7:1 6:1 5:1', '5~:4'].join(' | '), { vel: 96, vib: 1, legato: 1 });

  return s;
}
