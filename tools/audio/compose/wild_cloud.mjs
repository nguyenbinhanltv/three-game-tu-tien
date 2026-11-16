// Vân Hải Phù Đảo (`wild_cloud`, E3-I): đảo trôi trên biển mây lúc bình minh. Trong, thoáng, cao; vẫn trầm và hơi hoài cổ (mạch tinh đã bị rút), không rộn ràng.
// 72 BPM, 4/4, cung G (G A B D E). 40 ô nhịp ≈ 2:13. Cùng khung 5 phần với wild_ochre nhưng nhạc cụ sáng hơn: sáo trúc dẫn, đàn hạc rải, chuông thủy tinh, dây nền thưa.
//
//   A  pad mở + hạc rải chậm + chuông xa
//   B  sáo hát chủ đề (lên cao, hạ nhẹ ở cuối câu)
//   C  đàn tranh đáp, dây nền dâng, nhịp trống khung rất nhẹ
//   D  sáo trở lại quãng tám trên, nhị hồ bè đáp
//   E  thưa dần về A.
import { n, Scale, Song } from './lib.mjs';

export default function wildCloud() {
  const s = new Song({ id: 'wild_cloud', bpm: 72, bars: 40, seed: 72, reverb: { macro: 4, time: 115 } });
  const G = new Scale('G4', 'gong');

  const dizi = s.track('dizi', { ch: 0, program: 75, vol: 86, pan: 0.1, reverb: 100, humanTime: 0.02 });
  const harp = s.track('harp', { ch: 1, program: 46, vol: 70, pan: -0.3, reverb: 100, humanTime: 0.02 });
  const strings = s.track('strings', { ch: 2, program: 49, vol: 58, pan: -0.05, reverb: 110, humanVel: 0 });
  const pad = s.track('pad', { ch: 3, program: 94, vol: 46, pan: 0, reverb: 120, chorus: 18, humanVel: 0 });
  const bass = s.track('bass', { ch: 4, program: 42, vol: 56, pan: 0.1, reverb: 80 });
  const drum = s.track('drum', { ch: 5, program: 116, vol: 48, pan: 0.2, reverb: 80, humanTime: 0.01, humanVel: 8 });
  const bell = s.track('bell', { ch: 6, program: 98, vol: 50, pan: 0.4, reverb: 130, humanTime: 0 });
  const koto = s.track('koto', { ch: 7, program: 107, vol: 74, pan: -0.2, reverb: 100, humanTime: 0.02 });
  const erhu = s.track('erhu', { ch: 8, program: 110, vol: 64, pan: 0.25, reverb: 110, humanTime: 0.02 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40);

  const CH = {
    G: [n('G2'), n('D3'), n('B3'), n('D4')],
    E: [n('E2'), n('B2'), n('G3'), n('B3')],
    A: [n('A2'), n('E3'), n('B3'), n('D4')],
    D: [n('D3'), n('A3'), n('D4'), n('A4')],
  };
  const MAIN = ['G', 'E', 'A', 'D'];
  const ALT = ['E', 'A', 'G', 'D'];
  const chordAt = (bar) => (bar >= 24 && bar < 32 ? ALT : MAIN)[Math.floor((bar % 8) / 2)];

  // nền: pad dài + bass nửa nhịp, dây từ phần C
  for (let b = 0; b < 40; b += 2) {
    const c = CH[chordAt(b)];
    pad.chord(s.bar(b), c, 8, 50);
    bass.note(s.bar(b), c[0], 6, 60);
    if (b >= 16 && b < 32) strings.chord(s.bar(b), c.slice(1).map((p) => p + 12), 8, 52);
  }

  // hạc rải: tám nốt đi lên rồi xuống mỗi ô (thưa lại ở phần E, nghỉ ở D)
  const ARP = [0, 1, 2, 3, 2, 3, 1, 2];
  for (let b = 0; b < 40; b++) {
    if (b >= 24 && b < 32) continue;
    const c = CH[chordAt(b)].map((p) => p + 12);
    const thin = b >= 32 ? 0.6 : 1;
    ARP.forEach((k, i) => {
      if (thin < 1 && i % 2) return;
      harp.note(s.bar(b) + i * 0.5, c[k % 4], 1.6, (i === 0 ? (b === 0 ? 52 : 70) : 54) * thin);
    });
  }

  // chuông thủy tinh xa: một nốt cao mỗi bốn ô
  for (let b = 2; b < 38; b += 4) bell.note(s.bar(b) + 1.5, n('D6') - (b % 8 === 2 ? 0 : 5), 4, 44);

  // trống khung: chỉ từ phần C, rất nhẹ
  const FRAME = [64, 0, 0, 0, 0, 0, 0, 0, 44, 0, 0, 0, 0, 0, 34, 0];
  for (let b = 16; b < 32; b++) drum.pattern(s.bar(b), s.bar(b + 1), 1 / 4, FRAME, (i) => (i === 0 ? n('G2') : n('D3')), 0.3);

  // chủ đề sáo (hướng lên, thoáng)
  const THEME = ['0:2 2:1 3:1', '4:3 r:1', '3:1 2:1 1:1 2:1', '0~:3 r:1', '2:1 3:1 4:1 5:1', '4~:3 r:1', '3:2 2:1 1:1', '0:4'].join(' | ');
  dizi.phrase(s.bar(8), G, THEME, { vel: 84, vib: 1.4 });
  dizi.phrase(s.bar(24), G, THEME, { oct: 1, vel: 78, vib: 1.4 });

  // C: đàn tranh đáp, nhịp dày hơn
  const KMEL = ['0:1/2 1:1/2 2:1 3:1 2:1', '1:2 0:2', '2:1/2 3:1/2 4:1 3:1 2:1', '3:4', '4:1/2 5:1/2 6:1 5:1 4:1', '3:2 2:2', '1:1 2:1 3:1 2:1', '0*:4'].join(' | ');
  koto.phrase(s.bar(16), G, KMEL, { vel: 80, trem: 6 });

  // D: nhị hồ bè đáp, thưa
  [25, 27, 29, 31].forEach((b) => erhu.phrase(s.bar(b) + 2, G, '2:1 3:1/2 2:1/2 1:2', { vel: 58, vib: 1 }));

  // E: câu nối về A
  koto.phrase(s.bar(38), G, '0:1/2 1:1/2 2:1/2 3:1/2 4:1/2 3:1/2 2:1/2 1:1/2 | 0:4', { vel: 52 });

  return s;
}
