// Chân Cảnh O1 (phân tích, không sửa asset): ước lượng tỉ lệ tam giác "không bao giờ thấy" theo hướng camera chéo khóa của level.
//   tsx src/o1-facing.ts [--tol 0,20,30] [--out <json>] [thư mục assets, mặc định apps/client/public/assets]
// Mặt tam giác (pháp tuyến n từ tích có hướng, ở tọa độ thế giới của nút) KHÔNG BAO GIỜ thấy được nếu n·c ≤ −sin(tol) với c là hướng từ điểm nhìn
// tới camera (yaw khóa, nghiêng 52°) và tol là nửa góc mở (FOV 32° dọc ≈ 16°, ngang 16:9 ≈ 27°, thêm lệch do vật ở rìa khung). Chỉ kể mặt quay lưng
// (và mặt hướng xuống); chưa kể bị che khuất bởi vật khác nên là CẬN DƯỚI. Với asset đặt nhiều lần theo yaw ngẫu nhiên (prop) chỉ kể mặt hướng xuống.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document } from '@gltf-transform/core';
import { createIO } from './config';

const PITCH = (52 * Math.PI) / 180;
const FOV_V = (32 * Math.PI) / 180;
/** asset kiến trúc đã dựng theo tọa độ thế giới của level → yaw khóa (độ); khớp ISO_YAW ở apps/client/src/game/camera/iso.ts. */
const ARCH_YAW: Record<string, number> = {
  arch_sect: 30,
  arch_vh_island: 135,
  arch_thien_khuyet: 20,
  arch_dm_bridge: 135,
  arch_xich_tan: -45,
  arch_kiem_trung: 45,
  arch_kim_da: 45,
  arch_kinh_nguyet: 45,
  arch_phuc_mach: 45,
  arch_than_tang: 45,
  arch_do_kiep: 45,
};
const rad = (d: number) => (d * Math.PI) / 180;

export interface FacingResult {
  asset: string;
  yawDeg: number | null;
  tris: number;
  doubleSidedTris: number;
  /** tol (độ) → tỉ lệ số tam giác / diện tích không bao giờ thấy. */
  hidden: Record<string, { byCount: number; byArea: number }>;
}

export function analyze(doc: Document, asset: string, yawDeg: number | null, tols: number[]): FacingResult {
  const c = yawDeg === null ? null : [Math.sin(rad(yawDeg)) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(rad(yawDeg)) * Math.cos(PITCH)];
  // Mặt luôn quay xuống: không camera nào (độ cao ≥ 52° − nửa FOV) thấy nếu n.y·sinE + √(1−n.y²)·cosE ≤ 0 với mọi hướng ngang.
  const eMin = PITCH - FOV_V / 2;
  const cnt: Record<string, number> = {};
  const area: Record<string, number> = {};
  for (const t of tols) cnt[t] = area[t] = 0;
  let tris = 0;
  let totalArea = 0;
  let ds = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const doubleSided = prim.getMaterial()?.getDoubleSided() ?? false;
      const get = (i: number): number[] => {
        const v = pos.getElement(idx ? idx.getScalar(i) : i, [0, 0, 0]);
        return [m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]! + m[12]!, m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]! + m[13]!, m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]! + m[14]!];
      };
      for (let i = 0; i + 2 < n; i += 3) {
        const a = get(i);
        const b = get(i + 1);
        const d = get(i + 2);
        const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
        const w = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
        const nx = u[1]! * w[2]! - u[2]! * w[1]!;
        const ny = u[2]! * w[0]! - u[0]! * w[2]!;
        const nz = u[0]! * w[1]! - u[1]! * w[0]!;
        const len = Math.hypot(nx, ny, nz);
        tris++;
        if (len < 1e-12) continue;
        const ar = len / 2;
        totalArea += ar;
        if (doubleSided) ds++;
        for (const t of tols) {
          const s = Math.sin(rad(t));
          let hidden: boolean;
          if (c) hidden = (nx * c[0]! + ny * c[1]! + nz * c[2]!) / len <= -s;
          else {
            const y = ny / len;
            hidden = y * Math.sin(eMin) + Math.sqrt(Math.max(0, 1 - y * y)) * Math.cos(eMin) <= 0;
          }
          if (hidden) {
            cnt[t]!++;
            area[t]! += ar;
          }
        }
      }
    }
  }
  const hidden: FacingResult['hidden'] = {};
  for (const t of tols) hidden[t] = { byCount: tris ? Math.round((cnt[t]! / tris) * 1000) / 10 : 0, byArea: totalArea ? Math.round((area[t]! / totalArea) * 1000) / 10 : 0 };
  return { asset, yawDeg, tris, doubleSidedTris: ds, hidden };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1]! : d);
  const tols = opt('--tol', '0,20,30').split(',').map(Number);
  const dir = argv.find((a) => !a.startsWith('--') && fs.existsSync(a) && fs.statSync(a).isDirectory()) ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/client/public/assets');
  const io = await createIO();
  const out: FacingResult[] = [];
  const files = fs.readdirSync(dir).filter((f) => /^(arch|prop)_.*\.glb$/.test(f));
  for (const f of files) {
    const name = f.replace(/\.[0-9a-f]{10}\.glb$/, '');
    const yaw = ARCH_YAW[name];
    if (name.startsWith('arch_') && yaw === undefined) continue;
    try {
      out.push(analyze(await io.read(path.join(dir, f)), name, yaw ?? null, tols));
    } catch (e) {
      console.warn(`bỏ ${f}: ${(e as Error).message}`);
    }
  }
  const sum = (kind: 'arch' | 'prop', t: number) => {
    const rs = out.filter((r) => r.asset.startsWith(kind + '_'));
    const tot = rs.reduce((a, r) => a + r.tris, 0);
    return tot ? Math.round((rs.reduce((a, r) => a + (r.tris * r.hidden[t]!.byCount) / 100, 0) / tot) * 1000) / 10 : 0;
  };
  console.log('asset | yaw | tris | 2 mặt % | ' + tols.map((t) => `ẩn@${t}° (số/diện tích)`).join(' | '));
  for (const r of out.sort((a, b) => b.tris - a.tris))
    console.log(`${r.asset} | ${r.yawDeg ?? 'ngẫu nhiên'} | ${r.tris} | ${Math.round((r.doubleSidedTris / Math.max(1, r.tris)) * 100)} | ` + tols.map((t) => `${r.hidden[t]!.byCount}/${r.hidden[t]!.byArea}%`).join(' | '));
  console.log('\nTổng theo số tam giác: ' + (['arch', 'prop'] as const).map((k) => `${k}: ` + tols.map((t) => `@${t}° ${sum(k, t)}%`).join(', ')).join(' · '));
  const o = opt('--out', '');
  if (o) fs.writeFileSync(o, JSON.stringify(out, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
