// Khóa chuỗi mồ côi (Đợt D → công cụ chính thức): `pnpm i18n:orphans` và một phần của `content:check`.
// Hai luật:
//  1. Họ khóa theo thực thể (`item.<id>.*`, `skill.<id>.*`, `quest.<id>.*`, `mon.<id>*`, `npc.<id>.*`, `set.`, `mark.`, `path.`, `method.`, `origin.`)
//     phải trỏ tới thực thể có thật (kể cả NPC hộ tống khai trong levels/*.json). Xóa thực thể thì phải xóa khóa.
//  2. Mọi khóa còn lại phải xuất hiện trong mã/dữ liệu ngoài file i18n (đúng tên khóa, hoặc dưới một tiền tố dựng động `x.${…}`),
//     trừ tiền tố trong `DYNAMIC_ALLOW` (khóa dựng bằng nhiều mảnh mà quét tĩnh không thấy). Không có git thì bỏ luật 2 (có cảnh báo).
// Giới hạn: quét tĩnh không biết khóa nào "chưa dùng" khi tiền tố động đã bao nó; luật 2 chỉ bắt khóa không thể được dựng.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACTS, ITEMS, LEVELS, MARKS, METHODS, MONSTERS, NPCS, ORIGINS, PATHS, QUESTS, SETS, SKILLS, METHOD_SKILLS } from '../index';
import { err } from './errors';

/** Khóa dựng nhiều mảnh (không có chuỗi literal tiền tố trong mã). Thêm dòng kèm lý do khi cần. */
const DYNAMIC_ALLOW: { prefix: string; why: string }[] = [
  { prefix: 'appearance.hair.', why: 'appearance.hair.<giới>.<id tóc> ghép theo data/equipment/appearance.json' },
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const I18N_DIR = 'packages/content/data/i18n';

const keys: string[] = [];
for (const f of fs.readdirSync(path.join(ROOT, I18N_DIR)).filter((n) => n.endsWith('.json')))
  keys.push(...Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, I18N_DIR, f), 'utf8'))));

// --- Luật 1: khóa theo thực thể ---
// NPC ngoài `npcs.json`: NPC hộ tống khai ở `escorts[].npc` của level (npc_thuong_nhan, npc_tinh_quang_do, …).
const levelNpcs = Object.values(LEVELS).flatMap((l) => ((l as { escorts?: { npc: string }[] }).escorts ?? []).map((e) => e.npc));
const families: Record<string, Set<string>> = {
  item: new Set([...ITEMS, ...ARTIFACTS].map((x) => x.id)),
  skill: new Set([...SKILLS, ...METHOD_SKILLS].map((x) => x.id)),
  quest: new Set(QUESTS.map((x) => x.id)),
  mon: new Set(MONSTERS.map((x) => x.id)),
  npc: new Set([...NPCS.map((x) => x.id), ...levelNpcs]),
  set: new Set(SETS.map((x) => x.id)),
  mark: new Set(MARKS.map((x) => x.id)),
  path: new Set(PATHS.map((x) => x.id)),
  method: new Set(METHODS.map((x) => x.id)),
  origin: new Set(ORIGINS.map((x) => x.id)),
};
/** Khóa nhóm chung (không thuộc một thực thể): `set.fx`, `origin.group`, … */
const FAMILY_SHARED = new Set(['set.fx', 'origin.group']);
for (const k of keys) {
  const [fam, id] = k.split('.');
  const ids = families[fam!];
  if (!ids || id === undefined || FAMILY_SHARED.has(k.split('.').slice(0, 2).join('.'))) continue;
  if (k.split('.').length < 2) continue;
  if (!ids.has(id)) err(`i18n: khóa ${k} trỏ tới ${fam} "${id}" không tồn tại (xóa khóa hoặc thêm thực thể)`);
}

// --- Luật 2: khóa phải xuất hiện đâu đó ---
function repoFiles(): string[] | null {
  try {
    return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
}
const files = repoFiles();
if (!files) {
  console.warn('[i18n:orphans] không có git: bỏ luật 2 (khóa không được tham chiếu)');
} else {
  const SELF = 'packages/content/src/checkparts/i18nOrphans.ts';
  const EXT = /\.(ts|tsx|json|mjs|py|css|html|js)$/;
  const SKIP = /^(docs|archive)\/|^assets\/source\/|^apps\/client\/public\/|pnpm-lock|asset-lock/;
  const parts: string[] = [];
  for (const f of files) {
    if (!EXT.test(f) || SKIP.test(f) || f === SELF || f.startsWith(I18N_DIR + '/')) continue;
    try {
      parts.push(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    } catch {
      /* file đã xóa khỏi đĩa nhưng còn trong chỉ mục */
    }
  }
  const text = parts.join('\n');
  const tokens = new Set(text.match(/[A-Za-z0-9_.]+/g));
  // Tiền tố dựng động: 'a.b.' (kết thúc bằng dấu chấm) hoặc `a.b.${…}`/'a.b.' + x.
  const dyn = new Set<string>(DYNAMIC_ALLOW.map((d) => d.prefix));
  for (const m of text.matchAll(/['"`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*\.)(?:['"`]|\$\{)/g)) dyn.add(m[1]!);
  for (const m of text.matchAll(/['"`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*)\.?\$\{/g)) dyn.add(m[1]! + '.');
  const skipFam = new Set(Object.keys(families)); // đã kiểm ở luật 1 (khóa dựng theo id thực thể)
  for (const k of keys) {
    if (skipFam.has(k.split('.')[0]!)) continue;
    if (tokens.has(k) || text.includes(k)) continue;
    const seg = k.split('.');
    let covered = false;
    for (let i = 1; i < seg.length && !covered; i++) covered = dyn.has(seg.slice(0, i).join('.') + '.');
    if (!covered) err(`i18n: khóa ${k} không xuất hiện ở đâu và không có tiền tố dựng động (xóa, hoặc thêm vào DYNAMIC_ALLOW kèm lý do)`);
  }
}
