// COL-1 / COL-A: sinh collider cho kiến trúc dựng thành MỘT lưới gộp (arch_sect, arch_kiem_trung…) trực tiếp từ hình học GLB.
//   pnpm colliders:arch --id arch_sect --origin 2048,150,2048 --level van_lam [--cell 0.5]
// → packages/content/data/colliders/<id>.boxes.json: danh sách hộp trục thế giới [x0, z0, x1, z1, y0, y1, walk].
// Cách làm (lưới ô `cell`, mặc định 0,5 m): rải mẫu bề mặt tam giác vào ô theo hướng (lên / xuống / đứng).
//  1. Mỗi ô có các "mức đứng được": mặt hướng lên có khoảng trống đủ đầu người (`HEAD`) phía trên, cộng mặt đất (cao độ địa hình `groundAt`).
//  2. BFS từ mọi mức mặt đất: sang ô kề nếu có mức cao hơn ≤ `STEP` (bước lên) hoặc thấp hơn (bước xuống). Mức tới được và cao hơn đất → hộp `walk`
//     (bậc thang, bệ, sân nâng); mức không tới được (khối đặc, tháp không có thang) → hộp rắn từ đất tới đỉnh.
//  3. Với mỗi mức tới được: hình học nằm trong thân người (F + 0,3 … F + HEAD) → hộp rắn từ F tới đỉnh khối liền (tường, cột, mái hiên thấp).
//     Mái cao hơn đầu người không chặn (đi dưới được); mái thấp (cạnh dưới < HEAD) chặn.
//  4. Gộp ô cùng loại/cao độ thành hình chữ nhật.
// Hàm thuần (nhận tam giác), không phụ thuộc GLB/THREE: có test.

export type Tri = readonly [number, number, number, number, number, number, number, number, number];

export interface ArchOpts {
  cell?: number;
  /** Cao độ địa hình (cùng hệ toạ độ với tam giác). */
  groundAt: (x: number, z: number) => number;
}

/** Cao tối đa bước lên được (khớp `STEP_UP` của shared). */
const STEP = 0.5;
/** Cần khoảng trống chừng này phía trên mặt đứng (chiều cao thân người `BODY_H`). */
const HEAD = 1.8;
<<<<<<< HEAD
/** Vùng thân người bắt đầu cao hơn mức đứng chừng này: mặt bậc kế tiếp và mặt đứng (riser) của bậc ≤ STEP rơi cùng ô không phải vật cản. */
const BODY_LO = 0.6;
=======
>>>>>>> origin/main
const FLOOR_EPS = 0.15;
const MAX_TOP = 60;

/** [x0, z0, x1, z1, y0, y1, walk(1)|solid(0)] */
export type ArchBox = [number, number, number, number, number, number, number];

interface CellData {
  /** Mẫu bề mặt: y*10 làm tròn, hướng 0 lên / 1 xuống / 2 đứng. */
  s: Set<number>;
}

const enc = (y: number, f: number): number => Math.round(y * 10) * 4 + f;
const decY = (e: number): number => Math.floor(e / 4) / 10;
const decF = (e: number): number => ((e % 4) + 4) % 4;

export function buildArchBoxes(tris: Iterable<Tri>, o: ArchOpts): ArchBox[] {
  const C = o.cell ?? 0.5;
  const cells = new Map<number, CellData>();
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const list: Tri[] = [];
  for (const t of tris) {
    list.push(t);
    for (let k = 0; k < 3; k++) {
      minX = Math.min(minX, t[k * 3]!);
      maxX = Math.max(maxX, t[k * 3]!);
      minZ = Math.min(minZ, t[k * 3 + 2]!);
      maxZ = Math.max(maxZ, t[k * 3 + 2]!);
    }
  }
  if (!list.length) return [];
  const gx0 = Math.floor(minX / C) - 1;
  const gz0 = Math.floor(minZ / C) - 1;
  const W = Math.ceil(maxX / C) + 2 - gx0;
  const idx = (cx: number, cz: number): number => (cz - gz0) * W + (cx - gx0);
  const put = (x: number, z: number, y: number, f: number): void => {
    const cx = Math.floor(x / C);
    const cz = Math.floor(z / C);
    const k = idx(cx, cz);
    let d = cells.get(k);
    if (!d) cells.set(k, (d = { s: new Set() }));
    d.s.add(enc(y, f));
  };

  // 1) Rải mẫu.
  for (const t of list) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue;
    const fy = ny / len;
    const ymin = Math.min(ay, by, cy);
    const ymax = Math.max(ay, by, cy);
    if (Math.abs(fy) < 0.5) {
      // Mặt đứng/dốc gắt: rải theo ba cạnh chiếu xuống xz, phủ dải cao [ymin, ymax].
      const edges = [
        [ax, az, bx, bz],
        [bx, bz, cx, cz],
        [cx, cz, ax, az],
      ];
      for (const [x0, z0, x1, z1] of edges) {
        const n = Math.max(1, Math.ceil(Math.hypot(x1! - x0!, z1! - z0!) / (C * 0.5)));
        for (let i = 0; i <= n; i++) {
          const x = x0! + ((x1! - x0!) * i) / n;
          const z = z0! + ((z1! - z0!) * i) / n;
          for (let y = ymin; y <= ymax + 1e-6; y += 0.2) put(x, z, y, 2);
          put(x, z, ymax, 2);
        }
      }
      continue;
    }
    const f = fy > 0 ? 0 : 1;
    // Mặt ngang/dốc nhẹ: lấy mẫu tại tâm các ô trong bao xz nằm trong tam giác; y theo mặt phẳng.
    const x0 = Math.floor(Math.min(ax, bx, cx) / C);
    const x1 = Math.floor(Math.max(ax, bx, cx) / C);
    const z0 = Math.floor(Math.min(az, bz, cz) / C);
    const z1 = Math.floor(Math.max(az, bz, cz) / C);
    // Tam giác nhỏ hơn ô: một mẫu tại trọng tâm.
    if (x1 === x0 && z1 === z0) {
      put((ax + bx + cx) / 3, (az + bz + cz) / 3, (ay + by + cy) / 3, f);
      continue;
    }
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) {
        const px = (gx + 0.5) * C;
        const pz = (gz + 0.5) * C;
        if (Math.abs(den) < 1e-12) continue;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den;
        const l3 = 1 - l1 - l2;
        const e = -1e-3;
        if (l1 < e || l2 < e || l3 < e) continue;
        put(px, pz, l1 * ay + l2 * by + l3 * cy, f);
      }
  }

  // 2) Mức đứng được theo ô.
  interface Lv {
    y: number;
    ground: boolean;
    reached: boolean;
  }
  const cellLv = new Map<number, Lv[]>();
  const samples = new Map<number, { y: number; f: number }[]>();
  for (const [k, d] of cells) {
    const arr = [...d.s].map((e) => ({ y: decY(e), f: decF(e) })).sort((p, q) => p.y - q.y);
    samples.set(k, arr);
  }
  const groundOfCell = (k: number): number => {
    const cx = (k % W) + gx0;
    const cz = Math.floor(k / W) + gz0;
    return o.groundAt((cx + 0.5) * C, (cz + 0.5) * C);
  };
  // Mức `y` đứng được: thân người không vướng, và mặt đầu tiên phía trên không phải mặt hướng LÊN (nếu là mặt lên thì mức đó nằm trong lòng khối đặc).
  const clearAbove = (arr: { y: number; f: number }[], y: number): boolean => {
<<<<<<< HEAD
    if (arr.some((s) => s.y > y + BODY_LO && s.y <= y + HEAD)) return false;
=======
    if (arr.some((s) => s.y > y + 0.15 && s.y <= y + HEAD)) return false;
>>>>>>> origin/main
    const nxt = arr.find((s) => s.y > y + 0.05);
    return !nxt || nxt.f !== 0;
  };
  for (const [k, arr] of samples) {
    const g = groundOfCell(k);
    const lv: Lv[] = [];
    // Mặt đất: đứng được nếu thân người không vướng (mẫu trong (g + 0,3, g + HEAD]).
    if (clearAbove(arr, g)) lv.push({ y: g, ground: true, reached: false });
    for (const s of arr) {
      if (s.f !== 0 || s.y <= g + FLOOR_EPS) continue;
      if (!clearAbove(arr, s.y)) continue;
      if (lv.some((l) => Math.abs(l.y - s.y) < 0.15)) continue;
      lv.push({ y: s.y, ground: false, reached: false });
    }
    cellLv.set(k, lv);
  }
  // Ô trống (không có mẫu) chính là mặt đất đứng được: xử lý ngầm ở BFS (không cần lưu).

  // 3) BFS: mức mặt đất ở mọi ô có dữ liệu là điểm xuất phát; ô không dữ liệu coi là đất thoáng.
  const queue: [number, Lv][] = [];
  for (const [k, lv] of cellLv) {
    const g = groundOfCell(k);
    // Mặt đất, và bậc thấp ≤ STEP so với đất (bước lên từ đất thoáng quanh nó) là điểm xuất phát.
    for (const l of lv) if (l.ground || l.y - g <= STEP + 1e-6) ((l.reached = true), queue.push([k, l]));
  }
  const nb = [1, -1, W, -W];
  while (queue.length) {
    const [k, l] = queue.pop()!;
    for (const d of nb) {
      const k2 = k + d;
      const lv2 = cellLv.get(k2);
      if (!lv2) continue;
      for (const l2 of lv2) {
        if (l2.reached) continue;
        if (l2.y - l.y <= STEP + 1e-6) {
          l2.reached = true;
          queue.push([k2, l2]);
        }
      }
    }
  }

  // 4) Sinh hộp theo ô.
  interface Item {
    walk: 0 | 1;
    y0: number;
    y1: number;
  }
  const items = new Map<number, Item[]>();
  const add = (k: number, it: Item): void => {
    const a = items.get(k);
    if (a) a.push(it);
    else items.set(k, [it]);
  };
  const r1 = (v: number): number => Math.round(v * 10) / 10;
  for (const [k, arr] of samples) {
    const g = groundOfCell(k);
    const lv = cellLv.get(k)!;
    // Mức đứng được tới được: bệ/bậc nâng → hộp walk; hình học trong thân người → hộp rắn.
    const reachedLv = lv.filter((l) => l.reached);
    for (const l of reachedLv) {
      if (!l.ground) add(k, { walk: 1, y0: r1(g - 0.2), y1: r1(l.y) });
      // Thân người: mẫu trong [F + 0,3, F + HEAD].
<<<<<<< HEAD
      const body = arr.filter((s) => s.y > l.y + BODY_LO && s.y <= l.y + HEAD);
=======
      const body = arr.filter((s) => s.y > l.y + 0.3 && s.y <= l.y + HEAD);
>>>>>>> origin/main
      if (body.length) {
        let top = Math.max(...body.map((s) => s.y));
        // Khối liền trên đó (khoảng hở < 1 m).
        for (const s of arr) if (s.y > top && s.y - top < 1 && s.y < l.y + MAX_TOP) top = s.y;
        add(k, { walk: 0, y0: r1(l.y), y1: r1(top) });
      }
    }
    // Ô không có mức đứng được nào tới được: khối đặc từ đất lên tới đỉnh khối liền (tường, cột, khối đá, tháp không thang). Mái cao trên ô có sàn
    // tới được không vào đây (đi dưới được), mái hiên thấp đã tính ở hộp thân người.
    if (!reachedLv.length) {
      const own = arr.filter((q) => q.y >= g - 0.5);
      const lowest = own[0];
      // Lơ lửng: mẫu thấp nhất cao hơn đất quá tầm đầu người (đình trên vách, cầu treo, đảo bay) → khối lơ lửng từ mẫu thấp nhất, đỉnh đứng được.
      const floating = !!lowest && lowest.y - g > HEAD;
      let top = floating ? lowest!.y : g;
      let any = false;
      // Trong lòng khối đặc: mặt đầu tiên phía trên đất là mặt hướng lên (đỉnh khối) → chặn tới đỉnh, kể cả khi giữa khối không có mẫu nào.
      const first = own.find((q) => q.y > g + 0.05);
      if (!floating && first && first.f === 0) {
        top = first.y;
        any = true;
      }
      for (const q of own) {
        if (q.y <= top) continue;
        if (q.y - top < (any || floating ? 1 : HEAD)) {
          top = q.y;
          any = true;
        } else break;
      }
      if (floating) add(k, { walk: 1, y0: r1(lowest!.y), y1: r1(Math.max(top, lowest!.y + 0.1)) });
      else if (any && top > g + 0.3) add(k, { walk: 0, y0: r1(g), y1: r1(top) });
    }
  }

  // 5) Gộp ô thành hình chữ nhật theo từng khóa (loại, y0, y1).
  const byKey = new Map<string, Set<number>>();
  for (const [k, its] of items)
    for (const it of its) {
      const key = `${it.walk}|${it.y0}|${it.y1}`;
      let s = byKey.get(key);
      if (!s) byKey.set(key, (s = new Set()));
      s.add(k);
    }
  const out: ArchBox[] = [];
  for (const [key, set] of byKey) {
    const [w, y0, y1] = key.split('|').map(Number) as [number, number, number];
    const left = new Set(set);
    const order = [...set].sort((p, q) => p - q);
    for (const k of order) {
      if (!left.has(k)) continue;
      // Mở rộng theo x rồi theo z.
      let wd = 1;
      while (left.has(k + wd) && (k + wd) % W !== 0) wd++;
      let ht = 1;
      grow: for (;;) {
        for (let i = 0; i < wd; i++) if (!left.has(k + ht * W + i)) break grow;
        ht++;
      }
      for (let j = 0; j < ht; j++) for (let i = 0; i < wd; i++) left.delete(k + j * W + i);
      const cx = (k % W) + gx0;
      const cz = Math.floor(k / W) + gz0;
      out.push([r1(cx * C), r1(cz * C), r1((cx + wd) * C), r1((cz + ht) * C), y0, y1, w]);
    }
  }
  return out;
}
