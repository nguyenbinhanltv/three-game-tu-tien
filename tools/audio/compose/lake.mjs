// Hồ Sương Mù (`lake`): ven hồ, nơi Hàn Giao ẩn. Đẹp nhưng lạnh, tĩnh, một chút bất an.
// 66 BPM, 4/4, vũ điệu C (C Eb F G Bb). 32 ô nhịp ≈ 1:56.
//
// Cấu trúc (8 ô mỗi phần):
//   A  pad sương + giọt nước (chuông pha lê, đàn tranh bồi âm) + mạch trống trầm thưa
//   B  nhị chậm (fiddle) vuốt lên xuống kiểu đàn bầu
//   C  hợp âm tối hơn (Ab, Fm), dây trầm ngân, giọt nước dày, điềm gở
//   D  nhị quãng tám thấp + tiêu đáp, thưa dần về A.
import { n, Scale, Song } from './lib.mjs';

export default function lake() {
  const s = new Song({ id: 'lake', bpm: 66, bars: 32, seed: 66, reverb: { macro: 4, time: 110 } });
  const C = new Scale('C4', 'yu');

  const pad = s.track('pad', { ch: 0, program: 94, vol: 66, pan: 0, reverb: 120, chorus: 20, humanVel: 0 });
  const mist = s.track('mist', { ch: 1, program: 92, vol: 44, pan: -0.2, reverb: 120, humanVel: 0 });
  const drops = s.track('drops', { ch: 2, program: 98, vol: 58, pan: 0.45, reverb: 120, humanTime: 0.03 });
  const koto = s.track('koto', { ch: 3, program: 107, vol: 70, pan: -0.4, reverb: 110, humanTime: 0.03 });
  const erhu = s.track('erhu', { ch: 4, program: 110, vol: 84, pan: 0.05, reverb: 100, humanTime: 0.02 });
  const low = s.track('low', { ch: 5, program: 42, vol: 64, pan: 0.15, reverb: 90 });
  const drum = s.track('drum', { ch: 6, program: 47, vol: 64, pan: 0, reverb: 90, humanTime: 0 });
  const xiao = s.track('xiao', { ch: 7, program: 77, vol: 76, pan: 0.3, reverb: 110, humanTime: 0.02 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32);

  const CH = {
    Cm: [n('C3'), n('G3'), n('Bb3'), n('D4')],
    Ab: [n('Ab2'), n('Eb3'), n('G3'), n('C4')],
    Bb: [n('Bb2'), n('F3'), n('Bb3'), n('D4')],
    Fm: [n('F2'), n('C3'), n('Eb3'), n('G3')],
    Gsus: [n('G2'), n('D3'), n('F3'), n('C4')],
  };
  const MAIN = ['Cm', 'Ab', 'Cm', 'Bb'];
  const DARK = ['Ab', 'Fm', 'Ab', 'Gsus'];
  const chordAt = (bar) => (bar >= 16 && bar < 24 ? DARK : MAIN)[Math.floor((bar % 8) / 2)];

  for (let b = 0; b < 32; b += 2) {
    const c = CH[chordAt(b)];
    pad.chord(s.bar(b), c, 8, 60);
    mist.chord(s.bar(b), [c[0] + 24, c[1] + 24], 8, 50);
    if (b >= 16) low.note(s.bar(b), c[0], 8, b < 24 ? 70 : 58);
  }
  // mạch trống trầm (timpani) như tim đập dưới nước: phách 1, phách 3 khẽ ở ô lẻ
  for (let b = 0; b < 32; b++) {
    drum.note(s.bar(b), n('C2'), 2, b % 4 === 0 ? 62 : 48);
    if (b % 2 === 1) drum.note(s.bar(b) + 2.5, n('C2'), 1, 36);
  }
  // giọt nước: nốt cao rời rạc theo mẫu cố định (có hạt nên ổn định giữa các lần build)
  const DROP = [
    [0.5, 9],
    [1.75, 7],
    [3, 11],
  ];
  for (let b = 0; b < 32; b++) {
    const dense = b >= 16 && b < 24;
    DROP.forEach(([x, d], i) => {
      if (!dense && (b + i) % 2) return;
      drops.note(s.bar(b) + x, C.deg(d - (b % 3)), 2.5, 50 + (i === 0 ? 8 : 0));
    });
    if (b % 2 === 0) koto.note(s.bar(b) + 3.5, C.deg(10 - (b % 4)), 3, 44);
  }

  // nhị: vuốt nhiều, ngân rung chậm
  const ERHU = ['4~:3 3:1', '2:2 3~:2', '1~:3 0:1', '-1:4', '0~:2 1:1 2:1', '3~:3 2:1', '1:2 0~:2', '0:4'].join(' | ');
  erhu.phrase(s.bar(8), C, ERHU, { vel: 82, vib: 1, legato: 1 });
  erhu.phrase(s.bar(24), C, ['2~:4', '1:2 0:2', '-1~:4', '-2:4', '0~:3 -1:1', '0:4', 'r:4', 'r:4'].join(' | '), { oct: -1, vel: 78, vib: 1, legato: 1 });
  xiao.phrase(s.bar(29), C, '4:1 3:1 2:2 | 1~:4 | 0:4', { vel: 70, vib: 1.5 });
  // C: tiêu một câu báo điềm
  xiao.phrase(s.bar(18), C, '3:3 2:1 | 1b~:4', { vel: 66, vib: 1.5 });

  return s;
}
