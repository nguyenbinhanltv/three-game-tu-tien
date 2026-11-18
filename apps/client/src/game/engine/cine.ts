// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import { MS_ATTACK, MS_CHASE, MS_DEAD, PF_DEAD, SPAWN_POINT } from '@dtl/shared';
import { groundAt } from '../../base/levelCtx';
import { hasString, MONSTER, monsterName, t } from '@dtl/content';
import { get, set } from '../../ui/store';
import { chapterSting, duckHold } from '../audio/audio';
import { CHAPTER, type ChapterKind } from '../camera/chapter';
import { BOSS_CUTSCENE, BOSS_CUTSCENE_RANGE, bossIntroPath, DAN_CUTSCENE, danTranPath, minBossDist, PHASE_CUTSCENE, phaseShiftPath, SECT_CUTSCENE, type Waypoint } from '../camera/cutscene';
import { type PState } from '../entities/entities';
import { postParams } from '../../render/post';
import { _cineEndL, _cineEndP, _cineFwd, _cineL, _cineP, _v } from './common';
import type { Game } from '../engine';

/**
 * Hiện thẻ chương cho sự kiện cá nhân (C2): thẻ chữ + khung camera nhẹ + tiếng chiêng. Chỉ ở client,
 * không gửi gì lên server, không khóa input. Tắt trong Cài đặt thì bỏ qua cả ba.
 */
export function chapter(eng: Game, kind: ChapterKind, sting = true): void {
  if (!get().chapterCards) return;
  const p = CHAPTER[kind];
  set({ chapter: { id: ++eng.bossLineId, kind, until: Date.now() + p.card, dur: p.card } });
  eng.camFrame.start(p);
  if (sting) chapterSting(0.9);
  // Thẻ chương/cảnh mở đầu: nhạc nền hạ thấp trong suốt thời gian thẻ để chiêng và chữ nổi lên (D2).
  duckHold('chapter', 0.5, p.card / 1000 + 0.3);
}

/** Cảnh mở đầu chỉ chạy khi đứng gần điểm hồi sinh (đường camera dựng cho sân tông môn) , người chơi chưa tắt thẻ chương trong Cài đặt và không tắt bằng `?cine=0`. */
export function canCine(eng: Game, x: number, z: number): boolean {
  return get().chapterCards && Math.hypot(x - SPAWN_POINT.x, z - SPAWN_POINT.z) < 40;
}

export function startCine(eng: Game): void {
  eng.cineKind = 'sect';
  eng.cine.start();
  // Cảnh mở đầu: nhạc nền hạ thấp suốt đoạn camera điện ảnh (D2); thả khi cảnh hết hoặc bị bỏ qua.
  duckHold('cine', 0.45, SECT_CUTSCENE.dur + 0.5);
  eng.stage.classList.add('cining');
  set({ cine: { id: ++eng.bossLineId, kind: 'sect', dur: SECT_CUTSCENE.dur * 1000, out: false } });
}

/** Cảnh boss/chuyển pha chỉ chạy khi người chơi bật thẻ chương, không `?cine=0`, không đang chết, không đang có cảnh khác. */
export function canBossCine(eng: Game, me: PState | undefined): boolean {
  if (!me || !eng.started || eng.cine.active || eng.snapToServer) return false;
  if ((me.fl & PF_DEAD) !== 0 || get().phase !== 'game') return false;
  return get().chapterCards;
}

export function beginBossCine(eng: Game, kind: 'boss' | 'phase' | 'dan', path: readonly Waypoint[], prof: { dur: number; out: number }, info: { name: string; title?: string; text: string }): void {
  eng.cineKind = kind;
  eng.cineShakeAt = 0;
  eng.cineFocus = null;
  eng.cine.start(path, prof.dur, prof.out);
  eng.stage.classList.add('cining');
  set({ cine: { id: ++eng.bossLineId, kind, dur: prof.dur * 1000, out: false, ...info } });
}

/**
 * Boss xuất hiện (P2-B2): lần đầu boss bị kéo trong lần giao chiến, chỉ người đứng trong tầm kéo của boss
 * (`aggro`) mới thấy. Chỉ là lớp hình ở client: không gửi gì, không khóa input (phím/chuột bỏ qua), thế giới
 * vẫn chạy. Vào giữa trận (boss đã mất máu hoặc đã sang pha sau) thì không chiếu.
 */
export function checkBossIntro(eng: Game, me: PState | undefined): void {
  if (!me) return;
  const rp = eng.renderPos;
  eng.view.monsters.forEach((m, id) => {
    const def = MONSTER.get(m.t);
    if (!def?.boss) return;
    const fighting = m.st === MS_CHASE || m.st === MS_ATTACK;
    if (!fighting) {
      if (m.st === MS_DEAD || m.hp >= m.mhp) eng.bossIntroSeen.delete(id);
      return;
    }
    if (eng.bossIntroSeen.has(id)) return;
    const fresh = m.hp >= m.mhp * 0.98 && (m.ph ?? 0) === 0;
    const dist = Math.hypot(m.x - rp.x, m.z - rp.z);
    const key = `mon.${m.t}.say.intro`;
    const mine = fresh && dist <= Math.min(BOSS_CUTSCENE_RANGE, def.aggro) && hasString(key);
    // Chưa chiếu được (đang dịch chuyển, đang có cảnh khác...): thử lại ở nhịp sau, chừng nào boss còn chưa mất máu.
    if (mine && !canBossCine(eng, me)) return;
    eng.bossIntroSeen.add(id);
    if (!mine) return;
    const model = eng.ents.monsters.get(id)?.model;
    const path = bossIntroPath({ x: m.x, y: m.y, z: m.z }, m.yaw, def.scale, { x: rp.x, y: rp.y, z: rp.z }, groundAt);
    beginBossCine(eng, 'boss', path, BOSS_CUTSCENE, { name: monsterName(m.t), title: t(`mon.${m.t}.title`), text: t(key) });
    eng.cineFocus = { id, rise: 1.15 * def.scale, scale: def.scale };
    // Gầm: boss làm động tác lớn (nếu có), đất rung nhẹ, chớp mờ ở ngực.
    model?.bossMove?.('slam', 0.55);
    eng.shake.kick(0.45);
    if (eng.ents.chestOf(id, _v)) eng.vfx.burst(_v, 0xffd9a0, 1.0, 0.3);
  });
}

/** Đan Trận mở ra: cắt cảnh ngắn nhìn xuống vòng (giữ HUD, bỏ qua được bằng phím/chuột hoặc khi bị đánh). */
export function danCine(eng: Game, x: number, z: number, color = '#ffb070'): void {
  if (!canBossCine(eng, eng.me())) return;
  const cam = eng.camera;
  const look = _cineEndL.copy(cam.position).add(_cineFwd.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10));
  const path = danTranPath({ x: cam.position.x, y: cam.position.y, z: cam.position.z }, { x: look.x, y: look.y, z: look.z }, { x, y: groundAt(x, z), z }, groundAt);
  postParams.pulseColor.value.set(color);
  beginBossCine(eng, 'dan', path, DAN_CUTSCENE, { name: '', text: '' });
}

/** Chuyển pha (P2-B3): cắt cảnh ngắn, camera lùi nhẹ, rung đất, màu thoáng đổi. Trả false nếu không chiếu (lúc đó dùng câu thoại thường). */
export function phaseCine(eng: Game, src: string, key: string): boolean {
  const m = eng.view.monsters.get(src);
  const def = m ? MONSTER.get(m.t) : undefined;
  if (!m || !def || !hasString(key) || !canBossCine(eng, eng.me())) return false;
  const rp = eng.renderPos;
  if (Math.hypot(m.x - rp.x, m.z - rp.z) > Math.min(BOSS_CUTSCENE_RANGE, def.aggro)) return false;
  const cam = eng.camera;
  const look = _cineEndL.copy(cam.position).add(_cineFwd.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10));
  const path = phaseShiftPath(
    { x: cam.position.x, y: cam.position.y, z: cam.position.z },
    { x: look.x, y: look.y, z: look.z },
    { x: m.x, y: m.y, z: m.z },
    m.yaw,
    def.scale,
    groundAt,
  );
  postParams.pulseColor.value.set(def.accent ?? '#9fe6ff');
  beginBossCine(eng, 'phase', path, PHASE_CUTSCENE, { name: monsterName(m.t), text: t(key) });
  eng.cineFocus = { id: src, rise: 1.2 * def.scale, scale: def.scale };
  eng.shake.kick(0.9);
  return true;
}

/** Phím/chuột/bị đánh: camera trôi về chỗ người chơi trong 0,45 giây; thẻ chương vẫn hiện sau đó. */
export function skipCine(eng: Game, force = true): void {
  if (force) eng.cine.skip();
}

/** Ghi đè camera đã đặt xong bằng đường cảnh (điểm cuối của đường chính là camera thường nên không có mối nối). */
export function runCine(eng: Game, dt: number): void {
  const cam = eng.camera;
  _cineEndP.set(cam.position.x, cam.position.y, cam.position.z);
  _cineEndL.copy(_cineEndP).add(_cineFwd.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10));
  const on = eng.cine.update(dt, _cineEndP, _cineEndL, _cineP, _cineL);
  cineFx(eng, on);
  if (on && eng.cineFocus) focusCine(eng);
  if (on) {
    cam.position.set(_cineP.x, _cineP.y, _cineP.z);
    cam.lookAt(_cineL.x, _cineL.y, _cineL.z);
    return;
  }
  eng.stage.classList.remove('cining');
  duckHold('cine', 0);
  set({ cine: { ...get().cine!, out: true } });
  window.setTimeout(() => get().cine?.out && set({ cine: null }), 700);
  if (eng.cineKind === 'sect') chapter(eng, 'sect');
}

/**
 * Theo boss trong cảnh: (1) cảnh xuất hiện: nửa đầu mắt luôn dõi boss đang chạy, sau đó trả dần về điểm nhìn của
 * đường; (2) cả hai cảnh: camera không được sát boss hơn `minBossDist` (thấy trọn thân trên), nới ra dần ở 15%
 * cuối để hòa liền vào camera thường.
 */
export function focusCine(eng: Game): void {
  const f = eng.cineFocus!;
  const m = eng.view.monsters.get(f.id);
  if (!m || m.st === MS_DEAD) return;
  const smooth = (k: number): number => {
    const c = Math.max(0, Math.min(1, k));
    return c * c * (3 - 2 * c);
  };
  const x = eng.cine.time / (eng.cineKind === 'boss' ? BOSS_CUTSCENE.dur : PHASE_CUTSCENE.dur);
  if (eng.cineKind === 'boss') {
    const hold = (1 - smooth((x - 0.5) / 0.4)) * eng.cine.weight;
    _cineL.x += (m.x - _cineL.x) * hold;
    _cineL.y += (m.y + f.rise - _cineL.y) * hold;
    _cineL.z += (m.z - _cineL.z) * hold;
  }
  const min = minBossDist(f.scale) * (1 - smooth((x - 0.85) / 0.15)) * eng.cine.weight;
  const dx = _cineP.x - m.x;
  const dz = _cineP.z - m.z;
  const d = Math.hypot(dx, dz);
  if (d < min) {
    const k = d > 1e-3 ? min / d : 0;
    _cineP.x = m.x + (d > 1e-3 ? dx * k : min);
    _cineP.z = m.z + (d > 1e-3 ? dz * k : 0);
  }
}

/** Hiệu ứng hậu kỳ theo nhịp cảnh boss: nhòe hướng tâm (xuất hiện) hoặc nhuộm màu (chuyển pha), kèm rung lần hai. */
export function cineFx(eng: Game, on: boolean): void {
  const k = eng.cineKind;
  if (k === 'sect') return;
  const w = on ? eng.cine.weight : 0;
  const prof = k === 'boss' ? BOSS_CUTSCENE : k === 'dan' ? DAN_CUTSCENE : PHASE_CUTSCENE;
  const bell = Math.sin(Math.PI * Math.min(1, eng.cine.time / prof.dur));
  if (k === 'boss') postParams.radial.value = 0.75 * bell * w;
  else if (k === 'dan') postParams.pulse.value = 0.3 * bell * w;
  else {
    postParams.pulse.value = 0.9 * bell * w;
    if (on && eng.cineShakeAt === 0 && eng.cine.time > 0.55) {
      eng.cineShakeAt = 1;
      eng.shake.kick(0.7);
    }
  }
  if (!on) {
    postParams.radial.value = 0;
    postParams.pulse.value = 0;
  }
}
