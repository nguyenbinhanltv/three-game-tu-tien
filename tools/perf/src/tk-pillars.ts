// Sinh vị trí cột son dọc đại lộ Thiên Khuyết (MAP-4) kèm độ cao đất thật (`terrainOf(...).heightAt`), ghi vào
// packages/content/data/levels/thien_khuyet.assets.json khối `thienKhuyetSky.pillars`. Script Blender `thien_khuyet_arch.py`
// đọc `y` từ đây để cột bám đất (cột nướng cố định vào GLB nên không thể hỏi `heightAt` lúc chạy).
//   pnpm --filter @dtl/perf exec tsx src/tk-pillars.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '@dtl/content';
import { terrainOf } from '@dtl/shared';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILE = path.join(ROOT, 'packages/content/data/levels/thien_khuyet.assets.json');
const LEVEL = path.join(ROOT, 'packages/content/data/levels/thien_khuyet.json');
const N = 26;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tr = terrainOf('thien_khuyet');
const lv = JSON.parse(fs.readFileSync(LEVEL, 'utf8')) as { camps: { x: number; z: number }[]; pois: { x: number; z: number }[] };
const R = rng(8123);
const out: { x: number; z: number; y: number; kind: 'gay' | 'dung' | 'do' }[] = [];
for (let guard = 0; guard < 2000 && out.length < N; guard++) {
  const side = R() < 0.5 ? -1 : 1;
  const z = 470 + R() * 600;
  const x = Math.round((1034 + side * (46 + R() * 40) + (z - 470) * 0.004) * 10) / 10;
  const zz = Math.round(z * 10) / 10;
  if (Math.hypot(x - 1144, zz - 684) < 50) continue;
  if (lv.camps.some((c) => Math.hypot(x - c.x, zz - c.z) < 28) || lv.pois.some((p) => Math.hypot(x - p.x, zz - p.z) < 40)) continue;
  if (out.some((o) => Math.hypot(o.x - x, o.z - zz) < 14)) continue;
  const q = R();
  out.push({ x, z: zz, y: Math.round(tr.heightAt(x, zz) * 100) / 100, kind: q < 0.5 ? 'gay' : q < 0.8 ? 'dung' : 'do' });
}
const json = JSON.parse(fs.readFileSync(FILE, 'utf8'));
json.thienKhuyetSky.pillars = out;
fs.writeFileSync(FILE, JSON.stringify(json, null, 2) + '\n');
const ys = out.map((o) => o.y);
console.log(`${out.length} cột, y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}`);
