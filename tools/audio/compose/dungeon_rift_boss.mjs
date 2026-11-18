// Xích Tẫn Khích — Chiến Giới (`dungeon_rift_boss`): các đợt boss của phó bản (Cự Khôi, Tử Nhận Ma Tướng, Tử Quang Dực Chủ). Uy áp nặng, đồng thau và trống ngực, hợp xướng gào.
// 108 BPM, 4/4, thang E F A B C (như `dungeon_rift`). 40 ô nhịp ≈ 1:29.
//
//   A  ostinato 3-3-2 dây trầm + taiko, đồng thau nhấn phách 1
//   B  hợp xướng hát chủ đề hẹp, đàn ống pedal
//   C  dây đồng âm đập 3-3-2, đồng thau cao dần, chuông ống như tiếng búa đập sắt
//   D  chủ đề quãng tám trên, timpani dồn
//   E  thưa dần, nối về A.
import { n, Scale, Song } from './lib.mjs';

export default function dungeonRiftBoss() {
  const s = new Song({ id: 'dungeon_rift_boss', bpm: 108, bars: 40, seed: 108, reverb: { macro: 3, time: 96 }, tailSec: 5 });
  const E = new Scale('E3', [0, 1, 5, 7, 8]);

  const taiko = s.track('taiko', { ch: 0, program: 116, vol: 106, pan: 0, reverb: 60, humanTime: 0.004 });
  const timp = s.track('timp', { ch: 1, program: 47, vol: 88, pan: -0.15, reverb: 80, humanTime: 0.004 });
  const low = s.track('low', { ch: 2, program: 48, vol: 92, pan: -0.15, reverb: 50, humanTime: 0.003 });
  const brass = s.track('brass', { ch: 3, program: 57, vol: 86, pan: 0.2, reverb: 70 });
  const choir = s.track('choir', { ch: 4, program: 52, vol: 74, pan: 0, reverb: 110, humanVel: 2 });
  const organ = s.track('organ', { ch: 5, program: 19, vol: 62, pan: 0, reverb: 100, humanVel: 0 });
  const tube = s.track('tube', { ch: 6, program: 14, vol: 60, pan: 0.35, reverb: 90, humanTime: 0 });
  const bass = s.track('bass', { ch: 8, program: 43, vol: 84, pan: 0, reverb: 40, humanTime: 0.003 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40);

  const ROOT = (b) => (b % 4 === 2 ? n('F2') : n('E2'));
  // ostinato 3-3-2 trên 8 nốt móc: phách 0, 1,5, 3 của ô
  const HITS = [0, 1.5, 3];
  for (let b = 0; b < 40; b++) {
    const t = s.bar(b);
    const loud = b >= 16 && b < 32;
    for (const h of HITS) {
      low.note(t + h, ROOT(b), 0.5, loud ? 92 : 78);
      bass.note(t + h, ROOT(b) - 12, 0.6, 76);
    }
    taiko.note(t, n('C2'), 1, loud ? 100 : 84);
    if (b % 2) taiko.note(t + 2, n('C2'), 0.5, 70);
    if (loud) timp.note(t + 2.5, n('E2'), 0.5, 80);
  }
  for (let b = 0; b < 40; b += 2) brass.note(s.bar(b), b >= 16 && b < 32 ? n('B2') : n('E2'), 1.5, b >= 16 ? 92 : 78);
  for (let b = 0; b < 40; b += 4) organ.chord(s.bar(b), [n('E2'), n('B2'), n('E3')], 16, 60);
  for (let b = 18; b < 32; b += 4) tube.note(s.bar(b) + 3, b % 8 < 4 ? n('F5') : n('E5'), 1, 62);

  const THEME = ['0:2 1:1 0:1', '-1:2 0:2', '1:2 2:1 1:1', '0~:4', '2:2 1:2', '0:2 -1:2', '1:2 0:2', '0~:4'].join(' | ');
  choir.phrase(s.bar(8), E, THEME, { vel: 76, vib: 0.3 });
  choir.phrase(s.bar(24), E, THEME, { oct: 1, vel: 84, vib: 0.3 });
  brass.phrase(s.bar(16), E, THEME, { vel: 84 });
  return s;
}
