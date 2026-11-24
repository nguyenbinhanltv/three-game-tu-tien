// Tách từ check.ts (tối ưu Đợt E): trib.

import { GLOSSARY, hasString, ITEM, LEVELS, MONSTER, RECIPES, t } from '../index';
import {
  PEAK_LEVELS,
  HK_MECHANICS,
  HK_PARAMS,
  HUYEN_CHAINS,
  SUY_MECHANICS,
  TRIB_DEFS,
  TRIB_IDS,
  TRIB_MECHANIC_IDS,
  isHkMechanic,
  isSuyMechanic,
  tribForLevel,
  peakGated,
} from '@dtl/shared';

import { err } from './base';
import { needStr } from './palette';
// ---- Độ kiếp theo dữ liệu (E1-F) ----
{
  const peaks = new Set<number>(PEAK_LEVELS);
  const seenFrom = new Set<number>();
  for (const id of TRIB_IDS) {
    const d = TRIB_DEFS[id];
    const w = `độ kiếp ${id}`;
    if (d.chain) {
      // Kiếp chuỗi (TN-4): hoặc đã gắn vào thang cấp (to = from + 1), hoặc còn là mốc tạm (to = from) thì chưa được bật cho người chơi.
      if (d.to !== d.from && d.to !== d.from + 1) err(`${w}: kiếp chuỗi cần to = from (mốc tạm) hoặc to = from + 1`);
      if (d.to === d.from && d.enabled) err(`${w}: kiếp chuỗi chưa gắn vào thang cấp (to = from) thì không được bật`);
    } else if (!peaks.has(d.from) || d.to !== d.from + 1) err(`${w}: from ${d.from} phải là đại viên mãn và to = from + 1`);
    if (d.to > d.from) {
      if (seenFrom.has(d.from)) err(`${w}: hai kiếp cùng from ${d.from}`);
      seenFrom.add(d.from);
    }
    if (d.item !== null && !ITEM.get(d.item)) err(`${w}: vật phẩm đột phá ${d.item} không tồn tại`);
    if (d.enabled && d.item === null) err(`${w}: bật (enabled) mà chưa có vật phẩm đột phá`);
    if (d.room !== 'world' && d.room !== 'tribulation') err(`${w}: room phải là world hoặc tribulation`);
    if (d.level !== undefined) {
      const lv = LEVELS[d.level];
      if (d.room !== 'tribulation' || !lv?.tribulation || !lv.dungeon)
        err(`${w}: level ${d.level} phải là sân độ kiếp (tribulation + dungeon) và room = tribulation`);
    }
    if (!(d.duration > 0) || !(d.firstDelay >= 0) || !(d.failXpLoss >= 0 && d.failXpLoss <= 0.5) || !(d.pillMax >= 0))
      err(`${w}: thời lượng/phạt/đan ngoài khoảng`);
    if (!d.phases.length) err(`${w}: thiếu pha`);
    let prev = 0;
    const ids = new Set<string>();
    d.phases.forEach((p, i) => {
      const pw = `${w}, pha ${p.id}`;
      if (ids.has(p.id)) err(`${pw}: trùng id pha`);
      ids.add(p.id);
      if (!(p.end > prev)) err(`${pw}: mốc end phải tăng dần`);
      prev = p.end;
      if (i === d.phases.length - 1 && p.end !== d.duration) err(`${pw}: pha cuối phải kết thúc đúng lúc duration (${d.duration})`);
      if (!(p.gap > 0) || (p.gapEnd !== undefined && !(p.gapEnd > 0))) err(`${pw}: gap phải > 0`);
      if (p.extra && (p.extraR === undefined || p.extraPct === undefined)) err(`${pw}: có extra thì cần extraR và extraPct`);
      for (const pct of [p.aimPct, p.extraPct, p.net?.pct, p.final?.pct, p.grid?.pct])
        if (pct !== undefined && !(pct >= 0 && pct <= 0.9)) err(`${pw}: phần trăm sát thương ngoài [0, 0,9]`);
      if (p.kind === 'hoa' && !p.grid) err(`${pw}: pha hoa cần grid`);
      if (p.grid && p.grid.pick > p.grid.cols * p.grid.rows) err(`${pw}: pick vượt số ô`);
      if (p.final && p.final.guardShare !== undefined && !(p.final.guardShare >= 0 && p.final.guardShare <= 0.6))
        err(`${pw}: guardShare ngoài [0, 0,6]`);
      if (p.mechanic && !(TRIB_MECHANIC_IDS as readonly string[]).includes(p.mechanic)) err(`${pw}: cơ chế ${p.mechanic} chưa đăng ký`);
      if (p.shadows && !MONSTER.get('mon_tam_ma')) err(`${pw}: thiếu quái mon_tam_ma`);
      needStr(`ui.trib.${id}.${p.id}`);
      needStr(`ui.trib.${id}.${p.id}.hint`);
      if (p.final) needStr(`ui.trib.${id}.${p.id}.hint2`);
    });
    needStr(`ui.trib.${id}.title`);
  }
  // Kiếp đã bật cho người chơi phải có vật phẩm đột phá thật, chế được, nhặt được; cơ chế `dan_tran` phải có thông số Đan Trận (E2-D).
  for (const [id, d] of Object.entries(TRIB_DEFS)) {
    if (d.enabled && d.item) {
      if (!ITEM.get(d.item)) err(`độ kiếp ${id}: vật phẩm ${d.item} không tồn tại`);
      if (!RECIPES.some((r) => r.output.id === d.item)) err(`độ kiếp ${id}: ${d.item} không có công thức chế`);
    }
    if (d.enabled && !d.item && id !== 'truc_co') err(`độ kiếp ${id}: bật mà chưa có vật phẩm đột phá`);
    for (const p of d.phases) {
      if (p.mechanic === 'dan_tran') {
        const dt = p.danTran;
        if (
          !dt ||
          !(
            dt.r > 0 &&
            dt.fill > 0 &&
            dt.drain >= 0 &&
            dt.sweepEvery > 0 &&
            dt.sweepLen > 0 &&
            dt.sweepW > 0 &&
            dt.sweepWarn > 0 &&
            dt.sweepPct > 0 &&
            dt.sweepPct < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số danTran`);
        else if (dt.fill > p.end - (d.phases[d.phases.indexOf(p) - 1]?.end ?? 0))
          err(`độ kiếp ${id}/${p.id}: fill dài hơn pha, không thể ngưng đan`);
      }
      if (p.mechanic === 'tia_xich') {
        const x = p.tiaXich;
        if (
          !x ||
          !(x.every > 0 && x.len > 0 && x.w > 0 && x.warn > 0 && x.pct > 0 && x.pct < 1 && x.endR > 0 && x.endPct > 0 && x.endPct < 1)
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số tiaXich`);
      }
      if (p.mechanic === 'xuat_khieu') {
        const x = p.xuatKhieu;
        if (!x || !(x.dur > 0 && x.cd >= x.dur) || !p.grid)
          err(`độ kiếp ${id}/${p.id}: xuat_khieu cần xuatKhieu {dur, cd >= dur} và lưới ô lửa (grid)`);
      }
      if (p.mechanic === 'dan_loi') {
        const x = p.danLoi;
        if (!x || !(x.ring > 0 && x.steleR > 0 && x.first >= 0 && x.every > 0 && x.warn > 0 && x.pct > 0 && x.pct < 1 && x.r > 0))
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số danLoi`);
        else if (!(x.first + 5 * x.every <= p.end - (d.phases[d.phases.indexOf(p) - 1]?.end ?? 0)))
          err(`độ kiếp ${id}/${p.id}: pha dẫn lôi quá ngắn để thắp đủ năm bia`);
      }
      if (p.mechanic === 'nhat_thuc') {
        const x = p.nhatThuc;
        if (
          !x ||
          !MONSTER.get(x.boss) ||
          !(
            x.dist > 0 &&
            x.smashEvery > 0 &&
            x.smashWarn > 0 &&
            x.smashR > 0 &&
            x.every > 0 &&
            x.warn > 0 &&
            x.r > 0 &&
            x.stun > 0 &&
            x.shieldEvery > 0 &&
            x.pct > 0 &&
            x.pct < 1 &&
            x.smashPct > 0 &&
            x.smashPct < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số nhatThuc (boss phải tồn tại)`);
        if (!d.phases.some((q) => q.danLoi)) err(`độ kiếp ${id}/${p.id}: nhat_thuc cần một pha dan_loi trước đó (bia của kiếp)`);
      }
      if (p.mechanic === 'hoi_dao') {
        const x = p.hoiDao;
        if (
          !x ||
          !(
            x.ring > 0 &&
            x.gateR > 0 &&
            x.rounds >= 1 &&
            x.first >= 0 &&
            x.ask > 0 &&
            x.rest >= 0 &&
            x.pct > 0 &&
            x.pct < 1 &&
            x.heal >= 0 &&
            x.heal < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số hoiDao`);
        else {
          // Ba Đạo Môn không chồng nhau, và đủ thời gian trong pha cho mọi vòng.
          if (!(x.ring * 2 * Math.sin(Math.PI / 3) > x.gateR * 2))
            err(`độ kiếp ${id}/${p.id}: hoiDao ba cổng chồng nhau (ring ${x.ring}, gateR ${x.gateR})`);
          if (!(x.first + x.rounds * (x.ask + x.rest) - x.rest <= p.end - (d.phases[d.phases.indexOf(p) - 1]?.end ?? 0)))
            err(`độ kiếp ${id}/${p.id}: pha hỏi đạo quá ngắn cho ${x.rounds} vòng`);
        }
      }
      if (p.mechanic === 'am_lan') {
        const x = p.amLan;
        if (
          !x ||
          !(
            x.ring > 0 &&
            x.keep >= 0 &&
            x.first >= 0 &&
            x.every > 0 &&
            x.seed >= 0 &&
            x.grow > 0 &&
            x.hold >= 0 &&
            x.r0 > 0 &&
            x.r1 > x.r0 &&
            x.max >= 1 &&
            x.tick > 0 &&
            x.dps > 0 &&
            x.dps * x.tick < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số amLan`);
        // Vực lan phải chậm hơn người chạy (7 m/s) để né được.
        else if (!((x.r1 - x.r0) / x.grow < 6)) err(`độ kiếp ${id}/${p.id}: amLan lan nhanh hơn người chạy được`);
      }
      if (p.mechanic === 'duong_dap') {
        const x = p.duongDap;
        if (
          !x ||
          !(
            x.first >= 0 &&
            x.every > x.windup &&
            x.windup > x.win &&
            x.win >= 0.8 &&
            x.pct > 0 &&
            x.pct < 0.5 &&
            x.cut > 0 &&
            x.cut < 1 &&
            x.heal >= 0 &&
            x.heal < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số duongDap (cửa sổ phản đòn >= 0,8 s cho nhịp GCD, đòn < 50% khí huyết)`);
      }
      if (p.final?.gateSteles !== undefined && !(p.final.gateSteles >= 1 && p.final.gateSteles <= 5 && d.phases.some((q) => q.danLoi)))
        err(`độ kiếp ${id}/${p.id}: gateSteles ngoài 1–5 hoặc thiếu pha dan_loi`);
      if (p.mechanic === 'tam_canh') {
        const x = p.tamCanh;
        if (!x || !(x.hurt > 0 && x.hit >= 0 && x.skillEvery > 0 && x.skillWarn > 0 && x.skillPow > 0) || !p.shadows)
          err(`độ kiếp ${id}/${p.id}: tam_canh cần tamCanh {hurt, hit, skillEvery, skillWarn, skillPow} và shadows`);
      }
    }
  }
  // Thiên Nhân Ngũ Suy (TN-4): mỗi pha của kiếp chuỗi là một ải có cơ chế `suy_*` riêng, đủ thông số và qua được bằng thao tác.
  for (const [id, d] of Object.entries(TRIB_DEFS)) {
    const w = `độ kiếp ${id}`;
    const suyPhases = d.phases.filter((p) => isSuyMechanic(p.mechanic) || p.suy);
    if (!d.chain) {
      if (suyPhases.length) err(`${w}: cơ chế suy_* chỉ dùng trong kiếp chuỗi (chain)`);
      if (d.stageGold || d.law) err(`${w}: stageGold/law chỉ dùng trong kiếp chuỗi`);
      continue;
    }
    if (d.room !== 'tribulation') err(`${w}: kiếp chuỗi phải chạy ở room tribulation`);
    if (d.to === d.from && d.enabled) err(`${w}: kiếp chuỗi còn mốc tạm (to = from) thì không được bật`);
    // Huyền Kiếp (TN-6): ba chuỗi × ba kiếp nhỏ `hk_*`, tên theo glossary.huyenKiep, thông số đủ theo HK_PARAMS.
    if (d.phases.some((p) => isHkMechanic(p.mechanic))) {
      const ci = (HUYEN_CHAINS as readonly string[]).indexOf(id);
      const grp = ['ngoai', 'noi', 'hon'][ci];
      if (ci < 0 || !grp) err(`${w}: cơ chế hk_* chỉ dùng trong ${HUYEN_CHAINS.join(', ')}`);
      else {
        const names = GLOSSARY.huyenKiep[grp as keyof typeof GLOSSARY.huyenKiep] as Record<string, string>;
        if (d.phases.map((p) => p.id).join() !== Object.keys(names).join())
          err(`${w}: pha phải đúng thứ tự ${Object.keys(names).join(', ')} (glossary.huyenKiep.${grp})`);
        if (d.phases.map((p) => p.mechanic).join() !== HK_MECHANICS.slice(ci * 3, ci * 3 + 3).join())
          err(`${w}: cơ chế phải là ${HK_MECHANICS.slice(ci * 3, ci * 3 + 3).join(', ')}`);
        if ((d.after ?? '') !== (HUYEN_CHAINS[ci - 1] ?? '')) err(`${w}: after phải là ${HUYEN_CHAINS[ci - 1] ?? '(không có)'}`);
        if (t(`ui.trib.${id}.title`) !== `Huyền Kiếp · ${(GLOSSARY.huyenKiepGroups as Record<string, string>)[grp]}`)
          err(`${w}: tiêu đề lệch glossary.huyenKiepGroups`);
        for (const p of d.phases)
          if (hasString(`ui.trib.${id}.${p.id}`) && t(`ui.trib.${id}.${p.id}`) !== names[p.id])
            err(`${w}/${p.id}: tên lệch glossary.huyenKiep ("${names[p.id]}")`);
      }
      if (!d.stageGold || d.stageGold.length !== d.phases.length || d.stageGold.some((g) => !Number.isInteger(g) || g < 0 || g > 5000))
        err(`${w}: stageGold cần đúng ${d.phases.length} số nguyên trong [0, 5000]`);
      if (d.law) err(`${w}: Huyền Kiếp không có law (thưởng là bậc Bản Nguyên, móc huyenOriginTier)`);
      if (d.failXpLoss !== 0) err(`${w}: Huyền Kiếp không phạt tu vi (failXpLoss = 0)`);
      d.phases.forEach((p, i) => {
        const pw = `${w}/${p.id}`;
        const s = p.suy;
        const k = p.hk ?? {};
        const len = p.end - (d.phases[i - 1]?.end ?? 0);
        if (!s || !(s.rest >= 0 && s.rest < len && s.start >= 0 && s.start < 100 && s.rise >= 0 && s.riseEnd >= s.rise))
          return err(`${pw}: thiếu hoặc sai khối suy {rest, start, rise, riseEnd >= rise}`);
        if (!isHkMechanic(p.mechanic)) return err(`${pw}: mọi pha của Huyền Kiếp phải là một cơ chế hk_*`);
        for (const key of HK_PARAMS[p.mechanic]) if (!(k[key]! > 0)) err(`${pw}: hk.${key} phải là số dương`);
        for (const key of Object.keys(k))
          if (!HK_PARAMS[p.mechanic].includes(key)) err(`${pw}: hk.${key} không thuộc cơ chế ${p.mechanic}`);
        for (const key of ['pct', 'heal', 'bleed']) if (k[key] !== undefined && !(k[key]! <= 0.3)) err(`${pw}: hk.${key} quá 0,3`);
        const act = len - s.rest;
        const avg = (s.rise + s.riseEnd) / 2;
        // Không thao tác thì phải thất bại (Tuyết Kiếp: đứng yên còn bị cộng `cold`).
        if (!(s.start + (avg + (p.mechanic === 'hk_tuyet' ? k.cold! : 0)) * act >= 100)) err(`${pw}: đứng yên vẫn qua được`);
        // Thao tác đủ thì phải hóa giải nổi phần tự tăng.
        const best: Record<string, number> = {
          hk_tuyet: k.cure! * act,
          hk_phong: Math.floor(act / k.every!) * k.cure!,
          hk_loi: Math.floor(act / (k.hot! / k.rods!)) * k.cure!,
          hk_tram_ly: k.cure! * act,
          hk_huyet_anh: 3 * k.kill!,
          hk_van_tam: Math.floor(act / k.every!) * k.cure!,
          hk_kho_than: k.beats! * k.cure!,
          hk_hon_tho: Math.floor(act / k.every!) * k.cure!,
          hk_luan_hoi: Math.floor(act / k.every!) * k.cure!,
        };
        if (!(best[p.mechanic]! > avg * act - (100 - s.start))) err(`${pw}: thao tác đủ vẫn không giữ nổi thanh dưới 100`);
        if (p.mechanic === 'hk_kho_than' && !(k.beats! * k.every! <= act)) err(`${pw}: mười nhịp không vừa thời lượng kiếp`);
        if (p.mechanic === 'hk_phong' && !(k.every! > k.warn! && k.warn! >= 2)) err(`${pw}: every > warn >= 2 (kịp chạy ra sau trụ)`);
        if (p.mechanic === 'hk_van_tam' && !(k.every! >= k.show! + k.think! && k.seals! >= 3 && k.seals! <= 6))
          err(`${pw}: every >= show + think, seals 3–6`);
        if (p.mechanic === 'hk_luan_hoi' && !(k.sectors! >= 3 && k.sectors! <= 12 && k.every! > k.warn!))
          err(`${pw}: sectors 3–12, every > warn`);
        if (p.mechanic === 'hk_huyet_anh' && !MONSTER.get('mon_tam_ma')) err(`${pw}: thiếu quái mon_tam_ma (Huyết Ảnh)`);
        needStr(`sys.${p.mechanic}_start`);
      });
      for (const key of ['fail', 'keep', 'stage', 'stage_gold', 'ok', 'done', 'need_prev']) needStr(`sys.hk_${key}`);
      for (const key of ['label', 'short']) needStr(`ui.trib.hk.${key}`);
      continue;
    }
    if (suyPhases.length !== d.phases.length) err(`${w}: mọi pha của kiếp chuỗi phải là một ải suy_*`);
    if (new Set(d.phases.map((p) => p.mechanic)).size !== d.phases.length) err(`${w}: mỗi ải phải dùng một cơ chế riêng`);
    if (id === 'ngu_suy' && d.phases.map((p) => p.mechanic).join() !== SUY_MECHANICS.join())
      err(`${w}: năm ải phải theo thứ tự ${SUY_MECHANICS.join(', ')}`);
    if (!d.stageGold || d.stageGold.length !== d.phases.length || d.stageGold.some((g) => !Number.isInteger(g) || g < 0 || g > 5000))
      err(`${w}: stageGold cần đúng ${d.phases.length} số nguyên trong [0, 5000]`);
    const law = d.law;
    if (!law || [law.hp, law.mp, law.atk, law.def].some((v) => !(v >= 0 && v <= 0.1)))
      err(`${w}: law cần hp/mp/atk/def trong [0, 0,1] (nội tại nhỏ, không phá cân bằng)`);
    if (d.failXpLoss !== 0) err(`${w}: Ngũ Suy không phạt tu vi (failXpLoss = 0)`);
    const names = (GLOSSARY as unknown as { nguSuy?: Record<string, string> }).nguSuy ?? {};
    d.phases.forEach((p, i) => {
      const pw = `${w}/${p.id}`;
      const s = p.suy;
      const len = p.end - (d.phases[i - 1]?.end ?? 0);
      if (!s || !(s.rest >= 0 && s.rest < len && s.start >= 0 && s.start < 100 && s.rise >= 0 && s.riseEnd >= s.rise)) {
        err(`${pw}: thiếu hoặc sai khối suy {rest, start, rise, riseEnd >= rise}`);
        return;
      }
      const act = len - s.rest;
      const avg = (s.rise + s.riseEnd) / 2;
      if (id === 'ngu_suy') {
        if (names[p.id] === undefined) err(`${pw}: tên ải phải có trong glossary.nguSuy`);
        else if (hasString(`ui.trib.${id}.${p.id}`) && t(`ui.trib.${id}.${p.id}`) !== names[p.id])
          err(`${pw}: chuỗi ui.trib.${id}.${p.id} phải đúng tên trong glossary ("${names[p.id]}")`);
      }
      needStr(`sys.${p.mechanic}_start`);
      // Không thao tác thì phải thất bại (ải không qua được bằng cách đứng chịu): riêng Thọ Nguyên Suy thất bại vì đèn tắt hết.
      if (p.mechanic !== 'suy_tho' && !(s.start + avg * act >= 100)) err(`${pw}: đứng yên vẫn qua được (start + tăng < 100)`);
      if (p.mechanic === 'suy_linh') {
        const x = s.linh;
        if (!x || !(x.ring > 0 && x.r > 0 && x.lifeEnd > 0 && x.life >= x.lifeEnd && x.cure > s.riseEnd && x.drain >= 0 && x.drain <= 0.2))
          err(`${pw}: linh cần {ring, r, life >= lifeEnd > 0, cure > riseEnd, drain trong [0, 0,2]}`);
      }
      if (p.mechanic === 'suy_the') {
        const x = s.the;
        if (
          !x ||
          !(
            x.every > x.warn &&
            x.warn > 0 &&
            x.r > 0 &&
            x.dist > x.r &&
            x.cure > 0 &&
            x.cost >= 0 &&
            x.cost <= 0.15 &&
            x.bleed >= 0 &&
            x.bleed <= 0.05
          )
        )
          err(`${pw}: the cần {every > warn > 0, r, dist > r, cure, cost <= 0,15, bleed <= 0,05}`);
        else if (!(Math.floor(act / x.every) * x.cure > avg * act)) err(`${pw}: đón đủ mọi tia vẫn không hóa giải nổi suy khí`);
      }
      if (p.mechanic === 'suy_thuc') {
        const x = s.thuc;
        if (
          !x ||
          !(x.sectors >= 3 && x.sectors <= 16 && x.safe >= 1 && x.safe < x.sectors && x.r > 0 && x.every > x.warn && x.warn >= 1.5) ||
          !(x.pct > 0 && x.pct <= 0.3 && x.hurt > 0 && x.cure > 0 && x.cd > 0 && x.cdEnd >= x.cd)
        )
          err(`${pw}: thuc cần {sectors 3–16, 1 <= safe < sectors, r, every > warn >= 1,5, pct <= 0,3, hurt, cure, cdEnd >= cd > 0}`);
        else if (!(Math.floor(act / x.every) * x.cure > avg * act)) err(`${pw}: né đủ mọi đợt vẫn không hóa giải nổi suy khí`);
      }
      if (p.mechanic === 'suy_tho') {
        const x = s.tho;
        if (
          !x ||
          !(x.lamps >= 3 && x.lamps <= 8 && x.ring > 0 && x.r > 0 && x.light > 0 && x.gustEnd > 0 && x.gust >= x.gustEnd && x.warn > 0) ||
          !(x.per > 0 && x.cure >= 0)
        )
          err(`${pw}: tho cần {lamps 3–8, ring, r, light, gust >= gustEnd > 0, warn, per, cure}`);
        else if (!(x.gustEnd + x.warn > x.light)) err(`${pw}: đèn tắt nhanh hơn thời gian thắp một ngọn, không thể giữ`);
      }
      if (p.mechanic === 'suy_tam') {
        const x = s.tam;
        if (!x || !(x.calm > 0 && x.strike >= 2 && x.hitBad > 0 && x.hitGood > 0 && x.miss >= 0 && x.hurt >= 0 && x.hpFrac >= 1))
          err(`${pw}: tam cần {calm, strike >= 2, hitBad, hitGood, miss, hurt, hpFrac >= 1}`);
        else if (!(Math.floor(act / (x.calm + x.strike)) * x.hitGood > avg * act - (100 - s.start)))
          err(`${pw}: trúng đủ mọi nhịp phá vọng vẫn không giữ nổi thanh dưới 100`);
        if (!MONSTER.get('mon_tam_ma')) err(`${pw}: thiếu quái mon_tam_ma (Tâm Ma Ảnh)`);
      }
    });
    for (const k of ['sys.suy_fail', 'sys.suy_keep', 'sys.suy_stage', 'sys.suy_stage_gold', 'sys.suy_law', 'sys.suy_ok', 'sys.suy_done'])
      needStr(k);
    for (const k of ['label', 'rest', 'stage']) needStr(`ui.trib.suy.${k}`);
  }
  if (!tribForLevel(19)?.enabled) err('độ kiếp Kết Đan (cấp 19) phải đang bật (E2-D)');
  if (peakGated(19) || peakGated(23) || peakGated(27))
    err('peakGated: không còn bình cảnh nào bị chặn (Trúc Cơ 19, Kết Đan 23, Nguyên Anh 27 đã mở)');
  if (!tribForLevel(27)?.enabled) err('độ kiếp Hóa Thần (cấp 27) phải đang bật (E4-D)');
  if (!tribForLevel(23)?.enabled) err('độ kiếp Nguyên Anh (cấp 23) phải đang bật (E3-L)');
  if (TRIB_DEFS.truc_co.room !== 'world' || !TRIB_DEFS.truc_co.enabled) err('độ kiếp truc_co: phải chạy ở room world và đang bật');
}
