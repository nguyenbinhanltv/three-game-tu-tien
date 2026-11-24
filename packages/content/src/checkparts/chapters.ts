// Tách từ check.ts (tối ưu Đợt E): chapters.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hasString, ITEMS, LEVELS, MONSTERS, QUESTS, CHAPTERS } from '../index';
import { TRIB_IDS } from '@dtl/shared';
import { TELE_PADS } from '@dtl/shared';

import { uniqueIds, err } from './base';
// ---- Truyền Tống Trận liên level (E1-B): bản đồ đích phải có thật và là bản đồ thế giới. Kiểm chi tiết từng trận: levelcheck.ts ----
// TELE_PAD là Map toàn cục theo id (server/character tra không kèm level): id trận phải duy nhất trên mọi level.
uniqueIds('trận', [...TELE_PADS]);
for (const pad of TELE_PADS) {
  const dest = LEVELS[pad.level];
  if (!dest || dest.dungeon) err(`trận ${pad.id}: level ${pad.level} không phải bản đồ thế giới`);
}

// ---- Hành trình theo chương (U2-4): chapters.json chỉ tham chiếu thứ có thật ----
{
  const chIds = new Set<string>();
  const art = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL('../../../../apps/client/public/assets/art/art.json', import.meta.url)), 'utf8'),
  ) as {
    files: Record<string, Record<string, unknown>>;
  };
  let prevHi = 0;
  for (const c of CHAPTERS) {
    const w = `chương ${c.id}`;
    if (chIds.has(c.id)) err(`${w}: id trùng`);
    chIds.add(c.id);
    if (!LEVELS[c.level] || LEVELS[c.level]!.dungeon) err(`${w}: level ${c.level} không phải bản đồ thế giới`);
    if (!art.files.loading?.[c.art]) err(`${w}: thiếu tranh nền art/loading/${c.art}`);
    if (c.levels[0] > c.levels[1] || c.levels[0] !== prevHi + 1)
      err(`${w}: khoảng cấp ${c.levels.join('–')} phải nối liền chương trước (${prevHi})`);
    prevHi = c.levels[1];
    if (!QUESTS.some((q) => q.id === c.closeQuest)) err(`${w}: nhiệm vụ chốt ${c.closeQuest} không có`);
    for (const k of ['name', 'desc']) if (!hasString(`ui.chapters.${c.id}.${k}`)) err(`${w}: thiếu chuỗi ui.chapters.${c.id}.${k}`);
    if (!c.featured.length) err(`${w}: featured rỗng`);
    for (const i of c.featured) if (!ITEMS.some((x) => x.id === i)) err(`${w}: vật phẩm nổi bật ${i} không có`);
    const nodeIds = new Set<string>();
    for (const n of c.nodes) {
      const nw = `${w} nút ${n.id}`;
      if (nodeIds.has(n.id)) err(`${nw}: id trùng`);
      nodeIds.add(n.id);
      if (n.x < 0 || n.x > 100 || n.y < 0 || n.y > 100) err(`${nw}: x,y ngoài 0–100`);
      if (n.kind === 'world' && n.ref !== c.level) err(`${nw}: nút thế giới phải trỏ level của chương`);
      if (n.kind === 'dungeon' && !LEVELS[n.ref]?.dungeon) err(`${nw}: ${n.ref} không phải phó bản`);
      if (n.kind === 'boss' && !MONSTERS.some((m) => m.id === n.ref && m.boss)) err(`${nw}: ${n.ref} không phải boss`);
      if (n.kind === 'trib' && !(TRIB_IDS as readonly string[]).includes(n.ref)) err(`${nw}: kiếp ${n.ref} không có`);
      if (n.tele && !TELE_PADS.some((p) => p.id === n.tele && p.level === c.level))
        err(`${nw}: trận ${n.tele} không thuộc level ${c.level}`);
      const key = {
        world: `ui.chapters.world.${n.ref}`,
        dungeon: `dungeon.${n.ref}.name`,
        boss: `mon.${n.ref}`,
        trib: `ui.chapters.trib.${n.ref}`,
      }[n.kind];
      if (!hasString(key)) err(`${nw}: thiếu chuỗi ${key}`);
    }
    if (c.nodes.filter((n) => n.kind === 'world').length !== 1) err(`${w}: phải có đúng một nút thế giới`);
  }
}
