import fs from 'node:fs';
import '@dtl/content';
import { terrainOf } from '@dtl/shared';
const tr = terrainOf('thien_khuyet');
const l = JSON.parse(fs.readFileSync('../../packages/content/data/levels/thien_khuyet.json', 'utf8'));
const P: number[][] = [];
for (const c of l.camps) P.push([c.x, c.z, (c.radius || 30) + 20]);
for (const k of ['pois', 'spots', 'nodes', 'portals']) for (const p of l[k] || []) if (isFinite(p.x)) P.push([p.x, p.z, (p.r || 25) + 15]);
for (const s of l.spawns || []) P.push([s.x, s.z, (s.radius || 20) + 15]);
P.push([l.spawn.x, l.spawn.z, 70]);
const res: number[][] = [];
const HALF = 100, W = 35;
for (const yaw of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4])
  for (let x = 330; x <= 1760; x += 20)
    for (let z = 130; z <= 1600; z += 20) {
      let m = 1e9, hmin = 1e9, hmax = -1e9;
      for (let t = -HALF; t <= HALF; t += 25)
        for (const w of [-W, 0, W]) {
          const px = x + Math.cos(yaw) * t - Math.sin(yaw) * w;
          const pz = z + Math.sin(yaw) * t + Math.cos(yaw) * w;
          for (const p of P) m = Math.min(m, Math.hypot(px - p[0], pz - p[1]) - p[2]);
          if (pz > 470 && pz < 1060) m = Math.min(m, Math.abs(px - 1044) - 30);
          m = Math.min(m, Math.hypot(px - 1044, pz - 374) - 125);
          const h = tr.heightAt(px, pz);
          hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
        }
      res.push([m, hmax - hmin, x, z, yaw]);
    }
const ok = res.filter((r) => r[0] > 8 && r[1] < 9).sort((a, b) => b[0] - a[0]);
console.log(ok.length, ok.slice(0, 12).map((r) => r.map((v) => +v.toFixed(2)).join(',')).join(' | '));
