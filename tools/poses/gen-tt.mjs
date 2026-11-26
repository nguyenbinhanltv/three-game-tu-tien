// Thân Pháp TP-3a: sinh 4 pose GỐC quyền riêng cho Thể tu (voice `tt`), thay các pose `*_tt` cũ vốn là biến thể pose kiếm (vẫn mang khóa sword/edge).
//   node tools/poses/gen-tt.mjs   rồi   node tools/poses/thanphap.mjs kiem_khi_tram_tt,phi_kiem_tt,phi_kiem_2_tt,phi_kiem_3_tt   (sinh bản _tp)
// Quy ước (packages/shared/src/pose.ts): xoay Y dương = vai phải ra trước (đấm tay phải trúng: hông xoay dương, dồn lực: âm; tay trái ngược lại);
// hips.pos: y âm = hạ trọng tâm (gối khuỵu), z dương = lao tới; tay/chân tính theo hông LÚC NGHỈ nên hông lao tới thì tay với xa hơn.
// Thời gian tổng và khung trúng `hit` giữ đúng pose kiếm cũ (nhịp combat/FX không đổi). 9 khung: 0 thế thủ · 1 dồn nhẹ · 2 dồn sâu (hạ gối, xoay hông ngược) ·
// 3 giữ · 4 TRÚNG 1 (quartOut) · 5 RÚT ngay (+60 ms) · 6 TRÚNG 2 (ở hit[1]) · 7 thu · 8 về thế thủ.
// Bản `_tp` (thanphap.mjs) bỏ khung 5 và GIỮ đỉnh 58 ms: +30 ms sau va chạm bản gốc đã rút khoảng một nửa còn `_tp` vẫn duỗi hết cỡ.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/content/data/poses');
const r = (a) => JSON.stringify(a);
/** Hệ số bù độ cao tay theo độ hạ hông (xem `write`). */
const HAND_Y_COMP = 1.6;

/** Thế thủ: orthodox (trái trước), nắm đấm ngang cằm-ngực, khuỷu khép. */
const G = {
  hips: { pos: [0, -0.1, 0], rot: [0, -8, 0] },
  spine: [8, -6, 0],
  head: [0, 6, 0],
  handR: [-0.14, 0.36, 0.3],
  elbowR: [-0.3, -0.9, -0.1],
  // `sword` = hướng cẳng tay/nắm đấm tay phải (không có lưỡi): thiếu khóa này bộ giải IK mặc định dựng tay như cầm kiếm dựng đứng (cẳng tay hướng lên trời).
  sword: [0.1, 0.35, 1],
  edge: [0, -1, 0],
  handL: [0.12, 0.38, 0.34],
  elbowL: [0.3, -0.9, -0.1],
  footR: [-0.14, 0, -0.12],
  footL: [0.12, 0, 0.22],
};

/** Key từ thế thủ + ghi đè. */
const K = (t, o = {}, ease = 'inOut') => ({ t, ease, ...G, ...o, hips: { ...G.hips, ...(o.hips ?? {}) } });

function write(id, duration, hit, keys, sw = {}) {
  for (const [i, v] of Object.entries(sw)) keys[Number(i)].sword = v;
  // Bù lệch retarget Mixamo→Mannequin (đo bằng `window.__animlab` trên pose kiếm cũ và pose này): khi hông hạ `d` m, cổ tay thật cao hơn lệnh ~1,6·d m
  // (hạ hông 0,17 m → tay cao hơn 0,3 m: nắm đấm bị nâng lên quá đầu). Hạ lệnh y của hai tay đúng mức đó để tay thật rơi vào tầm vai-ngực.
  for (const k of keys) {
    const comp = HAND_Y_COMP * k.hips.pos[1];
    k.handR = [k.handR[0], Math.round((k.handR[1] + comp) * 1000) / 1000, k.handR[2]];
    k.handL = [k.handL[0], Math.round((k.handL[1] + comp) * 1000) / 1000, k.handL[2]];
  }
  const first = { ...keys[0] };
  delete first.ease;
  const ks = [first, ...keys.slice(1)];
  const row = (k) => {
    const parts = [`"t":${k.t}`];
    if (k.ease) parts.push(`"ease":"${k.ease}"`);
    parts.push(`"hips":{ "pos":${r(k.hips.pos)}, "rot":${r(k.hips.rot)}}`);
    for (const f of ['spine', 'head', 'handR', 'elbowR', 'sword', 'edge', 'handL', 'elbowL', 'footR', 'footL'])
      parts.push(`"${f}":${r(k[f])}`);
    return `    { ${parts.join(', ')} }`;
  };
  const txt = `{\n  "id": "${id}",\n  "duration": ${duration},\n  "loop": false,\n  "hit": ${r(hit)},\n  "keys": [\n${ks.map(row).join(',\n')}\n  ]\n}\n`;
  fs.writeFileSync(path.join(DIR, `${id}.json`), txt);
  console.log('ghi', id, ks.length, 'key');
}

const round3 = (x) => Math.round(x * 1000) / 1000;
// Khung 4 cách đỉnh 0,07 s (đường đấm ≤ 0,08 s), khung 3 → 4 giữ 0,05 s, khung 2 = 0,35 × khung 4 (cùng công thức K-5).
const T9 = (hit, hit2, dur) => {
  const f4 = round3(hit - 0.07);
  return [0, round3(0.35 * f4), round3(f4 - 0.05), f4, hit, round3(hit + 0.06), hit2, round3(hit2 + (dur - hit2) * 0.5), dur];
};

// 1) phi_kiem_tt — đòn 1: thẳng tay phải (cross) rồi móc trái. hit 0,26 / 0,42.
{
  const t = T9(0.26, 0.42, 0.8);
  const load = {
    hips: { pos: [0, -0.19, -0.03], rot: [0, -32, 0] },
    spine: [10, -20, 0],
    head: [0, 12, 0],
    handR: [-0.2, 0.24, 0.02],
    elbowR: [-0.6, -0.5, -0.6],
  };
  write(
    'phi_kiem_tt',
    0.8,
    [0.26, 0.42],
    [
      K(t[0]),
      K(t[1], {
        hips: { pos: [0, -0.14, -0.01], rot: [0, -20, 0] },
        spine: [9, -12, 0],
        head: [0, 8, 0],
        handR: [-0.18, 0.3, 0.14],
        elbowR: [-0.5, -0.7, -0.4],
      }),
      K(t[2], load),
      K(t[3], load, 'linear'),
      // trúng 1: hạ trọng tâm + lao tới, hông xoay dương, nắm đấm phải duỗi hết cỡ dẫn đường, tay trái kéo về hông
      K(
        t[4],
        {
          hips: { pos: [0, -0.2, 0.14], rot: [0, 28, 0] },
          spine: [14, 22, 0],
          head: [0, -10, 0],
          handR: [-0.12, 0.42, 0.62],
          elbowR: [-0.4, -0.7, 0.1],
          handL: [0.2, 0.08, 0.1],
          elbowL: [0.5, -0.5, -0.8],
          footL: [0.14, 0, 0.34],
        },
        'quartOut',
      ),
      // rút tay phải về thủ, gồng móc trái
      K(t[5], {
        hips: { pos: [0, -0.15, 0.05], rot: [0, 6, 0] },
        spine: [10, 2, 0],
        head: [0, -2, 0],
        handR: [-0.14, 0.34, 0.28],
        elbowR: [-0.3, -0.9, -0.1],
        handL: [0.34, 0.26, 0.1],
        elbowL: [0.9, -0.3, -0.2],
        footL: [0.14, 0, 0.3],
      }),
      // trúng 2: móc trái ngang, hông xoay âm
      K(
        t[6],
        {
          hips: { pos: [0, -0.2, 0.12], rot: [0, -34, 0] },
          spine: [14, -24, 0],
          head: [0, 12, 0],
          handR: [-0.14, 0.34, 0.28],
          handL: [-0.04, 0.42, 0.52],
          elbowL: [0.8, 0.15, 0],
          footL: [0.14, 0, 0.3],
        },
        'out',
      ),
      K(t[7], { hips: { pos: [0, -0.13, 0.04], rot: [0, -14, 0] }, spine: [9, -8, 0], footL: [0.12, 0, 0.26] }),
      K(t[8]),
    ],
    { 1: [0, 0.2, 0.7], 2: [0, 0.1, 0.4], 3: [0, 0.1, 0.4], 4: [0, 0, 1] },
  );
}

// 2) kiem_khi_tram_tt — hoành quyền: móc phải quét ngang rồi thẳng trái. hit 0,28 / 0,44, dài 0,9.
{
  const t = T9(0.28, 0.44, 0.9);
  const load = {
    hips: { pos: [0, -0.2, -0.03], rot: [0, -36, 0] },
    spine: [10, -22, 0],
    head: [0, 14, 0],
    handR: [-0.52, 0.4, -0.08],
    elbowR: [-0.9, 0.1, -0.3],
  };
  write(
    'kiem_khi_tram_tt',
    0.9,
    [0.28, 0.44],
    [
      K(t[0]),
      K(t[1], {
        hips: { pos: [0, -0.14, -0.01], rot: [0, -22, 0] },
        spine: [9, -14, 0],
        head: [0, 10, 0],
        handR: [-0.36, 0.38, 0.0],
        elbowR: [-0.8, -0.2, -0.3],
      }),
      K(t[2], load),
      K(t[3], load, 'linear'),
      // trúng 1: móc phải quét ngang qua người, hông lao tới xoay mạnh
      K(
        t[4],
        {
          hips: { pos: [0, -0.22, 0.14], rot: [0, 34, 0] },
          spine: [14, 26, 0],
          head: [0, -12, 0],
          handR: [0.02, 0.42, 0.6],
          elbowR: [-0.1, 0.2, 0],
          handL: [0.2, 0.08, 0.1],
          elbowL: [0.5, -0.5, -0.8],
          footL: [0.14, 0, 0.36],
        },
        'quartOut',
      ),
      K(t[5], {
        hips: { pos: [0, -0.16, 0.06], rot: [0, 4, 0] },
        spine: [10, 0, 0],
        handR: [-0.14, 0.34, 0.28],
        elbowR: [-0.3, -0.9, -0.1],
        handL: [0.2, 0.2, 0.12],
        elbowL: [0.6, -0.6, -0.5],
        footL: [0.14, 0, 0.3],
      }),
      // trúng 2: thẳng trái, tay phải về hông
      K(
        t[6],
        {
          hips: { pos: [0, -0.2, 0.12], rot: [0, -28, 0] },
          spine: [14, -22, 0],
          head: [0, 10, 0],
          handL: [0.14, 0.42, 0.62],
          elbowL: [0.4, -0.7, 0.1],
          handR: [-0.2, 0.08, 0.1],
          elbowR: [-0.5, -0.5, -0.8],
          footL: [0.14, 0, 0.32],
        },
        'out',
      ),
      K(t[7], { hips: { pos: [0, -0.13, 0.04], rot: [0, -12, 0] }, spine: [9, -8, 0], footL: [0.12, 0, 0.26] }),
      K(t[8]),
    ],
    { 1: [-0.2, 0.1, 0.4], 2: [-0.5, 0.05, 0.2], 3: [-0.5, 0.05, 0.2], 4: [0.6, 0, 0.8] },
  );
}

// 3) phi_kiem_2_tt — đòn 2: móc trái rồi móc ngược (uppercut) phải. hit 0,26 / 0,42.
{
  const t = T9(0.26, 0.42, 0.8);
  const load = {
    hips: { pos: [0, -0.19, -0.03], rot: [0, 34, 0] },
    spine: [10, 22, 0],
    head: [0, -14, 0],
    handL: [0.54, 0.4, -0.08],
    elbowL: [0.9, 0.1, -0.3],
  };
  write(
    'phi_kiem_2_tt',
    0.8,
    [0.26, 0.42],
    [
      K(t[0]),
      K(t[1], {
        hips: { pos: [0, -0.14, -0.01], rot: [0, 20, 0] },
        spine: [9, 12, 0],
        head: [0, -8, 0],
        handL: [0.36, 0.38, 0.0],
        elbowL: [0.8, -0.2, -0.3],
      }),
      K(t[2], load),
      K(t[3], load, 'linear'),
      // trúng 1: móc trái quét ngang, hông xoay âm
      K(
        t[4],
        {
          hips: { pos: [0, -0.2, 0.14], rot: [0, -34, 0] },
          spine: [14, -26, 0],
          head: [0, 12, 0],
          handL: [-0.02, 0.42, 0.6],
          elbowL: [0.1, 0.2, 0],
          handR: [-0.2, 0.08, 0.1],
          elbowR: [-0.5, -0.5, -0.8],
          footL: [0.14, 0, 0.34],
        },
        'quartOut',
      ),
      // hạ thấp, tay phải xuống thấp gồng móc ngược
      K(t[5], {
        hips: { pos: [0, -0.22, 0.08], rot: [0, 6, 0] },
        spine: [16, 4, 0],
        head: [0, -2, 0],
        handR: [-0.14, 0.15, 0.3],
        elbowR: [-0.2, -1, 0],
        handL: [0.12, 0.34, 0.3],
        footL: [0.14, 0, 0.3],
      }),
      // trúng 2: móc ngược phải từ dưới lên cằm
      K(
        t[6],
        {
          hips: { pos: [0, -0.2, 0.14], rot: [0, 26, 0] },
          spine: [8, 18, 0],
          head: [0, -10, 0],
          handR: [-0.1, 0.5, 0.46],
          elbowR: [-0.2, -0.9, 0.2],
          handL: [0.2, 0.2, 0.2],
          elbowL: [0.5, -0.7, -0.5],
          footL: [0.14, 0, 0.32],
        },
        'out',
      ),
      K(t[7], { hips: { pos: [0, -0.13, 0.04], rot: [0, 4, 0] }, spine: [9, 2, 0], footL: [0.12, 0, 0.26] }),
      K(t[8]),
    ],
    { 5: [0, 0.4, 0.9], 6: [0, 0.9, 0.4] },
  );
}

// 4) phi_kiem_3_tt — đòn 3 (kết): bước lao dài, thẳng phải rồi chưởng trái (lòng bàn tay) đẩy. hit 0,26 / 0,42.
{
  const t = T9(0.26, 0.42, 0.8);
  const load = {
    hips: { pos: [0, -0.22, -0.05], rot: [0, -36, 0] },
    spine: [12, -22, 0],
    head: [0, 14, 0],
    handR: [-0.22, 0.22, -0.02],
    elbowR: [-0.7, -0.5, -0.7],
    footL: [0.12, 0, 0.18],
    footR: [-0.16, 0, -0.16],
  };
  write(
    'phi_kiem_3_tt',
    0.8,
    [0.26, 0.42],
    [
      K(t[0]),
      K(t[1], {
        hips: { pos: [0, -0.16, -0.02], rot: [0, -20, 0] },
        spine: [10, -12, 0],
        head: [0, 8, 0],
        handR: [-0.2, 0.28, 0.1],
        elbowR: [-0.6, -0.6, -0.5],
        footR: [-0.15, 0, -0.14],
      }),
      K(t[2], load),
      K(t[3], load, 'linear'),
      // trúng 1: bước lao dài, thẳng phải dẫn đường
      K(
        t[4],
        {
          hips: { pos: [0, -0.26, 0.22], rot: [0, 32, 0] },
          spine: [16, 24, 0],
          head: [0, -12, 0],
          handR: [-0.1, 0.42, 0.62],
          elbowR: [-0.4, -0.7, 0.1],
          handL: [0.2, 0.08, 0.1],
          elbowL: [0.5, -0.5, -0.8],
          footL: [0.14, 0, 0.44],
          footR: [-0.16, 0, -0.2],
        },
        'quartOut',
      ),
      K(t[5], {
        hips: { pos: [0, -0.2, 0.12], rot: [0, 6, 0] },
        spine: [12, 2, 0],
        handR: [-0.2, 0.3, 0.2],
        elbowR: [-0.4, -0.8, -0.3],
        handL: [0.14, 0.3, 0.2],
        elbowL: [0.4, -0.8, -0.3],
        footL: [0.14, 0, 0.4],
        footR: [-0.16, 0, -0.18],
      }),
      // trúng 2: chưởng trái đẩy thẳng, hông xoay âm, vai trái dẫn
      K(
        t[6],
        {
          hips: { pos: [0, -0.26, 0.2], rot: [0, -30, 0] },
          spine: [16, -22, 0],
          head: [0, 10, 0],
          handL: [0.1, 0.44, 0.62],
          elbowL: [0.4, -0.7, 0.1],
          handR: [-0.2, 0.1, 0.1],
          elbowR: [-0.5, -0.5, -0.8],
          footL: [0.14, 0, 0.44],
          footR: [-0.16, 0, -0.2],
        },
        'out',
      ),
      K(t[7], { hips: { pos: [0, -0.14, 0.08], rot: [0, -12, 0] }, spine: [9, -8, 0], footL: [0.12, 0, 0.3], footR: [-0.14, 0, -0.14] }),
      K(t[8]),
    ],
    { 1: [0, 0.2, 0.7], 2: [0, 0.1, 0.4], 3: [0, 0.1, 0.4], 4: [0, 0, 1] },
  );
}
