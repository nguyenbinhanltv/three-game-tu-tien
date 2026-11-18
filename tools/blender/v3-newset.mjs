#!/usr/bin/env node
// Tạo meta.json + dòng assets/LICENSES.md cho các bộ v3 khai ở tools/blender/skins/v3sets/<bộ>.json (idempotent: không ghi đè cái đã có).
// Dùng: node tools/blender/v3-newset.mjs <set> [<set>…]   hoặc   --all
// Sau đó: DTL_ASSET_SOURCE=… pnpm assets:build --only chr_v3_<set>_<nam|nu>  (job nằm trong run.mjs, `v3SetEntries`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'tools/blender/skins/v3sets');
const args = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
const wanted = args.includes('--all') ? files : files.filter((f) => args.includes(f.replace(/\.json$/, '')));
if (!wanted.length) {
  console.error('Dùng: node tools/blender/v3-newset.mjs <set>…|--all (set = tên file trong tools/blender/skins/v3sets, không có .json)');
  process.exit(1);
}
const lic = path.join(root, 'assets/LICENSES.md');
let licText = fs.readFileSync(lic, 'utf8');
const nl = licText.includes('\r\n') ? '\r\n' : '\n';
const lines = licText.replace(/\r\n/g, '\n').split('\n');
for (const f of wanted) {
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const g of Object.keys(cfg.height)) {
    const id = `chr_v3_${cfg.set}_${g}`;
    const mdir = path.join(root, 'assets/source/chr', id);
    const mfile = path.join(mdir, 'meta.json');
    const gen = g === 'nam' ? 'nam' : 'nữ';
    if (!fs.existsSync(mfile)) {
      fs.mkdirSync(mdir, { recursive: true });
      const meta = {
        $schema: '../../../meta.schema.json',
        id,
        type: 'chr',
        budgetClass: 'player_v3',
        itemId: null,
        status: 'imported',
        budget: { faceLimit: 24000, texture: 2048 },
        procedural: { script: 'tools/blender/chr_v3.py', seed: null },
        license: {
          source: `Tripo web app (image→3D, người dùng dựng) từ concept Codex ${cfg.name ?? cfg.set} (v3, ${gen}); đặt lên xương UE5 Mannequin bằng tools/blender/chr_v3.py`,
          owner: 'dự án',
          date: new Date().toISOString().slice(0, 10),
        },
      };
      fs.writeFileSync(mfile, JSON.stringify(meta, null, 2) + '\n');
      console.log(`+ ${path.relative(root, mfile)}`);
    }
    if (!lines.some((l) => l.startsWith(`| \`${id}\` `))) {
      const at = Math.max(...lines.map((l, i) => (l.startsWith('| `chr_v3') ? i : -1)));
      lines.splice(at + 1, 0, `| \`${id}\` | Tripo web app (image→3D, người dùng dựng) từ concept Codex ${cfg.name ?? cfg.set} (v3, ${gen}); đặt lên xương UE5 Mannequin bằng \`tools/blender/chr_v3.py\` | dự án | ${new Date().toISOString().slice(0, 10)} | xem meta.json |`);
      console.log(`+ LICENSES.md: ${id}`);
    }
  }
}
fs.writeFileSync(lic, lines.join(nl));
