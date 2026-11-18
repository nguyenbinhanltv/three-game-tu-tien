// Đả Tọa (`meditate`): ngồi thiền hồi phục, có thể kéo dài. Gần như nhạc nền tĩnh; linh khí lưu chuyển.
// 60 BPM, 4/4, cung điệu A (A B C# E F#). 28 ô nhịp = 1:52.
//
// Cấu trúc (7 ô mỗi phần):
//   A  drone ấm + chuông xoay (bát chuông) + tiếng suối nhẹ
//   B  bồi âm cổ cầm (đàn tranh cao, rất khẽ) rơi chậm
//   C  hợp âm D/E thoáng lên, đàn hạc rải chậm như hơi thở
//   D  tiêu một câu dài, trở về drone.
import { n, Scale, Song } from './lib.mjs';

export default function meditate() {
  const s = new Song({ id: 'meditate', bpm: 60, bars: 28, seed: 60, reverb: { macro: 4, time: 120 } });
  const A = new Scale('A4', 'gong');

  const drone = s.track('drone', { ch: 0, program: 89, vol: 72, pan: 0, reverb: 110, humanVel: 0 });
  const low = s.track('low', { ch: 1, program: 49, vol: 58, pan: -0.15, reverb: 100, humanVel: 0 });
  const bowl = s.track('bowl', { ch: 2, program: 14, vol: 56, pan: 0.3, reverb: 127, humanTime: 0 });
  const water = s.track('water', { ch: 3, program: 122, bank: 4, vol: 38, pan: -0.3, reverb: 40, humanVel: 0, humanTime: 0 });
  const harm = s.track('harm', { ch: 4, program: 107, vol: 58, pan: 0.4, reverb: 120, humanTime: 0.04 });
  const harp = s.track('harp', { ch: 5, program: 46, vol: 60, pan: -0.35, reverb: 110 });
  const xiao = s.track('xiao', { ch: 6, program: 77, vol: 74, pan: 0.15, reverb: 110, humanTime: 0.02 });

  s.section('A', 0, 7).section('B', 7, 14).section('C', 14, 21).section('D', 21, 28);

  // drone: A ngân suốt, đổi màu ở phần C
  const CH = {
    A: [n('A2'), n('E3'), n('B3'), n('C#4')],
    D: [n('D3'), n('A3'), n('E4'), n('F#4')],
    E: [n('E3'), n('B3'), n('F#4'), n('A4')],
  };
  const chordAt = (b) => (b >= 14 && b < 21 ? (b < 18 ? 'D' : 'E') : 'A');
  // Nốt drone ngân dài: tách theo từng đoạn hợp âm, tối đa 7 ô mỗi nốt.
  const segs = [
    [0, 7],
    [7, 14],
    [14, 18],
    [18, 21],
    [21, 28],
  ];
  for (const [a, z] of segs) {
    const c = CH[chordAt(a)];
    drone.chord(s.bar(a), c, s.bar(z - a), 64);
    low.note(s.bar(a), c[0] - 12, s.bar(z - a), 60);
  }
  // tiếng suối: một nốt dài mỗi đoạn (preset Stream), giữ đều suốt vòng
  for (let b = 0; b < 28; b += 7) water.note(s.bar(b), n('C4'), s.bar(7), 70);

  // bát chuông: mỗi 2 ô, đổi cao độ chậm
  const BOWL = [n('A3'), n('E4'), n('A3'), n('B3')];
  for (let b = 0; b < 28; b += 2) bowl.note(s.bar(b) + (b % 4 ? 0.5 : 0), BOWL[(b / 2) % 4], 7, b % 4 ? 46 : 58);

  // B: bồi âm cổ cầm rơi chậm (cao, khẽ)
  harm.phrase(s.bar(7), A, ['5:2 7:2', '6:4', '8:2 7:2', '5:4', '7:2 9:2', '8:4', '7:4'].join(' | '), { vel: 52 });
  // C: đàn hạc rải chậm như hơi thở
  for (let b = 14; b < 21; b++) {
    const c = CH[chordAt(b)];
    [0, 1, 2, 3].forEach((k, i) => harp.note(s.bar(b) + i, c[k] + 12, 3, 50 + (i === 0 ? 8 : 0)));
  }
  // D: tiêu một câu dài
  xiao.phrase(s.bar(21), A, ['2:3 1:1', '0~:4', '1:2 2:2', '3~:4', '2:2 1:1 0:1', '-1~:4', '0:4'].join(' | '), {
    vel: 66,
    vib: 1.5,
    legato: 1,
  });

  return s;
}
