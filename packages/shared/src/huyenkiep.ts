// Huyền Kiếp (TN-6): chín kiếp nhỏ chia ba chuỗi (ba room độ kiếp): Ngoại kiếp → Nội kiếp → Hồn kiếp, mỗi chuỗi ba kiếp nhỏ.
// Hàm thuần dùng chung server (phán định ở apps/server/src/game/tribhuyen.ts) và client (HUD, dấu trên sân). Dữ liệu ở `tribulations.json`
// (`huyen_ngoai|huyen_noi|huyen_hon`, mỗi pha một kiếp nhỏ, bốn số chung ở khối `suy`, thông số riêng ở khối `hk`).
//
// Dùng lại khung kiếp chuỗi và thanh 0..100 của Thiên Nhân Ngũ Suy (`ngusuy.ts`): thanh ở đây gọi là "kiếp lực", tự tăng, chạm 100 là thất bại;
// mỗi kiếp nhỏ một thao tác riêng kéo thanh xuống. Tên chín kiếp lấy từ `glossary.huyenKiep`; cơ chế tự thiết kế.

import { TRIB_DEFS, type TribDef, type TribId } from './tribulation';
import { suyCleared } from './ngusuy';

/** Ba chuỗi theo thứ tự phải qua. */
export const HUYEN_CHAINS = ['huyen_ngoai', 'huyen_noi', 'huyen_hon'] as const satisfies readonly TribId[];
export type HuyenChain = (typeof HUYEN_CHAINS)[number];

/** Cơ chế của chín kiếp nhỏ, theo thứ tự chuỗi × pha. */
export const HK_MECHANICS = [
  'hk_tuyet',
  'hk_phong',
  'hk_loi',
  'hk_tram_ly',
  'hk_huyet_anh',
  'hk_van_tam',
  'hk_kho_than',
  'hk_hon_tho',
  'hk_luan_hoi',
] as const;
export type HkMechanic = (typeof HK_MECHANICS)[number];

export function isHkMechanic(id: string | undefined): id is HkMechanic {
  return (HK_MECHANICS as readonly string[]).includes(id ?? '');
}

/**
 * Thông số riêng (khối `hk`) mỗi cơ chế phải có, đều là số dương. Ý nghĩa:
 *  - hk_tuyet (Tuyết Kiếp): đứng yên thì hàn khí thấm. Chạy từ `still` m/s trở lên trong bán kính `r` quanh tâm: thanh giảm `cure` %/s; chậm hơn: tăng thêm `cold`.
 *    Mỗi `driftEvery` giây một đụn tuyết bán kính `driftR` hiện trong vòng `ring` (sống `driftDur` giây, tối đa `drifts`); giẫm vào: thanh tăng `driftHurt` %/s.
 *  - hk_phong (Phong Kiếp): `pillars` trụ chắn gió trên vòng `ring`. Mỗi `every` giây một trận cương phong báo hướng trước `warn` giây; lúc thổi tới, đứng
 *    sau một trụ (cách trụ không quá `depth` m theo chiều gió, lệch ngang không quá `shelterR`): thanh giảm `cure`; không: tăng `hurt`, mất `pct` khí huyết.
 *  - hk_loi (Lôi Kiếp): lôi lực tích trong người. `rods` Dẫn Lôi Trụ trên vòng `ring`; chạm trụ nguội (trong `r` m): thanh giảm `cure`, trụ nóng `hot` giây
 *    và sau `boomWarn` giây nổ vòng `boomR` (mất `pct` khí huyết, thanh tăng `hurt` nếu còn đứng đó).
 *  - hk_tram_ly (Trảm Ly Kiếp): giữ mình trong vòng `r` quanh Bản Mệnh Ấn (trong: giảm `cure` %/s; ngoài: tăng `out` %/s) trong lúc mỗi `every` giây một
 *    vạch kiếm vô hình dài `len` rộng `w` chém ngang chỗ đang đứng (báo `warn` giây; trúng: tăng `hurt`, mất `pct`).
 *  - hk_huyet_anh (Huyết Ảnh Kiếp): Huyết Ảnh (khí huyết `hpFrac` × của chủ) hiện ra; hạ nó: thanh giảm `kill`, con kế hiện sau `respawn` giây; bị nó đánh trúng: tăng `hurt`.
 *  - hk_van_tam (Vấn Tâm Kiếp): `seals` ấn trên vòng `ring` (bán kính `r`). Mỗi `every` giây: ấn thật sáng `show` giây rồi các ấn xoay vòng đổi chỗ; hết `think` giây
 *    đứng đúng ấn thật: giảm `cure`; sai: tăng `hurt`, mất `pct`.
 *  - hk_kho_than (Thập Tức Khô Thần): `beats` nhịp tức, cách nhau `every` giây. Điều tức (phím X) trong ±`win` giây quanh nhịp: giảm `cure`; lệch nhịp: tăng `hurt`; bỏ nhịp: tăng `miss`.
 *  - hk_hon_tho (Hồn Thọ Kiếp): khí huyết rỉ `bleed` × thanh mỗi giây. Mỗi `every` giây một Hồn Châu hiện trong vòng `ring` (sống `life` giây, tối đa `orbs`);
 *    chạm vào (trong `r` m): giảm `cure`, hồi `heal` khí huyết tối đa.
 *  - hk_luan_hoi (Luân Hồi Kiếp): vòng luân hồi `sectors` cung bán kính `r`, một cung sinh xoay `speed` rad/s. Mỗi `every` giây vòng nghiền một lần (báo `warn` giây):
 *    đứng trong cung sinh: giảm `cure`; ngoài: tăng `hurt`, mất `pct`. Sau mỗi lần nghiền cung sinh đổi chiều xoay.
 */
export const HK_PARAMS: Record<HkMechanic, readonly string[]> = {
  hk_tuyet: ['still', 'r', 'cure', 'cold', 'drifts', 'driftR', 'driftEvery', 'driftDur', 'driftHurt', 'ring'],
  hk_phong: ['pillars', 'ring', 'every', 'warn', 'shelterR', 'depth', 'pct', 'hurt', 'cure'],
  hk_loi: ['rods', 'ring', 'r', 'cure', 'hot', 'boomWarn', 'boomR', 'pct', 'hurt'],
  hk_tram_ly: ['r', 'every', 'warn', 'len', 'w', 'pct', 'hurt', 'out', 'cure'],
  hk_huyet_anh: ['hpFrac', 'kill', 'hurt', 'respawn'],
  hk_van_tam: ['seals', 'ring', 'r', 'show', 'think', 'every', 'hurt', 'cure', 'pct'],
  hk_kho_than: ['beats', 'every', 'win', 'cure', 'hurt', 'miss'],
  hk_hon_tho: ['orbs', 'ring', 'r', 'life', 'every', 'cure', 'heal', 'bleed'],
  hk_luan_hoi: ['sectors', 'r', 'speed', 'every', 'warn', 'pct', 'hurt', 'cure'],
};

/** Tiến độ các kiếp chuỗi của một nhân vật: Ngũ Suy ở `suy` (giữ khóa cũ), chuỗi khác ở `chain[id]`. */
export interface ChainMeta {
  suy?: number;
  chain?: Record<string, number>;
}

/** Số pha đã qua của chuỗi `def` (đã làm sạch). */
export function chainCleared(meta: ChainMeta, def: TribDef): number {
  return suyCleared(def.id === 'ngu_suy' ? meta.suy : meta.chain?.[def.id], def);
}

export function chainDone(meta: ChainMeta, def: TribDef): boolean {
  return !!def.chain && def.phases.length > 0 && chainCleared(meta, def) >= def.phases.length;
}

/** Ghi tiến độ `n` cho chuỗi `def` (kẹp trong [0, số pha]). */
export function setChainCleared(meta: ChainMeta, def: TribDef, n: number): void {
  const v = suyCleared(n, def);
  if (def.id === 'ngu_suy') meta.suy = v;
  else (meta.chain ??= {})[def.id] = v;
}

/** Làm sạch `meta.chain` nạp từ DB: chỉ giữ id kiếp chuỗi có thật, giá trị trong khoảng. */
export function sanitizeChainMeta(meta: ChainMeta): void {
  if (meta.suy !== undefined) meta.suy = suyCleared(meta.suy);
  const raw = meta.chain;
  if (raw === undefined) return;
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object')
    for (const [id, n] of Object.entries(raw)) {
      const def = (TRIB_DEFS as Record<string, TribDef | undefined>)[id];
      if (def?.chain && id !== 'ngu_suy') out[id] = suyCleared(n, def);
    }
  meta.chain = out;
}

/** Chuỗi phải qua trước `def` mà nhân vật chưa qua đủ (null = vào được). */
export function chainBlockedBy(meta: ChainMeta, def: TribDef): TribDef | null {
  const prev = def.after ? TRIB_DEFS[def.after] : undefined;
  return prev && !chainDone(meta, prev) ? prev : null;
}

/** Tổng số kiếp nhỏ Huyền Kiếp đã qua (0..9). */
export function huyenKiepCleared(meta: ChainMeta): number {
  return HUYEN_CHAINS.reduce((n, id) => n + chainCleared(meta, TRIB_DEFS[id]), 0);
}

/**
 * Bậc Bản Nguyên được nâng nhờ Huyền Kiếp: mỗi chuỗi qua đủ một bậc (0..3).
 * MÓC cho TN-1/VS-3: khung Bản Nguyên (`origins.json`) chưa có nên hiện CHƯA có hệ nào đọc giá trị này; khi có, cộng bậc theo hàm này thay vì lưu thêm trường.
 */
export function huyenOriginTier(meta: ChainMeta): number {
  return HUYEN_CHAINS.filter((id) => chainDone(meta, TRIB_DEFS[id])).length;
}

/** Vị trí thứ `i` trong `n` điểm chia đều trên vòng (trụ chắn gió, Dẫn Lôi Trụ, ấn Vấn Tâm): cùng công thức `suyRingPos`. */
export { suyRingPos as hkRingPos } from './ngusuy';

/** Đứng ở `(x, z)` có được trụ tại `(px, pz)` chắn trận gió thổi theo hướng đơn vị `(dx, dz)` không: sau trụ trong `(0,3; depth]` m, lệch ngang ≤ `shelterR`. */
export function hkSheltered(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  x: number,
  z: number,
  depth: number,
  shelterR: number,
): boolean {
  const rx = x - px;
  const rz = z - pz;
  const along = rx * dx + rz * dz;
  const side = Math.abs(rx * dz - rz * dx);
  return along > 0.3 && along <= depth && side <= shelterR;
}

/** Ấn thật sau khi các ấn xoay `shift` chỗ: ấn `idx` thành `(idx + shift) mod n`. */
export function hkSealAfter(idx: number, shift: number, n: number): number {
  return (((idx + shift) % n) + n) % n;
}

/** Góc giữa cung sinh của vòng luân hồi tại thời điểm `t` giây kể từ mốc `(theta0, dir × speed)`. */
export function hkLuanAngle(theta0: number, omega: number, t: number): number {
  const two = Math.PI * 2;
  return (((theta0 + omega * t) % two) + two) % two;
}

/** `(x, z)` có nằm trong cung sinh (nửa góc π/sectors quanh `theta`, trong bán kính `r` quanh tâm `c`) không. */
export function hkLuanSafe(c: { x: number; z: number }, theta: number, sectors: number, r: number, x: number, z: number): boolean {
  const d = Math.hypot(x - c.x, z - c.z);
  if (d > r) return false;
  // Trục vòng không thuộc cung nào: đứng giữa tâm không né được.
  if (d < 1.5) return false;
  const two = Math.PI * 2;
  const a = (Math.atan2(x - c.x, z - c.z) + two) % two;
  let diff = Math.abs(a - theta) % two;
  if (diff > Math.PI) diff = two - diff;
  return diff <= Math.PI / sectors;
}

/** Điểm `(x, z)` có nằm trong vạch chữ nhật gốc `(ox, oz)`, hướng `yaw`, dài `len`, rộng `w` không (cùng quy ước vạch báo `rect`). */
export function hkInRect(ox: number, oz: number, yaw: number, len: number, w: number, x: number, z: number): boolean {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = x - ox;
  const rz = z - oz;
  const along = rx * fx + rz * fz;
  const side = Math.abs(rx * fz - rz * fx);
  return along >= 0 && along <= len && side <= w / 2;
}
