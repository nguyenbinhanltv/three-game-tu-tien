// Tách từ sim.ts (tối ưu Đợt E): ladder.
import { combatPower, TIER_MIN_ILVL } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  computePlayerStats,
  rollItemInstance,
  seededRng,
  droppableSlots,
  templatesFor,
  HP_REGEN_MEDITATE,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  NGUNG_KHI_MAX,
  TRUC_CO_LEVEL,
  KET_DAN_LEVEL,
  NGUYEN_ANH_LEVEL,
  HOA_THAN_LEVEL,
  AM_HU_LEVEL,
  ANH_BIEN_LEVEL,
  DUONG_THUC_LEVEL,
  MAX_LEVEL,
  VAN_DINH_LEVEL,
  shadowStats,
  playerBaseStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { ITEM_SYS, ITEMS, MONSTER, realmName } from '../index';

import { at } from '@dtl/shared';
import { questByLevel, main, seekModel, pickSpawn } from './pace1';
import { METHOD_IDS, playerM, playerDps, monsterDps, PULL_FACTOR, selfSustain, pct, METHOD_NAME, MethodId } from './common';

// ---------- thang 28 cấp: Trúc Cơ → Nguyên Anh (E1-C, `docs/EXPANSION_DESIGN.md` 2.2) ----------
{
  const STAGES = [
    { name: 'Trúc Cơ', from: TRUC_CO_LEVEL, to: KET_DAN_LEVEL - 1, hours: 4 },
    { name: 'Kết Đan', from: KET_DAN_LEVEL, to: NGUYEN_ANH_LEVEL - 1, hours: 6 },
    { name: 'Nguyên Anh', from: NGUYEN_ANH_LEVEL, to: HOA_THAN_LEVEL - 1, hours: 8 },
  ] as const;
  /** Dung sai nhịp chặng mới so với 4/6/8 giờ (thiết kế: ±12%). */
  const TOL = 0.12;
  const INCOME_TARGETS_PER_HOUR = 400;
  /** Thu nhập tu vi/giờ theo thiết kế tại cấp L: 400 mục tiêu × (12+7L) × xpMul 1,25 × hệ số chênh cấp 0,9. */
  const designIncome = (level: number) => INCOME_TARGETS_PER_HOUR * (12 + 7 * level) * 1.25 * 0.9;

  console.log('\nThang 28 cấp (E1-C): tu vi, chỉ số người chơi (hệ số cảnh giới 1,6 / 2,5 / 3,8 / 5,5) và nhịp theo thu nhập của thiết kế');
  console.log('cảnh giới              xpNeed  tích lũy     hp     mp   atk   def   thu nhập/giờ  giờ/cấp  giờ tích lũy');
  for (const st of STAGES) {
    let cum = 0;
    let hrs = 0;
    for (let l = st.from; l <= st.to; l++) {
      const b = playerBaseStats(l);
      cum += xpNeed(l);
      const h = xpNeed(l) / designIncome(l);
      hrs += h;
      console.log(
        `${realmName(l).padEnd(22)} ${String(xpNeed(l)).padStart(7)} ${String(cum).padStart(9)} ${String(b.hp).padStart(6)} ${String(b.mp).padStart(6)} ${String(b.atk).padStart(5)} ${String(b.def).padStart(5)} ${designIncome(l).toFixed(0).padStart(12)} ${h.toFixed(2).padStart(8)} ${hrs.toFixed(2).padStart(10)}`,
      );
    }
    if (Math.abs(hrs / st.hours - 1) > TOL) {
      console.error(`LỖI: chặng ${st.name} ra ${hrs.toFixed(2)} giờ theo thu nhập thiết kế, ngoài ${st.hours} giờ ±${TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  const hb = playerBaseStats(HOA_THAN_LEVEL);
  console.log(
    `${realmName(HOA_THAN_LEVEL).padEnd(22)} ${'(trần tạm)'.padStart(7)} ${' '.padStart(9)} ${String(hb.hp).padStart(6)} ${String(hb.mp).padStart(6)} ${String(hb.atk).padStart(5)} ${String(hb.def).padStart(5)}`,
  );
  console.log(`Mốc thiết kế: Trúc Cơ 4 giờ, Kết Đan 6 giờ, Nguyên Anh 8 giờ (cờ LỖI nếu ngoài ±${TOL * 100}%).`);

  // Chương 6 (TN-3, `tn3/thiet-ke.md` mục 1): nhịp theo thu nhập thiết kế (chưa có quái/nhiệm vụ `van_dinh` để mô phỏng đủ như chương 5;
  // PR bản đồ sẽ thêm `ch6Timeline` khi có cụm quái). Anh Biến 32–35 ~2 giờ, Vấn Đỉnh 36–39 ~5 giờ, Âm Hư 40–43 ~5 giờ; Dương Thực 44 là trần tạm.
  const CH6_STAGES = [
    { name: 'Anh Biến', from: ANH_BIEN_LEVEL, to: VAN_DINH_LEVEL - 1, hours: 2 },
    { name: 'Vấn Đỉnh', from: VAN_DINH_LEVEL, to: AM_HU_LEVEL - 1, hours: 5 },
    { name: 'Âm Hư', from: AM_HU_LEVEL, to: DUONG_THUC_LEVEL - 1, hours: 5 },
  ] as const;
  console.log('\nChương 6 (TN-3): Anh Biến → Vấn Đỉnh → Âm Hư theo thu nhập thiết kế (khung; chưa mô phỏng quái van_dinh)');
  console.log('cảnh giới              xpNeed  thu nhập/giờ  giờ/cấp');
  let ch6Hours = 0;
  for (const st of CH6_STAGES) {
    let hrs = 0;
    for (let l = st.from; l <= st.to; l++) {
      const h = xpNeed(l) / designIncome(l);
      hrs += h;
      console.log(
        `${realmName(l).padEnd(22)} ${String(xpNeed(l)).padStart(7)} ${designIncome(l).toFixed(0).padStart(12)} ${h.toFixed(2).padStart(8)}`,
      );
    }
    ch6Hours += hrs;
    if (Math.abs(hrs / st.hours - 1) > TOL) {
      console.error(`LỖI: chặng ${st.name} ra ${hrs.toFixed(2)} giờ theo thu nhập thiết kế, ngoài ${st.hours} giờ ±${TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  console.log(`Chương 6: ${ch6Hours.toFixed(2)} giờ (mốc 12 giờ ±${TOL * 100}%); Dương Thực sơ kỳ (cấp ${DUONG_THUC_LEVEL}) mở chương 7.`);
  if (Math.abs(ch6Hours / 12 - 1) > TOL) {
    console.error(`LỖI: chương 6 ra ${ch6Hours.toFixed(2)} giờ, ngoài 12 giờ ±${TOL * 100}%`);
    process.exitCode = 1;
  }

  // Chương 7 (TN-7, `tn7/thiet-ke.md` mục 1): Dương Thực 44→47, ~1,7 giờ/cấp theo thu nhập thiết kế (3 cấp ≈ 5,1 giờ cày; cộng 9 cầu ~4 giờ ≈ 8 giờ cả chương).
  // Trần mở dần theo cầu (`kieuLevelCap`), nên thời gian thực có thể dài hơn nếu người chơi kẹt chờ cầu; bảng này chỉ kiểm đường cong tu vi.
  console.log('\nChương 7 (TN-7): Dương Thực 44 → 47 theo thu nhập thiết kế (khung; chưa mô phỏng quái cuu_kieu)');
  console.log('cảnh giới              xpNeed  thu nhập/giờ  giờ/cấp');
  let ch7Hours = 0;
  for (let l = DUONG_THUC_LEVEL; l < MAX_LEVEL; l++) {
    const h = xpNeed(l) / designIncome(l);
    ch7Hours += h;
    console.log(
      `${realmName(l).padEnd(22)} ${String(xpNeed(l)).padStart(7)} ${designIncome(l).toFixed(0).padStart(12)} ${h.toFixed(2).padStart(8)}`,
    );
  }
  console.log(`Chương 7: ${ch7Hours.toFixed(2)} giờ cày (mốc 5,1 giờ ±${TOL * 100}%); trần ${realmName(MAX_LEVEL)} (cấp ${MAX_LEVEL}).`);
  if (Math.abs(ch7Hours / 5.1 - 1) > TOL) {
    console.error(`LỖI: chương 7 ra ${ch7Hours.toFixed(2)} giờ cày, ngoài 5,1 giờ ±${TOL * 100}%`);
    process.exitCode = 1;
  }

  // Thu nhập tu vi thực của mô phỏng ở cấp 15 (Kiếm tu), so với thu nhập thiết kế cùng cấp: mô hình thiết kế có sát thực không.
  const sim15 = (xpNeed(NGUNG_KHI_MAX) - (questByLevel.get(NGUNG_KHI_MAX) ?? 0)) / (at(main.secByLevel, NGUNG_KHI_MAX) / 3600);
  console.log(
    `Đối chiếu: thu nhập tu vi mô phỏng ở tầng ${NGUNG_KHI_MAX} (Kiếm tu, quái thường + đả tọa) ≈ ${sim15.toFixed(0)}/giờ, thiết kế đặt ${designIncome(NGUNG_KHI_MAX).toFixed(0)}/giờ.`,
  );

  // TTK và máu mất với quái "cùng khuôn" U Minh Lang đặt ở cấp L (monsterStats đã nhân hệ số cảnh giới): thời gian hạ quái không được sụp.
  const refDef = MONSTER.get('mon_u_minh_lang')!;
  console.log(
    '\nTTK quái thường cùng khuôn (u_minh_lang đặt ở cấp L, đã nhân hệ số cảnh giới), theo công pháp (trang bị theo nhiệm vụ chỉ tới cấp 15):',
  );
  console.log('cảnh giới              TTK Kiếm/Hộ/Đan         mất/lần Kiếm/Hộ/Đan');
  for (let l = TRUC_CO_LEVEL; l <= HOA_THAN_LEVEL; l++) {
    const ms = monsterStats(l, refDef.hpMul, refDef.atkMul);
    const sk = seekModel(refDef.id);
    const ttks: number[] = [];
    const losts: number[] = [];
    for (const id of METHOD_IDS) {
      const pl = playerM(l, id);
      const ttk = ms.hp / playerDps(l, pl.atk, ms.def, id, refDef.elem);
      ttks.push(ttk);
      losts.push(
        Math.max(0, monsterDps(refDef, ms.atk, pl.def) * ttk * PULL_FACTOR - selfSustain(l, id) * pl.hp * (ttk + sk.seek)) / pl.hp,
      );
    }
    console.log(
      `${realmName(l).padEnd(22)} ${ttks.map((x) => x.toFixed(1).padStart(5) + 's').join(' ')}   ${losts.map((x) => pct(x).padStart(5)).join(' ')}`,
    );
    ttks.forEach((x, i) => {
      if (x < 3.5 || x > 8.5) {
        console.error(
          `LỖI: cấp ${l} ${METHOD_NAME[at(METHOD_IDS, i)]} TTK ${x.toFixed(1)}s ngoài 3,5–8,5 s (hệ số cảnh giới quái lệch người chơi)`,
        );
        process.exitCode = 1;
      }
    });
  }

  // E3-F: cùng quái cùng khuôn, người chơi mặc trọn 8 ô đồ thường Huyền phẩm của từng bậc (ilvl đầu chương): TTK, máu mất và lực chiến.
  console.log('\nTrang bị theo bậc (bộ 7 món thường Huyền phẩm, trung bình 40 lần roll) so với không đồ, quái cùng khuôn ở cấp L:');
  console.log('cấp  bậc  lực chiến (không đồ → có đồ)  atk    def    hp     TTK Kiếm/Hộ/Đan         mất/lần Kiếm/Hộ/Đan');
  const gearRows: { level: number; tier: number; power: number }[] = [];
  for (const [l, tier] of [
    [13, 1],
    [17, 2],
    [19, 2],
    [21, 3],
    [23, 3],
  ] as const) {
    const slots = droppableSlots(ITEM_SYS, ITEMS);
    const ilvl = at(TIER_MIN_ILVL, tier) > 1 ? Math.max(at(TIER_MIN_ILVL, tier), 1) : l;
    const RUNS = 40;
    const acc = { atk: 0, def: 0, hp: 0, mp: 0 };
    for (let run = 0; run < RUNS; run++) {
      const rng = seededRng(2000 + run);
      const worn = slots.map((sl) => {
        const tpl =
          ITEMS.filter((i) => i.kind === sl && !i.set && (i.tier ?? 1) === tier && (i.reqLevel ?? 1) <= l)[0] ??
          at(templatesFor(ITEMS, sl, l), 0, 'templatesFor');
        return { item: { id: tpl.id, n: 1, inst: rollItemInstance(ITEM_SYS, sl, Math.min(ilvl, l + 1), 2, rng, tpl.tier) } };
      });
      const st = computePlayerStats(l, worn);
      acc.atk += st.atk;
      acc.def += st.def;
      acc.hp += st.hp;
      acc.mp += st.mp;
    }
    const g = { atk: acc.atk / RUNS, def: acc.def / RUNS, hp: acc.hp / RUNS, mp: acc.mp / RUNS };
    const base = playerBaseStats(l);
    const p0 = combatPower(base);
    const p1 = combatPower(g);
    gearRows.push({ level: l, tier, power: p1 });
    const ms = monsterStats(l, refDef.hpMul, refDef.atkMul);
    const sk = seekModel(refDef.id);
    const ttks = METHOD_IDS.map((id) => ms.hp / playerDps(l, g.atk, ms.def, id, refDef.elem));
    const losts = METHOD_IDS.map(
      (id, i) =>
        Math.max(0, monsterDps(refDef, ms.atk, g.def) * at(ttks, i) * PULL_FACTOR - selfSustain(l, id) * g.hp * (at(ttks, i) + sk.seek)) /
        g.hp,
    );
    console.log(
      `${String(l).padEnd(4)} ${String(tier).padEnd(4)} ${String(p0).padStart(7)} → ${String(p1).padStart(7)} (${(p1 / p0).toFixed(2)}×)   ${g.atk.toFixed(0).padStart(5)} ${g.def.toFixed(0).padStart(6)} ${g.hp.toFixed(0).padStart(6)}  ${ttks.map((x) => x.toFixed(1).padStart(5) + 's').join(' ')}   ${losts.map((x) => pct(x).padStart(5)).join(' ')}`,
    );
    for (const x of ttks)
      if (x < 2.5 || x > 8.5) {
        console.error(`LỖI: cấp ${l} đồ bậc ${tier} TTK ${x.toFixed(1)}s ngoài 2,5–8,5 s`);
        process.exitCode = 1;
      }
    if (p1 / p0 > 3.2 || p1 / p0 < 1.1) {
      console.error(`LỖI: cấp ${l} đồ bậc ${tier} đổi lực chiến ×${(p1 / p0).toFixed(2)}, ngoài 1,1–3,2`);
      process.exitCode = 1;
    }
  }
  // Bậc cao phải mạnh hơn bậc thấp ở cùng cấp (cấp 19: bậc 2 vs bậc 3 qua `gearRows` kế nhau; mỗi bậc tăng lực chiến so với bậc trước).
  for (const t of [2, 3]) {
    const lo = Math.max(...gearRows.filter((r) => r.tier === t - 1).map((r) => r.power));
    const hi = Math.min(...gearRows.filter((r) => r.tier === t).map((r) => r.power));
    if (!(hi > lo)) {
      console.error(`LỖI: lực chiến đồ bậc ${t} (${hi}) không vượt bậc ${t - 1} (${lo})`);
      process.exitCode = 1;
    }
  }

  // Giờ theo nguồn tu vi ĐANG CÓ: chỉ quái Vân Lam (cấp ≤ 15, `xpLevelFactor` hạ dần tới 0,1 khi chênh ≥ 8 cấp), nhiệm vụ hiện có,
  // đả tọa, thử thách tâm ma ở bình cảnh. Chưa có phó bản, tinh anh/boss, quái cấp 16+ của E-2/E-3/E-4, nên chặng mới KHÔNG đạt nhịp
  // 4/6/8 giờ cho tới khi nội dung đó vào: đây là số liệu thông tin, không phải cờ LỖI.
  const existing = (id: MethodId) =>
    STAGES.map((st) => {
      let sec = 0;
      let kills = 0;
      for (let l = st.from; l <= st.to; l++) {
        const pl = playerM(l, id);
        const sp = pickSpawn(l);
        const def = MONSTER.get(sp.mon)!;
        const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, l));
        const ms = monsterStats(mlv, def.hpMul, def.atkMul);
        const ttk = ms.hp / playerDps(l, pl.atk, ms.def, id, def.elem);
        const sk = seekModel(def.id);
        const lost = Math.max(0, monsterDps(def, ms.atk, pl.def) * ttk * PULL_FACTOR - selfSustain(l, id) * pl.hp * (ttk + sk.seek));
        const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
        const xpPerKill = monsterXp(mlv, def.xpMul) * xpLevelFactor(l, mlv) + meditateXpPerSec(l) * rest;
        const k = Math.ceil(Math.max(0, xpNeed(l) - (questByLevel.get(l) ?? 0)) / xpPerKill);
        kills += k;
        sec += k * (ttk + sk.seek + rest);
        if (BOTTLENECK_LEVELS.includes(l)) {
          const sh = shadowStats(l, pl.atk, pl.def);
          sec += sh.hp / playerDps(l, pl.atk, sh.def, id) + 20;
        }
      }
      return { hours: sec / 3600, kills };
    });
  console.log(
    '\nNhịp theo nguồn tu vi hiện có (chỉ quái Vân Lam cấp ≤ 15 + nhiệm vụ + đả tọa + tâm ma; chưa phó bản, tinh anh/boss, quái cấp 16+):',
  );
  console.log('chặng         mục tiêu   ' + METHOD_IDS.map((m) => METHOD_NAME[m].padEnd(20)).join(' '));
  const ex = METHOD_IDS.map((m) => existing(m));
  STAGES.forEach((st, i) => {
    console.log(
      `${st.name.padEnd(13)} ${(st.hours + ' giờ').padEnd(10)} ${ex.map((e) => (at(e, i).hours.toFixed(1) + ' giờ, ' + at(e, i).kills + ' giết').padEnd(20)).join(' ')}`,
    );
  });
  console.log(
    'Quái Vân Lam (cấp ≤ 15) cho tu vi đủ cho Trúc Cơ (hơi dài hơn 4 giờ vì tu vi hạ dần theo chênh cấp), nhưng từ Kết Đan chênh cấp làm tu vi rơi về 10%: các chặng Kết Đan và Nguyên Anh cần quái, phó bản và boss của E-2/E-3/E-4 (mục 4–6, 11 của thiết kế) mới đạt 4/6/8 giờ.',
  );
}
