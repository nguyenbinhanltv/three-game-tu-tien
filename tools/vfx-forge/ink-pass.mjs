// V-P2..P8: lượt "ink" tự động cho timeline của một danh sách chiêu (xem docs/handbook/vfx-forge.md): hình toon + decal rune/crack dùng kiểu mực,
// tông rim/accent của hình toon đổi sang body (viền trắng chìm trên nền đá sáng), bỏ khói bụi trắng (flip dust_kick) và vết cháy (decal scorch).
// Dùng: node tools/vfx-forge/ink-pass.mjs <id chiêu>...   (chạy lại an toàn: không đổi gì thêm)
import fs from 'node:fs';
const TOON = new Set([
  'slash_thick',
  'slash_thin',
  'slash_cross',
  'slash_fan',
  'crack_radial',
  'rift_line',
  'rune_ring2',
  'shock_cone',
  'ripple',
  'crescent',
]);
for (const id of process.argv.slice(2)) {
  const p = `packages/content/data/fx/${id}.json`;
  const t = JSON.parse(fs.readFileSync(p, 'utf8'));
  let n = 0;
  t.events = t.events.filter((e) => {
    const drop = (e.type === 'mesh' && e.shape === 'flip' && e.flip === 'dust_kick') || (e.type === 'decal' && e.tex === 'scorch');
    if (drop) n++;
    return !drop;
  });
  for (const e of t.events) {
    if (e.type === 'mesh' && TOON.has(e.shape)) {
      if (!e.ink) n++;
      e.ink = true;
      if (!['slash_thick', 'slash_thin'].includes(e.shape) && (e.tone === 'rim' || e.tone === 'accent' || !e.tone)) e.tone = 'body';
    }
    if (e.type === 'decal' && (e.tex === 'rune' || e.tex === 'crack')) {
      if (!e.ink) n++;
      e.ink = true;
      e.tone = 'body';
    }
  }
  fs.writeFileSync(p, JSON.stringify(t, null, 1) + '\n');
  console.log(id, 'đổi', n);
}
