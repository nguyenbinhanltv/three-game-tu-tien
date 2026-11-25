import fs from 'node:fs';
import path from 'node:path';
import { createIO, ROOT } from './config.js';
const dir = path.join(ROOT, 'apps/client/public/assets');
const io = await createIO();
const files = fs.readdirSync(dir).filter((f) => /^(mon|elite|boss)_.*\.glb$/.test(f)).sort();
const rows: string[] = [];
for (const f of files) {
  const doc = await io.read(path.join(dir, f));
  const root = doc.getRoot();
  const lods: Record<string, { prims: number; mats: Set<string>; skinned: number; tris: number }> = {};
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = /LOD\d/.exec(node.getName() + ' ' + mesh.getName());
    const key = m ? m[0] : 'noLOD';
    const L = (lods[key] ??= { prims: 0, mats: new Set(), skinned: 0, tris: 0 });
    for (const p of mesh.listPrimitives()) {
      L.prims++;
      L.mats.add(p.getMaterial()?.getName() ?? '?');
      const idx = p.getIndices();
      L.tris += (idx ? idx.getCount() : (p.getAttribute('POSITION')?.getCount() ?? 0)) / 3;
    }
    if (node.getSkin()) L.skinned++;
  }
  rows.push(
    `${f.replace(/\.[0-9a-f]{10}\.glb$/, '').padEnd(34)} skins ${root.listSkins().length} mats ${root.listMaterials().length} ` +
      Object.entries(lods)
        .sort()
        .map(([k, v]) => `${k}:${v.prims}prim/${v.mats.size}mat/${Math.round(v.tris / 1000)}kt`)
        .join(' '),
  );
}
console.log(rows.join('\n'));
