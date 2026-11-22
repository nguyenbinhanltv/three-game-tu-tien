// Lệnh GM của tài khoản thử (`/gm …`, `?realm=`, `?tribulation=`): tách từ GameSim (R-7), giữ nguyên hành vi.
// Hệ con chỉ biết GameSim qua giao diện hẹp `GmCtx`; mọi đổi vật phẩm/tiền vẫn qua `Character.tx` (tx + idem + sổ cái).
import {
  isRootId,
  ROOT_IDS,
  ARTIFACT_MAX_LEVEL,
  CHARGE_MAX,
  parseAppearance,
  EQUIP_SLOTS,
  wearableBy,
  MAX_ENHANCE,
  MAX_SKILL_LEVEL,
  VARIANT_MIN_LEVEL,
  type EquipSlot,
  type Quality,
  QUALITY_COUNT,
  initialBottleneck,
  MAX_LEVEL,
  parseRealmCode,
  INV_SIZE,
  planSort,
  MS_DEAD,
  tribDef,
  chainDone,
  setChainCleared,
  TRIB_DEFS,
  type TribId,
  xpNeed,
  sanitizeStars,
} from '@dtl/shared';
import {
  ARTIFACT,
  APPEARANCE,
  ITEM,
  itemName,
  itemTier,
  methodName,
  LEVELS,
  MONSTER,
  QUEST,
  QUESTS,
  SET,
  SETS,
  SKILL,
  t,
  METHOD,
  VARIANTS,
  skillName,
} from '@dtl/content';
import { PLACE } from '@dtl/content/places';
import { isEquipSlot, type Character } from '../character';
import {
  BRANCH_METHOD,
  findIds,
  GM_GROUPS,
  GM_MAX_TIER,
  hasOutfitAsset,
  helpLine,
  isGmBranch,
  outfitRows,
  parsePlus,
  planKit,
  skinIds,
  weaponIds,
  type GmBranch,
} from './tools';
import { grantPathOf, methodOf, picksOf, resourceOf, setSkillLevel, skillLevelOf } from '../method';
import type { LevelDef, MonsterDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from '../entities';

/** Phần GameSim mà lệnh GM cần (giao diện hẹp, tránh import vòng lớp GameSim). */
interface GmCtx {
  level(): LevelDef;
  monsters(): readonly MonEnt[];
  playerCount(): number;
  tickP95(): number;
  inDuel(p: PlayerEnt): boolean;
  isDead(p: PlayerEnt): boolean;
  transferLevel(p: PlayerEnt, level: string, spawn: { x: number; z: number } | null, o?: { force?: boolean }): boolean;
  teleportTo(p: PlayerEnt, x: number, z: number, level?: string): boolean;
  teleGm(p: PlayerEnt, arg: string | undefined): string;
  placeIds(): string[];
  questEvent(p: PlayerEnt, type: Parameters<Character['questEvent']>[0], target: string | undefined, n: number): void;
  damageMonster(mon: MonEnt, dmg: number, p: PlayerEnt | null): void;
  spawnMonster(def: MonsterDef, level: number, x: number, z: number, spawn: null): MonEnt;
  removeMonster(m: MonEnt): void;
  damagePlayer(p: PlayerEnt, dmg: number, src: string): void;
  heal(p: PlayerEnt): void;
  giveXp(p: PlayerEnt, n: number): void;
  sendCd(p: PlayerEnt): void;
  resetCooldowns(p: PlayerEnt): void;
  onBreakthrough(p: PlayerEnt, force?: boolean, id?: TribId): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
}

export class GmSystem {
  constructor(private readonly c: GmCtx) {}

  /** Đặt cấp cho tài khoản thử (`/gm level`, `/gm realm`, `?realm=`): bình cảnh các mốc thấp hơn coi như đã vượt, hồi đầy. */
  setLevel(p: PlayerEnt, level: number): void {
    const c = p.char;
    const lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    c.level = lv;
    c.bk = initialBottleneck(lv);
    c.xp = 0;
    c.recalc();
    c.hp = c.mhp;
    c.mp = c.mmp;
    this.c.questEvent(p, 'level', undefined, lv);
  }

  /**
   * Kích độ kiếp ngay cho tài khoản thử (`/gm trib [truc_co|ket_dan|nguyen_anh|hoa_than]`, `?tribulation=1`): đưa về đại viên mãn đã vượt bình cảnh
   * của kiếp `id` (mặc định Trúc Cơ: Ngưng Khí 15), cấp một viên vật phẩm đột phá nếu có và thiếu (qua tx + sổ cái),
   * rồi đi đúng đường `onBreakthrough` như người chơi thật (`force`: bỏ qua cờ `enabled` của kiếp chưa mở).
   * Trả dòng báo cho người gọi.
   */
  tribulation(p: PlayerEnt, id: TribId = 'truc_co', stage?: number): string {
    const c = p.char;
    const def = tribDef(id);
    if (this.c.level().dungeon || this.c.isDead(p) || p.trib || p.trial || this.c.inDuel(p)) return 'trib: không độ kiếp được lúc này';
    // Đặt sau dòng kiểm bận: đang trong kiếp mà đổi tiến độ thì ải đang chạy sẽ không được lưu và nội tại pháp tắc bị mất giữa chừng.
    // Kiếp chuỗi (TN-4): `/gm trib ngu_suy [ải 1..5]` đặt lại tiến độ để vào thẳng ải đó (thưởng từng ải vẫn chỉ nhận một lần nhờ khóa chống trùng).
    if (def.chain) {
      if (stage !== undefined && Number.isInteger(stage) && stage >= 1 && stage <= def.phases.length)
        setChainCleared(c.meta, def, stage - 1);
      else if (chainDone(c.meta, def)) setChainCleared(c.meta, def, 0);
      c.recalc();
    }
    if (c.level !== def.from) this.setLevel(p, def.from);
    if (def.to > def.from) {
      c.bk = def.from;
      c.xp = xpNeed(def.from);
    }
    const item = def.item;
    if (item && !c.inv.some((it) => it?.id === item) && !c.tx('gm', null, (d) => d.add(item, 1)))
      return 'trib: túi đầy, không thêm được vật phẩm đột phá';
    this.c.onBreakthrough(p, true, id);
    return p.trib ? 'trib: bắt đầu độ kiếp' : def.room === 'tribulation' ? 'trib: đang vào room độ kiếp' : 'trib: không bắt đầu được';
  }

  /** Quái gọi bằng `/gm spawn` (để `spawn clear` dọn). */
  readonly spawned = new Set<MonEnt>();

  /** Mặc `n` món đầu của bộ `st` (Địa phẩm), cất đồ cũ vào túi. Dùng cho `/gm set` và `/gm outfit`. */
  wearSet(p: PlayerEnt, st: { pieces: string[] }, n: number): boolean {
    const c = p.char;
    const ok = c.tx('gm:set', null, (d) => {
      for (const pid of st.pieces.slice(0, n)) {
        if (!d.addRolled(pid, c.level, 3)) return false;
        const i = d.inv.findIndex((s) => s?.id === pid && s.inst);
        const slot = ITEM.get(pid)!.kind as EquipSlot;
        const old = d.equip[slot];
        d.equip[slot] = d.inv[i]!;
        d.inv[i] = old ?? null;
      }
      return true;
    });
    if (ok) c.recalc();
    return ok;
  }

  /**
   * Roll và mặc trực tiếp từng món (phẩm cao nhất, cường hóa `plus`); món đang mặc ở ô đó bị thu hồi qua sổ cái (-1).
   * Một transaction: túi đầy hoặc id lạ thì không đổi gì.
   */
  equipPieces(p: PlayerEnt, pieces: { slot: EquipSlot; id: string }[], plus: number): boolean {
    const c = p.char;
    const ok = c.tx('gm:kit', null, (d) => {
      for (const { slot, id } of pieces) {
        const def = ITEM.get(id);
        if (!def || def.kind !== slot) return false;
        const old = d.equip[slot];
        if (old) {
          d.bump(old.id, -(old.n || 1));
          delete d.equip[slot];
        }
        const i = d.inv.findIndex((x) => !x);
        if (i < 0 || !d.addRolled(id, Math.max(c.level, def.reqLevel ?? 1), 4 as Quality)) return false;
        const it = d.inv[i]!;
        d.inv[i] = null;
        d.equip[slot] = plus > 0 ? { ...it, plus } : it;
      }
      return true;
    });
    if (ok) c.recalc();
    return ok;
  }

  gender(p: PlayerEnt, g: 'm' | 'f'): void {
    const ap = parseAppearance(APPEARANCE, { g, dye: p.char.appearance.dye, hair: p.char.appearance.hair });
    if (!ap) return;
    p.char.setAppearance(ap);
    p.s.g = ap.g;
    p.s.dye = ap.dye;
  }

  /** Lệnh GM, chỉ dành cho tài khoản dev khi AUTH_DEV_BYPASS bật. */
  run(p: PlayerEnt, a: string[]): void {
    const c = p.char;
    const say = (m: string) => this.c.sys(p, 'sys.gm', { m }, 'info');
    switch (a[0]) {
      case 'level':
      case 'realm': {
        // `level N` hoặc `realm nk1…nk15 | tc | tc1…tc3`: cùng một đường đặt cấp.
        const lv = a[0] === 'realm' ? parseRealmCode(a[1] ?? '') : Math.max(1, Math.min(MAX_LEVEL, Number(a[1]) | 0));
        if (lv === null) return say('realm nk1…nk15 | tc | tc1…tc3');
        this.setLevel(p, lv);
        return say('level = ' + c.level);
      }
      case 'dao': {
        // /gm dao <kim|moc|thuy|hoa|tho|loi|clear>: đặt hoặc xóa Đạo (TN-3), không cần đủ cấp Vấn Đỉnh.
        if (a[1] === 'clear') delete c.meta.dao;
        else if (isRootId(a[1])) c.meta.dao = a[1];
        else return say('dao ' + ROOT_IDS.join(' | ') + ' | clear');
        c.recalc();
        c.charDirty = true;
        return say('dao = ' + (c.meta.dao ?? 'không'));
      }
      case 'kieu': {
        // /gm kieu <0..9>: đặt số cầu Cửu Kiều đã qua (TN-7) để thử; không phát thưởng, không đổi cấp.
        const n = Number(a[1]);
        if (!Number.isInteger(n) || n < 0 || n > 9) return say('kieu 0..9');
        c.meta.kieu = n;
        c.recalc();
        c.charDirty = true;
        c.gainXp(0);
        return say(`kieu = ${n} (trần cấp ${c.levelCap()})`);
      }
      case 'trib':
        // /gm trib [id]: kích độ kiếp ngay (mặc định Trúc Cơ: Ngưng Khí 15 viên mãn + Trúc Cơ Đan nếu thiếu).
        return say(
          a[1] && !(a[1] in TRIB_DEFS)
            ? `trib ${Object.keys(TRIB_DEFS).join(' | ')}`
            : this.tribulation(p, (a[1] as TribId | undefined) ?? 'truc_co', a[2] ? Number(a[2]) : undefined),
        );
      case 'xp':
        this.c.giveXp(p, Math.max(0, Number(a[1]) | 0));
        return;
      case 'gold':
        c.tx('gm', null, (d) => (d.addGold(Math.max(1, Number(a[1]) | 0)), true));
        return say('gold = ' + c.gold);
      case 'roll': {
        // /gm roll <mẫu trang bị> [phẩm 0-5] [ilvl]: roll một món (kiểm thử hệ trang bị 8 ô).
        const q = Math.min(QUALITY_COUNT - 1, Math.max(0, Number(a[2] ?? 0) | 0));
        const il = Math.max(1, Number(a[3] ?? c.level) | 0);
        const ok = c.tx('gm', null, (d) => d.addRolled(a[1] ?? '', il, q as Quality));
        return say(ok ? `đã roll ${a[1]} phẩm ${q} ilvl ${il}` : 'roll <mẫu trang bị> [phẩm 0-5] [ilvl]');
      }
      case 'plus': {
        // Đặt cấp cường hóa của món đang mặc ở ô `a[2]` (mặc định pháp kiếm) để thử VFX +7/+10 và rớt cấp.
        const slot = isEquipSlot(a[2]) ? a[2] : 'weapon';
        const n = Math.max(0, Math.min(MAX_ENHANCE, Number(a[1]) | 0));
        const ok = c.tx('gm:plus', null, (d) => {
          const w = d.equip[slot];
          if (!w) return false;
          d.equip[slot] = n > 0 ? { ...w, plus: n } : { ...w, plus: undefined };
          if (n === 0) delete d.equip[slot]!.plus;
          return true;
        });
        if (ok) c.recalc();
        return say(ok ? `${slot} +${n}` : 'plus <0-10> [ô]: ô chưa mặc đồ');
      }
      case 'art': {
        // /gm art <id pháp bảo> [cấp 1-5]: có và đeo luôn (không cần chế); `art off` cất vào túi. Chỉ để thử.
        if (a[1] === 'off') {
          const ok = c.tx('gm:art', null, (d) => {
            const it = d.equip.artifact;
            if (!it) return true;
            const i = d.inv.findIndex((x) => !x);
            if (i < 0) return false;
            d.inv[i] = it;
            delete d.equip.artifact;
            return true;
          });
          if (ok) c.recalc();
          return say(ok ? 'đã cất pháp bảo' : 'túi đầy');
        }
        if (!ARTIFACT.has(a[1] ?? '')) return say('art ' + [...ARTIFACT.keys()].join(' | ') + ' | off');
        const ok = c.tx('gm:art', null, (d) => {
          const prev = d.equip.artifact;
          if (prev) {
            const i = d.inv.findIndex((x) => !x);
            if (i < 0) return false;
            d.inv[i] = prev;
          }
          d.equip.artifact = { id: a[1] ?? '', n: 1 };
          d.bump(a[1] ?? '', 1);
          return true;
        });
        if (!ok) return say('không đeo được');
        const lv = Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, Number(a[2] ?? 1) | 0));
        c.meta.art ??= {};
        c.meta.art[a[1] ?? ''] = { lv, qi: 0 };
        c.recalc();
        p.mth.dirty = true;
        return say('art = ' + a[1] + ' cấp ' + lv);
      }
      case 'give': {
        const ok = c.tx('gm', null, (d) => d.add(a[1] ?? '', Math.max(1, Number(a[2] ?? 1) | 0)));
        return say(ok ? 'đã thêm ' + a[1] : 'không thêm được');
      }
      case 'set': {
        // `set <id bộ> [số món]`: roll rồi mặc luôn các món của bộ (Địa phẩm) để thử hiệu ứng 2/4 món và màu áo; `set off` cởi hết.
        if (a[1] === 'off') {
          // Cất đồ vào túi (không xóa) để sổ cái vẫn khớp.
          const ok = c.tx('gm:set', null, (d) => {
            for (const k of EQUIP_SLOTS) {
              const it = d.equip[k];
              if (!it) continue;
              const i = d.inv.findIndex((x) => !x);
              if (i < 0) return false;
              d.inv[i] = it;
              delete d.equip[k];
            }
            return true;
          });
          if (ok) c.recalc();
          return say(t(ok ? 'gm.msg.set_off' : 'gm.msg.bag_full'));
        }
        const st = SET.get(a[1] ?? '');
        if (!st) return say('set off | ' + SETS.map((x) => x.id).join(' | ') + ' [số món]');
        const n = Math.max(1, Math.min(st.pieces.length, Number(a[2] ?? st.pieces.length) | 0));
        return say(
          this.wearSet(p, st, n)
            ? t('gm.msg.set_worn', { n, total: st.pieces.length, name: t('set.' + st.id + '.name') })
            : t('gm.msg.bag_full'),
        );
      }
      case 'tp': {
        // `tp x z` hoặc `tp <địa điểm>` (bảng packages/content/data/places.json, cùng bảng với ?at=).
        if (a.length === 2) {
          const pl = PLACE.get(a[1] ?? '');
          if (!pl) return say('tp ' + this.c.placeIds().join(' | '));
          if (pl.level !== this.c.level().id) {
            const ok = !LEVELS[pl.level]?.dungeon && this.c.transferLevel(p, pl.level, { x: pl.x, z: pl.z }, { force: true });
            return say(ok ? `tp ${pl.id} → ${pl.level}` : `${pl.id} thuộc ${pl.level}, không chuyển được`);
          }
          this.c.teleportTo(p, pl.x, pl.z);
          return say(`tp ${pl.id} (${pl.x}, ${pl.z})`);
        }
        if (a.length === 1) return say('tp x z | tp ' + this.c.placeIds().join(' | '));
        const x = Number(a[1]);
        const z = Number(a[2]);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return say('tp x z | tp <địa điểm>');
        this.c.teleportTo(p, x, z);
        return say(`tp ${x} ${z}`);
      }
      case 'tele':
        return say(this.c.teleGm(p, a[1]));
      case 'qdone': {
        // /gm qdone <id|chuong2>: ghi nhiệm vụ đã xong (bỏ qua điều kiện) để thử chuỗi nhiệm vụ; chuong2 = mọi q2_* trước q2_ket_dan.
        const ids =
          a[1] === 'chuong2'
            ? QUESTS.filter((q) => q.id.startsWith('q2_') && q.id !== 'q2_ket_dan').map((q) => q.id)
            : QUEST.has(a[1] ?? '')
              ? [a[1]!]
              : [];
        if (!ids.length) return say('qdone <id nhiệm vụ> | chuong2');
        for (const id of ids) {
          delete p.char.quests.active[id];
          if (!p.char.quests.done.includes(id)) p.char.quests.done.push(id);
        }
        p.char.questDirty = true;
        return say('qdone ' + ids.join(','));
      }
      case 'qev': {
        // /gm qev <loại> [đích] [n]: bắn một sự kiện nhiệm vụ (ví dụ `qev dungeon phuc_mach_quat` thay cho phó bản chưa có).
        const n = Number(a[3] ?? 1);
        this.c.questEvent(p, a[1] as never, a[2] === '-' ? undefined : a[2], Number.isFinite(n) ? n : 1);
        return say(`qev ${a[1]} ${a[2] ?? '-'} ${n}`);
      }
      case 'god': {
        p.god = a[1] === 'off' ? false : a[1] === 'on' ? true : !p.god;
        if (p.god) this.c.heal(p);
        return say('god ' + (p.god ? 'on' : 'off'));
      }
      case 'heal':
        c.hp = c.mhp;
        c.mp = c.mmp;
        return say('đã hồi đầy');
      case 'branch': {
        // /gm branch <mốc> <id> | reset: chọn nhánh công pháp ngay (bỏ kiểm cảnh giới/giao chiến) hoặc xóa hết nhánh, không tốn linh thạch.
        const mdef = methodOf(c.meta);
        if (!mdef) return say('chưa chọn công pháp');
        if (a[1] === 'reset') {
          c.tx('gm:branch:reset', null, (d) => d.clearBranches(mdef.id));
          p.mth.dirty = true;
          return say('đã xóa nhánh của ' + mdef.id);
        }
        const tier = Number(a[1]);
        const br = mdef.branches.find((b) => b.tier === tier && b.id === a[2]);
        if (!br) return say('branch <mốc> <id>: ' + mdef.branches.map((b) => `${b.tier} ${b.id}`).join(' | '));
        c.tx('gm:branch:pick', null, (d) => d.setBranch(mdef.id, br.tier, br.id));
        p.mth.dirty = true;
        return say(`nhánh ${br.tier} = ${br.id}; đang có: ${JSON.stringify(picksOf(c) ?? {})}`);
      }
      case 'res': {
        // /gm res [n]: đặt tài nguyên riêng của công pháp (mặc định đầy).
        const rdef = resourceOf(c.meta);
        if (!rdef) return say('chưa chọn công pháp');
        p.mth.res = Math.max(0, Math.min(rdef.max, a[1] === undefined ? rdef.max : Number(a[1]) || 0));
        // Giờ của sim là `Date.now()` mỗi tick.
        p.mth.resAt = Date.now();
        p.mth.dirty = true;
        return say(rdef.id + ' = ' + p.mth.res);
      }
      case 'stars': {
        // /gm stars <0-9>: đặt sao Cổ Thần ngay (chỉ để thử/chụp ảnh): bỏ cấp, vật phẩm, linh thạch; không ghi ledger.
        c.meta.stars = sanitizeStars(Number(a[1]));
        c.recalc();
        c.save();
        p.mth.dirty = true;
        return say('sao Cổ Thần = ' + (c.meta.stars ?? 0));
      }
      case 'charge': {
        // /gm charge [0-100]: đặt vòng sạc chiêu tối thượng (mặc định đầy).
        p.mth.charge = Math.max(0, Math.min(CHARGE_MAX, a[1] === undefined ? CHARGE_MAX : Number(a[1]) | 0));
        p.mth.dirty = true;
        return say('sạc = ' + p.mth.charge);
      }
      case 'cd':
        // /gm cd: xóa hồi chiêu, GCD và hồi thần thức (chụp ảnh nhiều chiêu liên tiếp).
        p.cds.clear();
        p.gcdAt = 0;
        this.c.sendCd(p);
        this.c.resetCooldowns(p);
        return say('đã xóa hồi chiêu');
      case 'variant': {
        // /gm variant <id chiêu> <a|b>: chọn biến thức ngay (không cần cấp 3, ngoài combat, hồi chờ) để chụp ảnh/thử.
        const sk = SKILL.get(a[1] ?? '');
        if (!sk || !VARIANTS[sk.id] || (a[2] !== 'a' && a[2] !== 'b'))
          return say('variant <skill> a|b — skill: ' + Object.keys(VARIANTS).join(' | '));
        if (skillLevelOf(c.meta, sk.id) < VARIANT_MIN_LEVEL) setSkillLevel(c.meta, sk.id, VARIANT_MIN_LEVEL);
        c.meta.skillVar ??= {};
        c.meta.skillVar[sk.id] = a[2];
        p.mth.dirty = true;
        return say('variant ' + sk.id + ' = ' + a[2]);
      }
      case 'method': {
        // /gm method <id> [cấp chiêu]: chọn công pháp ngay (không cần tầng/NPC/linh thạch); cấp chiêu áp cho mọi chiêu mở.
        if (!METHOD.has(a[1] ?? '')) return say('method ' + [...METHOD.keys()].join(' | '));
        c.meta.method = a[1] ?? '';
        grantPathOf(c.meta);
        const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, Number(a[2] ?? 1) | 0));
        for (const sk of SKILL.values()) if (!sk.method || sk.method === a[1]) setSkillLevel(c.meta, sk.id, lv);
        p.mth.reset();
        c.recalc();
        return say('method = ' + a[1] + ' cấp chiêu ' + lv);
      }

      case 'dye': {
        // Thử đổi màu áo lúc đang chơi (người khác thấy qua schema); vẫn kiểm như lúc tạo nhân vật.
        const ap = parseAppearance(APPEARANCE, { g: c.appearance.g, dye: a[1], hair: c.appearance.hair });
        if (!ap) return say('dye ' + APPEARANCE.dyes.map((d) => d.id).join(' | '));
        c.setAppearance(ap);
        p.s.g = ap.g;
        p.s.dye = ap.dye;
        return say('dye = ' + ap.dye);
      }
      case 'die': {
        const god = p.god;
        p.god = false;
        this.c.damagePlayer(p, 999999, '');
        p.god = god;
        return;
      }
      case 'killall': {
        let n = 0;
        for (const m of this.c.monsters()) {
          if (m.state !== MS_DEAD && Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z) < 40) {
            this.c.damageMonster(m, m.s.hp, p);
            n++;
          }
        }
        return say('hạ ' + n + ' quái');
      }
      case 'hurt': {
        // Thử pha boss: hạ máu quái quanh mình về `pct`% (qua damageMonster nên pha/phá thế chạy như thật).
        const pct = Math.max(1, Math.min(100, Number(a[1]) | 0 || 50));
        let n = 0;
        for (const m of this.c.monsters()) {
          if (m.state === MS_DEAD || Math.hypot(m.s.x - p.move.x, m.s.z - p.move.z) >= 40) continue;
          const want = Math.ceil((m.s.mhp * pct) / 100);
          if (m.s.hp > want) {
            this.c.damageMonster(m, m.s.hp - want, p);
            n++;
          }
        }
        return say('hạ máu ' + n + ' quái về ' + pct + '%');
      }
      case 'spawn': {
        // Gọi quái thử ngay trước mặt (không hồi sinh, tự dọn sau khi chết); `spawn clear` dọn hết quái gọi bằng lệnh này.
        if (a[1] === 'clear') {
          let n = 0;
          for (const m of [...this.spawned]) {
            this.c.removeMonster(m);
            n++;
          }
          return say(t('gm.msg.spawn_clear', { n }));
        }
        const def = MONSTER.get(a[1] ?? '');
        if (!def) return say(t('gm.msg.no_mon', { id: a[1] ?? '' }));
        const n = Math.max(1, Math.min(GM_SPAWN_MAX, Math.floor(Number(a[2]) || 1)));
        const fwd = p.s.yaw;
        for (let i = 0; i < n; i++) {
          // Quạt rộng 150° phía trước, cách 8 m (xếp hai hàng khi đông).
          const ang = fwd + (n === 1 ? 0 : ((i / (n - 1) - 0.5) * (Math.PI * 5)) / 6);
          const r = 8 + (i % 2) * 3;
          this.spawned.add(
            this.c.spawnMonster(def, Math.max(1, p.char.level - 1), p.move.x + Math.sin(ang) * r, p.move.z + Math.cos(ang) * r, null),
          );
        }
        return say(`gọi ${n} ${def.id}`);
      }
      case 'help': {
        // /gm help [lệnh]: cú pháp + ví dụ mọi lệnh (chuỗi ở i18n `gm.cmd.*`).
        if (a[1]) return say(helpLine(a[1]) ?? t('gm.msg.help_none', { c: a[1] }));
        say(t('gm.help.head'));
        for (const g of GM_GROUPS) {
          say(t('gm.group.' + g.id));
          for (const cmd of g.cmds) say(t('gm.cmd.' + cmd));
        }
        return;
      }
      case 'skills': {
        // /gm skills list | max | all: liệt kê chiêu, đặt cấp chiêu tối đa (công pháp đang tu), hoặc mở mọi chiêu của mọi công pháp.
        const mode = a[1] ?? 'list';
        if (mode === 'all') {
          this.setLevel(p, MAX_LEVEL);
          for (const sk of SKILL.values()) setSkillLevel(c.meta, sk.id, MAX_SKILL_LEVEL);
          p.mth.dirty = true;
          c.recalc();
          return say(t('gm.msg.skills_all', { lv: c.level, n: SKILL.size, locked: [...SKILL.values()].filter((x) => x.locked).length }));
        }
        if (mode === 'max') {
          let n = 0;
          for (const sk of SKILL.values()) {
            if (sk.method && sk.method !== c.meta.method) continue;
            setSkillLevel(c.meta, sk.id, MAX_SKILL_LEVEL);
            n++;
          }
          p.mth.dirty = true;
          c.recalc();
          return say(t('gm.msg.skills_max', { n, lv: MAX_SKILL_LEVEL }));
        }
        if (mode !== 'list') return say(helpLine('skills')!);
        const own = [...SKILL.values()].filter((sk) => !sk.method || sk.method === c.meta.method);
        say(t('gm.msg.skills_head', { m: c.meta.method ? methodName(c.meta.method) : '—', n: own.length }));
        for (let i = 0; i < own.length; i += 4) {
          say(
            own
              .slice(i, i + 4)
              .map((sk) => `${sk.id} (${sk.unlock}${sk.locked ? ',' + t('gm.msg.locked') : ''})`)
              .join(' · '),
          );
        }
        return;
      }
      case 'learn': {
        // /gm learn <id chiêu> [cấp]: chuyển sang công pháp của chiêu, nâng tới cấp mở khóa, đặt cấp chiêu.
        const sk = SKILL.get(a[1] ?? '');
        if (!sk) return say(t('gm.msg.no_skill', { id: a[1] ?? '' }));
        const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, Number(a[2] ?? MAX_SKILL_LEVEL) | 0 || MAX_SKILL_LEVEL));
        if (sk.method && c.meta.method !== sk.method) {
          c.meta.method = sk.method;
          grantPathOf(c.meta);
          p.mth.reset();
        }
        if (c.level < sk.unlock) this.setLevel(p, sk.unlock);
        setSkillLevel(c.meta, sk.id, lv);
        p.mth.dirty = true;
        c.recalc();
        return say(t('gm.msg.learn', { id: sk.id, name: skillName(sk.id), lv, lock: sk.locked ? t('gm.msg.learn_locked') : '' }));
      }
      case 'kit': {
        // /gm kit <bậc 1-4> <kiem|hophap|dansu> [+N] [m|f]: trọn bộ theo bậc/nhánh, phẩm cao nhất, kèm công pháp và pháp bảo của nhánh.
        const tier = Number(a[1]);
        const br = a[2];
        if (!Number.isInteger(tier) || tier < 1 || tier > GM_MAX_TIER || !isGmBranch(br)) return say(helpLine('kit')!);
        let plus = 0;
        let g: 'm' | 'f' | undefined;
        for (const x of a.slice(3)) {
          if (x === 'm' || x === 'f') g = x;
          else {
            const n = parsePlus(x, MAX_ENHANCE);
            if (n === null) return say(helpLine('kit')!);
            plus = n;
          }
        }
        const plan = planKit(tier, br);
        const need = Math.max(...plan.pieces.map((x) => ITEM.get(x.id)?.reqLevel ?? 1));
        if (c.level < need) this.setLevel(p, need);
        c.meta.method = BRANCH_METHOD[br];
        grantPathOf(c.meta);
        for (const sk of SKILL.values()) if (!sk.method || sk.method === c.meta.method) setSkillLevel(c.meta, sk.id, MAX_SKILL_LEVEL);
        p.mth.reset();
        if (!this.equipPieces(p, plan.pieces, plus)) return say(t('gm.msg.bag_full'));
        if (g) this.gender(p, g);
        this.run(p, ['art', KIT_ARTIFACT[br], '5']);
        c.hp = c.mhp;
        c.mp = c.mmp;
        return say(
          t('gm.msg.kit', {
            tier: plan.tier,
            used: plan.used,
            set: t('set.' + plan.set + '.name'),
            n: plan.pieces.length,
            plus,
            m: methodName(c.meta.method!),
          }) + (plan.used < plan.tier ? ' ' + t('gm.msg.kit_cap', { used: plan.used }) : ''),
        );
      }
      case 'outfit': {
        // /gm outfit <id bộ|list|off> [m|f]: mặc bộ để xem trang phục (hình áo theo bộ đang mặc).
        if (!a[1] || a[1] === 'list') {
          say(t('gm.msg.outfit_head'));
          for (const r of outfitRows())
            say(`${r.id} — ${t('set.' + r.id + '.name')} · ${r.wearable ? t('gm.msg.outfit_ok') : t('gm.msg.outfit_asset')}`);
          return;
        }
        if (a[1] === 'off') return this.run(p, ['set', 'off']);
        const st = SET.get(a[1]);
        if (!st || !st.pieces.length)
          return say(t(st || hasOutfitAsset(a[1]) ? 'gm.msg.outfit_asset_only' : 'gm.msg.outfit_none', { id: a[1] }));
        if (a[2] === 'm' || a[2] === 'f') this.gender(p, a[2]);
        return say(
          this.wearSet(p, st, st.pieces.length)
            ? t('gm.msg.outfit', { id: st.id, name: t('set.' + st.id + '.name'), n: st.pieces.length })
            : t('gm.msg.bag_full'),
        );
      }
      case 'weapon': {
        // /gm weapon <id|list> [+N]: lấy và cầm kiếm (phẩm cao nhất), +10 = dạng cuối, vỏ lưng.
        const ids = weaponIds();
        if (!a[1] || a[1] === 'list') {
          say(t('gm.msg.weapon_head'));
          for (const id of ids)
            say(
              `${id} — ${itemName(id)} · ${t('gm.msg.tier', { n: itemTier(id) })} · ${t('gm.msg.req', { n: ITEM.get(id)?.reqLevel ?? 1 })}`,
            );
          return;
        }
        if (!ids.includes(a[1])) return say(t('gm.msg.no_weapon', { id: a[1] }));
        const plus = a[2] === undefined ? 0 : parsePlus(a[2], MAX_ENHANCE);
        if (plus === null) return say(helpLine('weapon')!);
        return say(
          this.equipPieces(p, [{ slot: 'weapon', id: a[1] }], plus)
            ? t('gm.msg.weapon', { name: itemName(a[1]), plus })
            : t('gm.msg.bag_full'),
        );
      }
      case 'skin': {
        // /gm skin <id|list|off>: lấy (nếu chưa có) và mặc skin vào ô ngoại hình; off = tháo về túi. Skin không có chỉ số.
        const ids = skinIds();
        if (!a[1] || a[1] === 'list') {
          say(t('gm.msg.skin_head'));
          for (const id of ids) say(`${id} — ${itemName(id)}`);
          return;
        }
        if (a[1] === 'off') {
          const ok = c.tx('gm:skin', null, (d) => {
            const i = d.inv.findIndex((x) => !x);
            if (!d.equip.skin || i < 0) return false;
            d.inv[i] = { ...d.equip.skin };
            delete d.equip.skin;
            return true;
          });
          return say(ok ? t('gm.msg.skin_off') : t('gm.msg.skin_none'));
        }
        const id = a[1];
        if (!ids.includes(id)) return say(t('gm.msg.no_skin', { id }));
        if (!wearableBy(ITEM.get(id), c.appearance.g)) return say(t('sys.equip_gender'));
        if (c.equip.skin?.id === id) return say(t('gm.msg.skin', { name: itemName(id) }));
        const ok = c.tx('gm:skin', null, (d) => {
          // Chưa có trong túi thì thêm một cái (ghi sổ cái), rồi đổi chỗ với skin đang mặc.
          if (!d.inv.some((x) => x?.id === id) && !d.add(id, 1)) return false;
          const i = d.inv.findIndex((x) => x?.id === id);
          const prev = d.equip.skin;
          d.equip.skin = { id, n: 1 };
          d.inv[i] = prev ? { ...prev } : null;
          return true;
        });
        return say(ok ? t('gm.msg.skin', { name: itemName(id) }) : t('gm.msg.bag_full'));
      }
      case 'find': {
        // /gm find <từ khóa>: tìm id vật phẩm/chiêu/bộ/quái/công pháp theo tên hoặc id (bỏ dấu cũng được).
        const hits = findIds(a.slice(1).join(' '), GM_FIND_MAX);
        if (!hits.length) return say(t('gm.msg.find_none'));
        for (const h of hits) say(`${t('gm.kind.' + h.kind)}: ${h.id} — ${h.name}`);
        return;
      }
      case 'bag': {
        // /gm bag clear | sort: dọn túi (bỏ ô khóa) hoặc xếp lại; một transaction, vật phẩm mất đi ghi sổ cái.
        if (a[1] === 'sort') {
          const ok = c.tx('gm:bag', null, (d) => {
            const next = planSort(d.inv, { def: (id) => ITEM.get(id), name: (it) => itemName(it.id) });
            for (let i = 0; i < INV_SIZE; i++) d.inv[i] = next[i] ?? null;
            return true;
          });
          return say(ok ? t('gm.msg.bag_sort') : t('gm.msg.bag_fail'));
        }
        if (a[1] !== 'clear') return say(helpLine('bag')!);
        let n = 0;
        const ok = c.tx('gm:bag', null, (d) => {
          for (let i = 0; i < d.inv.length; i++) {
            const it = d.inv[i];
            if (!it || it.lk) continue;
            d.bump(it.id, -it.n);
            d.inv[i] = null;
            n++;
          }
          return true;
        });
        return say(ok ? t('gm.msg.bag_clear', { n }) : t('gm.msg.bag_fail'));
      }
      case 'tick':
        return say(`tick p95 ${this.c.tickP95().toFixed(2)}ms, ${this.c.playerCount()} người, ${this.c.monsters().length} quái`);
      default:
        return say(t('gm.msg.unknown'));
    }
  }
}

/** Số quái tối đa mỗi lần `/gm spawn`, số kết quả tối đa của `/gm find`, pháp bảo đi kèm `/gm kit` theo nhánh. */
const GM_SPAWN_MAX = 20;
const GM_FIND_MAX = 30;
const KIT_ARTIFACT: Record<GmBranch, string> = { kiem: 'itm_tu_kim_ho_lo', hophap: 'itm_tran_hon_linh', dansu: 'itm_thanh_lien_an' };
