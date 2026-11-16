#!/usr/bin/env node
// Liệt kê id có `icon` nhưng chưa có ô trong atlas (đang dùng emoji `iconFallback`).
// Dùng: node tools/codex-assets/missing.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const methods = read('packages/content/data/methods.json');
const groups = {
  skills: read('packages/content/data/skills.json'),
  'methods.skills': methods.skills,
  items: read('packages/content/data/items.json'),
  'methods.items': methods.items,
  artifacts: read('packages/content/data/artifacts.json').items,
  alchemy: read('packages/content/data/alchemy.json').items,
  'equipment.templates': read('packages/content/data/equipment/templates.json'),
  'equipment.setItems': read('packages/content/data/equipment/setItems.json'),
};
const m = read('apps/client/public/assets/ui/icons.json');
const out = [];
for (const [g, defs] of Object.entries(groups)) for (const d of defs) if (!m.icons[d.icon]) out.push({ group: g, id: d.id, icon: d.icon, name: d.name ?? d.nameKey ?? '', tier: d.tier, quality: d.quality, set: d.set, fallback: d.iconFallback });
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else for (const o of out) console.log(`${o.group}\t${o.id}\t${o.icon}\t${o.tier ?? ''}\t${o.set ?? ''}`);
console.error(`${out.length} thiếu`);
