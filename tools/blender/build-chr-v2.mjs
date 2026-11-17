#!/usr/bin/env node
// CHR-PROTO: dựng thân v2 (chr_base_v2.py) + đầu/tóc Tripo (chr_v2_head.py) cho cả bốn kiểu, ghi rig_v01.glb vào nguồn asset.
//   node tools/blender/build-chr-v2.mjs [--only nam|nu] [--style a|b]
// Nguồn: <DTL_ASSET_SOURCE>/chr/chr_base_v2/tripo/raw_{head,hair}_*_v01.glb. Ra: <nguồn>/chr/<id>/tripo/rig_v01.glb với id
// chr_v2_<giới> (tóc A) và chr_v2_hb_<giới> (tóc B). Sau đó: `node tools/blender/run.mjs --only <id> --force` + optimize.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findBlender } from './find-blender.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.env.DTL_ASSET_SOURCE ?? 'D:/METAGRIT/dtl-asset-source';
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const onlySex = flag('--only');
const onlyStyle = flag('--style');
const blender = findBlender();
if (!blender) throw new Error('không thấy Blender');
const tmp = path.join(process.env.TEMP ?? os.tmpdir(), 'chr_v2_build');
const tripo = path.join(source, 'chr/chr_base_v2/tripo');

/** Tham số khớp tóc từng kiểu (chr_v2_head.py --cfg): split = ngưỡng phía sau/trước tâm đầu khi đẩy tóc ra khỏi thân. */
const CFG = {
  'nam/a': { split: 0.07 },
  'nam/b': { split: 0.07 },
  'nu/a': { split: 0.07 },
  'nu/b': { split: 0.07, dy: 0.02, hair_w: 1.38, cap_up: 0.012, dz: -0.02 },
};

for (const sex of ['nam', 'nu']) {
  if (onlySex && onlySex !== sex) continue;
  const base = path.join(tmp, sex);
  let r = spawnSync(blender, ['--background', '--factory-startup', '--python', path.join(here, 'chr_base_v2.py'), '--', sex, base, '--blend'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  for (const style of ['a', 'b']) {
    if (onlyStyle && onlyStyle !== style) continue;
    const id = style === 'a' ? `chr_v2_${sex}` : `chr_v2_hb_${sex}`;
    const out = path.join(tmp, `${sex}_${style}`);
    r = spawnSync(
      blender,
      ['--background', '--factory-startup', '--python', path.join(here, 'chr_v2_head.py'), '--', sex, path.join(base, `chr_v2_${sex}.blend`), path.join(tripo, `raw_head_${sex}_v01.glb`), path.join(tripo, `raw_hair_${sex}_${style}_v01.glb`), out, '--cfg', JSON.stringify(CFG[`${sex}/${style}`])],
      { stdio: 'inherit' },
    );
    if (r.status !== 0) process.exit(r.status ?? 1);
    const dst = path.join(source, 'chr', id, 'tripo');
    fs.mkdirSync(dst, { recursive: true });
    fs.copyFileSync(path.join(out, 'rig_v01.glb'), path.join(dst, 'rig_v01.glb'));
    console.log(`[build-chr-v2] ${id} → ${dst}`);
  }
}
