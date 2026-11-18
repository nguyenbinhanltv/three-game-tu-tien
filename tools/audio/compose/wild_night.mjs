// Thiên Khuyết Cổ Thành (`wild_night`, E4-I): thành cổ của Cựu Thiên Điện dưới đêm sao, đèn trời vàng nhạt dọc đại lộ, tượng đá nghiêng đổ. Trang nghiêm, lạnh, cô tịch.
// 60 BPM, 4/4, vũ điệu A (A C D E G). 40 ô nhịp ≈ 2:40. Chậm hơn Đoạn Mạch/Vân Hải: dàn hợp xướng xa như tiếng vọng điện cũ, đàn hạc gảy từng giọt như sao rơi,
// nhị hồ trầm dẫn, chuông thủy tinh thưa, KHÔNG có trống (đêm vắng); chiến đấu dùng `combat` như các bài chưa có stem.
//
//   A  pad lạnh + hạc rải giọt + chuông sao xa
//   B  nhị hồ hát chủ đề (câu hỏi, dừng lâu)
//   C  hợp xướng vọng vào, hạc dày lên, sáo thở đáp
//   D  nhị hồ quãng tám trên, dây nền dâng
//   E  thưa dần về A.
import { n, Scale, Song } from './lib.mjs';

export default function wildNight() {
  const s = new Song({ id: 'wild_night', bpm: 60, bars: 40, seed: 60, reverb: { macro: 4, time: 130 } });
  const A = new Scale('A3', 'yu');

  const erhu = s.track('erhu', { ch: 0, program: 110, vol: 80, pan: 0.1, reverb: 110, humanTime: 0.02 });
  const harp = s.track('harp', { ch: 1, program: 46, vol: 72, pan: -0.3, reverb: 110, humanTime: 0.02 });
  const strings = s.track('strings', { ch: 2, program: 49, vol: 56, pan: -0.05, reverb: 120, humanVel: 0 });
  const pad = s.track('pad', { ch: 3, program: 89, vol: 46, pan: 0, reverb: 130, chorus: 18, humanVel: 0 });
  const bass = s.track('bass', { ch: 4, program: 42, vol: 60, pan: 0.1, reverb: 80 });
  const choir = s.track('choir', { ch: 5, program: 52, vol: 40, pan: 0, reverb: 140, humanVel: 0 });
  const bell = s.track('bell', { ch: 6, program: 8, vol: 50, pan: 0.4, reverb: 140, humanTime: 0 });
  const dizi = s.track('dizi', { ch: 7, program: 77, vol: 62, pan: 0.3, reverb: 120, humanTime: 0.02 });

  s.section('A', 0, 8).section('B', 8, 16).section('C', 16, 24).section('D', 24, 32).section('E', 32, 40);

  const CH = {
    A: [n('A2'), n('E3'), n('C4'), n('E4')],
    D: [n('D3'), n('A3'), n('D4'), n('F4')],
    G: [n('G2'), n('D3'), n('G3'), n('D4')],
    F: [n('F2'), n('C3'), n('A3'), n('C4')],
  };
  const MAIN = ['A', 'D', 'F', 'A'];
  const ALT = ['D', 'G', 'F', 'A'];
  const chordAt = (bar) => (bar >= 24 && bar < 32 ? ALT : MAIN)[Math.floor((bar % 8) / 2)];

  // nền: pad dài, bass nửa nhịp, dây từ phần D
  for (let b = 0; b < 40; b += 2) {
    const c = CH[chordAt(b)];
    pad.chord(s.bar(b), c, 8, 50);
    bass.note(s.bar(b), c[0], 7, 62);
    if (b >= 24 && b < 32)
      strings.chord(
        s.bar(b),
        c.slice(1).map((p) => p + 12),
        8,
        54,
      );
    if (b >= 16 && b < 32) choir.chord(s.bar(b), [c[1], c[2]], 8, 44);
  }

  // hạc gảy giọt: một nốt mỗi hai phách, cách quãng rộng như sao rơi
  const ARP = [0, 3, 2, 1];
  for (let b = 0; b < 40; b++) {
    if (b >= 8 && b < 16 && b % 2) continue;
    const c = CH[chordAt(b)].map((p) => p + 12);
    const thin = b >= 34 ? 0.6 : 1;
    ARP.forEach((k, i) => {
      if (i % 2 && b < 16) return;
      if (thin < 1 && i % 2) return;
      harp.note(s.bar(b) + i, c[k], 2.4, (i === 0 ? 72 : 58) * thin);
    });
  }

  // chuông sao xa: một nốt cao mỗi ba ô
  for (let b = 1; b < 38; b += 3) bell.note(s.bar(b) + 2, n('E6') - (b % 2 ? 0 : 7), 4, 46);

  // chủ đề nhị hồ (hỏi, dừng dài)
  const THEME = ['2:3 r:1', '1:1 2:1 3:2', '4:2 3:1 2:1', '1~:4', '3:1 2:1 1:1 0:1', '1~:3 r:1', '0:2 -1:1 0:1', '-2:4'].join(' | ');
  erhu.phrase(s.bar(8), A, THEME, { vel: 82, vib: 1.8 });
  erhu.phrase(s.bar(24), A, THEME, { oct: 1, vel: 78, vib: 1.8 });

  // C: sáo thở đáp chủ đề
  const DMEL = ['4:2 3:1 2:1', '1:3 r:1', '2:1 3:1 4:1 5:1', '4~:4', '3:2 2:2', '1:2 0:2', '2:1 1:1 0:2', '0*:4'].join(' | ');
  dizi.phrase(s.bar(16), A, DMEL, { vel: 66, vib: 1 });

  // E: câu nối về A
  harp.phrase(s.bar(38), A, '0:1/2 1:1/2 2:1/2 3:1/2 4:1/2 3:1/2 2:1/2 1:1/2 | 0:4', { vel: 54 });

  return s;
}
