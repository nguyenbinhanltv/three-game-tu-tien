// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import * as THREE from 'three/webgpu';
import {
  AIRBORNE_HEIGHT,
  MF_BROKEN,
  MF_CHANT,
  MF_STUN,
  MS_ATTACK,
  MS_CHASE,
  MS_DEAD,
  PF_CASTING,
  PF_DEAD,
  PF_FLYING,
  PF_MEDITATING,
  PF_TRIBULATION,
  tribDef,
  tribForLevel,
  phaseRules,
  ROOM_WORLD,
  SOUL_SCOUT,
} from '@dtl/shared';
import { areaKey, biomeAt, groundAt, levelId } from '../../base/levelCtx';
import { hasString, ITEM, itemName, LEVELS, MONSTER, monsterName, NPCS, QUEST, t } from '@dtl/content';
import { type BossInfo, type DebugInfo, get, pushToast, set, type TargetCast, type TargetInfo } from '../../ui/store';
import { type DebugPerf } from '../../ui/store';
import { duckHold } from '../audio/audio';
import { rememberZone } from '../world/bootArt';
import { firstTime } from '../camera/chapter';
import { type MState, type PState } from '../entities/entities';
import { nearestGoalSpot, type OffCandidate, questGoal, trackedQuestId } from '../entities/offscreen';
import { BOSS_BAR_RANGE, keepMonsterTarget } from '../combat/targetRange';
import { isWebGPU } from './common';
import { canCine, chapter, checkBossIntro, startCine } from './cine';
import type { Game } from '../engine';

export function pruneRareLoot(eng: Game): void {
  const now = performance.now();
  for (let i = eng.rareLoot.length - 1; i >= 0; i--) if (eng.rareLoot[i].until < now) eng.rareLoot.splice(i, 1);
}

/** Niệm chú/choáng của quái (theo đồng hồ client), nếu quái có chiêu niệm chú. */
export function castOf(eng: Game, m: MState): TargetCast | undefined {
  const def = MONSTER.get(m.t);
  if (!def || !m.mf || !m.ce) return undefined;
  const end = m.ce - eng.timeOffset;
  if (m.mf & MF_BROKEN && def.posture) return { kind: 'broken', end, total: def.posture.brk * 1000, open: 0 };
  const ch = phaseRules(def, m.ph ?? 0).ai.chant;
  if (!ch) return undefined;
  if (m.mf & MF_CHANT) return { kind: 'chant', end, total: ch.cast * 1000, open: ch.open };
  if (m.mf & MF_STUN) return { kind: 'stun', end, total: ch.stun * 1000, open: 0 };
  return undefined;
}

/** Boss vào pha mới hoặc gục: hiện một câu thoại ngắn nếu mình đứng gần (không khóa điều khiển, không gửi gì lên server). */
export function bossSay(eng: Game, src: string, key: string): void {
  const m = eng.view.monsters.get(src);
  // Đang cắt cảnh boss/chuyển pha: phụ đề của cảnh là câu thoại duy nhất, không chồng thêm dòng thoại thường.
  if (!m || !hasString(key) || (eng.cine.active && eng.cineKind !== 'sect')) return;
  if (Math.hypot(m.x - eng.renderPos.x, m.z - eng.renderPos.z) > 60) return;
  set({ bossLine: { id: ++eng.bossLineId, name: monsterName(m.t), text: t(key), until: Date.now() + 3200 } });
  // Lời boss (thoại): hạ nhạc để đọc được và nghe được tiếng chân/đòn.
  duckHold('boss', 0.4, 3.3);
}

/** Boss cho thanh giữa phía trên: boss đang chọn, không thì boss còn sống gần nhất đang giao chiến trong 80 m. */
export function bossFor(eng: Game, target: TargetInfo | null, x: number, z: number): BossInfo | null {
  let id = target?.kind === 'mon' && target.boss ? target.id : '';
  if (!id) {
    let best = 80 * 80;
    eng.view.monsters.forEach((m, mid) => {
      if (m.st === MS_DEAD || !MONSTER.get(m.t)?.boss) return;
      if (m.st !== MS_CHASE && m.st !== MS_ATTACK && m.hp >= m.mhp) return;
      const d2 = (m.x - x) ** 2 + (m.z - z) ** 2;
      if (d2 < best) {
        best = d2;
        id = mid;
      }
    });
  }
  const m = id ? eng.view.monsters.get(id) : undefined;
  if (!m || m.st === MS_DEAD) return null;
  if (Math.hypot(m.x - x, m.z - z) > BOSS_BAR_RANGE) return null;
  const def = MONSTER.get(m.t);
  const info: BossInfo = { id, def: m.t, level: m.lv, hp: m.hp, mhp: m.mhp, cast: castOf(eng, m) };
  if (def?.posture) info.posture = (m.pz ?? 0) / 100;
  if (def?.phases) info.marks = def.phases.map((p) => p.hp);
  return info;
}

export function syncHud(eng: Game, me: PState | undefined): void {
  if (!me) return;
  const rp = eng.renderPos;
  let target: TargetInfo | null = null;
  if (eng.targetId) {
    if (eng.targetKind === 'mon') {
      const m = eng.view.monsters.get(eng.targetId);
      const def = m ? MONSTER.get(m.t) : undefined;
      // Quái đã ra khỏi tầm nhìn (AOI) hoặc bị bỏ lại quá xa: bỏ chọn, không để khung mục tiêu/thanh boss bám theo.
      if (!m || !def || !keepMonsterTarget(Math.hypot(m.x - rp.x, m.z - rp.z), !!def.boss)) {
        eng.targetId = '';
        if (eng.autoAttack) {
          eng.autoAttack = false;
          set({ autoAttack: false });
        }
      } else {
        target = {
          id: eng.targetId,
          kind: 'mon',
          name: monsterName(def.id),
          def: def.id,
          level: m.lv,
          hp: m.hp,
          mhp: m.mhp,
          boss: !!def.boss,
        };
        const cast = castOf(eng, m);
        if (cast) target.cast = cast;
      }
    } else if (eng.targetKind === 'player') {
      const p = eng.view.players.get(eng.targetId);
      if (p) target = { id: eng.targetId, kind: 'player', name: p.name, level: p.lv, hp: p.hp, mhp: p.mhp, boss: false };
      else eng.targetId = '';
    } else {
      target = {
        id: eng.targetId,
        kind: 'npc',
        name: t(`npc.${eng.targetId}.name`),
        def: eng.targetId,
        level: 0,
        hp: 1,
        mhp: 1,
        boss: false,
      };
      const n = eng.ents.npcs.find((e) => e.id === eng.targetId);
      if (n && Math.hypot(n.x - rp.x, n.z - rp.z) > 30) eng.targetId = '';
    }
  }
  const boss = bossFor(eng, target, rp.x, rp.z);
  // Boss đã có thanh máu lớn trên HUD thì ẩn bảng tên 3D của nó (không để tên lộ ra sau thanh máu).
  eng.ents.hudBossId = boss?.id ?? '';
  checkBossIntro(eng, me);
  eng.offscreen.setCandidates(offscreenCandidates(eng, target, boss));
  let hint = '';
  if (!(me.fl & PF_DEAD)) {
    const near = eng.ents.nearestInteractable(eng.cur.x, eng.cur.y, eng.cur.z);
    if (near) {
      if (near.kind === 'npc') hint = t('ui.hint.talk', { name: t(`npc.${near.id}.name`) });
      else if (near.kind === 'node') hint = t('ui.hint.gather', { name: t(`item.${eng.view.nodes.get(near.id)?.t}.name`) });
      else
        hint = t(near.id === 'exit' ? 'ui.hint.exit' : 'ui.hint.portal', {
          name: t(`dungeon.${near.id === 'exit' ? levelId() : (near.to ?? 'kiem_trung')}.name`),
        });
    }
  }
  const st = get();
  // Đóng hộp thoại NPC khi đi xa.
  let npc = st.npc;
  if (npc) {
    const n = eng.ents.npcs.find((e) => e.id === npc);
    if (!n || Math.hypot(n.x - rp.x, n.z - rp.z) > 10) npc = null;
  }
  rememberZone(rp.x, rp.z);
  recoverTribulation(eng, me);
  const fps = eng.fpsAcc > 0 ? Math.round(eng.fpsFrames / eng.fpsAcc) : 0;
  eng.cpuAvg = eng.fpsFrames > 0 ? eng.cpuAcc / eng.fpsFrames : 0;
  eng.cpuPeak = eng.cpuMax;
  eng.cpuAcc = 0;
  eng.cpuMax = 0;
  eng.fpsAcc = 0;
  eng.fpsFrames = 0;
  let perf = st.perf;
  // Dòng gọn ở góc khi có ?debug (chỉ số và đơn vị quốc tế, không có chữ cần dịch); số đủ nằm trong bảng F3.
  if (eng.debugPerf)
    perf = `${eng.cpuAvg.toFixed(1)} ms · ${eng.lastRender.drawCalls} draw · ${Math.round(eng.lastRender.triangles / 1000)}k tri`;
  const nearby: { name: string; lv: number }[] = [];
  eng.view.players.forEach((p, sid) => {
    if (sid !== eng.sid) nearby.push({ name: p.name, lv: p.lv });
  });
  nearby.sort((a, b) => a.name.localeCompare(b.name));
  const nearbyKey = nearby.map((n) => n.name + n.lv).join('|');
  const sameNearby = nearbyKey === st.nearby.map((n) => n.name + n.lv).join('|');
  set({
    ...(sameNearby ? {} : { nearby }),
    debug: st.debugOpen ? debugInfo(eng, me, Math.round(st.fps ? st.fps * 0.6 + fps * 0.4 : fps)) : null,
    hp: me.hp,
    mhp: me.mhp,
    mp: me.mp,
    mmp: me.mmp,
    flags: me.fl,
    target,
    boss,
    hint,
    npc,
    x: rp.x,
    y: rp.y,
    z: rp.z,
    airborne: (me.fl & PF_FLYING) !== 0 || rp.y - groundAt(rp.x, rp.z) > AIRBORNE_HEIGHT,
    zone: t(areaKey(levelId(), biomeAt(rp.x, rp.z))),
    fps: Math.round(st.fps ? st.fps * 0.6 + fps * 0.4 : fps),
    perf,
    autoAttack: eng.autoAttack,
    tribEnd: me.fl & PF_TRIBULATION ? Math.max(st.tribEnd, eng.tribUntil) : 0,
    castEnd: me.fl & PF_CASTING ? st.castEnd : 0,
  });
  checkChapters(eng, rp.x, rp.z, (me.fl & PF_FLYING) !== 0);
}

/**
 * Ứng viên cho chỉ báo ngoài màn hình (M4-15), theo thứ tự ưu tiên: mục tiêu đang chọn, boss đang
 * giao chiến, đích của nhiệm vụ đang theo dõi. Chỉ đọc vị trí đã có (trạng thái room, NPC, dữ liệu bản đồ).
 */
export function offscreenCandidates(eng: Game, target: TargetInfo | null, boss: BossInfo | null): OffCandidate[] {
  const out: OffCandidate[] = [];
  if (!get().offscreen) return out;
  const ents = eng.ents;
  // Mô hình chưa dựng (ngoài tầm hiển thị) thì lấy vị trí trong trạng thái room.
  const entityPos = (id: string) => (o: THREE.Vector3) => {
    if (ents.chestOf(id, o)) return true;
    const e = eng.view.monsters.get(id) ?? eng.view.players.get(id);
    return !!e && (o.set(e.x, e.y + 1, e.z), true);
  };
  const npcPos = (id: string) => {
    const n = ents.npcs.find((e) => e.id === id);
    return n ? (o: THREE.Vector3) => (o.set(n.x, n.y + 1.6, n.z), true) : null;
  };
  // Từ ngực (chestOf) xuống chân.
  const spanOf = (id: string) => {
    const m = ents.monsters.get(id);
    return m ? m.model.height * 0.55 : 1.2;
  };
  if (target) {
    const pos = target.kind === 'npc' ? npcPos(target.id) : entityPos(target.id);
    if (pos)
      out.push({
        key: target.id,
        kind: target.boss ? 'boss' : target.kind === 'mon' ? 'foe' : 'target',
        label: target.name,
        pos,
        span: target.kind === 'npc' ? 1.6 : spanOf(target.id),
      });
  }
  if (boss && boss.id !== target?.id)
    out.push({ key: boss.id, kind: 'boss', label: monsterName(boss.def), pos: entityPos(boss.id), span: spanOf(boss.id) });

  const st = get();
  // Cùng luật với chấm ở bảng theo dõi (trackedQuestId): chỉ chỉ tới đúng nhiệm vụ đó, không nhảy sang nhiệm vụ khác.
  const qid = trackedQuestId(st.quests, st.trackQuest);
  const rp = eng.renderPos;
  do {
    const def = qid ? QUEST.get(qid) : undefined;
    const goal = def && questGoal(def, st.quests.active[qid], NPCS);
    if (!goal) break;
    const label = t(`quest.${qid}.name`);
    if (goal.kind === 'npc') {
      // NPC không có trên bản đồ này (ví dụ đang ở bí cảnh) thì không chỉ.
      const pos = npcPos(goal.npc);
      if (pos) out.push({ key: qid + ':' + goal.npc, kind: goal.turnin ? 'turnin' : 'quest', label, pos, span: 1.6 });
      break;
    }
    const spot = nearestGoalSpot(goal, rp.x, rp.z, eng.view.monsters, eng.view.nodes, LEVELS[eng.view.level]);
    if (!spot) break;
    let pos: OffCandidate['pos'];
    let key: string;
    if ('id' in spot) {
      // Cùng con quái với mục tiêu/boss thì đã có chỉ báo rồi.
      if (spot.id === target?.id || spot.id === boss?.id) break;
      key = spot.id;
      const id = spot.id;
      if (goal.kind === 'mon') pos = entityPos(id);
      else
        pos = (o) => {
          const n = eng.view.nodes.get(id);
          return !!n && (o.set(n.x, n.y + 0.8, n.z), true);
        };
    } else {
      key = `${spot.x},${spot.z}`;
      const y = groundAt(spot.x, spot.z) + 1;
      pos = (o) => (o.set(spot.x, y, spot.z), true);
    }
    out.push({
      key: qid + ':' + key,
      kind: goal.kind === 'node' ? 'gather' : 'quest',
      label,
      icon: goal.kind === 'node' ? goal.item : undefined,
      pos,
      span: goal.kind === 'mon' && 'id' in spot ? spanOf(spot.id) : 0.8,
    });
  } while (false);
  // Điểm đánh dấu của mình và đồng đội (M-4): mũi tên ở rìa màn hình khi nằm ngoài khung nhìn.
  for (const m of st.marks) {
    const y = groundAt(m.x, m.z) + 2;
    out.push({
      key: `mark:${m.id}`,
      kind: m.own ? 'mark' : 'mate',
      label: m.own ? t('ui.wm.mark_own') : t('ui.wm.mark_of', { name: m.name }),
      pos: (o) => (o.set(m.x, y, m.z), true),
      span: 0.4,
    });
  }
  // Đồ rơi quý (M4-6) đang nằm trên đất ngoài khung nhìn: chỉ trong lúc cột sáng còn đứng.
  pruneRareLoot(eng);
  for (const l of eng.rareLoot) {
    const p = l.pos;
    out.push({ key: l.key, kind: 'loot', label: itemName(l.item), icon: ITEM.get(l.item)?.icon, pos: (o) => (o.copy(p), true), span: 0.4 });
  }
  return out;
}

/** Thẻ đang chờ (vào bí cảnh) và lần đầu vào Lạc Kiếm Tông của nhân vật này; gọi mỗi lần đồng bộ HUD. */
export function checkChapters(eng: Game, x: number, z: number, flying = false): void {
  if (!eng.started || eng.snapToServer) return;
  // Ngự kiếm lần đầu (G10): thẻ chương + gợi ý lên/xuống; đã xem thì lần sau không hiện.
  if (flying && get().room === ROOM_WORLD && !eng.pendingChapter && get().soul.k !== SOUL_SCOUT) {
    const who = get().char?.name;
    if (who && firstTime(localStorage, 'fly', who)) {
      chapter(eng, 'fly');
      pushToast(t('ui.fly_hint'), 'info');
    }
  }
  // Chương 2 · Đoạn Mạch: thẻ lần đầu nhân vật này tới (E2-D). Vào bằng room mới nên kiểm ở đây, không ở `enterLevel`.
  if (!eng.ch2Checked && levelId() === 'doan_mach' && get().phase === 'game') {
    const who = get().char?.name;
    if (who) {
      eng.ch2Checked = true;
      if (firstTime(localStorage, 'ch2', who)) window.setTimeout(() => !eng.disposed && chapter(eng, 'ch2'), 1200);
    }
  }
  // Chương 3 · Vân Hải (E3-H): cùng cách với chương 2.
  if (!eng.ch3Checked && levelId() === 'van_hai' && get().phase === 'game') {
    const who = get().char?.name;
    if (who) {
      eng.ch3Checked = true;
      if (firstTime(localStorage, 'ch3', who)) window.setTimeout(() => !eng.disposed && chapter(eng, 'ch3'), 1200);
    }
  }
  // Chương 4 · Thiên Khuyết (E4-H): cùng cách.
  if (!eng.ch4Checked && levelId() === 'thien_khuyet' && get().phase === 'game') {
    const who = get().char?.name;
    if (who) {
      eng.ch4Checked = true;
      if (firstTime(localStorage, 'ch4', who)) window.setTimeout(() => !eng.disposed && chapter(eng, 'ch4'), 1200);
    }
  }
  // Chương 5 · Bắc Hoang (DV3-H): cùng cách.
  if (!eng.ch5Checked && levelId() === 'bac_hoang' && get().phase === 'game') {
    const who = get().char?.name;
    if (who) {
      eng.ch5Checked = true;
      if (firstTime(localStorage, 'ch5', who)) window.setTimeout(() => !eng.disposed && chapter(eng, 'ch5'), 1200);
    }
  }
  if (eng.pendingChapter) {
    chapter(eng, eng.pendingChapter);
    eng.pendingChapter = null;
  }
  const name = get().char?.name;
  if (eng.sectChecked || !name || get().room !== ROOM_WORLD || biomeAt(x, z) !== 'sect') return;
  eng.sectChecked = true;
  if (!firstTime(localStorage, 'sect', name)) return;
  if (canCine(eng, x, z)) startCine(eng);
  else chapter(eng, 'sect');
}

/**
 * Lỡ tin `tribstart` (vào room hoặc kết nối lại khi mình đang độ kiếp, ví dụ `?tribulation=1`): cờ PF_TRIBULATION đã bật
 * hơn 0,6 giây mà chưa có giờ kết thúc thì dựng lại HUD và mây kiếp. Không biết lúc bắt đầu thật nên đếm từ đủ thời lượng
 * (cận trên); HUD vẫn tắt đúng lúc vì nó theo cờ của server.
 */
export function recoverTribulation(eng: Game, me: PState): void {
  const now = Date.now();
  if (!(me.fl & PF_TRIBULATION)) {
    eng.tribFlagAt = 0;
    return;
  }
  if (!eng.tribFlagAt) eng.tribFlagAt = now;
  if (eng.tribUntil > now || now - eng.tribFlagAt < 600 || !eng.started) return;
  // Lỡ tin: kiếp đang độ là kiếp mở ra từ cấp hiện tại (cấp chỉ đổi khi thành công).
  const def = tribForLevel(me.lv) ?? tribDef('truc_co');
  eng.tribId = def.id;
  eng.tribUntil = now + def.duration * 1000;
  const sid = eng.sid;
  eng.vfx.tribulationCloud(
    (out) => eng.ents.chestOf(sid, out),
    def.duration,
    () => ((eng.view.players.get(sid)?.fl ?? 0) & PF_TRIBULATION) !== 0,
  );
  set({ tribEnd: eng.tribUntil, tribId: eng.tribId });
}

/** Số liệu cho bảng gỡ lỗi F3 (M1-2). */
export function debugInfo(eng: Game, me: PState, fps: number): DebugInfo {
  const states: string[] = [];
  const on = (cond: unknown, key: string): void => {
    if (cond) states.push('ui.debug.st.' + key);
  };
  on(eng.cur.grounded, 'grounded');
  on(!eng.cur.grounded && !eng.cur.flying, 'airborne');
  on(eng.cur.flying, 'flying');
  on(eng.wantFly, 'want_fly');
  on(me.fl & PF_DEAD, 'dead');
  on(me.fl & PF_MEDITATING, 'meditating');
  on(me.fl & PF_CASTING, 'casting');
  on(me.fl & PF_TRIBULATION, 'tribulation');
  on(eng.autorun, 'autorun');
  on(eng.autoAttack, 'auto_attack');
  on(eng.dragging, 'dragging');
  on(eng.typing(), 'typing');
  const now = performance.now();
  return {
    keys: [...eng.keys.held],
    states,
    speed: eng.speed,
    focus: document.hasFocus(),
    visible: !document.hidden,
    active: document.activeElement?.tagName ?? '',
    pointerLock: eng.locked,
    controls: eng.controls,
    events: eng.keys.log.map((e) => ({ id: e.id, kind: e.kind, code: e.code, ago: Math.round(now - e.at) })),
    ping: Math.round(eng.ping),
    room: get().room,
    roomId: eng.room.roomId,
    sid: eng.sid,
    perf: debugPerfInfo(eng, fps),
  };
}

export function debugPerfInfo(eng: Game, fps: number): DebugPerf {
  const mem = eng.renderer.info.memory;
  const lod = eng.ents.lodStats();
  return {
    backend: isWebGPU(eng.renderer) ? 'WebGPU' : 'WebGL2',
    gpu:
      eng.gpuInfo +
      (eng.gpuErrors.length ? ` · LỖI: ${eng.gpuErrors[eng.gpuErrors.length - 1]}` : '') +
      (eng.lastBlank ? ` · khung sd ${eng.lastBlank.sd}` : ''),
    fps,
    cpuMs: eng.cpuAvg,
    cpuMaxMs: eng.cpuPeak,
    drawCalls: eng.lastRender.drawCalls,
    triangles: eng.lastRender.triangles,
    geometries: mem.geometries,
    textures: mem.textures,
    players: eng.ents.players.size,
    monsters: eng.ents.monsters.size,
    npcs: eng.ents.npcs.length,
    lod: lod.lod,
    offscreen: lod.offscreen,
    fxMeshes: eng.vfx.pool.live,
    particles: eng.vfx.particles.aliveCount().total,
    particleLimit: eng.vfx.particles.limit,
    tiles: eng.terrain.tileCount(),
  };
}

export function fxTargetOf(eng: Game, sid: string): { x: number; y: number; z: number; chest: number } | null {
  const id = sid === eng.sid ? eng.targetId || eng.fxDst.get(sid) : eng.fxDst.get(sid);
  if (!id || !eng.ents) return null;
  const mon = eng.ents.monsters.get(id);
  const ent = mon ?? eng.ents.players.get(id);
  if (!ent) return null;
  return { x: ent.x, y: ent.y, z: ent.z, chest: mon ? mon.model.height * 0.55 : 1.2 };
}
