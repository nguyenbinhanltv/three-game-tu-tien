// Sinh mỹ thuật sàn chín phòng cầu Cửu Kiều (TN-7): packages/shared/src/props.kieu.ts, tất định.
//   node tools/maps/gen-kieu-arena.mjs   (rồi prettier --write, pnpm content:check)
// Chín phòng cầu dùng chung một bãi phẳng của địa hình `cuu_kieu` (tâm 1300, 985; sàn `bound` 70 m; xem gen-kieu-rooms.mjs), nên bãi cỏ trống là mặt bằng chung.
// Ở đây mỗi cầu có bố cục prop riêng quanh sàn: vòng trụ đá + đèn lồng ở mép, bốn bia mốc, và một cụm chủ đề đúng cơ chế của cầu.
// Prop chỉ để nhìn (không `r`, không va chạm): ranh giới do `bound` giữ. Cụm chủ đề đặt cách tâm >= 30 m (cầu 3, sân Ngũ Suy: >= 46 m; cầu 4 công tắc ở <= 22 m) và ngoài các điểm sinh quái/boss (spawn người chơi
// ở (1300, 1040), boss đứng gần tâm) để không che người chơi hay vạch báo. Chủ đề ánh sáng (mood) theo bảng KIEU_MOOD (cùng file).
// Tên cầu theo glossary.cuuKieuTen; mood dùng bốn mood ck_* của Thiên Lộ Giới (nhịp ngày trải dài theo chín cầu: bình minh → ngày → hoàng hôn → đêm → bình minh Đạp Thiên).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CX = 1300;
const CZ = 985;
const PI = Math.PI;
const r2 = (v) => Math.round(v * 100) / 100;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mood theo cầu: 1 ngày, 2 hoàng hôn (đối đầu chính mình), 3 đêm (suy kiệt), 4 bình minh (hai mặt), 5 ngày (thể phách), 6 hoàng hôn, 7–8 đêm (kiếp), 9 bình minh (Đạp Thiên). */
const MOOD = ['ck_day', 'ck_dusk', 'ck_night', 'ck_dawn', 'ck_day', 'ck_dusk', 'ck_night', 'ck_night', 'ck_dawn'];

const at = (r, a, id, s = 1, face = 'out') => ({
  id,
  x: r2(CX + Math.cos(a) * r),
  z: r2(CZ + Math.sin(a) * r),
  yaw: r2(face === 'out' ? -a + PI / 2 : face === 'in' ? -a - PI / 2 : face),
  s,
});

/** Khung chung: 16 trụ đá + 16 đèn xen kẽ ở mép sàn (r 64), 4 bia ở bốn hướng (r 56), (không đặt gì ở giữa sàn: boss, vạch báo, công tắc cầu 4, sân kiếp cầu 3 dựng ở đó). */
function frame(R) {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2 + 0.05;
    out.push(at(67, a, 'prop_tru_da_khac_van', 0.9 + R() * 0.2));
    out.push(at(67, a + PI / 16, 'prop_den_long_troi', 1));
  }
  for (let i = 0; i < 4; i++) out.push(at(56, (i / 4) * PI * 2 + PI / 4, 'prop_bia_da', 1.15));
  return out;
}

/** Cụm chủ đề theo cầu (id lấy từ assets/source/prop). */
const THEME = {
  // 1 Thạch: đá vụn rải quanh sàn như cầu vừa nứt
  1: (R) => ring(R, 10, 36, 52, 'prop_da_dung', 0.8, 1.3).concat(ring(R, 8, 30, 44, 'prop_da_nam', 0.8, 1.2)),
  // 2 Kiếm Ảnh: kiếm gãy cắm thành vòng quanh sàn, đối đầu chính mình
  2: (R) => ring(R, 14, 31, 31, 'prop_kiem_gay', 1, 1.4).concat(ring(R, 6, 46, 50, 'prop_kiem_kinh_quang', 0.8, 1)),
  // 3 Suy: gốc khô, cỏ rũ, đá nằm (suy kiệt)
  3: (R) => ring(R, 10, 46, 54, 'prop_cay_goc_kho', 0.9, 1.3).concat(ring(R, 8, 46, 52, 'prop_duong_xi', 0.9, 1.4)),
  // 4 Giới: hai dãy gương đối xứng qua trục, Âm/Dương
  4: () => mirror('prop_anh_ngoc_kinh', 1.2).concat(mirror('prop_phu_dao_dinh', 1)),
  // 5 Thân: trụ đá lớn quanh sàn như đấu trường thể phách
  5: (R) => ring(R, 8, 34, 34, 'prop_tru_da_khac_van', 1.4, 1.6).concat(ring(R, 10, 46, 52, 'prop_da_dung', 1, 1.4)),
  // 6 Đạo: sáu bia đạo ứng sáu nguồn, lư hương
  6: () =>
    Array.from({ length: 6 }, (_, i) => at(38, (i / 6) * PI * 2, 'prop_tung_phu_dao', 1.1)).concat(
      Array.from({ length: 3 }, (_, i) => at(32, (i / 3) * PI * 2 + 0.5, 'prop_lu_huong', 1.2)),
    ),
  // 7 Ngoại Kiếp: cột mạch tinh hứng lôi
  7: (R) => ring(R, 10, 36, 44, 'prop_mach_tinh_tru', 1.1, 1.5).concat(ring(R, 8, 52, 54, 'prop_tru_nham_do', 1, 1.3)),
  // 8 Nội Kiếp: bóng đèn tụ hồn quanh sàn
  8: (R) => ring(R, 12, 34, 34, 'prop_den_long_troi', 1.2, 1.6).concat(ring(R, 6, 48, 50, 'prop_than_nien_chau', 0.8, 1)),
  // 9 Đạp Thiên: cầu mây gãy và bia Lộ dẫn lên, đạo kiếm sáng ở bốn phương
  9: (R) =>
    ring(R, 4, 42, 44, 'prop_cau_may', 1.2, 1.5)
      .concat(ring(R, 4, 50, 52, 'prop_cau_da_gay', 1, 1.2))
      .concat(ring(R, 8, 32, 34, 'prop_kiem_kinh_quang_cuoi', 0.9, 1.1)),
};

function ring(R, n, r0, r1, id, s0, s1) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * PI * 2 + R() * 0.35;
    return at(r0 + R() * (r1 - r0), a, id, s0 + R() * (s1 - s0), R() * PI * 2);
  });
}

/** Hai dãy đối xứng qua trục dọc (x = CX): trái và phải, 5 vị trí mỗi bên. */
function mirror(id, s) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const z = CZ - 40 + i * 20;
    for (const sx of [-1, 1]) out.push({ id, x: r2(CX + sx * 36), z: r2(z), yaw: r2(sx > 0 ? -PI / 2 : PI / 2), s });
  }
  return out;
}

/** Sảnh vào (camera chéo ?cam=iso chỉ thấy ~10 m quanh nhân vật): hai đèn và hai bia thấp quanh chỗ sinh (1300, 1040). Chỉ prop thấp. */
function plaza() {
  const out = [];
  for (const sx of [-1, 1]) {
    out.push({ id: 'prop_den_long_troi', x: r2(1300 + sx * 5.5), z: 1034, yaw: 0, s: 1 });
    out.push({ id: 'prop_bia_da', x: r2(1300 + sx * 7.5), z: 1042, yaw: r2(-sx * 0.5), s: 0.8 });
  }
  return out;
}

/** Cụm thấp quanh r 13–19 để thấy trong khung iso: đá nằm, kiếm gãy, gốc khô… theo chủ đề; tránh công tắc cầu 4 (góc -90°, 30°, 150° ở r 22). */
const LOW = {
  1: 'prop_da_nam',
  2: 'prop_kiem_gay',
  4: 'prop_anh_ngoc_kinh',
  5: 'prop_da_dung',
  6: 'prop_lu_huong',
  7: 'prop_mach_tinh_tru',
  8: 'prop_den_long_troi',
  9: 'prop_kiem_kinh_quang_cuoi',
};
function inner(n, R) {
  if (n === 3) return [];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.3 + R() * 0.3;
    if (n === 4 && [-PI / 2, PI / 6, (5 * PI) / 6].some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.45)) continue;
    out.push(at(14 + R() * 5, a, LOW[n], 0.8 + R() * 0.3, R() * PI * 2));
  }
  return out;
}

const all = {};
for (let n = 1; n <= 9; n++) {
  const R = rng(20261123 + n * 7919);
  // Chừa cung phía nam (chỗ người chơi vào, camera đứng sau lưng): không prop nào cách tâm > 40 m trong ±0,6 rad quanh hướng +z.
  const keep = (q) => {
    const d = Math.hypot(q.x - CX, q.z - CZ);
    return d <= 40 || Math.abs(Math.atan2(q.z - CZ, q.x - CX) - PI / 2) > 0.6;
  };
  all[`kieu_${n}`] = [...frame(R), ...THEME[n](R)].filter(keep).concat(plaza(), inner(n, R));
}

const body = Object.entries(all)
  .map(
    ([k, v]) => `  ${k}: [\n${v.map((p) => `    { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${r2(p.s)} },`).join('\n')}\n  ],`,
  )
  .join('\n');
const text = `// Prop sàn chín phòng cầu Cửu Kiều (TN-7). SINH BẰNG tools/maps/gen-kieu-arena.mjs: sửa ở đó rồi chạy lại.
// Chỉ để nhìn (không va chạm); xem ghi chú đầu script về bố cục.
import type { HandProp } from './props.types';

/** Mood ánh sáng của cầu 1..9 (ghi đè \`assets.mood\` của \`kieu_<n>\` ở \`@dtl/content\`). */
export const KIEU_MOOD: readonly string[] = ${JSON.stringify(MOOD)};

export const KIEU_PROPS: Readonly<Record<string, readonly HandProp[]>> = {
${body}
};
`;
fs.writeFileSync(path.join(ROOT, 'packages/shared/src/props.kieu.ts'), text);
console.log(
  'props.kieu.ts:',
  Object.entries(all)
    .map(([k, v]) => `${k}=${v.length}`)
    .join(' '),
);
