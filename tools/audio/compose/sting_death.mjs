// Thân Tử Đạo Tiêu (`sting_death`): tử vong. Ngắn, buồn: tiêu trầm đi xuống, một tiếng chiêng xa, nền dây thấp.
// Một lần, khoảng 5 s + ngân.
import { n, Scale, Song } from './lib.mjs';

export default function stingDeath() {
  const s = new Song({ id: 'sting_death', bpm: 60, bars: 1, loop: false, seed: 13, reverb: { macro: 4, time: 110 }, tailSec: 4 });
  const A = new Scale('A3', 'yu');
  const xiao = s.track('xiao', { ch: 0, program: 77, vol: 96, pan: 0.1, reverb: 110, humanTime: 0 });
  const gong = s.track('gong', { ch: 1, program: 14, bank: 8, vol: 78, pan: -0.2, reverb: 127, humanTime: 0 });
  const low = s.track('low', { ch: 2, program: 49, vol: 76, pan: 0, reverb: 110, humanVel: 0 });
  const koto = s.track('koto', { ch: 3, program: 107, vol: 70, pan: -0.35, reverb: 110, humanTime: 0 });
  gong.note(0, n('A1'), 4, 96);
  low.chord(0, [n('A2'), n('E3'), n('C4')], 4, 70);
  xiao.phrase(0.25, A, "4~:1 3:1/2 2:1/2 1~:2", { oct: 1, vel: 86, vib: 1, legato: 1 });
  koto.note(3, n('A3'), 2, 56);
  koto.note(3.02, n('E4'), 2, 48);
  return s;
}
