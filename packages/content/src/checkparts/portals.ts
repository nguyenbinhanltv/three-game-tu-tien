// Tách từ check.ts (tối ưu Đợt E): portals.

import { kieuOfLevel } from '@dtl/shared';
import { SETS, hasString, ITEM, LEVELS, MONSTER, NPCS } from '../index';
import { terrainOf } from '@dtl/shared';

import { at } from '@dtl/shared';
import { err } from './base';
// ---- Cổng và bí cảnh theo dữ liệu (E1-B) ----
for (const lv of Object.values(LEVELS)) {
  for (const q of lv.portals ?? []) {
    if (!LEVELS[q.to]?.dungeon) err(`level ${lv.id}: cổng dẫn tới ${q.to} không phải bí cảnh`);
    if (lv.dungeon) err(`level ${lv.id}: bí cảnh không có cổng vào bí cảnh khác`);
  }
  const d = lv.dungeon;
  if (!d) continue;
  const w = `bí cảnh ${lv.id}`;
  const ret = LEVELS[d.returnLevel];
  if (!ret || ret.dungeon) err(`${w}: returnLevel ${d.returnLevel} không phải bản đồ thế giới`);
  // Sân độ kiếp (E1-F) vào bằng vé của kiếp, không có cổng và không có đợt quái.
  if (lv.tribulation) {
    if (d.waves.length) err(`${w}: sân độ kiếp không có đợt quái`);
  } else {
    // Phòng cầu Cửu Kiều vào bằng vé của Dẫn Kiều Nhân (KieuSystem.plan), không có cổng trên bản đồ thế giới.
    // Phòng tập GM (`practice`) vào bằng lệnh GM: không có cổng, không có đợt quái, và phải là phòng riêng.
    if (d.practice && (!d.private || d.waves.length || d.reward)) err(`${w}: phòng tập phải private, không đợt quái, không thưởng`);
    if (!d.practice && kieuOfLevel(lv.id) === null && !(ret?.portals ?? []).some((q) => q.to === lv.id))
      err(`${w}: ${d.returnLevel} không có cổng dẫn vào`);
    if (kieuOfLevel(lv.id) !== null) {
      if (!d.private) err(`${w}: phòng cầu phải là phó bản riêng (private)`);
      if (!NPCS.some((n) => n.id === 'npc_dan_kieu_nhan' && n.level === d.returnLevel))
        err(`${w}: returnLevel ${d.returnLevel} không có Dẫn Kiều Nhân`);
    }
    if (!d.practice && !d.waves.length) err(`${w}: thiếu đợt quái`);
  }
  for (const wv of d.waves) for (const g of wv.mons) if (!MONSTER.get(g.id)) err(`${w}: quái ${g.id} không tồn tại`);
  d.waves.forEach((wv, i) => {
    const ww = `${w}, đợt ${i + 1}`;
    for (const g of wv.mons) {
      if (g.at !== undefined && !wv.points?.[g.at]) err(`${ww}: quái ${g.id} trỏ điểm sinh ${g.at} không có`);
      if (!(g.n >= 1)) err(`${ww}: quái ${g.id} số lượng phải >= 1`);
    }
    for (const pt of wv.points ?? [])
      if (!Number.isFinite(terrainOf(lv).groundAt(pt.x, pt.z))) err(`${ww}: điểm sinh (${pt.x}, ${pt.z}) ngoài bản đồ`);
    if (wv.seals) {
      const sl = wv.seals;
      if (sl.doors.length < 1 || sl.doors.length > 5) err(`${ww}: phong ấn cần 1–5 cửa`);
      for (const d of sl.doors) {
        for (const [x, z] of [
          [d.x, d.z],
          [d.gx, d.gz],
        ] as const)
          if (!Number.isFinite(terrainOf(lv).groundAt(x, z))) err(`${ww}: cửa phong ấn (${x}, ${z}) ngoài bản đồ`);
        const c = lv.dungeon!.center;
        if (Math.hypot(d.gx - c.x, d.gz - c.z) > (lv.dungeon!.bound ?? 90) - 6)
          err(`${ww}: trận môn (${d.gx}, ${d.gz}) ngoài vòng bí cảnh`);
        if (Math.hypot(d.x - d.gx, d.z - d.gz) < sl.bar + 2) err(`${ww}: cửa phải cách trận môn ≥ bar + 2 m để chặn không đè lên cửa`);
      }
      if (!(sl.touch > 0 && sl.touch <= 6 && sl.phuR >= 4 && sl.bar >= sl.touch + 2))
        err(`${ww}: seals touch ≤ 6, phuR ≥ 4, bar ≥ touch + 2`);
      if (!MONSTER.get(sl.reinforce.mon)) err(`${ww}: quái tiếp viện ${sl.reinforce.mon} không tồn tại`);
      if (!wv.title) err(`${ww}: đợt phong ấn phải có title`);
    }
    if (wv.steles) {
      const sl = wv.steles;
      const c = lv.dungeon!.center;
      if (Math.hypot(sl.x - c.x, sl.z - c.z) > (lv.dungeon!.bound ?? 90) - sl.r - 8)
        err(`${ww}: bia (${sl.x}, ${sl.z}) ngoài vòng bí cảnh`);
      if (!(sl.r >= 4 && sl.r <= 12 && sl.secs >= 20 && sl.secs <= 120 && sl.grace >= 3 && sl.press > 0 && sl.press <= 0.05))
        err(`${ww}: steles r 4–12, 20–120 s, grace ≥ 3 s, press ∈ (0; 5%]`);
      for (const g of sl.reinforce) {
        if (!MONSTER.get(g.mon)) err(`${ww}: quái tiếp viện ${g.mon} không tồn tại`);
        if (!(g.at >= 0 && g.at < sl.secs && g.n >= 1)) err(`${ww}: tiếp viện phải có at trong [0; secs) và n ≥ 1`);
      }
      if (!wv.title) err(`${ww}: đợt giữ bia phải có title`);
    }
    if (wv.shadow) {
      const sh = wv.shadow;
      if (kieuOfLevel(lv.id) === null) err(`${ww}: đợt Kiếm Ảnh chỉ dùng ở phòng cầu`);
      if (!(sh.hpMul > 0 && sh.hpMul <= 3 && sh.atkMul > 0 && sh.atkMul <= 4)) err(`${ww}: shadow hpMul ∈ (0; 3], atkMul ∈ (0; 4]`);
      if (!(sh.strikeEvery >= 3 && sh.r >= 2 && sh.r <= 8 && sh.mul > 0)) err(`${ww}: shadow strikeEvery ≥ 3 s, r 2–8 m, mul > 0`);
      if (!wv.title) err(`${ww}: đợt Kiếm Ảnh phải có title`);
    }
    if (wv.puzzle) {
      const pz = wv.puzzle;
      if (pz.points.length < 3 || pz.points.length > 4) err(`${ww}: đố gương/đèn cần 3–4 điểm`);
      if (pz.msg !== undefined && !hasString(`sys.${pz.msg}_puzzle`)) err(`${ww}: thiếu chuỗi sys.${pz.msg}_puzzle`);
      for (const pt of pz.points)
        if (!Number.isFinite(terrainOf(lv).groundAt(pt.x, pt.z))) err(`${ww}: cột gương (${pt.x}, ${pt.z}) ngoài bản đồ`);
      if (!(pz.secs >= 10 && pz.secs <= 60)) err(`${ww}: đố gương secs phải trong [10; 60]`);
      if (!MONSTER.get(pz.wrong.mon)) err(`${ww}: quái phạt ${pz.wrong.mon} không tồn tại`);
      if (!(pz.bossCut >= 0 && pz.bossCut <= 0.2)) err(`${ww}: bossCut phải trong [0; 0,2]`);
      if (!wv.title) err(`${ww}: đợt đố gương phải có title`);
    }
    if (wv.title && !hasString(`dungeon.${lv.id}.wave.${i + 1}`)) err(`${ww}: thiếu chuỗi dungeon.${lv.id}.wave.${i + 1}`);
  });
  if (!lv.tribulation && !hasString(`dungeon.${lv.id}.name`)) err(`${w}: thiếu chuỗi dungeon.${lv.id}.name`);
  if (d.timeLimit !== undefined && !(d.timeLimit >= 60 && d.timeLimit <= 900)) err(`${w}: timeLimit phải trong [60; 900] giây`);
  if (d.maxRevives !== undefined && !(d.maxRevives >= 0)) err(`${w}: maxRevives không hợp lệ`);
  if (d.lockAt !== undefined && !(d.lockAt >= 1 && d.lockAt <= d.waves.length)) err(`${w}: lockAt ngoài số đợt`);
  const rw = d.reward;
  if (rw) {
    if (!(rw.xpPct > 0 && rw.xpPct <= 0.5)) err(`${w}: thưởng xpPct phải trong (0; 0,5]`);
    if (!(rw.gold.length === 2 && at(rw.gold, 0) >= 0 && at(rw.gold, 1) >= at(rw.gold, 0))) err(`${w}: thưởng gold phải là [thấp, cao]`);
    for (const it of rw.items) {
      if (!ITEM.get(it.item)) err(`${w}: thưởng vật phẩm ${it.item} không tồn tại`);
      if (!(it.chance > 0 && it.chance <= 1 && it.min >= 1 && it.max >= it.min)) err(`${w}: thưởng ${it.item} chance/min/max không hợp lệ`);
    }
    for (const e of rw.equip ?? []) {
      if (e.set && !SETS.some((x) => x.id === e.set)) err(`${w}: thưởng bộ ${e.set} không tồn tại`);
      if (e.q.length !== 5 || e.q.reduce((a, b) => a + b, 0) !== 100) err(`${w}: thưởng equip.q phải 5 phần tử tổng 100`);
    }
  }
  for (const pt of [d.spawn, d.exit, d.center])
    if (!Number.isFinite(terrainOf(lv).groundAt(pt.x, pt.z))) err(`${w}: điểm (${pt.x}, ${pt.z}) ngoài bản đồ`);
}
if (!at(LEVELS, 'van_lam').spawn) err('van_lam: thiếu spawn');
