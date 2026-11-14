// Test tools/blender/import_tripo.py (M2-2) và bước hạ LOD0 về trần trong optimize.ts.
// Đầu vào: fixture có xương (build_fixture_rig.py --legs --tripo) giả dạng đầu ra Tripo:
// transform trên node chưa áp, xoay 90° quanh trục đứng, cao 1 m, gốc ở tâm khối.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Node } from '@gltf-transform/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findBlender, runBlender } from '../../blender/find-blender.mjs';
import { ROOT, createIO, loadBudgets } from '../src/config.js';
import { optimizeAsset } from '../src/optimize.js';
import { countTriangles, lodLevel, measurePoses } from '../src/stats.js';

const blender = findBlender();
const SCRIPT = path.join(ROOT, 'tools/blender/import_tripo.py');
const BUDGETS = path.join(ROOT, 'assets/budgets.json');
const id = 'chr_fixture_tripo';

const meta = {
  id,
  type: 'chr',
  status: 'imported',
  license: { source: 'test', owner: 'dự án', date: '2026-11-15' },
  budget: { faceLimit: 1200 },
  import: {
    kind: 'tripo',
    source: 'chr/chr_fixture_tripo/tripo/raw_v01.glb',
    size: { height: 1.7 },
    sockets: [{ name: 'socket_hand_r', bone: 'spine', position: [0.2, 1.2, 0.05] }],
  },
};

function worldPos(n: Node): number[] {
  const m = n.getWorldMatrix();
  return [m[12], m[13], m[14]];
}

describe.skipIf(!blender)('import_tripo.py (Blender headless)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-tripo-'));
  const src = path.join(dir, 'src.glb');
  const metaFile = path.join(dir, 'meta.json');
  const out = (k: number) => path.join(dir, `out${k}.glb`);
  const run = (k: number) => runBlender(blender!, SCRIPT, [src, out(k), '--meta', metaFile, '--budgets', BUDGETS], { quiet: true });

  beforeAll(() => {
    // Ít mặt cho nhanh: khoảng 2 nghìn tam giác.
    const fixture = ['--rings', '30', '--segments', '32', '--legs', '--tripo'];
    expect(runBlender(blender!, path.join(ROOT, 'tools/blender/build_fixture_rig.py'), [src, ...fixture], { quiet: true })).toBe(0);
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    expect(run(1)).toBe(0);
    expect(run(2)).toBe(0);
  }, 240_000);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('đầu vào đúng là kiểu Tripo: cao 1 m, gốc ở tâm', async () => {
    const d = measurePoses(await (await createIO()).read(src)).rest;
    expect(d.height).toBeCloseTo(1, 3);
    expect(d.minY).toBeCloseTo(-0.5, 3);
  });

  it('cùng đầu vào cho ra cùng file', () => {
    expect(fs.readFileSync(out(1)).equals(fs.readFileSync(out(2)))).toBe(true);
  });

  it('cao đúng meta, đáy ở Y = 0, tâm X/Z ở gốc, transform đã áp', async () => {
    const doc = await (await createIO()).read(out(1));
    const d = measurePoses(doc).rest;
    expect(d.height).toBeCloseTo(1.7, 3);
    expect(d.minY).toBeCloseTo(0, 3);
    expect(d.width).toBeCloseTo(d.depth, 2);
    for (const n of doc.getRoot().listNodes().filter((x) => x.getMesh() || x.getName() === `${id}_rig`)) {
      expect(n.getScale()).toEqual([1, 1, 1]);
      expect(n.getRotation()).toEqual([0, 0, 0, 1]);
    }
  });

  it('hướng theo xương đùi: đùi trái ở +X (mặt nhìn +Z), cùng độ sâu với đùi phải', async () => {
    const doc = await (await createIO()).read(out(1));
    const joint = (name: string) => doc.getRoot().listNodes().find((n) => n.getName() === name)!;
    const l = worldPos(joint('thigh_l'));
    const r = worldPos(joint('thigh_r'));
    expect(l[0] - r[0]).toBeCloseTo(0.18, 3);
    expect(l[2] - r[2]).toBeCloseTo(0, 4);
  });

  it('đặt tên theo asset id, giữ skin và trọng số, socket gắn vào xương ở đúng vị trí', async () => {
    const doc = await (await createIO()).read(out(1));
    const root = doc.getRoot();
    expect(root.listMeshes().map((m) => m.getName())).toEqual([id]);
    expect(root.listMaterials().map((m) => m.getName())).toEqual([`${id}_mat`]);
    expect(root.listTextures().map((t) => t.getName())).toEqual([`${id}_color`]);
    expect(root.listSkins()).toHaveLength(1);
    expect(root.listSkins()[0].listJoints()).toHaveLength(7);
    const prim = root.listMeshes()[0].listPrimitives()[0];
    expect(prim.getAttribute('JOINTS_0')).not.toBeNull();
    expect(prim.getAttribute('WEIGHTS_0')).not.toBeNull();
    const socket = root.listNodes().find((n) => n.getName() === 'socket_hand_r')!;
    expect(socket.getExtras()).toMatchObject({ socket: 1 });
    expect(socket.getParentNode()?.getName()).toBe('spine');
    const p = worldPos(socket);
    expect(p[0]).toBeCloseTo(0.2, 3);
    expect(p[1]).toBeCloseTo(1.2, 3);
    expect(p[2]).toBeCloseTo(0.05, 3);
  });

  it('clip giữ đúng quãng dịch chuyển: root nhấc 0,1 m ở giữa clip sau chuẩn hóa', async () => {
    const poses = measurePoses(await (await createIO()).read(out(1)));
    expect(poses['breathe@start'].minY).toBeCloseTo(0, 3);
    expect(poses['breathe@mid'].minY).toBeCloseTo(0.1, 3);
  });

  it('optimize hạ LOD0 về trần faceLimit, mesh có xương giữ trọng số và chiều cao', async () => {
    const outDir = path.join(dir, 'build');
    fs.mkdirSync(outDir);
    const spec = loadBudgets().classes.player;
    const warns: string[] = [];
    const e = await optimizeAsset(out(1), id, 'player', spec, outDir, null, (m) => warns.push(m), meta.budget.faceLimit);
    expect(e.rawTriangles).toBeGreaterThan(1200);
    expect(e.triangles).toBeLessThanOrEqual(1200);
    expect(e.triangles).toBeGreaterThan(1000);
    expect(warns.filter((w) => w.includes('LOD0'))).toEqual([]);
    expect(Math.abs(e.dims.build!.height - e.dims.raw!.height) / e.dims.raw!.height).toBeLessThan(0.01);
    const doc = await (await createIO()).readBinary(new Uint8Array(fs.readFileSync(path.join(outDir, e.file))));
    expect(countTriangles(doc, 0)).toBe(e.triangles);
    for (const n of doc.getRoot().listNodes().filter((x) => x.getMesh() && lodLevel(x) === 0)) {
      expect(n.getSkin()).not.toBeNull();
      for (const p of n.getMesh()!.listPrimitives()) expect(p.getAttribute('WEIGHTS_0')).not.toBeNull();
    }
  });
});
