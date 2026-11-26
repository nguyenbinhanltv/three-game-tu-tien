// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import { type Room } from 'colyseus.js';
import {
  applyInvMsg,
  type BossTimerMsg,
  type CdMsg,
  type CharView,
  type ChatMsg,
  type DuelMsg,
  type EscortMsg,
  type InviteMsg,
  type MarkMsg,
  type PartyMsg,
  type RecapMsg,
  TELE_PAD,
  type TeleMsg,
  type DmgMsg,
  type FxMsg,
  type HazardMsg,
  type BoltEndMsg,
  type BoltMsg,
  type InitMsg,
  type InvMsg,
  type QuestView,
  type WardrobeMsg,
  type KieuBoardMsg,
  ROOM_DUNGEON,
  S,
  type SysMsg,
  type TransferMsg,
  type MethodMsg,
  type SpiritScanMsg,
  type SpiritStateMsg,
  type SoulStateMsg,
  type CloneStateMsg,
} from '@dtl/shared';
import { groundAt } from '../../base/levelCtx';
import { OTHERS_FX_DIST, OTHERS_FX_LIVE_MAX } from '../fx/fxBudget';
import { FX_TIMELINE, MONSTER, pathOf, t } from '@dtl/content';
import { minimapHooks } from '../../ui/minimap/model';
import { visibleView } from '../net/aoiView';
import { pushLog, set, useUI } from '../../ui/store';
import { sfx } from '../audio/audio';
import { BOLT_VIEW_DIST, boltAge } from '../../render/vfx/projectile';
import { EntityManager, type WorldView } from '../entities/entities';
import { MapVis } from '../world/mapVis';
import { hazardDanger } from '../../render/vfx/phases';
import { telegraph } from '../fx/telegraph';
import { HAZARD_COLORS } from '../fx/vfx';
import { isWorldRoom, levelOfInit } from './common';
import { isBossSrc, lightningFlash, monFlagFx, monsterInk, onDmg, onSys, resetSound, shakeForHazard, volumeAt } from './fxMsgs';
import type { Game } from '../engine';

/** Chạy sau `sec` giây: đồng hồ thật, trừ phòng thử VFX (`?vfxlab=1`) dùng đồng hồ trình diễn để tua/tạm dừng được đúng mili giây. */
function later(eng: Game, sec: number, fn: () => void): void {
  if (eng.monFx?.lab && eng.vfx) eng.vfx.add(sec, () => {}, fn);
  else window.setTimeout(fn, sec * 1000);
}

/** Vạch báo của server (S.HAZARD). Tách ra để phòng thử VFX phát lại đúng đường này cho chiêu của quái (V-P9). */
export function onHazard(eng: Game, m: HazardMsg): void {
  // Chui đất: vạch `burrow` đầu tiên là điểm quái trồi lên (BurrowFx vẽ ụ đất chạy tới đó).
  if (m.mv === 'burrow' && m.src) eng.burrowFx.noteHazard(m.src, m.x, m.z, m.delay, Date.now());
  if (import.meta.env.DEV)
    (eng.hazardLog ??= []).push({
      k: m.kind,
      mv: m.mv,
      sh: m.sh ?? 'circle',
      src: m.src ?? '',
      boss: isBossSrc(eng, m.src),
      t: eng.view.monsters.get(m.src ?? '')?.t ?? '',
      x: m.x,
      z: m.z,
      r: m.r,
      yaw: m.yaw,
      w: m.w,
      big: m.big,
      px: eng.cur.x,
      pz: eng.cur.z,
      delay: m.delay,
      at: Date.now(),
    });
  if (import.meta.env.DEV && eng.hazardLog && eng.hazardLog.length > 200) eng.hazardLog.shift();
  // Trảm Ly Kiếp (TN-6): vạch kiếm vô hình (chữ nhật không nguồn) hết giờ báo thì nhát chém hiện hình. Chỉ là hình.
  if (m.sh === 'rect' && !m.src && useUI.getState().suy?.id === 'hk_tram_ly') {
    const sid = eng.sid;
    later(eng, m.delay, () => !eng.disposed && eng.suyFx?.cut(sid, m.x, m.z, m.yaw ?? 0));
  }
  // Vùng chữ nhật/quạt ở xa không ai thấy: bỏ qua (chưa có AOI nên cả kênh nhận).
  if (m.sh && eng.vfx) {
    // Chiêu quái có timeline vạch báo riêng (V-P9): vẫn dùng pháp trận quạt/chữ nhật (hình đúng hitbox, tiến độ quét) nhưng vẽ đè lên thân boss.
    // `own` ở nhánh này chỉ đổi cách vẽ (đè lên thân boss); pháp trận quạt/chữ nhật luôn được vẽ nên không mất vạch báo khi `warn` bị bỏ qua.
    const own = !!eng.monFx?.ownWarn(m, m.src ? eng.ents?.monsters.get(m.src) : undefined);
    const wsrc = m.src ? eng.ents?.monsters.get(m.src) : undefined;
    // Vạch riêng (timeline) chạy TRƯỚC: boss/tinh anh thêm nhấp nháy dọc vạch; pháp trận quạt/dải cũ luôn được vẽ (đường lùi, không mất vạch báo).
    eng.monFx?.warn(m, wsrc);
    if (Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z) < 90)
      telegraph(eng.vfx, m, isBossSrc(eng, m.src), hazardDangerOf(eng, m), own);
  } else if (m.mv === 'trail') eng.vfx?.trailPool(m.x, m.z, m.r, m.delay, m.dur ?? 8);
  else if (m.mv === 'pool') eng.vfx?.venomPool(m.x, m.z, m.r, m.delay, m.dur ?? 6, m.kind);
  else {
    const hsrc = m.src ? eng.ents?.monsters.get(m.src) : undefined;
    // Vòng cũ chỉ bị bỏ khi vạch riêng của chiêu đã thật sự phát (xa/đông FX thì `warn` bỏ qua → giữ vòng cũ, không mất vạch báo).
    const warned = !!eng.monFx?.warn(m, hsrc);
    eng.vfx?.hazard(
      m.x,
      m.z,
      m.r,
      m.delay,
      m.kind,
      m.sd,
      lightningFlash(eng, m),
      isBossSrc(eng, m.src),
      m.hot,
      hsrc ? () => !eng.disposed && !!eng.monFx?.boom(m, eng.ents?.monsters.get(m.src ?? '') ?? hsrc) : undefined,
      hazardDangerOf(eng, m),
      warned && !!eng.monFx?.ownWarn(m, hsrc),
    );
  }
  // Boss thả vùng: động tác đòn lớn chạm đúng lúc vùng nổ (vùng chữ nhật/quạt từ boss = chém/quét, vùng tròn = nện).
  if (m.src) eng.ents?.monsters.get(m.src)?.model.bossMove?.(m.sh ? 'sweep' : 'slam', m.delay);
  // Vòng kéo (Nuốt) và vũng độc không nổ: không âm nện/rung màn hình.
  if (m.mv === 'pull' || m.mv === 'pool' || m.mv === 'trail') return;
  const vol = volumeAt(eng, m.x, m.z);
  const bsrc = m.src ? eng.ents?.monsters.get(m.src) : undefined;
  // Vùng tròn: `Vfx.hazard` tự gọi `boom` lúc nổ và chỉ bỏ hình cũ khi nó thật sự phát; vùng chữ nhật/nón (telegraph) gọi ở đây.
  if (bsrc && m.sh) later(eng, m.delay, () => (eng.disposed ? 0 : eng.monFx?.boom(m, eng.ents?.monsters.get(m.src ?? '') ?? bsrc)));
  later(eng, m.delay, () => {
    sfx(m.kind === 'lightning' ? 'thunder' : 'impact', vol, m);
    shakeForHazard(eng, m);
    // Thiên lôi của độ kiếp (vòng tròn, không phải quái thả): cụm nổ vẽ tay tại điểm rơi (V-P10). Chỉ là hình.
    if (m.kind === 'lightning' && !m.sh && !bsrc && !eng.disposed) kiepStrike(eng, m);
  });
}

/** Mốc (ms) của các cụm nổ sét gần đây: lôi võng thả 7 vòng cùng lúc, chỉ vẽ cụm vẽ tay cho tối đa `KIEP_STRIKE_MAX` vòng mỗi nửa giây. */
const kiepStrikes: number[] = [];
const KIEP_STRIKE_MAX = 3;

/** Phát timeline `fx_kiep_strike` tại chỗ sét rơi (tia sét + chớp vẫn do `Vfx.hazard` vẽ). Xa quá hoặc đang quá nhiều lưới thì bỏ. */
function kiepStrike(eng: Game, m: HazardMsg): void {
  const tl = FX_TIMELINE.get('fx_kiep_strike');
  const runner = eng.skillFx?.runner;
  if (!tl || !runner || !eng.vfx) return;
  const dist = Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z);
  // Kiếp của mình luôn vẽ (đòn nhắm mình); của người khác chỉ khi gần và pool chưa đông.
  if (m.src !== eng.sid && (dist > OTHERS_FX_DIST || eng.vfx.pool.live >= OTHERS_FX_LIVE_MAX)) return;
  const now = performance.now();
  while (kiepStrikes.length && now - kiepStrikes[0]! > 500) kiepStrikes.shift();
  if (kiepStrikes.length >= KIEP_STRIKE_MAX) return;
  kiepStrikes.push(now);
  // Neo `self` = actor.y + 1,15 và offset nhân `mul`; timeline đặt chân ở offset −1,15, nên chân thực tế = actor.y + 1,15 − 1,15·mul.
  // Bù 1,15·(mul − 1) để chân cụm nổ luôn chạm mặt đất ở mọi cỡ.
  const mul = m.big ? 1.8 : 1;
  runner.startAt(tl, {
    actor: { x: m.x, y: groundAt(m.x, m.z) + 1.15 * (mul - 1), z: m.z, yaw: 0, model: {} },
    palette: m.hot ? 'kiep_hoa' : 'loi',
    tgt: null,
    mul,
    mine: m.src === eng.sid,
  });
}

function hazardDangerOf(eng: Game, m: HazardMsg): 0 | 1 | 2 {
  return hazardDanger({ boss: isBossSrc(eng, m.src), mv: m.mv, big: m.big, r: m.r });
}

export function applyInit(eng: Game, init: InitMsg): void {
  eng.sid = init.sid;
  eng.timeOffset = init.serverTime - Date.now();
  set({
    phase: eng.started ? 'game' : 'loading',
    room: init.room,
    dev: init.dev,
    debugAllowed: eng.debugOk,
    char: init.char,
    inv: init.inv,
    equip: init.equip,
    quests: init.quests,
    marks: [],
    target: null,
    boss: null,
    npc: null,
    tribEnd: 0,
    castEnd: 0,
  });
  eng.targetId = '';
  eng.autoAttack = false;
  eng.skillQueue.cancel();
  set({ queuedSkill: -1 });
  eng.pending.length = 0;
  eng.inputSentAt.length = 0;
  eng.seq = 0;
  eng.lastAck = -1;
  eng.wantFly = false;
}

/** Chuyển sang room khác (bí cảnh ↔ thế giới) mà không dựng lại renderer. */
export function rebind(eng: Game, room: Room, init: InitMsg): void {
  eng.room = room;
  eng.view = visibleView(room.state as unknown as WorldView);
  applyInit(eng, init);
  bindRoom(eng, room);
  void eng.enterLevel(levelOfInit(init));
  eng.ents?.dispose();
  eng.ents = new EntityManager(eng.scene, eng.sid, levelOfInit(init));
  eng.ents.setWarm(eng.warmObject);
  eng.mapVis?.dispose();
  eng.mapVis = new MapVis(eng.scene, isWorldRoom(init.room) ? levelOfInit(init) : null);
  resetSound(eng, isWorldRoom(init.room));
  if (eng.beacons) eng.beacons.mesh.visible = isWorldRoom(init.room);
  eng.ents.camera = eng.camera;
  eng.ents.onSkillEvent = (sid, e) => eng.emitSkillEvent(sid, e);
  // Vào bí cảnh: thẻ chương hiện khi nhân vật đã có trong room mới (khung đầu tiên sau khi bắt kịp server).
  eng.pendingChapter = init.room === ROOM_DUNGEON ? 'dungeon' : null;
  eng.camFrame.cancel();
  eng.ents.onMonsterDeath = (m) => monsterInk(eng, m);
  eng.ents.onMonFlags = (m, e) => monFlagFx(eng, m, e);
  eng.ents.burrow = eng.burrowFx;
  eng.snapToServer = true;
  eng.dmg?.clear();
  eng.offscreen?.clear();
  eng.lootFly?.clear();
  eng.rareLoot.length = 0;
  eng.lootSlots.clear();
  eng.inkHitAt.clear();
}

export function bindRoom(eng: Game, room: Room): void {
  eng.leaving = false;
  room.onMessage(S.CHAR, (c: CharView) => {
    set({ char: c });
    eng.questMarkersDirty = true;
  });
  room.onMessage(S.INV, (m: InvMsg) => set({ inv: applyInvMsg(useUI.getState().inv, m), equip: m.equip }));
  room.onMessage(S.WARDROBE, (m: WardrobeMsg) => set({ wardrobe: m }));
  room.onMessage(S.KIEU_BOARD, (m: KieuBoardMsg) => set({ kieuBoard: m }));
  room.onMessage(S.QUESTS, (q: QuestView) => {
    set({ quests: q });
    eng.questMarkersDirty = true;
  });
  room.onMessage(S.BOSS_TIMERS, (m: BossTimerMsg) => {
    const off = Date.now() - m.now;
    set({ bossTimers: { ...m, off } });
    // Móc của minimap (M-3): giờ hồi sinh boss theo id quái (đồng hồ máy), xóa khi boss sống.
    for (const tm of m.list) {
      if (!MONSTER.get(tm.t)?.boss) continue;
      if (tm.at > 0) minimapHooks.bossRespawnAt.set(tm.t, tm.at + off);
      else minimapHooks.bossRespawnAt.delete(tm.t);
    }
  });
  room.onMessage(S.CD, (m: CdMsg) => {
    const off = Date.now() - m.now;
    const cds: Record<string, number> = {};
    for (const k in m.cds) cds[k] = m.cds[k]! + off;
    const empowered: Record<string, number> = {};
    for (const k in m.em) empowered[k] = m.em[k]! + off;
    set({ cds, gcdAt: m.gcd + off, empowered });
  });
  room.onMessage(S.METHOD, (m: MethodMsg) => {
    // Dấu ! của nhiệm vụ nhánh Hướng tu phụ thuộc hướng đang tu: dựng lại khi hướng đổi (kể cả lúc tin này tới sau S.QUESTS).
    if (pathOf(m.method)?.id !== pathOf(useUI.getState().method?.method)?.id) eng.questMarkersDirty = true;
    set({ method: m, methodOff: Date.now() - m.now });
  });
  room.onMessage(S.SYS, (m: SysMsg) => onSys(eng, m));
  room.onMessage(S.FX, (m: FxMsg) => eng.onFx(m));
  room.onMessage(S.DMG, (m: DmgMsg) => onDmg(eng, m));
  room.onMessage(S.HAZARD, (m: HazardMsg) => {
    if (eng.monFx?.lab) return;
    onHazard(eng, m);
  });
  room.onMessage(S.BOLT, (m: BoltMsg) => {
    if (eng.monFx?.lab) return;
    // Đạn của quái (D1): chỉ vẽ, server phán định trúng. Bù độ trễ bằng giờ server lúc bắn.
    if (!eng.vfx || Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z) > BOLT_VIEW_DIST) return;
    eng.vfx.bolts.spawn(m, boltAge(m, Date.now() + eng.timeOffset), HAZARD_COLORS[m.kind] ?? HAZARD_COLORS.fire!);
    eng.monFx?.bolt(m.kind, m.x, groundAt(m.x, m.z), m.z, m.yaw, false);
    eng.boltKinds.set(m.id, m.kind);
    if (eng.boltKinds.size > 64) eng.boltKinds.delete(eng.boltKinds.keys().next().value as number);
    sfx('sword', volumeAt(eng, m.x, m.z) * 0.45, m);
  });
  room.onMessage(S.BOLT_END, (m: BoltEndMsg) => {
    eng.vfx?.bolts.end(m.id, m.x, m.z, !!m.hit);
    eng.monFx?.bolt(eng.boltKinds.get(m.id) ?? 'fire', m.x, groundAt(m.x, m.z) + 0.8, m.z, 0, true);
    eng.boltKinds.delete(m.id);
    if (m.hit) sfx('impact', m.hit === eng.sid ? 0.8 : volumeAt(eng, m.x, m.z) * 0.5, m);
  });
  room.onMessage(S.CHAT, (m: ChatMsg) => pushLog(m.m, m.c === 'party' ? 'party' : 'chat', m.from));
  // Tổ đội và tỉ thí (P3-9): chỉ hiển thị; mọi phán định ở server. Giờ server đổi sang đồng hồ client.
  // Bảng tổng kết trận (U5): số liệu do server tổng hợp, client chỉ hiển thị.
  room.onMessage(S.RECAP, (m: RecapMsg) => set({ recap: m }));
  room.onMessage(S.PARTY, (m: PartyMsg | null) => set({ party: m }));
  // Truyền Tống Trận và điểm đánh dấu (M-4): chỉ hiển thị; server quyết định. Thời gian còn lại đổi sang đồng hồ client.
  room.onMessage(S.TELE, (m: TeleMsg) => {
    const now = performance.now();
    set({ tele: { open: m.open, cast: m.cast ? { id: m.cast.id, until: now + m.cast.ms } : null, cdUntil: m.cd > 0 ? now + m.cd : 0 } });
    minimapHooks.teleports = m.open.flatMap((id) => {
      const pad = TELE_PAD.get(id);
      return pad ? [{ id, x: pad.x, z: pad.z, label: t(`tele.${id}`) }] : [];
    });
  });
  room.onMessage(S.MARK, (m: MarkMsg) => set({ marks: m.marks }));
  room.onMessage(S.ESCORT, (m: EscortMsg) => eng.ents?.setEscort(m));
  // Thần thức (E2-E): chỉ hiển thị; server quyết định kết quả quét. Thời gian đổi sang đồng hồ client.
  room.onMessage(S.SPIRIT_STATE, (m: SpiritStateMsg) => {
    const now = performance.now();
    set({ spirit: { open: m.open, chUntil: m.ch > 0 ? now + m.ch : 0, cdUntil: m.cd > 0 ? now + m.cd : 0, r: m.r } });
  });
  // Nguyên anh (E3-K): chỉ hiển thị; server quyết định.
  room.onMessage(S.SOUL_STATE, (m: SoulStateMsg) => {
    const now = performance.now();
    set({
      soul: {
        open: m.open,
        k: m.k,
        until: m.left > 0 ? now + m.left : 0,
        bx: m.bx,
        by: m.by,
        bz: m.bz,
        to: m.to ?? null,
        cdUntil: m.cd > 0 ? now + m.cd : 0,
        deathCdUntil: m.dcd > 0 ? now + m.dcd : 0,
      },
    });
  });
  // Phân thân thần niệm (E4-K): chỉ hiển thị; server quyết định.
  room.onMessage(S.CLONE_STATE, (m: CloneStateMsg) => {
    const now = performance.now();
    set({ clone: { open: m.open, until: m.left > 0 ? now + m.left : 0, cdUntil: m.cd > 0 ? now + m.cd : 0 } });
  });
  room.onMessage(S.SPIRIT_SCAN, (m: SpiritScanMsg) => {
    const now = performance.now();
    set({ spiritScan: { x: m.x, z: m.z, r: m.r, at: now, until: now + m.ttl, hits: m.hits } });
    const kinds: Record<string, number> = {};
    for (const h of m.hits) kinds[h.k] = (kinds[h.k] ?? 0) + 1;
    eng.spiritLog.push({ r: m.r, n: m.hits.length, kinds, hits: m.hits });
  });
  room.onMessage(S.INVITE, (m: InviteMsg) => {
    const until = m.until - eng.timeOffset;
    set((s) => {
      const rest = s.invites.filter((i) => !(i.kind === m.kind && i.id === m.id));
      return { invites: m.gone ? rest : [...rest, { ...m, until }].slice(-4) };
    });
    if (!m.gone) sfx('ui_open', 0.8);
  });
  room.onMessage(S.DUEL, (m: DuelMsg) => {
    // Vào trận: nhắm đối thủ (thay mục tiêu quái cũ); hết trận: bỏ nhắm nếu vẫn đang nhắm người đó.
    if (m.phase === 'count') {
      eng.setTarget(m.foe, 'player');
    } else if (m.phase === 'end' && eng.targetKind === 'player' && eng.targetId === m.foe) {
      eng.clearTarget();
    }
    set({ duel: { ...m, at: m.at - eng.timeOffset } });
    if (m.phase === 'end') setTimeout(() => set((s) => (s.duel?.phase === 'end' ? { duel: null } : {})), 4500);
  });
  room.onMessage(S.KICK, (m: { k: string }) => {
    eng.leaving = true;
    set({ phase: 'error', error: t(m.k) });
  });
  room.onMessage(S.TRANSFER, (m: TransferMsg) => eng.transfer(m));
  room.onMessage('*', () => {});
  room.onLeave((code) => {
    if (eng.leaving || eng.disposed || eng.room !== room) return;
    eng.tryReconnect(room, code);
  });
}
