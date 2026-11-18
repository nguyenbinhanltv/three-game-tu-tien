// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import * as THREE from 'three/webgpu';
import { type DmgMsg, type FxMsg, type HazardMsg, MF_SENSED, MF_REAL, MF_BURROW, MF_CHANT, MF_REFLECT, MF_WEAK, MS_ATTACK, PF_CASTING, PF_DEAD, PF_FLYING, PF_SHIELD, PF_TRIBULATION, type SysMsg, BONDED_ARTIFACT_ID, PF_SOUL, inSkyBand, SOUL_SCOUT } from '@dtl/shared';
import { groundAt } from '../levelCtx';
import { ITEM, METHOD_SKILLS, MONSTER, t } from '@dtl/content';
import { MON_AURA_REAL, MON_AURA_REFLECT, MON_AURA_SENSED, MON_AURA_WEAK, MON_BURROW_DIRT, type MonFlagEdge } from '../monFlags';
import { fxColor, METHOD_FX, playMethodFx, playVariantExtras } from '../methodFx';
import { get, pushLog, pushToast, set } from '../../ui/store';
import { duck, lootChime, playSting, type Sfx, sfx } from '../audio';
import { FootstepDriver } from '../footsteps';
import { buildSources, Soundscape } from '../soundscape';
import { audioSpatialApi } from '../soundscapeAudio';
import { gearLootTier, LOOT_ARC, LOOT_BOUNCE, LOOT_TIERS, lootColor, lootTier } from '../../render/vfx/loot';
import { type MonVis, type PlayerVis, type PState } from '../entities';
import { SECT_LANTERNS } from '../sect';
import { SoulVis, type SoulScout } from '../soulVis';
import { CloneVis } from '../cloneVis';
import { skipOthersFx } from '../fxBudget';
import { SHAKE } from '../shake';
import { fxTriggered, replacedFx } from '../skillFx';
import { type SkillEvent } from '../character/view';
import { hitPitch, hitStopOf, layersOf, materialOf, shakeOf, WHOOSH_GAIN, whooshDelay, type HitCtx } from '../hitjuice';
import { DASH_LOOKBACK, HIT_CTX_TTL, HIT_WAIT, KNOCKDOWN_FRAC, QUIET, SKILL_INFO, STINGS, _v, _v2 } from './common';
import { chapter, danCine, phaseCine, skipCine } from './cine';
import { bossSay, pruneRareLoot } from './hudSync';
import type { Game } from '../engine';

/**
 * Sự kiện chiêu của máy trạng thái (K-4) → tiếng vung đặt lịch theo đồng hồ AudioContext, và xả hàng chờ đúng khung `hit`:
 * tiếng trúng, hit-stop, rung camera của đòn rơi cùng khung hoạt ảnh ra đòn.
 */
export function onSwingEvent(eng: Game, sid: string, e: SkillEvent): void {
  if (e.kind === 'windup') {
    eng.swinging.begin(sid, e.hitIn ?? 0, performance.now());
    const whoosh = SKILL_INFO.get(e.skill);
    if (whoosh && (whoosh.fx === 'sword' || whoosh.fx === 'slash') && !eng.disposed) {
      const mine = sid === eng.sid;
      const pv = eng.ents?.players.get(sid);
      const vol = mine ? WHOOSH_GAIN : pv ? volumeAt(eng, pv.x, pv.z) * WHOOSH_GAIN * 0.6 : 0;
      if (vol > 0) {
        eng.whooshAt.set(sid, performance.now());
        sfx('sword', vol, pv, false, { delay: whooshDelay(e.hitIn ?? 0), rate: hitPitch(e.combo === 2) });
      }
    }
  } else if (e.kind === 'hit') {
    eng.swinging.delete(sid);
    eng.lastHit.set(sid, { skill: e.skill, index: e.index, combo: e.combo, kb: e.kb, at: performance.now() });
    if (eng.lastHit.size > 64) for (const [k, v] of eng.lastHit) if (performance.now() - v.at > 2000) eng.lastHit.delete(k);
    // Cận cảnh chiêu tối thượng của mình: lúc ra đòn.
    if (sid === eng.sid && SKILL_INFO.get(e.skill)?.ult) eng.ultCamT = 0;
    eng.flushing = true;
    for (const m of eng.hitQ.release(sid)) applyDmg(eng, m, eng.lastHit.get(sid));
    eng.flushing = false;
  } else if (e.kind === 'cancel' || e.kind === 'end') {
    eng.swinging.delete(sid);
    for (const m of eng.hitQ.release(sid)) applyDmg(eng, m, undefined);
  }
}

/** FX của nguyên anh và thuấn di (E3-K): chỉ hình. Trả true nếu đã xử lý. */
export function onSoulFx(eng: Game, m: FxMsg, src: string): boolean {
  if (m.t !== 'soul_out' && m.t !== 'soul_in' && m.t !== 'soul_flee' && m.t !== 'blink') return false;
  eng.soulLog.push({ t: m.t, src, x: m.x, z: m.z, d: m.d });
  if (eng.soulLog.length > 40) eng.soulLog.shift();
  const vis = ensureSoulVis(eng);
  const now = performance.now();
  const x = m.x ?? 0;
  const z = m.z ?? 0;
  if (m.t === 'blink') {
    vis.blink(m.ox ?? x, m.oz ?? z, x, z, now);
  } else if (m.t === 'soul_flee') {
    const p = eng.ents?.players.get(src);
    const from = p ? new THREE.Vector3(p.x, p.y, p.z) : new THREE.Vector3(x, m.y ?? 0, z);
    vis.flee(from, new THREE.Vector3(x, m.y ?? groundAt(x, z), z), m.d ?? 10, now, src);
  } else {
    vis.pulse(x, (m.y ?? groundAt(x, z)) + 0.9, z, now, { r0: 0.5, r1: m.t === 'soul_out' ? 3 : 2, dur: m.d ?? 0.5 });
  }
  return true;
}

export function ensureSoulVis(eng: Game): SoulVis {
  eng.soulVis ??= new SoulVis(eng.scene, (sid, kind) => eng.ents?.makeSoul(sid, kind) ?? null);
  return eng.soulVis;
}

export function ensureCloneVis(eng: Game): CloneVis {
  eng.cloneVis ??= new CloneVis(eng.scene, eng.vfx!, eng.sid, (sid) => eng.ents?.makeSoul(sid, 'soul') ?? null);
  return eng.cloneVis;
}

/** Nguyên anh (bản thu nhỏ) của mọi người đang thám thính, thân xác bỏ lại của mình, gợn linh khí dưới chân khi ngự không. */
export function updateSoulVis(eng: Game, dt: number, me: PState | undefined): void {
  const e = eng.ents;
  if (!e) return;
  const scouts: SoulScout[] = [];
  for (const [sid, v] of e.players) {
    const fl = v.s.fl;
    if ((fl & PF_SOUL) !== 0 && (fl & PF_DEAD) === 0) scouts.push({ sid, x: v.x, y: v.y, z: v.z, yaw: v.yaw, speed: v.speed });
  }
  const soul = get().soul;
  const body = me && (me.fl & PF_SOUL) !== 0 && soul.k === SOUL_SCOUT ? { x: soul.bx, y: soul.by, z: soul.bz } : null;
  // Ngự không: gợn linh khí dưới chân người đang bay không kiếm (tối đa 3 người gần, mỗi 0,8 s).
  const now = performance.now();
  const skyers: PlayerVis[] = [];
  if (now - eng.skyRippleAt > 800) {
    for (const v of e.players.values()) {
      if (skyers.length >= 3) break;
      if ((v.s.fl & PF_FLYING) === 0 || (v.s.fl & PF_SOUL) !== 0 || !inSkyBand(v.s.lv, v.y, groundAt(v.x, v.z))) continue;
      if (Math.hypot(v.x - eng.renderPos.x, v.z - eng.renderPos.z) > 40) continue;
      skyers.push(v);
    }
  }
  if (!eng.soulVis && scouts.length === 0 && skyers.length === 0) return;
  const vis = ensureSoulVis(eng);
  if (skyers.length) {
    eng.skyRippleAt = now;
    for (const v of skyers) vis.skyRipple(v.x, v.y - 0.1, v.z, now);
  }
  if (body && !eng.soulBody) eng.soulBodyYaw = e.players.get(eng.sid)?.yaw ?? 0;
  eng.soulBody = !!body;
  vis.update(dt, scouts, body, now, eng.sid, eng.soulBodyYaw);
}

export function handleFx(eng: Game, m: FxMsg, held = false): void {
  const v = eng.vfx;
  const e = eng.ents;
  if (!v || !e || eng.disposed) return;
  const src = m.src ?? '';
  const dst = m.dst ?? '';
  const pSrc = e.players.get(src);
  if (src && dst && !held) eng.fxDst.set(src, dst);
  if (src && !held) {
    eng.fxVar.set(src + ':' + m.t, m.v ?? m.tb);
    if (m.ox !== undefined && m.oz !== undefined) eng.fxOrigin.set(src, { x: m.ox, z: m.oz });
    else eng.fxOrigin.delete(src);
    if (m.x !== undefined && m.z !== undefined) eng.fxArea.set(src, { x: m.x, z: m.z, r: m.r ?? 8 });
    else eng.fxArea.delete(src);
  }
  // Timeline theo S.FX cho cảnh lớn (đột phá, độ kiếp, thuấn di, nguyên anh): chạy trước cả đường nguyên anh/thuấn di cũ (không thay, chỉ thêm lớp hình).
  const tlPre = pSrc && !held ? fxTriggered(m.t, eng.methodOfPlayer(src), m.v ?? m.tb) : undefined;
  if (tlPre && typeof pSrc?.model.performClock === 'function') eng.skillFx?.startFromFx(src, tlPre);
  if (onSoulFx(eng, m, src)) return;
  if (!held) {
    // Động tác chiêu; đòn của mình đang vào thế thì giữ hiệu ứng + tiếng tới đúng lúc ra đòn.
    // Lướt (K-2): hình trượt từ chỗ cũ tới chỗ server đặt, và cắt phần thu về của chiêu đang phát (K-4).
    if (pSrc && eng.skillPoses.dashOf(m.t)) {
      const from = e.posAgo(src, DASH_LOOKBACK);
      if (from) pSrc.model.dashFrom?.(from.x, from.z, m.d ?? 0.3);
    }
    const dstV = dst ? (e.monsters.get(dst) ?? e.players.get(dst)) : undefined;
    const gap = pSrc && dstV ? Math.hypot(dstV.x - pSrc.x, dstV.z - pSrc.z) - ('model' in dstV && 'def' in dstV.model ? ((dstV.model as { def?: { scale?: number } }).def?.scale ?? 1) : 0.5) : undefined;
    const hold = eng.skillPoses.onFx(m.t, pSrc?.model, src === eng.sid, performance.now(), { n: m.n, gap, method: eng.methodOfPlayer(src) });
    if (hold > 0) {
      setTimeout(() => eng.onFx(m, true), hold * 1000);
      return;
    }
  }
  playFxSound(eng, m.t, src, m.dst ?? '', m.x, m.z);
  // Ngân sách hiệu ứng không dính tới mình (M6-3): đông thì bỏ phần trang trí; động tác, âm thanh vẫn giữ.
  const involvesMe = src === eng.sid || dst === eng.sid;
  if (!involvesMe) {
    const at = m.t === 'rain' ? { x: m.x ?? 0, z: m.z ?? 0 } : (e.players.get(m.t === 'bite' ? dst : src) ?? e.monsters.get(src));
    const dist = at ? Math.hypot(at.x - eng.renderPos.x, at.z - eng.renderPos.z) : 0;
    if (skipOthersFx(m.t, { involvesMe, live: v.pool.live, dist })) {
      // Cú cắn vẫn phát động tác của quái, chỉ bỏ chớp sáng ở người bị cắn.
      if (m.t === 'bite') e.monsters.get(src)?.model.attack();
      return;
    }
  }
  const posSrc = (out: THREE.Vector3) => e.chestOf(src, out);
  const posDst = (out: THREE.Vector3) => e.chestOf(dst, out);
  // Màu theo công pháp (chiêu chung đổi màu khi đã chọn công pháp) và hình dạng theo biến thức / cấp chiêu.
  const tint = (d: number) => fxColor(m, d);
  const mctx = { v, m, src: posSrc, dst: posDst, mine: src === eng.sid, flash: (a: number) => eng.post?.flash(a) };
  // Timeline kích hoạt theo S.FX (lướt: không có động tác riêng) hoặc đã thay hình cũ của công pháp (chỉ khi model phát sự kiện chiêu).
  if (METHOD_FX.has(m.t)) {
    if (!(replacedFx(m.t) && typeof pSrc?.model.performClock === 'function')) playMethodFx(mctx);
    // Chiêu tối thượng của mình: thẻ ngắn 0,6 giây (viền sáng, tên chiêu), không khóa input.
    const ult = src === eng.sid ? METHOD_SKILLS.find((s) => s.fx === m.t && s.ult) : undefined;
    if (ult) set({ ultCard: { id: ++eng.ultCardId, skill: ult.id, color: m.c ?? 'ffffff', until: Date.now() + 600 } });
    return;
  }
  // Chiêu đã có dòng thời gian hiệu ứng (data/fx/<id>.json): hình do `SkillFx.runner` phát theo sự kiện chiêu, bỏ hình cũ.
  // Chỉ khi người ra chiêu có model phát sự kiện chiêu (SkinnedCharacter): model khối (`?models=legacy`, nạp lỗi) không có, giữ hình cũ.
  if (replacedFx(m.t) && typeof pSrc?.model.performClock === 'function') {
    // Đột phá của mình: hình do timeline lo, nhưng trạng thái HUD, chớp sáng và thẻ chương vẫn phải chạy (trước đây bị bỏ qua cùng nhánh hình cũ).
    if (m.t === 'ascend' && src === eng.sid) {
      set({ tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
      eng.post?.flash(0.3);
      window.setTimeout(() => !eng.disposed && chapter(eng, m.tb === 'hoa_than' ? 'ascend_hn' : m.tb === 'nguyen_anh' ? 'ascend_na' : m.tb === 'ket_dan' ? 'ascend_kd' : 'ascend', false), 1100);
    }
    return;
  }
  if (m.v) playVariantExtras(mctx, tint(0xbfeaff));
  switch (m.t) {
    case 'sword':
    case 'slash':
    case 'thunder': {
      if (!e.chestOf(src, _v)) break;
      if (m.t === 'sword') {
        // Phi kiếm: tới nơi để lại một dấu chém chéo nhỏ (không lớp mực, đòn thường đánh liên tục).
        v.swordShot(_v, posDst, tint(0xbfeaff), 1, 0.2, (at) => v.slashMark(posDst, 0xcff3ff, 0.55, -0.55, 0.2, false, at.clone()));
      }
      else if (m.t === 'slash') v.slash(_v, posDst, tint(0x8fdcff));
      else if (e.chestOf(dst, _v2)) {
        v.swordShot(_v, posDst, tint(0xfff3b0), 1.8, 0.16);
        // Lôi Đình Nhất Kiếm: nhát chém dọc lớn (biến thể đứng của kiếm khí) cùng lúc sét đánh.
        v.slashVertical(posDst, 0xfff3b0, 1.3);
        v.lightning(_v2.x, _v2.y - 1, _v2.z, 0xfff0a8, 1.3, m.sd);
        if (src === eng.sid || dst === eng.sid) eng.post?.flash(0.25);
      }
      break;
    }
    case 'rain':
      v.swordRain(m.x ?? 0, m.y ?? 0, m.z ?? 0, m.r ?? 8, tint(0x9fe0ff), m.sd, src === eng.sid);
      break;
    case 'bite': {
      e.monsters.get(src)?.model.attack();
      if (!(QUIET && dst === eng.sid) && e.chestOf(dst, _v)) v.burst(_v, 0xe8c4a8, 0.6, 0.2, 0.25); // cắn: chỉ viền mờ màu kem, không cầu hồng đặc
      break;
    }
    case 'heal':
    case 'potion':
      v.pillar(posSrc, tint(0x7dffa0), 1.0, 0.9, 4);
      break;
    case 'art': {
      // Pháp bảo phụ (P3-8): pháp bảo bay lên theo animation thủ tục; thêm một vòng sáng nhỏ dưới chân, không trụ sáng, không chớp toàn cảnh.
      if (m.s === BONDED_ARTIFACT_ID) e.players.get(src)?.lo?.trigger(m.d ?? 1.4);
      else e.players.get(src)?.art?.trigger(m.d ?? 1.2);
      const col = tint(m.s === BONDED_ARTIFACT_ID ? 0xffb35a : 0xc9a2ff);
      if (e.chestOf(src, _v)) v.burst(_v.set(_v.x, _v.y - 1.05, _v.z).clone(), col, Math.min(1.5, (m.r ?? 8) * 0.12), 0.4);
      if (m.s === 'itm_thanh_lien_an') {
        // Khiên trùm cả tổ đội: vẽ cho người trong tầm đang mang khiên (cờ về sau vài chục ms).
        const rr = (m.r ?? 22) ** 2;
        const from = e.players.get(src);
        window.setTimeout(() => {
          for (const [sid, pv] of e.players) {
            if (from && (pv.x - from.x) ** 2 + (pv.z - from.z) ** 2 > rr) continue;
            if (sid !== src && !((pv.s.fl ?? 0) & PF_SHIELD)) continue;
            v.shield((out) => e.chestOf(sid, out), m.d ?? 4, () => (((eng.view.players.get(sid)?.fl ?? 0) & PF_SHIELD) !== 0), col, 1, 0.09);
          }
        }, 120);
      }
      break;
    }
    case 'artheal':
      // Ngưng Đan Lô: cột đan hỏa mảnh và mờ (không che người), số hồi do DmgMsg heal hiện.
      v.pillar(posSrc, tint(0xffb35a), 0.8, 0.3, 2.2, 0.1);
      break;
    case 'artdrain':
      // Hồ Lô hút linh lực: một tia nhỏ từ quái bay về người dùng.
      if (e.chestOf(src, _v)) v.swordShot(_v, posDst, tint(0xc9a2ff), 0.45, 0.5);
      break;
    case 'artseal':
      if (e.chestOf(dst, _v)) v.burst(_v.clone(), tint(0xe8c46a), 0.9, 0.35);
      break;
    case 'shield':
      v.shield(posSrc, m.d ?? 8, () => ((eng.view.players.get(src)?.fl ?? 0) & PF_SHIELD) !== 0, tint(0x7fd8ff), m.v === 'big' ? 1.4 : 1);
      break;
    case 'levelup':
      v.pillar(posSrc, 0xffe08a, 1.8, 1.4, 12);
      break;
    case 'ascend':
      // Người khác thấy trụ sáng như cũ; của mình thì quầng + tia nắng mảnh để không phủ trắng khung hình.
      if (src === eng.sid) v.ascendGlow(posSrc, 2.6, m.tb === 'ket_dan', m.tb === 'nguyen_anh', m.tb === 'hoa_than');
      else v.pillar(posSrc, m.tb === 'hoa_than' ? 0xffeeb8 : m.tb === 'nguyen_anh' ? 0xd2c4ff : m.tb === 'ket_dan' ? 0xffd79a : 0xfff2b8, 3.2, 2.4, 40);
      if (src === eng.sid) {
        set({ tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
        eng.post?.flash(0.3);
        // Thẻ chương đột phá sau khi mây kiếp tan và trụ sáng bốc lên; sting đột phá đã phát nên không thêm chiêng.
        window.setTimeout(() => !eng.disposed && chapter(eng, m.tb === 'hoa_than' ? 'ascend_hn' : m.tb === 'nguyen_anh' ? 'ascend_na' : m.tb === 'ket_dan' ? 'ascend_kd' : 'ascend', false), 1100);
      }
      if (e.chestOf(src, _v)) v.burst(_v, 0xfff2b8, 6, 1.2);
      break;
    case 'respawn':
      // Của mình: linh quang đầy đủ do deathVisual nổ khi cờ PF_DEAD tắt (khớp lúc mực rút). Người khác: cột sáng.
      if (src === eng.sid) break;
      // Được Hồi Thiên Đan Lộ hồi sinh: cột sáng hẹp và mờ để nhìn rõ người vừa đứng dậy.
      if (m.v === 'revive') v.pillar(posSrc, 0xbfe8ff, 1.2, 0.35, 6, 0.12);
      else v.pillar(posSrc, 0xbfe8ff, 1.2, 1.0, 8);
      break;
    case 'quest':
    case 'craft':
    case 'enhance':
      v.pillar(posSrc, m.t === 'quest' ? 0xffd84a : 0xffa860, 0.9, 0.8, 3.5);
      break;
    case 'gather':
      _v.set(m.x ?? 0, (m.y ?? 0) + 0.6, m.z ?? 0);
      v.burst(_v, 0x8fffc0, 0.8, 0.35);
      break;
    case 'death':
      if (src === eng.sid) set({ tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
      eng.cloneVfx.get(src)?.stop();
      eng.cloneVfx.delete(src);
      if (e.chestOf(src, _v)) v.burst(_v, 0x8a8f98, 1.6, 0.5);
      break;
    case 'cast':
      v.charge(posSrc, m.d ?? 1, 0xfff0a8, () => ((eng.view.players.get(src)?.fl ?? 0) & PF_CASTING) !== 0);
      // Pháp trận dưới chân: vạch tiến độ chạy theo thời gian niệm chú, tắt dần nếu bị ngắt.
      v.castSigil(posSrc, m.d ?? 1, 0xfff0a8, 1.4, () => ((eng.view.players.get(src)?.fl ?? 0) & PF_CASTING) !== 0);
      if (src === eng.sid) set({ castEnd: Date.now() + (m.d ?? 1) * 1000, castTotal: (m.d ?? 1) * 1000 });
      eng.skillPoses.onCast(pSrc?.model, m.s, m.d ?? 1, eng.methodOfPlayer(src));
      break;
    case 'mcast':
      // Quái đánh xa đọc chú: chỉ hiện quả cầu tụ lực; vùng báo trước tới sau qua S.HAZARD.
      v.charge(posSrc, m.d ?? 1, 0xff9a6a, () => {
        const st = eng.view.monsters.get(src)?.st;
        return st === MS_ATTACK;
      });
      break;
    case 'chant':
      // Boss niệm chú: quả cầu tụ lực lớn; thanh niệm chú hiện ở khung mục tiêu (đọc từ state `mf`/`ce`).
      v.charge(posSrc, m.d ?? 2, 0x9fe6ff, () => ((eng.view.monsters.get(src)?.mf ?? 0) & MF_CHANT) !== 0);
      // Pháp trận lớn dưới chân boss: đọc được thời gian còn lại để kịp ngắt chú (M5-3).
      v.castSigil(posSrc, m.d ?? 2, 0x9fe6ff, 3.2, () => ((eng.view.monsters.get(src)?.mf ?? 0) & MF_CHANT) !== 0);
      break;
    case 'interrupt':
      if (e.chestOf(dst, _v)) v.burst(_v, 0xfff2b0, 2.6, 0.45);
      break;
    case 'break':
      // Boss mất thế: chớp vàng lớn ở ngực boss.
      if (e.chestOf(src, _v)) v.burst(_v, 0xffd36b, 3.2, 0.55);
      break;
    case 'phase': {
      const mt = eng.view.monsters.get(src)?.t;
      const cined = !!mt && phaseCine(eng, src, `mon.${mt}.say.${m.d ?? 1}`);
      if (mt && !cined) bossSay(eng, src, `mon.${mt}.say.${m.d ?? 1}`);
      // Trong cảnh camera sát boss: chớp nhỏ và mờ để vẫn thấy hình.
      if (e.chestOf(src, _v)) v.burst(_v, 0xe8f4ff, cined ? 0.9 : 2.2, cined ? 0.3 : 0.5);
      break;
    }
    case 'bfall': {
      const mt = eng.view.monsters.get(src)?.t;
      if (mt) bossSay(eng, src, `mon.${mt}.say.dead`);
      break;
    }
    case 'castend':
      if (src === eng.sid) set({ castEnd: 0 });
      eng.skillPoses.onCastEnd(pSrc?.model);
      break;
    case 'dantran': {
      // Đan Trận (E2-D): `pg` < 0 khép vòng, ngược lại cập nhật tiến độ; lần đầu của một vòng thì dựng vòng.
      const h = eng.danVfx.get(src);
      if (m.pg !== undefined && m.pg < 0) {
        h?.stop();
        eng.danVfx.delete(src);
        if (src === eng.sid) set({ danPg: -1 });
        break;
      }
      if (!h && m.r) {
        eng.danVfx.set(src, v.danTran(m.x ?? 0, m.z ?? 0, m.r, (m.d ?? 28) + 1, () => ((eng.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0));
        if (src === eng.sid) danCine(eng, m.x ?? 0, m.z ?? 0);
      }
      eng.danVfx.get(src)?.set(m.pg ?? 0);
      if (src === eng.sid) set({ danPg: m.pg ?? 0 });
      break;
    }
    case 'tamcanh': {
      // Tâm cảnh (E3-L): của chủ kiếp; lần đầu (pg 100) cắt cảnh ngắn nhìn xuống chỗ Tâm Ma Ảnh sắp hiện.
      if (src !== eng.sid) break;
      const first = (m.pg ?? -1) === 100 && get().tamCanh < 0;
      set({ tamCanh: m.pg ?? -1 });
      if (first) {
        const me = eng.me();
        if (me) danCine(eng, eng.renderPos.x, eng.renderPos.z, '#8a78c8');
        // Quầng nhận diện bản sao tối màu của Tâm Ma Ảnh (theo dõi quái `mon_tam_ma` đang sống trong tầm nhìn).
        v.tamMaAura(
          (out) => {
            let found = false;
            eng.view.monsters.forEach((mm) => {
              if (!found && mm.t === 'mon_tam_ma' && mm.hp > 0) {
                out.set(mm.x, groundAt(mm.x, mm.z), mm.z);
                found = true;
              }
            });
            return found;
          },
          () => get().tamCanh >= 0,
        );
      }
      break;
    }
    case 'xuatkhieu': {
      // Nguyên anh rời thân: bóng xanh nhạt lơ lửng trên thân trong `d` giây.
      eng.soulVfx.get(src)?.stop();
      const until = Date.now() + (m.d ?? 6) * 1000;
      eng.soulVfx.set(src, v.soulOut(posSrc, m.d ?? 6, () => ((eng.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0));
      if (src === eng.sid) set({ soulUntil: until });
      break;
    }
    case 'xuatkhieu_end':
      eng.soulVfx.get(src)?.stop();
      eng.soulVfx.delete(src);
      if (src === eng.sid) set({ soulUntil: 0 });
      break;
    case 'clone_out': {
      // Phân thân thần niệm (E4-K): bản sao của chủ ở (x, z), bước theo `clone_mv`, vung tay theo `clone_act`.
      ensureCloneVis(eng).spawn(src, m.x ?? 0, m.z ?? 0, m.d ?? 20, m.s ?? 'dps', pSrc?.yaw ?? 0);
      break;
    }
    case 'clone_mv':
      eng.cloneVis?.move(src, m.x ?? 0, m.z ?? 0);
      break;
    case 'clone_act': {
      const tm = dst ? eng.ents?.monsters.get(dst) : undefined;
      eng.cloneVis?.act(src, tm ? tm.x : null, tm ? tm.z : null, m.r ?? 0);
      break;
    }
    case 'clone_hit':
      eng.cloneVis?.hit(src);
      break;
    case 'clone_end':
      eng.cloneVis?.end(src, m.pg === 1);
      break;
    case 'nguhanh': {
      // Tia kiếp ngũ hành (E4-D): HUD hiện hành đang giáng và trận môn cần đứng; vạch báo do vùng nguy hiểm vẽ.
      if (src === eng.sid) set({ nguHanh: { e: m.n ?? 0, at: Date.now() + (m.d ?? 2) * 1000 } });
      break;
    }
    case 'phanthan': {
      // Thế thân thần niệm: bóng vàng sao nhạt đứng yên ở chỗ đã tách ra.
      eng.cloneVfx.get(src)?.stop();
      const cx = m.x ?? 0;
      const cz = m.z ?? 0;
      eng.cloneVfx.set(src, v.thanNiem(cx, cz, groundAt(cx, cz), m.d ?? 20, () => ((eng.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0));
      if (src === eng.sid) set({ cloneUntil: Date.now() + (m.d ?? 20) * 1000 });
      break;
    }
    case 'phanthan_end':
      // `pg` = 1: thế thân gánh đòn rồi tan (nổ một chớp); ngược lại hết giờ thì mờ dần.
      eng.cloneVfx.get(src)?.stop(m.pg === 1);
      eng.cloneVfx.delete(src);
      if (src === eng.sid) set({ cloneUntil: 0 });
      break;
    case 'thienphat':
      // Mạch nối thiên phạt đánh trúng thân chính (không ai đứng trận môn thứ hai).
      _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 1, m.z ?? 0);
      v.burst(_v, 0xfff0b8, 3, 0.4);
      if (src === eng.sid) eng.shake.kick(0.6);
      break;
    case 'mirror_disc': {
      // Đĩa gương (E3-M): tia xoay theo đúng công thức server (góc đầu = sd/1000, báo pg/100 giây); d = 0 là tắt.
      const ver = ++eng.mirrorDiscVer;
      if ((m.d ?? 0) <= 0) break;
      v.mirrorDisc(m.x ?? 0, m.z ?? 0, m.r ?? 24, 3, m.n ?? 3, (m.sd ?? 0) / 1000, 25, (m.pg ?? 150) / 100, m.d ?? 8, () => eng.mirrorDiscVer === ver);
      break;
    }
    case 'mirror_pillar': {
      // Cột gương của đợt đố: màu theo thứ tự cột (lam, đỏ, vàng); d = 0 tắt; pg = 1 là cột đã chạm đúng.
      const n = m.n ?? 0;
      const ver = (eng.mirrorPillarVer[n] = (eng.mirrorPillarVer[n] ?? 0) + 1);
      if ((m.d ?? 0) <= 0) break;
      v.mirrorPillar(m.x ?? 0, m.z ?? 0, [0x5aa8ff, 0xe0584a, 0xe8c15a, 0xb078e8][n] ?? 0xffffff, m.d ?? 20, m.pg === 1, () => eng.mirrorPillarVer[n] === ver);
      break;
    }
    case 'kd_stele': {
      // Bia của pha Kim dạ (DV-3E): cột sáng + vòng quanh bia; pg 1 sáng (kim dát), 0 tắt (tím thẫm); d = 0 gỡ. Mỗi lần nhận tin thay hình cũ.
      const n = m.n ?? 0;
      const ver = (eng.kdSteleVer[n] = (eng.kdSteleVer[n] ?? 0) + 1);
      if ((m.d ?? 0) <= 0) break;
      v.kdStele(m.x ?? 0, m.z ?? 0, m.r ?? 8, m.d ?? 3, m.pg === 1, () => eng.kdSteleVer[n] === ver);
      break;
    }
    case 'mirror_veil': {
      // Nguyệt phản: vòng gương bạc phủ vùng r quanh boss suốt d giây; d = 0 là tắt.
      const ver = ++eng.mirrorVeilVer;
      if ((m.d ?? 0) <= 0) break;
      const cx = m.x ?? 0;
      const cz = m.z ?? 0;
      v.castSigil((out) => (out.set(cx, groundAt(cx, cz), cz), true), m.d ?? 18, 0xc8d8ff, m.r ?? 14, () => eng.mirrorVeilVer === ver);
      _v.set(cx, groundAt(cx, cz) + 1.5, cz);
      v.burst(_v, 0xdde8ff, 4, 0.6);
      if (eng.sid && src) eng.shake.kick(0.35);
      break;
    }
    case 'mirror_echo': {
      // Lặp lại: bóng thật phản đúng chiêu; một chớp bạc ở chỗ người bị phản (vạch báo do vùng nguy hiểm vẽ).
      _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 1, m.z ?? 0);
      v.burst(_v, 0xbfd8ff, 1.6, 0.35);
      break;
    }
    case 'mirror_shatter': {
      // Bóng giả vỡ: mảnh gương bạc bắn ra, vòng nổ báo trước do vùng nguy hiểm vẽ.
      _v.set(m.x ?? 0, (m.y ?? 0) + 1.4, m.z ?? 0);
      v.burst(_v, 0xe6f2ff, 3.4, 0.5);
      break;
    }
    case 'mirror_split': {
      // Bốn thân hiện ra: chớp bạc lớn tại boss.
      _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 1.6, m.z ?? 0);
      v.burst(_v, 0xdde8ff, 5, 0.7);
      break;
    }
    case 'tamma_cast': {
      // Tâm Ma Ảnh tụ lực dùng chiêu của người độ kiếp: một nhịp tụ khí tím sẫm ở bóng (vạch báo do vùng nguy hiểm vẽ).
      const sm = eng.view.monsters.get(src);
      if (sm) {
        _v.set(sm.x, groundAt(sm.x, sm.z) + 1.2, sm.z);
        v.burst(_v, 0x8a6fd0, 2.2, 0.4);
      }
      break;
    }
    case 'dantran_ok': {
      // Đan thành: một cột đan hỏa lam ngả vàng bốc lên từ giữa vòng, mảnh và trầm (không che nhân vật).
      _v.set(m.x ?? 0, groundAt(m.x ?? 0, m.z ?? 0) + 0.6, m.z ?? 0);
      v.burst(_v, 0xffcf8a, 3.2, 0.5);
      v.pillar(posSrc, 0xffd79a, 1.4, 0.9, 10, 0.1);
      if (src === eng.sid) eng.shake.kick(0.5);
      break;
    }
    case 'tribstart':
      // Vòng Đan Trận còn sót của kiếp trước (chết giữa kiếp không có tin khép vòng).
      eng.danVfx.get(src)?.stop();
      eng.danVfx.delete(src);
      eng.soulVfx.get(src)?.stop();
      eng.soulVfx.delete(src);
      eng.cloneVfx.get(src)?.stop();
      eng.cloneVfx.delete(src);
      if (src === eng.sid) set({ danPg: -1, tamCanh: -1, soulUntil: 0, nguHanh: null, cloneUntil: 0 });
      v.tribulationCloud((out) => e.chestOf(src, out), m.d ?? 40, () => ((eng.view.players.get(src)?.fl ?? 0) & PF_TRIBULATION) !== 0, m.sd);
      if (src === eng.sid) {
        eng.tribUntil = Date.now() + (m.d ?? 40) * 1000;
        eng.tribId = m.tb ?? 'truc_co';
        set({ tribEnd: eng.tribUntil, tribId: eng.tribId });
        chapter(eng, 'trib');
      }
      break;
  }
}

/** Vùng báo do boss thả (màu ma khí) hay quái thường (son đỏ). */
export function isBossSrc(eng: Game, src: string | undefined): boolean {
  const t = src ? eng.view.monsters.get(src)?.t : undefined;
  return !!t && !!MONSTER.get(t)?.boss;
}

/**
 * Độ chớp toàn cảnh khi một tia sét đánh xuống: sấm độ kiếp của mình chớp rõ, tia gần mình chớp nhẹ
 * theo khoảng cách, xa hơn 45 m thì không. Chỉ là lớp hình.
 */
export function lightningFlash(eng: Game, m: HazardMsg): number {
  if (m.kind !== 'lightning') return 0;
  if (m.src === eng.sid) return 0.32;
  const d = Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z);
  return d < 45 ? 0.18 * (1 - d / 45) : 0;
}

/** Rung khi vùng nổ: chỉ sấm độ kiếp của mình hoặc boss đập đất gần mình. */
export function shakeForHazard(eng: Game, m: HazardMsg): void {
  if (eng.disposed || !m.src) return;
  const d = Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z);
  if (m.src === eng.sid) {
    if (d < m.r + 12) eng.shake.kick(SHAKE.thunder * (d < m.r + 1 ? 1 : 0.6));
  } else if (eng.ents?.monsters.get(m.src)?.model.def.boss && d < Math.max(m.r, m.w ?? 0) + 8) {
    eng.shake.kick(SHAKE.slam);
  }
}

export function playFxSound(eng: Game, t: string, src: string, dst: string, x?: number, z?: number): void {
  // Sự kiện của chính mình có nhạc ngắn (sting) riêng: lên tầng và đột phá thay hẳn jingle SFX;
  // tử vong giữ tiếng ngã (SFX) và thêm sting. Chưa có file/tắt tiếng thì dùng SFX như cũ.
  const sting = src === eng.sid ? STINGS[t] : undefined;
  if (sting && playSting(sting) && t !== 'death' && t !== 'ascend') return;
  const map: Record<string, Sfx> = {
    sword: 'sword',
    slash: 'slash',
    rain: 'rain',
    thunder: 'thunder',
    heal: 'heal',
    potion: 'potion',
    art: 'shield',
    shield: 'shield',
    levelup: 'levelup',
    ascend: 'ascend',
    quest: 'quest',
    craft: 'craft',
    enhance: 'enhance',
    gather: 'gather',
    death: 'death',
    respawn: 'respawn',
    cast: 'cast',
    kanh: 'slash',
    vankiem: 'rain',
    transon: 'thunder',
    kimcuong: 'shield',
    xuanphong: 'heal',
    hoithien: 'heal',
    mcast: 'mcast',
    tribstart: 'trib',
    // Phá chú (ngắt niệm chú) và boss mất thế: tiếng xác nhận giòn, nổi nhất (D2).
    interrupt: 'spellbreak',
    break: 'spellbreak',
  };
  const name = map[t];
  if (!name) return;
  // Phi kiếm của người chơi đã có tiếng vung đặt lịch từ sự kiện `windup` (K-7): không phát thêm tiếng vút lúc FX tới.
  if (t === 'sword' && src && performance.now() - (eng.whooshAt.get(src) ?? -1e9) < 700) return;
  let vol = 1;
  let at: { x: number; z: number } | undefined;
  if (x !== undefined && z !== undefined) at = { x, z };
  else if (eng.ents.chestOf(src || dst, _v)) at = _v;
  if (at) vol = volumeAt(eng, at.x, at.z);
  // Tiếng của người khác nhỏ hơn tiếng của mình.
  if (src && src !== eng.sid && dst !== eng.sid) vol *= 0.6;
  sfx(name, vol, at);
}

/** Ghi nhận người chơi (mình/đồng đội) bị đánh và kẻ đánh, cho nhấp nháy trên minimap. */
export function markHurt(eng: Game, m: DmgMsg): void {
  if (m.heal || m.n <= 0 || !eng.view.players.has(m.dst)) return;
  const now = performance.now();
  if (eng.hurtAt.size > 64) for (const [k, at] of eng.hurtAt) if (now - at > 3000) eng.hurtAt.delete(k);
  eng.hurtAt.set(m.dst, now);
  if (m.src && eng.view.monsters.has(m.src)) eng.hurtAt.set(m.src, now);
}

export function onDmg(eng: Game, m: DmgMsg): void {
  if (eng.disposed) return;
  markHurt(eng, m);
  // Đòn của một người chơi đang vung (đã vào thế, chưa tới `hitAt`): chờ khung `hit` của hoạt ảnh để tiếng, khựng, rung
  // rơi đúng lúc ra đòn (K-7). Quá hạn mà không có `hit` thì `frame` xả.
  if (m.src && eng.swinging.active(m.src, performance.now()) && !m.heal) {
    eng.hitQ.push(m.src, m, HIT_WAIT);
    return;
  }
  const lh = m.src ? eng.lastHit.get(m.src) : undefined;
  applyDmg(eng, m, lh && performance.now() - lh.at < HIT_CTX_TTL * 1000 ? lh : undefined);
}

/** Hướng nguồn → đích trên mặt đất (null nếu thiếu một đầu). */
export function dirOf(eng: Game, src: string | undefined, dst: string): { x: number; z: number } | null {
  const a = src ? (eng.ents.players.get(src) ?? eng.ents.monsters.get(src)) : undefined;
  const b = eng.ents.players.get(dst) ?? eng.ents.monsters.get(dst);
  return a && b ? { x: b.x - a.x, z: b.z - a.z } : null;
}

export function applyDmg(eng: Game, m: DmgMsg, ev: { skill: string; index: number; combo: number; kb: boolean; at: number } | undefined): void {
  if (eng.disposed) return;
  if (!eng.ents || !eng.ents.topOf(m.dst, _v)) return;
  const mine = m.dst === eng.sid;
  const byMe = m.src === eng.sid;
  // Bị quái đánh khi chưa chọn mục tiêu: tự chọn kẻ tấn công để phản đòn nhanh.
  if (mine && !m.heal && !eng.targetId && m.src && eng.view.monsters.has(m.src)) eng.setTarget(m.src, 'mon');
  const foe = !m.heal && (mine || byMe) ? eng.ents.monsters.get((mine ? m.src : m.dst) ?? '') : undefined;
  if (foe) eng.music.engage(!!foe.model.def.boss);
  // FX quái (V5): quái bị đánh → tia/mảnh theo hệ; quái đánh trúng người → vệt chém đỏ.
  if (!m.heal && m.n > 0) {
    const dm = eng.ents.monsters.get(m.dst);
    if (dm) eng.monFx?.hit(dm);
    else {
      const sm = m.src ? eng.ents.monsters.get(m.src) : undefined;
      const dp = sm ? eng.ents.players.get(m.dst) : undefined;
      if (sm && dp) eng.monFx?.strike(sm, dp);
    }
  }
  if (!mine && !byMe) {
    // Sát thương của người khác: chỉ hiện khi ở gần.
    if (_v.distanceTo(eng.renderPos) > 45) return;
  }
  // Ngữ cảnh đòn (K-7): đòn thứ ba của chuỗi, sức mạnh/tối thượng của chiêu lấy từ khung `hit` của hoạt ảnh.
  const skill = ev ? SKILL_INFO.get(ev.skill) : undefined;
  const hc: HitCtx = { crit: !!m.crit, heavy: !!m.hv, combo3: !!ev && (ev.kb || ev.combo === 2), power: skill?.power ?? 0, ult: !!skill?.ult, victimIsMe: mine, byMe };
  // Hit feel chỉ là lớp hình. Rung camera theo bảng (lấy max, có hướng nguồn → đích); công tắc "Rung màn hình" do `CameraShake` tôn trọng.
  const stops = hitStopOf(hc);
  if (!m.heal && m.n > 0) {
    const lv = shakeOf(hc);
    if (lv > 0) eng.shake.kick(lv, dirOf(eng, m.src, m.dst) ?? undefined);
  }
  // Cảnh boss/chuyển pha ngắn (≤ 2,6 s) và boss vốn đang đánh mình: chỉ đòn nặng mới hủy; cảnh mở đầu thì mọi đòn đều hủy.
  if (mine && !m.heal && m.n > 0) skipCine(eng, eng.cineKind === 'sect' || !!m.hv);
  if (mine && !m.heal && m.n > 0) eng.post?.hit(m.n / Math.max(1, eng.me()?.mhp ?? 1), !!m.crit || !!m.hv);
  if (m.hv && !m.heal && m.n > 0) heavyInk(eng, m.dst, m.src);
  if (!m.heal && m.n > 0 && !(QUIET && m.dst === eng.sid)) eng.ents.hitReact(m.dst, m.src, !!m.crit, m.src && eng.view.players.has(m.src) ? 0.2 : 0, !!m.hv, stops);
  // Boss đánh nặng (≥ KNOCKDOWN_FRAC máu tối đa) thì người bị đánh ngã rồi đứng dậy; chỉ hình, người chơi vẫn đi lại được và kéo dậy sớm khi di chuyển.
  if (!m.heal && m.hv && m.n > 0 && m.src) {
    const victim = eng.ents.players.get(m.dst);
    if (victim && eng.ents.monsters.get(m.src)?.model.def.boss && m.n >= victim.s.mhp * KNOCKDOWN_FRAC) victim.model.knockdown?.();
  }
  let cls = 'other';
  if (m.heal) cls = 'heal';
  else if (mine) cls = 'hurt';
  else if (byMe) cls = m.crit ? 'crit' : 'hit';
  if (!m.heal) {
    // Bị hộ thể hấp thụ hết: tiếng kim khí; chí mạng/đòn nặng: tiếng va mạnh hơn đòn thường.
    const name: Sfx = m.n === 0 ? 'block' : mine ? 'hurt' : m.crit || m.hv ? 'crit' : 'hit';
    const vol = mine || byMe ? 1 : volumeAt(eng, _v.x, _v.z) * 0.5;
    // Phát ngay trong khung này: khi có `ev` thì đây chính là khung `hit` của hoạt ảnh. Pitch 0,92–1,08 (đòn 3 cao hơn một bậc).
    const rate = hitPitch(hc.combo3);
    sfx(name, vol, _v, true, { rate });
    const layers: string[] = [];
    if (m.n > 0 && !mine) {
      // Lớp chồng theo công pháp người ra đòn và chất liệu mục tiêu (tổng ≤ +3 dB).
      const mon = eng.ents.monsters.get(m.dst);
      for (const l of layersOf({ method: m.src ? eng.methodOfPlayer(m.src) : undefined, material: materialOf(mon?.model.def), crit: hc.crit || hc.heavy, strong: hc.combo3 || hc.power >= 2 || hc.ult })) {
        sfx(l.sfx, vol * l.gain, _v, false, { rate: rate * l.rate });
        layers.push(l.sfx);
      }
      // Chiêu tối thượng của mình trúng: hạ nhạc 20% trong 120 ms.
      if (hc.ult && byMe) duck(0.2, 0.12, 0.4);
    }
    if (import.meta.env.DEV && ev) {
      const soundAt = performance.now();
      eng.hitSoundLog.push({ skill: ev.skill, index: ev.index, eventAt: ev.at, soundAt, lagMs: soundAt - ev.at, synced: eng.flushing, sfx: name, rate, layers });
      if (eng.hitSoundLog.length > 200) eng.hitSoundLog.shift();
    }
  }
  const text = m.heal ? `+${m.n}` : m.n === 0 ? t('ui.absorbed') : mine ? `-${m.n}` : `${m.n}${m.crit ? '!' : ''}`;
  // Đứng đúng trận môn khắc chế (Thiên Nhân Kiếp, cờ `ke` do server tính): chỉ thêm chữ báo.
  eng.dmg.spawn(m.ke === 1 && !m.heal ? `${text} ${t('ui.dmg.ke')}` : text, _v, cls);
}

/** Vệt mực mờ dưới chân nạn nhân đòn nặng (M4-14), tối đa một vệt mỗi 0,4 giây mỗi nạn nhân. */
export function heavyInk(eng: Game, dst: string, src: string | undefined): void {
  const v = eng.vfx;
  const e = eng.ents;
  if (!v || !e) return;
  const now = performance.now();
  if (now - (eng.inkHitAt.get(dst) ?? -1e9) < 400) return;
  const d = e.monsters.get(dst) ?? e.players.get(dst);
  if (!d) return;
  eng.inkHitAt.set(dst, now);
  if (eng.inkHitAt.size > 64) for (const [k, at] of eng.inkHitAt) if (now - at > 400) eng.inkHitAt.delete(k);
  const s = src ? (e.players.get(src) ?? e.monsters.get(src)) : undefined;
  // Không rõ người đánh: hướng vệt theo camera nhìn tới.
  const fx = s ? s.x : eng.camera.position.x;
  const fz = s ? s.z : eng.camera.position.z;
  v.inkStreak(d.x, d.z, fx, fz, e.monsters.has(dst) ? 0.75 : 0.6);
}

/** Quái đang thấy vừa gục (M4-14): mực văng ra rồi loang thành vết trên đất, tan dần sau vài giây. */
/** Cờ quái mở rộng (E1-E) bật/tắt: vòng phản đòn/yếu điểm bám chân quái trong suốt thời gian cờ; bụi khi chui đất/trồi. */
export function monFlagFx(eng: Game, m: MonVis, e: MonFlagEdge): void {
  const v = eng.vfx;
  if (!v || Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z) > 70) return;
  const id = m.id;
  const pos = (out: THREE.Vector3) => {
    const o = eng.ents?.monsters.get(id);
    if (!o) return false;
    out.set(o.x, o.y, o.z);
    return true;
  };
  const left = Math.max(0.3, ((eng.view.monsters.get(id)?.ce ?? 0) - (Date.now() + eng.timeOffset)) / 1000);
  if (e.on & MF_REFLECT) v.castSigil(pos, left, MON_AURA_REFLECT.color, MON_AURA_REFLECT.radius, () => ((eng.view.monsters.get(id)?.mf ?? 0) & MF_REFLECT) !== 0);
  if (e.on & MF_WEAK) v.castSigil(pos, left, MON_AURA_WEAK.color, MON_AURA_WEAK.radius, () => ((eng.view.monsters.get(id)?.mf ?? 0) & MF_WEAK) !== 0);
  // Thể thật của Kính Nguyệt Chân Quân (E3-M): vết ngọc lam suốt trận; thần thức soi ra thì vòng vàng tới `ce`.
  if (e.on & MF_REAL) v.castSigil(pos, 3600, MON_AURA_REAL.color, MON_AURA_REAL.radius, () => ((eng.view.monsters.get(id)?.mf ?? 0) & MF_REAL) !== 0 && (eng.view.monsters.get(id)?.hp ?? 0) > 0);
  if (e.on & MF_SENSED) v.castSigil(pos, left, MON_AURA_SENSED.color, MON_AURA_SENSED.radius, () => ((eng.view.monsters.get(id)?.mf ?? 0) & MF_SENSED) !== 0);
  if (e.on & MF_CHANT) eng.monFx?.cast(m);
  if ((e.on | e.off) & MF_BURROW) {
    _v2.set(m.x, m.y + 0.4, m.z);
    v.burst(_v2, MON_BURROW_DIRT, Math.min(3, 1 + m.model.height * 0.5), 0.4);
  }
}

export function monsterInk(eng: Game, m: MonVis): void {
  const v = eng.vfx;
  if (!v || Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z) > 70) return;
  const h = m.model.height;
  eng.monFx?.death(m);
  const size = Math.min(2.4, Math.max(0.8, h / 1.6));
  _v2.set(m.x, m.y + h * 0.5, m.z);
  v.burst(_v2, 0xdce6df, 0.9 * size, 0.3);
  v.inkBurst(_v2, size);
  v.inkSplat(m.x, m.z, Math.min(4.5, Math.max(1.1, h * 0.8)));
}

/**
 * Vẽ một món đồ rơi (M4-6) nảy ra từ quái/điểm hái `src`. `item` không có = vàng. Chỉ là lớp hình:
 * món đồ đã vào túi ở server. Trả false nếu không có vị trí để vẽ (nguồn đã mất khỏi trạng thái room).
 */
export function showLoot(eng: Game, src: string, item: string | undefined, q?: number): boolean {
  const v = eng.vfx;
  const e = eng.ents;
  if (!v || !e) return false;
  const from = new THREE.Vector3();
  if (!e.chestOf(src, from)) {
    const n = eng.view.nodes.get(src) ?? eng.view.monsters.get(src);
    if (!n) return false;
    from.set(n.x, n.y + 0.8, n.z);
  }
  if (from.distanceTo(eng.renderPos) > 80) return false;
  if (!item) {
    v.goldDrop(from);
    return true;
  }
  const def = ITEM.get(item);
  if (!def) return false;
  const now = performance.now();
  const prev = eng.lootSlots.get(src);
  const slot = prev && now - prev.at < 600 ? prev.n + 1 : 0;
  eng.lootSlots.set(src, { at: now, n: slot });
  if (eng.lootSlots.size > 32) for (const [k, s] of eng.lootSlots) if (now - s.at > 600) eng.lootSlots.delete(k);
  // Trang bị đã roll: bậc theo phẩm server gửi (Phàm..Thiên); còn lại theo `rarity` của mẫu.
  const tier = q !== undefined ? gearLootTier(q) : lootTier(def.rarity);
  const color = q !== undefined ? lootColor(tier, q) : undefined;
  const fallback = def.iconFallback ?? '❔';
  const land = v.lootDrop(
    from,
    tier,
    slot,
    () => lootChime(tier, 0.9),
    (at) => {
      _v.copy(at).project(eng.camera);
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Sau lưng camera hoặc ngoài màn hình: bắt đầu từ mép gần nhất.
      const sx = _v.z > 1 ? w / 2 : Math.min(w - 20, Math.max(20, (_v.x * 0.5 + 0.5) * w));
      const sy = _v.z > 1 ? h - 40 : Math.min(h - 20, Math.max(20, (-_v.y * 0.5 + 0.5) * h));
      eng.lootFly.spawn(def.icon, fallback, sx, sy, tier);
    },
    color,
  );
  if (tier >= 2) {
    pruneRareLoot(eng);
    const hold = LOOT_ARC + LOOT_BOUNCE + LOOT_TIERS[tier].hold + Math.min(slot, 5) * 0.12;
    eng.rareLoot.push({ key: src + ':' + item + ':' + now, item, pos: land, until: now + hold * 1000 });
  }
  return true;
}

/** Âm lượng giảm theo khoảng cách tới người chơi. */
export function volumeAt(eng: Game, x: number, z: number): number {
  const d = Math.hypot(x - eng.renderPos.x, z - eng.renderPos.z);
  return d < 8 ? 1 : Math.max(0, 1 - (d - 8) / 70);
}

/** Dựng lại bước chân và nguồn âm theo vị trí cho room hiện tại (bí cảnh chỉ có bước chân trên nền đá). */
export function resetSound(eng: Game, world: boolean): void {
  eng.scape?.dispose();
  const log = (msg: string) => {
    if (import.meta.env.DEV) console.info(`[audio] ${msg}`);
  };
  eng.steps = new FootstepDriver(world ? 'van_lam' : 'kiem_trung', (name, vol, at) => sfx(name, vol, at, false), log);
  eng.scape = world ? new Soundscape(buildSources(SECT_LANTERNS), audioSpatialApi(), log) : null;
  if (import.meta.env.DEV) (window as unknown as { __sound?: unknown }).__sound = { hits: () => eng.hitSoundLog, steps: () => eng.steps?.stats, scape: () => ({ active: eng.scape?.state(), ...eng.scape?.stats }) };
}

export function onSys(eng: Game, m: SysMsg): void {
  const text = t(m.k, m.p);
  const type = m.t ?? 'info';
  pushLog(text, type);
  if (type === 'good' || type === 'bad' || type === 'info') pushToast(text, type);
  // Đồ rơi từ quái/điểm hái (M4-6): vật có hình thì chuông ngân lúc chạm đất thay cho tiếng xu.
  const shown = type === 'loot' && !!m.src && showLoot(eng, m.src, m.i, m.q);
  if (type === 'loot' && (!shown || !m.i)) sfx('loot', 0.7);
  else if (type === 'bad') sfx('ui_error', 0.8);
  if (m.k === 'sys.fly_no_mp') {
    eng.wantFly = false;
    set({ wantFly: false });
  }
}
