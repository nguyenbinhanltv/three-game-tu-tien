// Tu Vi Tinh Tiến (`sting_levelup`): lên tầng Ngưng Khí. Ngắn, sáng, gọn: đàn tranh lướt lên ngũ cung + chuông đồng nhỏ.
// Một lần (không lặp), khoảng 3 s + ngân.
import { n, Scale, Song } from './lib.mjs';

export default function stingLevelup() {
  const s = new Song({ id: 'sting_levelup', bpm: 96, bars: 1, loop: false, seed: 7, reverb: { macro: 4, time: 80 }, tailSec: 3 });
  const D = new Scale('D4', 'gong');
  const koto = s.track('koto', { ch: 0, program: 107, vol: 104, pan: -0.2, reverb: 80, humanTime: 0 });
  const bell = s.track('bell', { ch: 1, program: 9, vol: 84, pan: 0.3, reverb: 100, humanTime: 0 });
  const harp = s.track('harp', { ch: 2, program: 46, vol: 84, pan: 0.2, reverb: 90, humanTime: 0 });
  const pad = s.track('pad', { ch: 3, program: 49, vol: 70, pan: 0, reverb: 100, humanVel: 0 });
  // lướt lên 7 bậc trong nửa phách, rồi motif chủ đề 0-2-4 → 5
  for (let i = 0; i < 8; i++) harp.note(i * 0.07, D.deg(i), 2, 70 + i * 3, { human: false });
  koto.phrase(0.6, D, '5:1/4 7:1/4 9>:2', { vel: 96 });
  bell.note(0.6, D.deg(10), 2, 90);
  bell.note(1.1, D.deg(12), 2.4, 80);
  pad.chord(0.5, [n('D4'), n('A4'), n('F#5')], 3.4, 70);
  return s;
}
