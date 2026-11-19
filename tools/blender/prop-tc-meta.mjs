#!/usr/bin/env node
// Tạo assets/source/prop/<id>/meta.json cho mọi món PROP-1 khai ở tools/blender/prop_tc_items.json (idempotent: không ghi đè file đã có).
// Dùng: node tools/blender/prop-tc-meta.mjs   rồi   pnpm assets:build --only prop_tc_<tên đầu nhóm>  (job trong run.mjs, `propTcJobs`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const groups = JSON.parse(fs.readFileSync(path.join(root, 'tools/blender/prop_tc_items.json'), 'utf8')).groups;
let made = 0;
const licFile = path.join(root, 'assets/LICENSES.md');
const licRaw = fs.readFileSync(licFile, 'utf8');
const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);
const nl = licRaw.includes(CRLF) ? CRLF : LF;
const lines = licRaw.split(CRLF).join(LF).split(LF);
const anchor = lines.findIndex((l) => l.startsWith('| `arch_thien_khuyet` |'));
let licAdded = 0;
for (const [g, items] of Object.entries(groups)) {
  for (const it of items) {
    for (const id of [`prop_tc_${it.name}`, `prop_tc_${it.name}_2`]) {
      const f = path.join(root, 'assets/source/prop', id, 'meta.json');
      const row = `| \`${id}\` | Tự sinh bằng bộ kit \`tools/blender/thien_cong_kit.py\` + \`tools/blender/prop_tc_${g}.py\` (Blender headless); texture PBR Poly Haven CC0 (xem mục Thiên Công Khai Vật) | dự án | 2026-11-19 | PROP-1, nhóm ${g}: ${it.vi}${id.endsWith('_2') ? ' (biến thể 2)' : ''} |`;
      if (anchor >= 0 && !lines.some((l) => l.startsWith(`| \`${id}\` |`))) {
        lines.splice(anchor + 1 + licAdded, 0, row);
        licAdded++;
      }
      if (fs.existsSync(f)) continue;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const meta = {
        $schema: '../../../meta.schema.json',
        id,
        type: 'prop',
        budgetClass: 'prop',
        itemId: null,
        status: 'in_game',
        budget: { faceLimit: 5000, texture: 512 },
        procedural: { script: 'tools/blender/prop_tc.py', seed: null },
        license: {
          source: `Tự sinh bằng bộ kit tools/blender/thien_cong_kit.py + prop_tc_${g}.py (PROP-1, nhóm ${g}, "${it.vi}"); texture PBR Poly Haven CC0`,
          owner: 'dự án',
          date: '2026-11-19',
        },
      };
      fs.writeFileSync(f, `${JSON.stringify(meta, null, 2)}\n`);
      made++;
    }
  }
}
if (licAdded) fs.writeFileSync(licFile, lines.join(nl));
console.log(`[prop-tc-meta] đã tạo ${made} meta.json, thêm ${licAdded} dòng LICENSES.md`);
