// Tách từ check.ts (tối ưu Đợt E): equip.

import {
  AFFIX_ILVL_CAP,
  ROOT_IDS,
  droppableSlots,
  templatesFor,
  type EquipSlot,
  budget,
  ELEMENTS,
  EQUIP_SLOTS,
  isEquipSlot,
  QUALITY_COUNT,
  QUALITY_MUL,
  rollItemInstance,
  seededRng,
  parseInst,
  STAT_PER_POINT,
  type LootDef,
  type MonsterAi,
  type MonsterDef,
  phaseRules,
} from '@dtl/shared';
import { SETS, GLOSSARY, hasString, ITEM, ITEM_SYS, ITEMS, MONSTER, MONSTERS, NPC, RECIPES, SKILLS, t } from '../index';
import { LOOT } from '../loot';
import { monSkillsOf } from '@dtl/shared';
import { TRIB_DEFS } from '@dtl/shared';

import { at } from '@dtl/shared';
import { err, ALL_SKILLS } from './base';
import { needStr, needItem } from './palette';
// ---- trang bị 8 ô (Phase 3-1) ----
{
  const sys = ITEM_SYS;
  const where = 'equipment';
  if (sys.slots.map((x) => x.id).join() !== EQUIP_SLOTS.join())
    err(`${where}: slots.json phải đúng thứ tự EQUIP_SLOTS (${EQUIP_SLOTS.join(', ')})`);
  for (const sd of sys.slots) {
    needStr(`ui.equip.${sd.id}`);
    needStr(`ui.item.kind.${sd.id}`);
    if (GLOSSARY.equipSlots[sd.id as keyof typeof GLOSSARY.equipSlots] !== t(`ui.equip.${sd.id}`))
      err(`${where}: tên ô ${sd.id} lệch glossary.equipSlots`);
    if (!(sd.weight >= 0 && sd.weight <= 3)) err(`slot ${sd.id}: weight phải trong [0, 3]`);
    const shares = Object.entries(sd.main);
    const sum = shares.reduce((s, [, v]) => s + (v ?? 0), 0);
    if (sd.weight > 0 && Math.abs(sum - 1) > 1e-9) err(`slot ${sd.id}: tổng chia dòng chính phải bằng 1 (đang ${sum})`);
    if (sd.weight === 0 && shares.length) err(`slot ${sd.id}: weight 0 thì không có dòng chính`);
    for (const [k] of shares) if (!(k in STAT_PER_POINT)) err(`slot ${sd.id}: chỉ số chính lạ ${k}`);
  }
  if (sys.qualities.length !== QUALITY_COUNT || QUALITY_MUL.length !== QUALITY_COUNT)
    err(`${where}: phải có ${QUALITY_COUNT} phẩm khớp QUALITY_MUL`);
  sys.qualities.forEach((q, i) => {
    if (q.id !== i) err(`quality ${i}: id phải bằng chỉ số`);
    needStr(`ui.quality.${i}`);
    if (GLOSSARY.qualities[i] !== t(`ui.quality.${i}`)) err(`${where}: tên phẩm ${i} lệch glossary.qualities`);
    if (q.affixes !== i) err(`quality ${i}: số dòng phụ phải bằng ${i} (thiết kế 3.2)`);
    if (!(q.affixFrac >= 0 && q.affixFrac < 0.6) || (i === 0) !== (q.affixFrac === 0)) err(`quality ${i}: affixFrac không hợp lệ`);
    if (!/^#[0-9a-fA-F]{6}$/.test(q.color)) err(`quality ${i}: màu không hợp lệ`);
    if (i > 0 && !(q.affixFrac >= at(sys.qualities, i - 1).affixFrac)) err(`quality ${i}: affixFrac phải không giảm`);
  });
  if (sys.affixes.length !== 14) err(`${where}: phải có đúng 14 loại dòng phụ (đang ${sys.affixes.length})`);
  const slotIds = new Set<string>(EQUIP_SLOTS);
  for (const a of sys.affixes) {
    needStr(`ui.affix.${a.id}`);
    if (!(a.min > 0 && a.max >= a.min && a.max < 1)) err(`affix ${a.id}: khoảng giá trị không hợp lệ`);
    if (!(a.weight > 0)) err(`affix ${a.id}: weight phải > 0`);
    for (const s of a.slots ?? []) if (!slotIds.has(s)) err(`affix ${a.id}: ô lạ ${s}`);
    if (a.param && !sys.params[a.param]?.length) err(`affix ${a.id}: thiếu danh sách tham số ${a.param}`);
    if (a.param && !t(`ui.affix.${a.id}`).includes('{p}')) err(`affix ${a.id}: chuỗi phải có {p}`);
    if (!t(`ui.affix.${a.id}`).includes('{v}')) err(`affix ${a.id}: chuỗi phải có {v}`);
  }
  if (new Set(sys.affixes.map((a) => a.id)).size !== sys.affixes.length) err(`${where}: id dòng phụ trùng`);
  for (const sk of sys.params.skill) if (!SKILLS.some((s) => s.id === sk)) err(`${where}: chiêu không tồn tại ${sk}`);
  if (sys.params.element.join() !== ELEMENTS.join()) err(`${where}: params.element phải là ${ELEMENTS.join(', ')}`);
  for (const e of sys.params.element) needStr(`ui.element.${e}`);
  // Mọi ô có chỉ số phải có đủ dòng phụ hợp lệ để roll đủ phẩm Thiên (4 dòng khác nhau).
  for (const sd of sys.slots) {
    if (sd.weight <= 0) continue;
    const pool = sys.affixes
      .filter((a) => !a.slots || a.slots.includes(sd.id))
      .reduce((n, a) => n + (a.param ? sys.params[a.param].length : 1), 0);
    if (pool < (sys.qualities[QUALITY_COUNT - 1]?.affixes ?? 0)) err(`slot ${sd.id}: không đủ dòng phụ để roll phẩm cao nhất`);
  }
  // Mô phỏng nhanh: roll nhiều lần mọi ô × phẩm phải qua parseInst, không vượt ngân sách, số dòng đúng.
  const rng = seededRng(20261115);
  for (const sd of sys.slots) {
    for (let q = 0; q < QUALITY_COUNT; q++) {
      for (const ilvl of [1, 8, AFFIX_ILVL_CAP, 30]) {
        for (let n = 0; n < 40; n++) {
          const inst = rollItemInstance(sys, sd.id, ilvl, q as 0, rng);
          if (!parseInst(sys, sd.id, inst)) err(`roll ${sd.id}/q${q}/ilvl${ilvl}: parseInst từ chối kết quả roll`);
          if (inst.affixes.length !== (sd.weight > 0 ? q : 0)) err(`roll ${sd.id}/q${q}: số dòng phụ sai (${inst.affixes.length})`);
          const bound = budget(ilvl, q as 0, sd.weight) * 1.06;
          const mainPts = Object.entries(inst.main).reduce((s, [k, v]) => s + (v ?? 0) / STAT_PER_POINT[k as 'atk'], 0);
          if (mainPts > bound + 2)
            err(`roll ${sd.id}/q${q}/ilvl${ilvl}: dòng chính ${mainPts.toFixed(1)} vượt ngân sách ${bound.toFixed(1)}`);
        }
      }
    }
  }
  // Mẫu trang bị: kind khớp ô hợp lệ, reqLevel có mặt.
  for (const it of ITEMS) {
    if (isEquipSlot(it.kind) && (it.reqLevel ?? 0) < 1) err(`item ${it.id}: trang bị phải có reqLevel`);
  }
}

const KINDS = ['lightning', 'frost', 'fire', 'spirit'];

/** Kiểm bộ chiêu của quái (với boss có pha: kiểm bộ chiêu đã ghép của từng pha). `at` ghi rõ pha trong thông báo lỗi. */
function checkAi(m: MonsterDef, ai: MonsterAi, attackCd: number, at: string) {
  const id = `monster ${m.id}${at}`;
  const combo = ai.combo;
  if (combo) {
    if (!(combo.chance > 0 && combo.chance <= 1)) err(`${id}: combo.chance phải trong (0, 1]`);
    if (!(combo.delay >= 0.25 && combo.delay < attackCd)) err(`${id}: combo.delay phải từ 0,25 tới dưới attackCd`);
    if (!(combo.mul > 0 && combo.mul <= 3)) err(`${id}: combo.mul phải trong (0, 3]`);
  }
  const cs = ai.caster;
  if (cs) {
    if (m.boss) err(`${id}: boss chưa hỗ trợ caster`);
    if (!['circle', 'rect', 'cone', 'bolt'].includes(cs.shape)) err(`${id}: caster.shape không hợp lệ`);
    if (!KINDS.includes(cs.kind)) err(`${id}: caster.kind không hợp lệ`);
    // Né bằng di chuyển phải làm được: vùng hiện ít nhất 0,9 giây, tổng thời gian báo trước ít nhất 1,5 giây.
    if (!(cs.delay >= 0.9)) err(`${id}: caster.delay phải >= 0,9 giây`);
    if (!(cs.cast >= 0.3 && cs.cast + cs.delay >= 1.5)) err(`${id}: caster.cast + delay phải >= 1,5 giây`);
    if (!(cs.cd >= 2)) err(`${id}: caster.cd phải >= 2 giây`);
    if (!(cs.mul > 0 && cs.mul <= 3)) err(`${id}: caster.mul phải trong (0, 3]`);
    if (!(cs.range > 3 && cs.range <= m.aggro + 4)) err(`${id}: caster.range phải trong (3, aggro + 4]`);
    if (cs.shape !== 'bolt' && !(cs.r > 0 && cs.r <= 20)) err(`${id}: caster.r phải trong (0, 20]`);
    if ((cs.shape === 'rect' || cs.shape === 'cone') && cs.r < cs.range) err(`${id}: caster.r phải >= range với hình rect/cone`);
    if (cs.shape === 'rect' && !(cs.w !== undefined && cs.w > 0 && cs.w <= 6)) err(`${id}: rect cần w trong (0, 6]`);
    if (cs.shape === 'cone' && !(cs.w !== undefined && cs.w > 0 && cs.w <= 75)) err(`${id}: cone cần w (nửa góc, độ) trong (0, 75]`);
    if (cs.shape === 'bolt') {
      // Đạn phải bay chậm, nhìn thấy, né được bằng bước ngang (D1).
      const v = cs.speed ?? 0;
      if (!(v >= 5 && v <= 14)) err(`${id}: bolt cần speed trong [5, 14] m/s (chậm, né được)`);
      if (!(cs.r >= 0.2 && cs.r <= 1.2)) err(`${id}: bolt cần r (bán kính đạn) trong [0,2; 1,2]`);
      if (cs.n !== undefined && !(Number.isInteger(cs.n) && cs.n >= 1 && cs.n <= 5)) err(`${id}: bolt.n phải nguyên trong [1, 5]`);
      if (cs.spread !== undefined && !(cs.spread >= 0 && cs.spread <= 60)) err(`${id}: bolt.spread (độ) trong [0, 60]`);
      if ((cs.n ?? 1) > 1 && !(cs.spread! > 0)) err(`${id}: bolt nhiều viên cần spread > 0`);
      // Quái lùi giữ khoảng cách từ 0,35 × range: lúc đó vẫn phải có ít nhất 1,2 giây từ khi tụ lực tới khi đạn tới.
      if (v > 0 && !(cs.cast + (cs.range * 0.35) / v >= 1.2)) err(`${id}: bolt cast + (0,35 × range)/speed phải >= 1,2 giây`);
    }
  }
  const ch = ai.chant;
  if (ch) {
    if (!m.boss) err(`${id}: chỉ boss mới niệm chú`);
    if (!KINDS.includes(ch.kind)) err(`${id}: chant.kind không hợp lệ`);
    if (!(ch.cast >= 1.2 && ch.cast <= 5)) err(`${id}: chant.cast phải trong [1,2; 5] giây`);
    if (!(ch.open >= 0 && ch.open <= 0.6)) err(`${id}: chant.open phải trong [0; 0,6]`);
    // Cửa sổ ngắt phải đủ rộng cho độ trễ mạng + GCD 1 giây.
    if (!(ch.cast * (1 - ch.open) >= 1.2)) err(`${id}: cửa sổ ngắt cast·(1 − open) phải >= 1,2 giây`);
    if (!(ch.delay >= 0.9)) err(`${id}: chant.delay phải >= 0,9 giây`);
    if (!(ch.stun >= 1 && ch.stun <= 6)) err(`${id}: chant.stun phải trong [1; 6] giây`);
    if (!(ch.cd > ch.cast + ch.delay + ch.stun)) err(`${id}: chant.cd phải lớn hơn cast + delay + stun`);
    // Trần 5: đòn tự bạo cuối trận của Thôn Mạch (E2-C) cần ~65% máu tối đa người cấp 19.
    if (!(ch.mul > 0 && ch.mul <= 5)) err(`${id}: chant.mul phải trong (0, 5]`);
    if (!(ch.r > 0 && ch.r <= 20)) err(`${id}: chant.r phải trong (0, 20]`);
    const pu = ch.pull;
    if (pu) {
      if (!(pu.range >= ch.r && pu.range <= 30)) err(`${id}: chant.pull.range phải trong [chant.r; 30] m`);
      if (!(pu.delay >= 0.9 && pu.delay <= 3)) err(`${id}: chant.pull.delay phải trong [0,9; 3] giây (đủ thời gian báo)`);
      if (!(pu.dur >= 0.4 && pu.dur <= 2)) err(`${id}: chant.pull.dur phải trong [0,4; 2] giây`);
      if (!(pu.stop >= 1 && pu.stop <= ch.r)) err(`${id}: chant.pull.stop phải trong [1; chant.r] m (kéo vào trong vùng nổ)`);
      if (!(ch.cd > ch.cast + pu.delay + pu.dur + ch.delay + ch.stun))
        err(`${id}: chant.cd phải lớn hơn cast + pull.delay + pull.dur + delay + stun`);
    }
  }
  const dp = m.deathPool;
  if (dp) {
    if (m.boss) err(`${id}: vũng độc khi chết chỉ cho quái thường/tinh anh`);
    if (!KINDS.includes(dp.kind)) err(`${id}: deathPool.kind không hợp lệ`);
    if (!(dp.r >= 1 && dp.r <= 6)) err(`${id}: deathPool.r phải trong [1; 6] m`);
    if (!(dp.delay >= 0.9 && dp.delay <= 3)) err(`${id}: deathPool.delay phải trong [0,9; 3] giây (đủ thời gian báo)`);
    if (!(dp.dur >= 2 && dp.dur <= 10)) err(`${id}: deathPool.dur phải trong [2; 10] giây`);
    if (!(dp.tick >= 0.5 && dp.tick <= 2)) err(`${id}: deathPool.tick phải trong [0,5; 2] giây`);
    if (!(dp.mul > 0 && dp.mul <= 0.5)) err(`${id}: deathPool.mul phải trong (0; 0,5] (sát thương nhỏ mỗi nhịp)`);
  }
  const sl = ai.slam;
  if (sl) {
    if (!m.boss) err(`${id}: chỉ boss mới có slam`);
    if (!KINDS.includes(sl.kind)) err(`${id}: slam.kind không hợp lệ`);
    if (!(sl.delay >= 1.2)) err(`${id}: slam.delay phải >= 1,2 giây (vùng hiện dưới chân, cần thời gian chạy ra)`);
    if (!(sl.cd > sl.delay + 2)) err(`${id}: slam.cd phải lớn hơn delay + 2`);
    if (!(sl.mul > 0 && sl.mul <= 3)) err(`${id}: slam.mul phải trong (0, 3]`);
    if (!(sl.r > 0 && sl.r <= 8)) err(`${id}: slam.r phải trong (0, 8]`);
    if (!(Number.isInteger(sl.max) && sl.max >= 1 && sl.max <= 5)) err(`${id}: slam.max phải là số nguyên 1–5`);
  }
  const sw = ai.sweep;
  if (sw) {
    if (!m.boss) err(`${id}: chỉ boss mới có sweep`);
    if (!KINDS.includes(sw.kind)) err(`${id}: sweep.kind không hợp lệ`);
    if (sw.shape !== 'rect' && sw.shape !== 'cone') err(`${id}: sweep.shape phải là rect hoặc cone`);
    // Vùng hiện ngay khi boss khóa hướng: cần đủ thời gian đi ngang ra khỏi vùng.
    if (!(sw.delay >= 1.2 && sw.delay <= 3)) err(`${id}: sweep.delay phải trong [1,2; 3] giây`);
    if (!(sw.cd > sw.delay + 2)) err(`${id}: sweep.cd phải lớn hơn delay + 2`);
    if (!(sw.mul > 0 && sw.mul <= 3)) err(`${id}: sweep.mul phải trong (0, 3]`);
    if (!(sw.r > m.attackRange && sw.r <= 20)) err(`${id}: sweep.r phải trong (attackRange, 20]`);
    if (sw.shape === 'rect' && !(sw.w > 0 && sw.w <= 6)) err(`${id}: sweep rect cần w trong (0, 6]`);
    if (sw.shape === 'cone' && !(sw.w > 0 && sw.w <= 75)) err(`${id}: sweep cone cần w (nửa góc, độ) trong (0, 75]`);
  }

  checkMonSkills(m, ai, id);
}

/** Kiểm nguyên tắc quái mở rộng (E1-E): thời gian báo đủ để né, cd lớn hơn lần dùng, tham số trong khoảng hợp lý. */
function checkMonSkills(m: MonsterDef, ai: MonsterAi, id: string) {
  const inR = (v: unknown, lo: number, hi: number) => typeof v === 'number' && v >= lo && v <= hi;
  const mulOk = (v: unknown) => typeof v === 'number' && v > 0 && v <= 3;
  const kindOk = (c: { kind: string }, k: string) => {
    if (!KINDS.includes(c.kind)) err(`${id}: ${k}.kind không hợp lệ`);
  };
  const { line, charge, leap, burrow, reflect, summon, reveal } = ai;
  // Vệt để lại (DV-2 đợt 4): đủ lâu để đọc, không phủ kín sân (≤ 8 vũng mỗi vệt, ≤ 12 s), sát thương mỗi nhịp nhỏ.
  for (const [k, c] of [
    ['line', line],
    ['charge', charge],
  ] as const) {
    const tr = c?.trail;
    if (!tr) continue;
    kindOk(tr, `${k}.trail`);
    if (!inR(tr.dur, 3, 12)) err(`${id}: ${k}.trail.dur phải trong [3; 12] giây`);
    if (!inR(tr.tick, 0.5, 2)) err(`${id}: ${k}.trail.tick phải trong [0,5; 2] giây`);
    if (!inR(tr.mul, 0.05, 0.6)) err(`${id}: ${k}.trail.mul phải trong [0,05; 0,6]`);
    if (!inR(tr.r, 1, 4)) err(`${id}: ${k}.trail.r phải trong [1; 4] mét`);
  }
  if (ai.anchor && !(inR(ai.anchor.r, 4, 20) && inR(ai.anchor.pct, 0.002, 0.03)))
    err(`${id}: anchor cần r trong [4; 20] m và pct trong [0,002; 0,03] mỗi giây`);
  if (line) {
    kindOk(line, 'line');
    if (!inR(line.delay, 0.9, 3)) err(`${id}: line.delay phải trong [0,9; 3] giây`);
    if (!(line.cd > line.delay + 2)) err(`${id}: line.cd phải lớn hơn delay + 2`);
    if (!mulOk(line.mul)) err(`${id}: line.mul phải trong (0, 3]`);
    if (!(inR(line.r, 2, m.boss ? 40 : 20) && line.r > m.attackRange)) err(`${id}: line.r phải trong (attackRange, ${m.boss ? 40 : 20}]`);
    if (!inR(line.w, 0.5, 6)) err(`${id}: line.w phải trong [0,5; 6] mét`);
    if (!(line.range > 0 && line.range <= line.r)) err(`${id}: line.range phải trong (0, r]`);
  }
  if (charge) {
    kindOk(charge, 'charge');
    if (!inR(charge.delay, 0.9, 3)) err(`${id}: charge.delay phải trong [0,9; 3] giây`);
    if (!(charge.cd > charge.delay + 3)) err(`${id}: charge.cd phải lớn hơn delay + 3`);
    if (!mulOk(charge.mul)) err(`${id}: charge.mul phải trong (0, 3]`);
    if (!inR(charge.w, 0.5, 6)) err(`${id}: charge.w phải trong [0,5; 6] mét`);
    if (!inR(charge.speed, 8, 30)) err(`${id}: charge.speed phải trong [8; 30] m/s`);
    if (!(inR(charge.min, 2, 20) && charge.range > charge.min && charge.range <= 30)) err(`${id}: charge cần 2 <= min < range <= 30`);
    if (!(inR(charge.r, 4, 30) && charge.r >= charge.min)) err(`${id}: charge.r phải trong [4; 30] và >= min`);
  }
  if (leap) {
    kindOk(leap, 'leap');
    if (!inR(leap.delay, 0.8, 3)) err(`${id}: leap.delay phải trong [0,8; 3] giây`);
    if (!(leap.cd > leap.delay + 2)) err(`${id}: leap.cd phải lớn hơn delay + 2`);
    if (!mulOk(leap.mul)) err(`${id}: leap.mul phải trong (0, 3]`);
    if (!inR(leap.r, 1, 8)) err(`${id}: leap.r phải trong [1; 8] mét`);
    if (!(inR(leap.min, 2, 20) && leap.range > leap.min && leap.range <= 24)) err(`${id}: leap cần 2 <= min < range <= 24`);
  }
  if (burrow) {
    kindOk(burrow, 'burrow');
    if (!inR(burrow.hide, 1.2, 4)) err(`${id}: burrow.hide phải trong [1,2; 4] giây`);
    if (!(Number.isInteger(burrow.n) && inR(burrow.n, 1, 4))) err(`${id}: burrow.n phải là số nguyên 1–4`);
    if (!inR(burrow.r, 1, 8)) err(`${id}: burrow.r phải trong [1; 8] mét`);
    if (!inR(burrow.spread, 2, 12)) err(`${id}: burrow.spread phải trong [2; 12] mét`);
    if (!(burrow.range > 0 && burrow.range <= 30)) err(`${id}: burrow.range phải trong (0, 30]`);
    if (!mulOk(burrow.mul)) err(`${id}: burrow.mul phải trong (0, 3]`);
    const c = burrow.cone;
    if (!c) err(`${id}: burrow thiếu cone`);
    else {
      if (!inR(c.delay, 1.2, 3)) err(`${id}: burrow.cone.delay phải trong [1,2; 3] giây`);
      if (!inR(c.r, 4, 20)) err(`${id}: burrow.cone.r phải trong [4; 20] mét`);
      if (!inR(c.w, 5, 75)) err(`${id}: burrow.cone.w (nửa góc, độ) phải trong [5; 75]`);
      if (!mulOk(c.mul)) err(`${id}: burrow.cone.mul phải trong (0, 3]`);
      if (!(burrow.cd > burrow.hide + c.delay + 3)) err(`${id}: burrow.cd phải lớn hơn hide + cone.delay + 3`);
    }
  }
  if (reflect) {
    if (!inR(reflect.warn, 0.6, 3)) err(`${id}: reflect.warn phải trong [0,6; 3] giây (thấy cờ trước khi phản)`);
    if (!inR(reflect.dur, 1, 6)) err(`${id}: reflect.dur phải trong [1; 6] giây`);
    if (!(reflect.ratio > 0 && reflect.ratio <= 1)) err(`${id}: reflect.ratio phải trong (0, 1]`);
    if (!(reflect.cap > 0 && reflect.cap <= 0.5)) err(`${id}: reflect.cap phải trong (0; 0,5] máu tối đa người đánh`);
    if (!(reflect.take >= 0 && reflect.take < 1)) err(`${id}: reflect.take phải trong [0, 1)`);
    if (!(reflect.cd >= reflect.warn + reflect.dur + 3)) err(`${id}: reflect.cd phải >= warn + dur + 3`);
  }
  if (summon) {
    const mm = MONSTER.get(summon.mon);
    if (!mm) err(`${id}: summon.mon không tồn tại ${summon.mon}`);
    else {
      if (mm.boss || mm.elite) err(`${id}: summon.mon phải là quái thường`);
      if (mm.ai && monSkillsOf(mm.ai).includes('summon')) err(`${id}: đệ tử không được tự gọi đệ tử`);
      if (mm.id === m.id) err(`${id}: không tự gọi chính mình`);
    }
    if (!(Number.isInteger(summon.n) && inR(summon.n, 1, 4))) err(`${id}: summon.n phải là số nguyên 1–4`);
    if (!(Number.isInteger(summon.max) && inR(summon.max, summon.n, 8))) err(`${id}: summon.max phải là số nguyên trong [n; 8]`);
    if (!inR(summon.r, 2, 12)) err(`${id}: summon.r phải trong [2; 12] mét`);
    if (!inR(summon.delay, 1, 4)) err(`${id}: summon.delay phải trong [1; 4] giây`);
    if (!(summon.cd >= 6)) err(`${id}: summon.cd phải >= 6 giây`);
  }
  if (ai.armor) {
    const a = ai.armor;
    if (!m.boss) err(`${id}: armor chỉ dành cho boss`);
    if (!inR(a.cycle, 15, 60)) err(`${id}: armor.cycle phải trong [15; 60] giây`);
    if (!inR(a.window, 4, 15) || !(a.window <= a.cycle / 2)) err(`${id}: armor.window phải trong [4; 15] giây và không quá nửa chu kỳ`);
    if (!(a.take >= 0 && a.take <= 0.4)) err(`${id}: armor.take phải trong [0; 0,4]`);
  }
  if (m.look !== undefined && !['golem', 'wisp', 'road'].includes(m.look)) err(`${id}: look ${m.look} không hợp lệ`);
  if (ai.resist) {
    const r = ai.resist;
    if (!m.boss) err(`${id}: resist chỉ dành cho boss`);
    const nph = (m.phases?.length ?? 0) + 1;
    if (r.forms.length !== nph) err(`${id}: resist.forms (${r.forms.length}) phải bằng số pha (${nph})`);
    for (const f of r.forms) if (!ROOT_IDS.includes(f as never)) err(`${id}: resist.forms có hệ lạ ${f}`);
    if (!(r.same > 0 && r.same <= 0.6)) err(`${id}: resist.same phải trong (0; 0,6]`);
    if (!(r.counter >= 1 && r.counter <= 2)) err(`${id}: resist.counter phải trong [1; 2]`);
  }
  if (ai.faces) {
    const f = ai.faces;
    if (!m.boss) err(`${id}: faces chỉ dành cho boss`);
    if (!inR(f.duong, 8, 30)) err(`${id}: faces.duong phải trong [8; 30] giây (đủ dồn chiêu một đợt)`);
    if (!inR(f.am, 4, 15)) err(`${id}: faces.am phải trong [4; 15] giây`);
    if (!inR(f.warn, 1, 3)) err(`${id}: faces.warn phải trong [1; 3] giây (thấy báo trước khi lật)`);
    if (!(f.am >= f.warn + 2)) err(`${id}: faces.am phải >= warn + 2`);
    if (!(f.take >= 0 && f.take <= 0.2)) err(`${id}: faces.take phải trong [0; 0,2] (mặt Âm gần như miễn)`);
    if (f.am / (f.duong + f.am) > 0.45) err(`${id}: mặt Âm chiếm quá 45% chu kỳ (kéo dài trận quá mức)`);
  }
  if (reveal) {
    if (!inR(reveal.dur, 1, 8)) err(`${id}: reveal.dur phải trong [1; 8] giây`);
    if (!(reveal.mul > 1 && reveal.mul <= 3)) err(`${id}: reveal.mul phải trong (1, 3]`);
    if (reveal.guard !== undefined && !(reveal.guard > 0 && reveal.guard <= 1)) err(`${id}: reveal.guard phải trong (0, 1]`);
    if (reveal.posture !== undefined && !(reveal.posture > 0 && reveal.posture <= 1)) err(`${id}: reveal.posture phải trong (0, 1]`);
    if (reveal.posture !== undefined && !m.posture) err(`${id}: reveal.posture cần quái có thanh phá thế (posture)`);
    if (reveal.after) {
      if (!['charge', 'leap', 'burrow'].includes(reveal.after)) err(`${id}: reveal.after phải là charge, leap hoặc burrow`);
      else if (!ai[reveal.after]) err(`${id}: reveal.after = ${reveal.after} nhưng quái không có chiêu đó`);
    } else if (!(reveal.cd >= reveal.dur + 2)) err(`${id}: reveal.cd phải >= dur + 2`);
  }
}

function checkLoot(id: string, l: LootDef) {
  const [g0, g1] = l.gold ?? [];
  if (!(Number.isInteger(g0) && Number.isInteger(g1) && g0 >= 0 && g1 >= g0))
    err(`loot ${id}: gold phải là [min, max] nguyên, 0 <= min <= max`);
  for (const d of l.drops ?? []) {
    needItem(d.item, `loot ${id}`);
    if (!(d.chance > 0 && d.chance <= 1)) err(`loot ${id}/${d.item}: chance phải trong (0, 1]`);
    if (!(Number.isInteger(d.min) && Number.isInteger(d.max) && d.min >= 1 && d.max >= d.min))
      err(`loot ${id}/${d.item}: min/max không hợp lệ`);
  }
}
function checkEquipLoot(id: string, l: LootDef) {
  const m = MONSTER.get(id);
  const want = !m ? undefined : m.boss ? 'boss' : m.elite ? 'elite' : undefined;
  if (want && l.src !== want) err(`loot ${id}: src phải là '${want}'`);
  if (!want && l.src !== 'common' && l.src !== 'dungeon') err(`loot ${id}: quái thường có src 'common' hoặc 'dungeon'`);
  if (!l.src) return;
  const rolls = l.equip ?? [];
  // Bóng không cho xp (xpMul 0, bóng gương/bóng mặc cả) được để trống để khỏi bị farm.
  if (!rolls.length && MONSTER.get(id)?.xpMul !== 0) err(`loot ${id}: thiếu bảng rơi trang bị (equip)`);
  const slots = droppableSlots(ITEM_SYS, ITEMS);
  rolls.forEach((r, i) => {
    const w = `loot ${id}/equip[${i}]`;
    if (!(r.chance > 0 && r.chance <= 1)) err(`${w}: chance phải trong (0, 1]`);
    if (!Array.isArray(r.q) || r.q.length < 5 || r.q.length > QUALITY_COUNT || r.q.some((x) => !(x >= 0)) || !r.q.some((x) => x > 0))
      err(`${w}: q phải là 5–${QUALITY_COUNT} trọng số >= 0 (thiếu = 0), có ít nhất một số dương`);
    if (r.set && !SETS.some((x) => x.id === r.set)) err(`${w}: bộ không tồn tại ${r.set}`);
    for (const k of Object.keys(r.slots ?? {})) if (!slots.includes(k as EquipSlot)) err(`${w}: ô ${k} không rơi được`);
    if (r.ilvlBonus !== undefined && !(Number.isInteger(r.ilvlBonus) && r.ilvlBonus >= 0 && r.ilvlBonus <= 3))
      err(`${w}: ilvlBonus phải nguyên trong [0; 3]`);
    const tot = r.q.reduce((a, b) => a + b, 0) || 1;
    const lo = r.q.findIndex((x) => x > 0);
    // Phẩm theo nguồn (thiết kế 3.2): quái thường chỉ Phàm/Linh; tinh anh từ Linh, tối đa Địa; Thiên chỉ boss.
    const hi = r.q.reduce((a, x, k) => (x > 0 ? k : a), 0);
    // Thần phẩm (thiết kế bậc 6): chỉ boss, chỉ ở bảng rơi chính (i = 0), xác suất mỗi lần rơi ≤ 1%.
    const pThan = (r.q[5] ?? 0) / tot;
    if (pThan > 0 && (l.src !== 'boss' || i !== 0 || pThan > 0.01)) err(`${w}: Thần phẩm chỉ ở boss, bảng đầu, ≤ 1% mỗi lần rơi`);
    if (l.src === 'common' && hi > 1) err(`${w}: quái thường chỉ rơi Phàm/Linh phẩm`);
    if (l.src === 'dungeon' && hi > 3) err(`${w}: bí cảnh thường chỉ rơi tới Địa phẩm`);
    if (l.src === 'elite' && i === 0 && (hi > 3 || (r.q[2] ?? 0) / tot < 0.3)) err(`${w}: tinh anh chủ yếu Huyền phẩm, tối đa Địa phẩm`);
    if (l.src === 'boss' && i === 0 && lo < 2) err(`${w}: boss chỉ rơi từ Huyền phẩm`);
  });
  // Quái kiếp (Nhật Thực Dực Chủ) không rơi đồ (`minionOf`), nên không cần bảng rơi trang bị.
  const tribBoss = Object.values(TRIB_DEFS).some((d) => d.phases.some((p) => p.nhatThuc?.boss === id));
  if (l.src === 'boss' && !tribBoss && !(rolls[0]?.chance === 1)) err(`loot ${id}: boss phải chắc chắn rơi một món (equip[0].chance = 1)`);
}
for (const id of LOOT.keys()) if (!MONSTER.has(id)) err(`loot: quái không tồn tại ${id}`);
for (const [id, l] of LOOT) checkEquipLoot(id, l);
// Mọi ô có chỉ số phải có mẫu để rơi ở mọi ilvl >= 1.
for (const s of ITEM_SYS.slots) {
  if (s.weight > 0 && s.drop !== false && templatesFor(ITEMS, s.id, 1).length === 0)
    err(`ô ${s.id}: thiếu mẫu có reqLevel <= 1 để rơi ở ilvl 1`);
}
// Tinh anh: máu gấp ~4 quái thường cùng loài, có ít nhất một kỹ năng riêng, có tên và biệt hiệu.
for (const m of MONSTERS) {
  if (!m.elite) continue;
  if (m.boss) err(`monster ${m.id}: elite và boss loại trừ nhau`);
  if (!(m.hpMul >= 4)) err(`monster ${m.id}: tinh anh phải có hpMul >= 4`);
  if (!(m.ai?.caster || m.ai?.slam || m.ai?.sweep || m.ai?.chant || (m.ai && monSkillsOf(m.ai).some((k) => k !== 'reveal'))))
    err(`monster ${m.id}: tinh anh cần một kỹ năng riêng (caster/slam/sweep/chant/line/charge/leap/burrow/reflect/summon)`);
  needStr(`mon.${m.id}.title`);
}

for (const m of MONSTERS) {
  needStr(`mon.${m.id}`);
  if (m.boss) needStr(`mon.${m.id}.title`);
  // Tỉ lệ rơi chỉ nằm trong loot.json (server đọc); monsters.json vào bundle client nên cấm.
  if ('drops' in m || 'gold' in m) err(`monster ${m.id}: drops/gold phải nằm trong data/loot.json, không ở monsters.json`);
  const loot = LOOT.get(m.id);
  if (!loot) err(`monster ${m.id}: thiếu bảng rơi trong data/loot.json`);
  else checkLoot(m.id, loot);
  checkAi(m, m.ai ?? {}, m.attackCd, '');
  if (m.phases) {
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có pha`);
    if (m.phases.length > 3) err(`monster ${m.id}: tối đa 3 pha sau pha đầu`);
    let prev = 1;
    m.phases.forEach((p, i) => {
      if (!(p.hp > 0.05 && p.hp < prev)) err(`monster ${m.id} pha ${i + 1}: hp phải giảm dần trong (0,05; 1)`);
      prev = p.hp;
      if (p.cdMul !== undefined && !(p.cdMul >= 0.6 && p.cdMul <= 1.2)) err(`monster ${m.id} pha ${i + 1}: cdMul phải trong [0,6; 1,2]`);
      if (p.speedMul !== undefined && !(p.speedMul >= 0.8 && p.speedMul <= 1.3))
        err(`monster ${m.id} pha ${i + 1}: speedMul phải trong [0,8; 1,3]`);
      const r = phaseRules(m, i + 1);
      checkAi(m, r.ai, m.attackCd * r.cdMul, ` pha ${i + 1}`);
      // Thoại khi vào pha: ngắn, đọc kịp trong lúc vẫn đánh (letterbox ~3 giây).
      const key = `mon.${m.id}.say.${i + 1}`;
      needStr(key);
      if (hasString(key) && t(key).length > 90) err(`${key}: thoại quá dài (> 90 ký tự)`);
    });
    if (hasString(`mon.${m.id}.say.dead`) && t(`mon.${m.id}.say.dead`).length > 90) err(`mon.${m.id}.say.dead: thoại quá dài`);
  }
  if (m.mirror) {
    const mi = m.mirror;
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có mirror`);
    const nph = (m.phases?.length ?? 0) + 1;
    for (const [k, f] of Object.entries(mi) as [string, { phase: number } | undefined][])
      if (f && !(Number.isInteger(f.phase) && f.phase >= 0 && f.phase < nph)) err(`monster ${m.id}: mirror.${k}.phase ngoài số pha`);
    if (mi.decoys) {
      const dd = MONSTER.get(mi.decoys.mon);
      if (!dd) err(`monster ${m.id}: mirror.decoys.mon không tồn tại`);
      else if (dd.boss || dd.elite || !(dd.hpMul <= 0.1))
        err(`monster ${m.id}: bóng giả phải là quái thường chết trong một đòn (hpMul ≤ 0,1)`);
      if (!(mi.decoys.n >= 1 && mi.decoys.n <= 5 && mi.decoys.boom.delay >= 1 && mi.decoys.boom.r <= 8))
        err(`monster ${m.id}: mirror.decoys n ∈ [1;5], nổ báo ≥ 1 giây, r ≤ 8`);
    }
    if (mi.echo && !(mi.echo.delay >= 1 && mi.echo.cd >= 4)) err(`monster ${m.id}: mirror.echo báo ≥ 1 giây, hồi ≥ 4 giây`);
    if (mi.disc) {
      const dc = mi.disc;
      if (!(dc.warn >= 1 && dc.beams >= 2 && dc.beams <= 4 && dc.spin > 0 && dc.spin <= 40 && dc.w >= 2 && dc.dur <= 10))
        err(`monster ${m.id}: mirror.disc: báo ≥ 1 s, 2–4 tia, quay ≤ 40°/s (đi vòng kịp), rộng ≥ 2 m, ≤ 10 s`);
    }
    if (mi.veil && !(mi.veil.r <= 16 && mi.veil.dur <= 25 && mi.veil.hpMul > 0 && mi.veil.hpMul <= 0.5))
      err(`monster ${m.id}: mirror.veil: r ≤ 16, ≤ 25 s, hpMul ∈ (0; 0,5]`);
  }
  if (m.than) {
    const th = m.than;
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có than`);
    const nph = (m.phases?.length ?? 0) + 1;
    for (const [k, f] of Object.entries(th) as [string, { phase: number } | undefined][])
      if (f && !(Number.isInteger(f.phase) && f.phase >= 0 && f.phase < nph)) err(`monster ${m.id}: than.${k}.phase ngoài số pha`);
    if (
      th.hands &&
      !(th.hands.n >= 2 && th.hands.n <= 8 && th.hands.delay >= 1.3 && th.hands.w * th.hands.n < 360 - 20 * th.hands.n && th.hands.cd >= 6)
    )
      err(`monster ${m.id}: than.hands: 2–8 tay, báo ≥ 1,3 s, khe giữa các tay ≥ 20°, hồi ≥ 6 s`);
    if (
      th.elem &&
      !(
        th.elem.delay >= 1.5 &&
        th.elem.cut > 0 &&
        th.elem.cut <= 0.9 &&
        th.elem.ring + th.elem.sealR <= th.elem.r + 0.5 &&
        th.elem.ring >= th.elem.sealR * 2.2
      )
    )
      err(`monster ${m.id}: than.elem: báo ≥ 1,5 s, ấn nằm trong vòng đánh và không chồng nhau`);
    if (th.clone) {
      const cd = MONSTER.get(th.clone.mon);
      if (!cd) err(`monster ${m.id}: than.clone.mon không tồn tại`);
      else if (cd.boss || cd.elite || cd.xpMul !== 0)
        err(`monster ${m.id}: phân thân không phải boss/tinh anh và không cho tu vi (xpMul 0)`);
      if (!(th.clone.n >= 1 && th.clone.n <= 4 && th.clone.life >= 10 && th.clone.heal <= 0.15))
        err(`monster ${m.id}: than.clone: 1–4 con, sống ≥ 10 s, hồi ≤ 15%`);
    }
    if (th.rings && !(th.rings.dur <= 15 && th.rings.spin <= 30 && th.rings.final.delay >= 1.5 && th.rings.final.gather >= 6))
      err(`monster ${m.id}: than.rings: ≤ 15 s, quay ≤ 30°/s (chạy kịp), Phản hồi báo ≥ 1,5 s`);
  }
  if (m.rift) {
    const rf = m.rift;
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có rift`);
    const nph = (m.phases?.length ?? 0) + 1;
    if (!(Number.isInteger(rf.phase) && rf.phase >= 0 && rf.phase < nph)) err(`monster ${m.id}: rift.phase ngoài số pha`);
    if (!(rf.burn >= 1 && rf.burn <= 5 && rf.weak >= 3 && rf.veins.length >= 2))
      err(`monster ${m.id}: rift: 1–5 tầng cháy, mất thế ≥ 3 s, ≥ 2 khe`);
    if (!m.phases?.[rf.phase - 1]?.ai?.chant && !m.ai?.chant) err(`monster ${m.id}: rift cần chú (ai.chant) từ pha ${rf.phase}`);
    for (const v of rf.veins) if (!(v.r >= 3 && v.r <= 10)) err(`monster ${m.id}: khe mạch r 3–10 m`);
  }
  if (m.kd) {
    const k = m.kd;
    const nph = (m.phases?.length ?? 0) + 1;
    if (k.mend && !(k.mend.cd >= 3 && k.mend.r >= 4 && k.mend.pct > 0 && k.mend.pct <= 0.2))
      err(`monster ${m.id}: kd.mend cd ≥ 3 s, r ≥ 4 m, pct ∈ (0; 20%]`);
    if (k.twin && !(k.twin.mul > 1 && k.twin.mul <= 2.5)) err(`monster ${m.id}: kd.twin.mul ∈ (1; 2,5]`);
    if (k.bargain) {
      if (!m.boss || (!m.ai?.chant && !m.phases?.some((ph) => ph.ai?.chant))) err(`monster ${m.id}: kd.bargain cần boss có chú (ai.chant)`);
      if (!(Number.isInteger(k.bargain.phase) && k.bargain.phase >= 0 && k.bargain.phase < nph))
        err(`monster ${m.id}: kd.bargain.phase ngoài số pha`);
      if (!MONSTER.get(k.bargain.mon)) err(`monster ${m.id}: kd.bargain.mon ${k.bargain.mon} không tồn tại`);
      if (!(k.bargain.sep >= 10 && k.bargain.pen > 0 && k.bargain.pen <= 0.4))
        err(`monster ${m.id}: kd.bargain sep ≥ 10 m, pen ∈ (0; 40%]`);
    }
    if (k.night) {
      const n = k.night;
      if (!m.boss) err(`monster ${m.id}: chỉ boss mới có kd.night`);
      if (!(Number.isInteger(n.phase) && n.phase >= 0 && n.phase < nph)) err(`monster ${m.id}: kd.night.phase ngoài số pha`);
      if (!(n.steles.length >= 2 && n.steles.every((s) => s.r >= 4 && s.r <= 12))) err(`monster ${m.id}: kd.night cần ≥ 2 bia, r 4–12 m`);
      if (!(n.press > 0 && n.press <= 0.06 && n.cd >= 8 && n.warn >= 1.5 && n.mul > 0 && n.dur >= 3 && n.grace >= 3))
        err(`monster ${m.id}: kd.night press ∈ (0; 6%], cd ≥ 8 s, warn ≥ 1,5 s, dur ≥ 3 s, grace ≥ 3 s`);
    }
  }
  const ps = m.posture;
  if (ps) {
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có thanh phá thế`);
    if (!(ps.k > 0 && ps.k <= 6)) err(`monster ${m.id}: posture.k phải trong (0, 6]`);
    if (!(ps.heavy >= 0 && ps.heavy <= 0.2)) err(`monster ${m.id}: posture.heavy phải trong [0; 0,2]`);
    if (!(ps.interrupt >= 0 && ps.interrupt <= 1)) err(`monster ${m.id}: posture.interrupt phải trong [0; 1]`);
    if (!(ps.wait >= 1 && ps.decay > 0 && ps.decay <= 0.5)) err(`monster ${m.id}: posture.wait >= 1 và decay trong (0; 0,5]`);
    if (!(ps.brk >= 1 && ps.brk <= 6)) err(`monster ${m.id}: posture.brk phải trong [1; 6] giây`);
  }
}
for (const s of ALL_SKILLS) {
  needStr(`skill.${s.id}.name`);
  needStr(`skill.${s.id}.desc`);
  if (s.interrupt && s.kind !== 'damage') err(`skill ${s.id}: interrupt chỉ dùng cho skill kind 'damage'`);
}
if (MONSTERS.some((m) => m.ai?.chant) && !SKILLS.some((s) => s.interrupt && s.unlock === 1)) {
  err('có boss niệm chú nhưng không có skill ngắt mở từ tầng 1');
}
for (const r of RECIPES) {
  needItem(r.output.id, `recipe ${r.id}`);
  for (const i of r.inputs) needItem(i.id, `recipe ${r.id}`);
  if (!NPC.has(r.npc)) err(`recipe ${r.id}: npc không tồn tại ${r.npc}`);
  // Luyện rồi bán không được lời.
  const out = ITEM.get(r.output.id);
  if (out) {
    const cost = r.gold + r.inputs.reduce((s, i) => s + (ITEM.get(i.id)?.sell ?? 0) * i.n, 0);
    if (out.sell * r.output.n > cost + 30) err(`recipe ${r.id}: bán thành phẩm lời quá nhiều (${out.sell * r.output.n} so với ${cost})`);
  }
}
