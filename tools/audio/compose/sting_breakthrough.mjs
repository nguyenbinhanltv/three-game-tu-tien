// Trúc Cơ Thành (`sting_breakthrough`): độ kiếp Trúc Cơ thành công. Chiêng lớn nở ra, sáo trúc bay lên, dây ấm rực rỡ.
// Dùng motif mở đầu của `title` (0-1-2-4 → chủ âm quãng tám). Một lần, khoảng 6 s + ngân.
import { n, Scale, Song } from './lib.mjs';

export default function stingBreakthrough() {
  const s = new Song({ id: 'sting_breakthrough', bpm: 80, bars: 2, loop: false, seed: 11, reverb: { macro: 4, time: 100 }, tailSec: 4 });
  const D = new Scale('D5', 'gong');
  const kit = s.track('kit', { ch: 9, program: 0, vol: 100, pan: 0, reverb: 90, humanTime: 0 });
  const timp = s.track('timp', { ch: 0, program: 47, vol: 100, pan: -0.1, reverb: 80, humanTime: 0 });
  const gong = s.track('gong', { ch: 1, program: 14, bank: 8, vol: 90, pan: 0.1, reverb: 120, humanTime: 0 });
  const strings = s.track('strings', { ch: 2, program: 48, vol: 96, pan: -0.15, reverb: 100 });
  const brass = s.track('brass', { ch: 3, program: 61, vol: 80, pan: 0.2, reverb: 100 });
  const dizi = s.track('dizi', { ch: 4, program: 73, vol: 104, pan: 0.15, reverb: 96, humanTime: 0 });
  const harp = s.track('harp', { ch: 5, program: 46, vol: 84, pan: 0.35, reverb: 96, humanTime: 0 });
  // cuộn timpani dâng 1 phách rồi chiêng + chũm chọe nở
  timp.pattern(0, 1, 1 / 8, [50, 60, 70, 80, 90, 100, 110, 120], n('D2'), 0.12);
  kit.pattern(0, 1, 1 / 8, [30, 40, 50, 60, 70, 80, 90, 100], n('A3'), 0.1);
  kit.note(1, n('C#3'), 4, 118);
  kit.note(1.01, n('E3'), 4, 96);
  gong.note(1, n('D2'), 6, 110);
  timp.note(1, n('D2'), 2, 124);
  strings.chord(1, [n('D3'), n('A3'), n('D4'), n('F#4'), n('A4')], 6.6, 96);
  strings.swell(1, 4, 90, 127);
  brass.chord(1.5, [n('D3'), n('A3'), n('D4')], 6, 84);
  dizi.phrase(1.25, D, '0:1/2 1:1/4 2:1/4 3:1/4 4:1/4 5>~:3 r:1', { vel: 100, vib: 1.2 });
  for (let i = 0; i < 10; i++) harp.note(1 + i * 0.06, D.deg(i - 5), 3, 66 + i * 2);
  return s;
}
