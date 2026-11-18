import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Document } from '@gltf-transform/core';
import { quantize } from '@gltf-transform/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findBlender, runBlender } from '../../blender/find-blender.mjs';
import { ROOT, createIO, loadBudgets, lodTargets } from '../src/config.js';
import { fitWithin } from '../src/ktx.js';
import { hashName, optimize, readManifest } from '../src/optimize.js';
import { countTriangles, isSkinned, lodCount, lodLevel, measurePoses } from '../src/stats.js';
import { validate } from '../src/validate.js';

import { at, missing } from '@dtl/shared';
const SECT = path.join(ROOT, 'apps/client/public/assets/sect.glb');
const quiet = () => {};

function tmp(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dtl-${name}-`));
  for (const d of ['raw', 'out', 'source']) fs.mkdirSync(path.join(dir, d));
  return {
    dir,
    raw: path.join(dir, 'raw'),
    out: path.join(dir, 'out'),
    source: path.join(dir, 'source'),
    cache: path.join(dir, 'cache.json'),
    licenses: (ids: string[]) => {
      const file = path.join(dir, 'LICENSES.md');
      fs.writeFileSync(file, ['| Asset | Nguồn |', '| --- | --- |', ...ids.map((id) => `| \`${id}\` | test |`)].join('\n'));
      return file;
    },
  };
}

async function readOut(out: string, id: string): Promise<Document> {
  const entry = at(readManifest(out).assets, id);
  return (await createIO()).readBinary(new Uint8Array(fs.readFileSync(path.join(out, entry.file))));
}

describe('tiện ích', () => {
  it('fitWithin hạ cạnh dài, giữ tỉ lệ, bội số 4', () => {
    expect(fitWithin(512, 512, 1024)).toBeNull();
    expect(fitWithin(2048, 2048, 1024)).toEqual([1024, 1024]);
    expect(fitWithin(2048, 1000, 512)).toEqual([512, 252]);
  });
  it('lodTargets lấy min(tỉ lệ × LOD0, trần)', () => {
    const b = loadBudgets();
    expect(lodTargets(15000, at(b.classes, 'player'))).toEqual([6000, 2250]);
    expect(lodTargets(25000, at(b.classes, 'player'))).toEqual([8000, 3000]);
    expect(lodTargets(1000, at(b.classes, 'prop'))).toEqual([400, 150]);
  });
});

describe('sect.glb (kiến trúc, không xương)', () => {
  const t = tmp('sect');
  beforeAll(() => fs.copyFileSync(SECT, path.join(t.raw, 'arch_sect.glb')));
  afterAll(() => fs.rmSync(t.dir, { recursive: true, force: true }));

  it('tối ưu: quantize + meshopt, nhỏ hơn, giữ kích thước, rồi dùng cache', async () => {
    const r = await optimize({ rawDir: t.raw, outDir: t.out, cacheFile: t.cache, ktx: false, log: quiet });
    expect(r.failed).toEqual([]);
    const e = at(r.manifest.assets, 'arch_sect');
    expect(e.file).toMatch(/^arch_sect\.[0-9a-f]{10}\.glb$/);
    expect(e.skinned).toBe(false);
    expect(e.quantized).toBe(true);
    expect(e.bytes).toBeLessThan(e.rawBytes / 2);
    expect(e.lods).toHaveLength(1); // kiến trúc không sinh LOD
    const doc = await readOut(t.out, 'arch_sect');
    const used = doc
      .getRoot()
      .listExtensionsUsed()
      .map((x) => x.extensionName);
    expect(used).toContain('EXT_meshopt_compression');
    expect(used).toContain('KHR_mesh_quantization');
    expect(Math.abs(e.dims.build!.height - e.dims.raw!.height) / e.dims.raw!.height).toBeLessThan(0.005);

    const again = await optimize({ rawDir: t.raw, outDir: t.out, cacheFile: t.cache, ktx: false, log: quiet });
    expect(again.cached).toEqual(['arch_sect']);
    expect(at(again.manifest.assets, 'arch_sect').file).toBe(e.file);
  });

  it('validate đạt với LICENSES thật của repo', async () => {
    const r = await validate({ rawDir: t.raw, outDir: t.out, sourceDir: t.source });
    expect(r.errors).toEqual([]);
    expect(r.checked).toEqual(['arch_sect']);
  });

  it('validate thất bại khi thiếu dòng LICENSES, vượt ngân sách, hoặc hash sai', async () => {
    const budgets = loadBudgets();
    at(budgets.classes, 'arch').triangles.max = 5000;
    const r = await validate({ rawDir: t.raw, outDir: t.out, sourceDir: t.source, budgets, licensesFile: t.licenses([]) });
    const msgs = r.errors.map((e) => e.message).join('\n');
    expect(msgs).toMatch(/thiếu dòng/);
    expect(msgs).toMatch(/vượt ngân sách arch/);

    const m = readManifest(t.out);
    const file = path.join(t.out, at(m.assets, 'arch_sect').file);
    const bytes = fs.readFileSync(file);
    fs.appendFileSync(file, Buffer.from([0]));
    const r2 = await validate({ rawDir: t.raw, outDir: t.out, sourceDir: t.source });
    expect(r2.errors.map((e) => e.message).join('\n')).toMatch(/hash trong tên không khớp/);
    fs.writeFileSync(file, bytes);
  });

  it('tên asset sai quy ước thì optimize báo lỗi', async () => {
    const t2 = tmp('badname');
    fs.copyFileSync(SECT, path.join(t2.raw, 'Sect Đẹp.glb'));
    const r = await optimize({ rawDir: t2.raw, outDir: t2.out, cacheFile: t2.cache, ktx: false, log: quiet });
    expect(r.failed[0]?.error).toMatch(/sai quy ước/);
    fs.rmSync(t2.dir, { recursive: true, force: true });
  });
});

const blender = findBlender();

describe.skipIf(!blender)('nhân vật có xương sinh bằng Blender headless', () => {
  const t = tmp('rig');
  const id = 'chr_fixture_rig';
  beforeAll(() => {
    const status = runBlender(blender!, path.join(ROOT, 'tools/blender/build_fixture_rig.py'), [path.join(t.raw, `${id}.glb`)], {
      quiet: true,
    });
    expect(status).toBe(0);
  }, 120_000);
  afterAll(() => fs.rmSync(t.dir, { recursive: true, force: true }));

  it('không quantize, đủ 3 LOD đúng đích, LOD giữ skin và trọng số, kích thước không đổi ở mọi tư thế', async () => {
    const r = await optimize({ rawDir: t.raw, outDir: t.out, cacheFile: t.cache, ktx: false, log: quiet });
    expect(r.failed).toEqual([]);
    const e = at(r.manifest.assets, id);
    expect(e.class).toBe('player');
    expect(e.skinned).toBe(true);
    expect(e.quantized).toBe(false);
    expect(e.bones).toBe(5);
    expect(e.animations).toContain('breathe');

    const doc = await readOut(t.out, id);
    const used = doc
      .getRoot()
      .listExtensionsUsed()
      .map((x) => x.extensionName);
    expect(used).toContain('EXT_meshopt_compression');
    expect(used).not.toContain('KHR_mesh_quantization');
    expect(lodCount(doc)).toBe(3);
    const [t1 = missing('t1'), t2 = missing('t2')] = lodTargets(e.triangles, at(loadBudgets().classes, 'player'));
    expect(countTriangles(doc, 1)).toBeLessThanOrEqual(t1 * 1.1);
    expect(countTriangles(doc, 2)).toBeLessThanOrEqual(t2 * 1.1);
    for (const node of doc
      .getRoot()
      .listNodes()
      .filter((n) => n.getMesh())) {
      expect(node.getSkin(), `${node.getName()} LOD${lodLevel(node)}`).not.toBeNull();
      for (const p of node.getMesh()!.listPrimitives()) {
        expect(p.getAttribute('JOINTS_0')).not.toBeNull();
        expect(p.getAttribute('WEIGHTS_0')).not.toBeNull();
      }
    }

    const raw = measurePoses(await (await createIO()).read(path.join(t.raw, `${id}.glb`)));
    const build = measurePoses(doc);
    expect(at(raw, 'rest').height).toBeCloseTo(1.7, 2);
    expect(at(raw, 'breathe@mid').height).toBeGreaterThan(1.85); // root scale 1,15, spine nghiêng
    for (const pose of Object.keys(raw)) expect(at(build, pose).height).toBeCloseTo(at(raw, pose).height, 3);

    const v = await validate({ rawDir: t.raw, outDir: t.out, sourceDir: t.source, licensesFile: t.licenses([id]) });
    expect(v.errors).toEqual([]);
  }, 60_000);

  it('validate bắt được mesh có xương bị quantize', async () => {
    const io = await createIO();
    const m = readManifest(t.out);
    const doc = await readOut(t.out, id);
    await doc.transform(quantize());
    const bytes = await io.writeBinary(doc);
    const file = hashName(id, bytes);
    fs.writeFileSync(path.join(t.out, file), bytes);
    at(m.assets, id).file = file;
    fs.writeFileSync(path.join(t.out, 'manifest.json'), JSON.stringify(m));
    const v = await validate({ rawDir: t.raw, outDir: t.out, sourceDir: t.source, licensesFile: t.licenses([id]) });
    expect(v.errors.map((e) => e.message).join('\n')).toMatch(/KHR_mesh_quantization/);
    expect(isSkinned(doc)).toBe(true);
  }, 60_000);

  it('validate báo vượt số xương và texture', async () => {
    const budgets = loadBudgets();
    at(budgets.classes, 'player').bones = 3;
    at(budgets.classes, 'player').texture = { color: 512, data: 512 };
    const v = await validate({ rawDir: t.raw, outDir: t.out, sourceDir: t.source, budgets, licensesFile: t.licenses([id]) });
    const msgs = v.errors.map((e) => e.message).join('\n');
    expect(msgs).toMatch(/5 xương, vượt 3/);
    expect(msgs).toMatch(/baseColorTexture\) 1024×1024 vượt 512px/);
  }, 60_000);
});

// ---------- KTX2 với toktx giả ----------

function png(w: number, h: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  // Dải chuyển màu (prune thay texture một màu bằng hệ số material nên không dùng màu đặc).
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w * 3; x++) rows[y * (w * 3 + 1) + 1 + x] = (x + y) & 255;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

describe('KTX2 (toktx giả)', () => {
  const t = tmp('ktx');
  const log = path.join(t.dir, 'toktx.log');
  const prevToktx = process.env.TOKTX;
  beforeAll(async () => {
    process.env.TOKTX = path.join(ROOT, 'tools/asset-pipeline/test/fake-toktx.mjs');
    process.env.FAKE_TOKTX_LOG = log;
    const doc = new Document();
    const buffer = doc.createBuffer();
    const pos = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer);
    const uv = doc
      .createAccessor()
      .setType('VEC2')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
      .setBuffer(buffer);
    const nrm = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
      .setBuffer(buffer);
    const color = doc.createTexture('albedo').setMimeType('image/png').setImage(png(2048, 1024));
    const normal = doc.createTexture('normal').setMimeType('image/png').setImage(png(256, 256));
    const mat = doc.createMaterial('fx_mat').setBaseColorTexture(color).setNormalTexture(normal);
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', pos)
      .setAttribute('TEXCOORD_0', uv)
      .setAttribute('NORMAL', nrm)
      .setMaterial(mat);
    const node = doc.createNode('fx_test_ktx').setMesh(doc.createMesh('fx_test_ktx').addPrimitive(prim));
    doc.createScene('scene').addChild(node);
    await (await createIO()).write(path.join(t.raw, 'fx_test_ktx.glb'), doc);
  });
  afterAll(() => {
    if (prevToktx === undefined) delete process.env.TOKTX;
    else process.env.TOKTX = prevToktx;
    delete process.env.FAKE_TOKTX_LOG;
    fs.rmSync(t.dir, { recursive: true, force: true });
  });

  it('màu → ETC1S sRGB hạ về ngân sách, normal → UASTC tuyến tính, gắn KHR_texture_basisu', async () => {
    const r = await optimize({ rawDir: t.raw, outDir: t.out, cacheFile: t.cache, log: quiet });
    expect(r.failed).toEqual([]);
    const e = at(r.manifest.assets, 'fx_test_ktx');
    expect(e.ktx2).toBe(true);
    const calls = fs
      .readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as string[]);
    const albedo = calls.find((a) => a.includes('etc1s'))!;
    const normal = calls.find((a) => a.includes('uastc'))!;
    expect(albedo).toEqual(expect.arrayContaining(['--assign_oetf', 'srgb', '--resize', '512x256', '--genmipmap']));
    expect(normal).toEqual(expect.arrayContaining(['--assign_oetf', 'linear']));
    expect(normal).not.toContain('--resize');
    const sizes = Object.fromEntries(e.textures.map((x) => [x.name, [x.mimeType, x.width, x.height]]));
    expect(sizes.albedo).toEqual(['image/ktx2', 512, 256]);
    expect(sizes.normal).toEqual(['image/ktx2', 256, 256]);
    const doc = await readOut(t.out, 'fx_test_ktx');
    expect(
      doc
        .getRoot()
        .listExtensionsRequired()
        .map((x) => x.extensionName),
    ).toContain('KHR_texture_basisu');

    const v = await validate({ rawDir: t.raw, outDir: t.out, sourceDir: t.source, licensesFile: t.licenses(['fx_test_ktx']) });
    expect(v.errors).toEqual([]);
    expect(v.warnings.filter((w) => /KTX2/.test(w.message))).toEqual([]);
  }, 60_000);
});
