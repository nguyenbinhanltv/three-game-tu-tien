// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import { FLAGS } from '../../base/flags';
import { downgradeOf, getGpuHint, setGpuHint, suggestQuality } from '../../base/quality';
import * as THREE from 'three/webgpu';
import {
  C,
  caveBoundOf,
  TELE_CAST_MS,
  cloneMoveState,
  canFlyAt,
  IN_DOWN,
  IN_FLY,
  IN_JUMP,
  IN_UP,
  type MoveCtx,
  type MoveInput,
  type MoveState,
  MS_DEAD,
  PF_CASTING,
  PF_DEAD,
  PF_FLYING,
  PF_TRIBULATION,
  STEP,
  collisionOf,
  stepMove,
  type SkillDef,
  CHARGE_MAX,
  needsTarget,
  PF_SOUL,
  PF_STAGGER,
  SOUL_RANGE,
  SOUL_SCOUT,
  skyFlightUnlocked,
  domainRadius,
} from '@dtl/shared';
import { groundAt, levelId, levelTerrain } from '../../base/levelCtx';
import { LEVELS, MONSTER, pathOf, resolveBarSkill, SKILLS, t } from '@dtl/content';
import { get, pushLog, pushToast, set } from '../../ui/store';
import { frameStats, RENDER_FAIL_LIMIT, RENDERER_KEY, rendererChoice } from '../core/gpuGuard';
import { setListener } from '../audio/audio';
import { type PState } from '../entities/entities';
import { monsterPushRadius, pickPushers } from '../world/grass';
import { postParams } from '../../render/post';
import { updateOcclusion } from '../world/occlusion';
import {
  ISO_FAR,
  ISO_FOV,
  ISO_DIST,
  isoDistFor,
  clampLeadFrame,
  isoClearScale,
  isoTopEq,
  isoFrameBoss,
  isoLeadable,
  clampLeadSafe,
  isoCameraPos,
  isoLead,
  isoLeadTarget,
  isoYawFor,
  worldToIntent,
} from '../camera/iso';
import { assets } from '../core/assets';
import { BASE_ZONE, easeZoneCam, zoneCamera } from '../camera/camZones';
import { isHeld } from '../../input/bindings';
import { ULT_FOV, ultFovAt } from '../combat/hitjuice';
import { labDt } from '../debug/vfxLab';
import { SLOWMO, VFX_LAB, _camFocus, _shakeLook, _shakePos, _v, _v2, isWebGPU } from './common';
import { runCine } from './cine';
import { heroParams } from '../../render/materials/world';
import { heroRimOn } from '../fx/fxSettings';
import { applyDmg, ensureCloneVis, updateSoulVis } from './fxMsgs';
import { syncHud } from './hudSync';
import { updateEclipse, updateFaceMood, updateRiftMood } from './levelLoad';
import type { Game } from '../engine';
import { logger } from '../../base/log';

const renderLog = logger('render');
const loadLog = logger('load');
const gpuLog = logger('gpu');
const qualityLog = logger('quality');

function* liveMonsters(eng: Game): Generator<{ id: string; x: number; z: number }> {
  for (const [id, m] of eng.ents.monsters) if (m.s.st !== MS_DEAD) yield { id, x: m.x, z: m.z };
}

/** Gửi ý định dùng chiêu lên server (tự chọn mục tiêu nếu cần). Server vẫn kiểm mọi điều kiện. */
export function fireSkill(eng: Game, i: number): void {
  const skill = eng.bar()[i];
  const me = eng.me();
  if (!skill || !me || me.fl & PF_DEAD) return;
  const needTarget = needsTarget(skill) || (skill.kind === 'dash' && skill.dash?.dir === 'target');
  // Đang tỉ thí: chiêu đánh nhắm đối thủ (server vẫn kiểm đúng đối thủ, đã hết đếm ngược, trong tầm).
  const duel = get().duel;
  if (needTarget && duel && duel.phase !== 'end') {
    eng.send(C.SKILL, { id: skill.id, t: duel.foe });
    return;
  }
  if (needTarget) {
    // Camera chéo: chiêu đơn tự khóa quái gần con trỏ nhất (client chỉ chọn mục tiêu; server vẫn kiểm tầm). Không có thì rơi về tab-target.
    if (eng.iso) {
      const near = eng.iso.pickMonster(liveMonsters(eng));
      if (near && near !== eng.targetId) eng.setTarget(near, 'mon');
    }
    const cur = eng.ents.monsters.get(eng.targetId);
    if (!cur || cur.s.st === MS_DEAD) {
      const id = eng.ents.nextTarget('', eng.cur.x, eng.cur.z);
      if (!id) {
        pushToast(t('sys.no_target'), 'bad');
        return;
      }
      eng.setTarget(id, 'mon');
    }
    if (i === 0) {
      eng.autoAttack = true;
      set({ autoAttack: true });
    }
    eng.faceTargetUntil = performance.now() + 900;
  }
  eng.send(C.SKILL, { id: skill.id, t: needTarget ? eng.targetId : undefined, ...eng.iso?.aimMsg() });
  predictSkill(eng, i, skill, needTarget);
}

/**
 * Vào thế ngay khi gửi chiêu (chỉ hình): chỉ khi client thấy server sẽ nhận (đứng đất, hết chờ, đủ linh lực, trong tầm).
 * Dùng cho cả bấm phím lẫn tự đánh, để chuỗi liên hoàn luôn có nhịp vào thế đủ (K-4).
 */
function predictSkill(eng: Game, i: number, skill: SkillDef, needTarget: boolean): void {
  const me = eng.me();
  if (!me) return;
  const mon = needTarget ? eng.view.monsters.get(eng.targetId) : undefined;
  const inRange =
    !needTarget || (!!mon && Math.hypot(mon.x - eng.cur.x, mon.z - eng.cur.z) <= skill.range + 1.5 + (MONSTER.get(mon.t)?.scale ?? 1));
  const ready =
    Date.now() >= eng.skillReadyAt(i) - 60 &&
    me.mp >= skill.mp &&
    (me.fl & PF_CASTING) === 0 &&
    (!skill.ult || (get().method?.charge ?? 0) >= CHARGE_MAX);
  // Biến thức có thể bỏ niệm chú (Lôi Tốc): dự đoán theo thời gian niệm đã gộp biến thức.
  if (inRange && ready && eng.cur.grounded && !eng.cur.flying) {
    const gap = mon ? Math.hypot(mon.x - eng.cur.x, mon.z - eng.cur.z) - (MONSTER.get(mon.t)?.scale ?? 1) : undefined;
    eng.skillPoses.predict(
      eng.ents.players.get(eng.sid)?.model,
      { ...skill, cast: resolveBarSkill(get().method, skill).cast },
      performance.now(),
      gap,
      get().method?.method,
    );
  }
}

export function runFrame(eng: Game): void {
  if (eng.disposed || eng.compiling > 0) return;
  eng.renderer.info.reset();
  const now = performance.now();
  const rawDt = Math.min(0.1, (now - eng.lastT) / 1000) * SLOWMO;
  const dt = VFX_LAB ? labDt(rawDt) : rawDt;
  eng.lastT = now;
  eng.frames++;
  // Sát thương chờ khung `hit` mà quá hạn (hoạt ảnh bị hủy, model khối cũ): phát luôn, theo đồng hồ game.
  for (const m of eng.hitQ.tick(dt)) applyDmg(eng, m, undefined);
  const me = eng.me();

  if (me) {
    reconcile(eng, me);
    const ctx = moveCtx(eng, me);
    eng.acc += dt;
    if (eng.acc > 0.25) eng.acc = 0.25;
    while (eng.acc >= STEP) {
      eng.acc -= STEP;
      const inp = buildInput(eng);
      eng.pending.push(inp);
      eng.prev = cloneMoveState(eng.cur);
      stepMove(eng.cur, inp, ctx);
      eng.send(C.INPUT, inp);
      eng.inputSentAt[inp.s & 127] = now;
    }
    if (eng.pending.length > 60) eng.pending.splice(0, eng.pending.length - 60);

    // Server ép hạ xuống (hết linh lực, độ kiếp…): bỏ ý định bay.
    if (eng.wantFly && !eng.cur.flying) {
      if (!eng.flyLostAt) eng.flyLostAt = now;
      else if (now - eng.flyLostAt > 700) {
        eng.wantFly = false;
        set({ wantFly: false });
      }
    } else eng.flyLostAt = 0;

    const a = eng.acc / STEP;
    const decay = Math.exp(-dt * 12);
    eng.offset.multiplyScalar(decay);
    const px = eng.prev.x + (eng.cur.x - eng.prev.x) * a + eng.offset.x;
    const py = eng.prev.y + (eng.cur.y - eng.prev.y) * a + eng.offset.y;
    const pz = eng.prev.z + (eng.cur.z - eng.prev.z) * a + eng.offset.z;
    const vx = (eng.cur.x - eng.prev.x) / STEP;
    const vz = (eng.cur.z - eng.prev.z) / STEP;
    const sp = Math.hypot(vx, vz);
    eng.speed += (sp - eng.speed) * Math.min(1, dt * 10);
    eng.renderPos.set(px, py, pz);

    let faceTo = eng.facing;
    if (now < eng.faceTargetUntil && eng.ents.chestOf(eng.targetId, _v)) faceTo = Math.atan2(_v.x - px, _v.z - pz);
    else if (sp > 0.5) faceTo = Math.atan2(vx, vz);
    let d = faceTo - eng.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    eng.facing += d * Math.min(1, dt * 14);
  }

  const rp = eng.renderPos;
  eng.terrain.update(rp.x, rp.z, eng.started ? 1 : 8);
  const myLevel = get().char?.level ?? 1;
  // Chậm thời gian TRÌNH DIỄN (VS-1 `slowmo`): chỉ animation/hình/hạt; di chuyển, dự đoán, camera, âm thanh dùng dt thật.
  const pscale = eng.presentationScale(performance.now());
  const vdt = dt * pscale;
  // Hero light (C1): công tắc chung + tập đồng đội (đổi khi tổ đội đổi).
  const heroOn = heroRimOn();
  if (heroParams.enabled.value !== (heroOn ? 1 : 0)) heroParams.enabled.value = heroOn ? 1 : 0;
  const party = get().party;
  if (!heroOn) eng.ents.heroSids = null;
  else if (eng.heroPartyRef !== party || !eng.ents.heroSids) {
    eng.heroPartyRef = party;
    eng.ents.heroSids = new Set(party?.members.map((m) => m.sid).filter(Boolean) ?? []);
  }
  if (me) {
    // Đối số đầu LUÔN là dt thật (nội suy vị trí người khác/quái, hover, hộ tống, animation của thực thể không phải mình); `vdt` chỉ cho animation nhân vật mình.
    eng.ents.update(
      dt,
      eng.view,
      { x: rp.x, y: rp.y, z: rp.z, yaw: eng.facing, speed: eng.speed, airborne: !eng.cur.grounded && !eng.cur.flying },
      eng.targetId,
      myLevel,
      vdt,
    );
  }
  eng.ents.syncHero();
  if (me) eng.steps?.update(eng.ents, eng.sid, rp, !eng.cur.grounded && !eng.cur.flying);
  eng.scape?.update(rp.x, rp.z, now / 1000);
  if (eng.questMarkersDirty) {
    eng.questMarkersDirty = false;
    eng.ents.updateQuestMarkers(get().quests, myLevel, pathOf(get().method?.method)?.id);
  }
  if (me) eng.vfx.trails.update(dt, eng.ents.players, eng.sid, eng.camera);
  eng.suyFx?.update();
  eng.skillFx?.update(dt, pscale);
  if (me) eng.realmAura?.update(dt);
  if (me) eng.pathAura?.update(dt);
  if (me) updateGrass(eng, dt, rp);
  eng.vfx.update(dt, pscale);
  eng.post?.update(dt);
  updateCamera(eng, dt);
  setListener(rp.x, rp.z, eng.camYaw);
  // Camera chéo: bóng ôm khung hình nên tâm bóng là điểm camera nhìn (người + dẫn trước), và rộng thêm theo khoảng cách camera lúc ngự kiếm.
  const isoLook = eng.iso?.applied ? eng.iso.look : null;
  if (isoLook) eng.env.setIso(true, eng.iso!.distCur / ISO_DIST);
  eng.env.update(dt, eng.camera, isoLook ?? rp);
  if (eng.riftMood) updateRiftMood(eng, dt, rp.z, rp.x);
  if (levelId() === 'gioi_tri') updateFaceMood(eng, dt);
  eng.aurora?.update(eng.camera.position);
  updateEclipse(eng, dt);
  eng.lanterns?.update(_v.set(rp.x, rp.y, rp.z));
  if (me) eng.ambient.update(dt, eng.camera.position, rp);
  if (me) eng.butterflies?.update(dt, rp);
  if (eng.mapVis && me) {
    const st = get();
    eng.mapVis.setOpen(st.tele.open);
    eng.mapVis.setMarks(st.marks);
    eng.mapVis.setQuests(st.quests);
    eng.mapVis.update(rp, st.tele.cast, performance.now(), TELE_CAST_MS);
    eng.mapVis.updateSpirit(rp, st.spirit, st.spiritScan, performance.now());
  }
  updateSoulVis(eng, dt, me);
  // Lĩnh vực (E4-K): vòng nhạt dưới chân mình từ Nguyên Anh trung kỳ.
  const dr = me ? domainRadius(get().char?.level ?? 0) : 0;
  if (dr > 0 || eng.cloneVis)
    ensureCloneVis(eng).setDomain(dr > 0 && me && (me.fl & PF_DEAD) === 0 ? { x: eng.renderPos.x, z: eng.renderPos.z, r: dr } : null);
  eng.cloneVis?.update(dt, eng.renderPos.x, eng.renderPos.z);
  for (const disc of eng.gateDiscs) {
    // Cổng gương nguyệt (vành + trụ đá) đứng yên, không lắc và không nhấp nháy như đĩa cổng.
    if (disc.name === 'moon-gate') continue;
    // Đĩa của cổng gương nguyệt không lắc: lắc thì mép chui qua gờ gương và bị cắt chiều sâu.
    if (!disc.userData.still) disc.rotation.y = Math.sin(now * 0.0006) * 0.15;
    const dmat = disc.material as THREE.MeshBasicMaterial;
    // Mặt gương nguyệt: độ đục giữ ≥ 0,7, gợn nhẹ và mây phản chiếu trôi chậm (xoay texture).
    dmat.opacity =
      (disc.userData.op ?? 0.55) + Math.sin(now * 0.003) * (disc.userData.still ? 0.08 : disc.userData.op ? disc.userData.op * 0.35 : 0.2);
    if (disc.userData.mirrorTex) (disc.userData.mirrorTex as THREE.Texture).rotation = now * 0.00006;
  }
  tickSkillQueue(eng, now);
  tickCombat(eng, now, me);
  // Cập nhật ma trận cả cảnh MỘT lần mỗi khung (M3-9): để tự động thì mỗi pass (cảnh chính, bóng) duyệt lại
  // toàn bộ cây, kể cả ~60 xương của mỗi nhân vật có xương.
  eng.scene.updateMatrixWorld();
  try {
    eng.post!.render();
    eng.renderFails = 0;
    checkBlankFrame(eng, now);
  } catch (e) {
    // Vẽ ném lỗi liên tục (thiết bị WebGPU hỏng, shader không biên dịch được): cảnh chỉ còn nền đen dù HUD vẫn chạy.
    renderLog.error(e);
    if (++eng.renderFails >= RENDER_FAIL_LIMIT) eng.fallbackToWebGL2('render-error');
  }
  // renderer.info không tự reset (M1-6): lúc này là tổng của MỌI pass trong khung (bóng, cảnh, hậu kỳ).
  const ri = eng.renderer.info.render;
  eng.lastRender.drawCalls = ri.drawCalls ?? ri.calls;
  eng.lastRender.triangles = ri.triangles;
  // Xem trước nhân vật (bảng mở): vẽ sau khi đã chốt số đo của cảnh chính để draw call của nó không lẫn vào.
  eng.charPreview?.tick(dt);
  eng.dmg.update(dt, eng.camera, window.innerWidth, window.innerHeight, eng.ents.labelBoxes);
  eng.lootFly.update(dt);
  if (me && eng.started) eng.offscreen.update(eng.camera, window.innerWidth, window.innerHeight, rp);

  eng.fpsAcc += dt;
  eng.fpsFrames++;
  const cpu = performance.now() - now;
  if (eng.started && downgradeOf(get().quality)) eng.autoQuality.frame(now, cpu); // Vừa/Thấp không tự hạ: khỏi ghi mẫu
  autoQualityTick(eng, now);
  eng.cpuAcc += cpu;
  if (cpu > eng.cpuMax) eng.cpuMax = cpu;
  eng.colliderViz?.update(rp.x, rp.z);
  if (now - eng.hudAt > 100) {
    eng.hudAt = now;
    // Lúc tải giữ điểm hồi sinh do prefetch đặt (renderPos có thể chưa khớp vị trí thật).
    if (eng.started) assets.setViewer(rp.x, rp.z);
    syncHud(eng, me);
    eng.props?.setTriangleLoad(eng.lastRender.triangles); // Cực cao: co/nở tầm cây-đá theo tam giác khung vừa vẽ
    eng.music.tick(now, {
      active: eng.started,
      room: get().room,
      x: rp.x,
      z: rp.z,
      flags: me?.fl ?? 0,
      monsters: eng.ents.monsters.values(),
    });
  }
  if (!eng.started && me && eng.terrain.ready && eng.frames > 4) {
    eng.started = true;
    eng.loadStats.worldReady = Math.round(performance.now() - eng.startedAt);
    eng.loadStats.frames = eng.frames;
    loadLog.info(JSON.stringify(eng.loadStats));
    // Chỉ vào game nếu vẫn đang ở màn hình tải (không ghi đè trạng thái lỗi, ví dụ bị đá do đăng nhập trùng).
    if (get().phase === 'loading') set({ phase: 'game' });
    pushLog(t('sys.welcome', { name: me.name }), 'good');
    pushLog(t('ui.help_hint'), 'info');
  }
}

function updateCamera(eng: Game, dt: number): void {
  const rp = eng.renderPos;
  const flying = eng.cur.flying;
  eng.camFrame.update(dt);
  // Camera theo khu: trong cảnh điện ảnh/độ kiếp thì về mặc định (cảnh tự đặt camera), ra khỏi cảnh trôi mượt lại.
  const zw = eng.cine.active || eng.tribScene ? BASE_ZONE : zoneCamera(rp.x, rp.z, eng.zoneWant);
  easeZoneCam(eng.zoneCur, zw, dt);
  const zc = eng.zoneCur;
  // Cận cảnh chiêu tối thượng (K-7): FOV +1,5° trong 80 ms rồi về trong 200 ms, kéo camera gần thêm chút; không chặn điều khiển.
  // Theo công tắc "Rung màn hình" (tắt thì không cận cảnh); cảnh điện ảnh tự đặt camera nên bỏ qua.
  let ultPunch = 0;
  if (eng.ultCamT >= 0) {
    eng.ultCamT += dt;
    ultPunch = eng.shake.enabled && !eng.cine.active ? ultFovAt(eng.ultCamT) : 0;
    if (eng.ultCamT > ULT_FOV.rise + ULT_FOV.fall) eng.ultCamT = -1;
  }
  let pull = 0;
  if (eng.fxPull) {
    const f = eng.fxPull;
    f.t += dt;
    pull = f.amt * Math.min(1, f.t / 0.4) * Math.max(0, Math.min(1, (f.dur - f.t) / 0.6));
    if (f.t >= f.dur) eng.fxPull = null;
  }
  let fovKick = 0;
  if (eng.fxFov) {
    const f = eng.fxFov;
    f.t += dt;
    fovKick = f.amt * Math.min(1, f.t / 0.15) * Math.max(0, Math.min(1, (f.dur - f.t) / 0.6));
    if (f.t >= f.dur) eng.fxFov = null;
  }
  const wantFov = (eng.iso && !eng.cine.active ? ISO_FOV : zc.fov) + ultPunch + fovKick;
  if (Math.abs(eng.camera.fov - wantFov) > 0.01) {
    eng.camera.fov = wantFov;
    eng.camera.updateProjectionMatrix();
  }
  // Khung thẻ chương cộng thêm vào góc của người chơi, không ghi đè camDist/camPitch.
  const want = Math.min(
    70,
    eng.camDist * zc.distMul * (flying ? 1.35 : 1) * eng.camFrame.distMul * (1 - 0.05 * (ultPunch / ULT_FOV.kick)) * (1 + pull),
  );
  eng.camDistCur += (want - eng.camDistCur) * Math.min(1, dt * 6);
  const pitch = Math.max(-0.45, Math.min(1.45, eng.camPitch + zc.pitchAdd + eng.camFrame.pitchAdd));
  const cp = Math.cos(pitch);
  let tx = rp.x;
  // Kiểu FPS: nhìn qua đầu nhân vật để tâm ngắm không bị nhân vật che.
  let ty = rp.y + 1.6;
  let tz = rp.z;
  let cx = tx + Math.sin(eng.camYaw) * cp * eng.camDistCur;
  let cy = ty + Math.sin(pitch) * eng.camDistCur;
  let cz = tz + Math.cos(eng.camYaw) * cp * eng.camDistCur;
  const iso = eng.iso && !eng.cine.active ? eng.iso : null;
  if (iso) {
    // Camera chéo khóa góc: hướng cố định theo bản đồ, nghiêng cố định, khoảng cách khóa (không zoom), dẫn trước nhẹ theo con trỏ.
    eng.camYaw = isoYawFor(levelId());
    const cl = iso.ground ? isoLead(iso.ground.x - rp.x, iso.ground.z - rp.z) : { x: 0, z: 0 };
    // Đang có mục tiêu: dẫn camera về phía nó (kèm một phần con trỏ) để người và mục tiêu cùng nằm trong khung.
    // Chưa chọn mục tiêu mà có boss lớn trong tầm: vẫn đưa boss gần nhất vào khung (người đứng trong vòng của boss không bị cắt boss).
    let frameId =
      eng.targetId && eng.ents.chestOf(eng.targetId, _v) && isoLeadable(Math.hypot(_v.x - rp.x, _v.z - rp.z)) ? eng.targetId : '';
    if (!frameId) {
      let bd = Infinity;
      for (const [id, m] of eng.ents.monsters) {
        const d = Math.hypot(m.x - rp.x, m.z - rp.z);
        if (d < bd && isoFrameBoss(!!MONSTER.get(m.s.t)?.boss, m.model.height, d, m.s.st === MS_DEAD)) {
          bd = d;
          frameId = id;
        }
      }
    }
    const tl = frameId && eng.ents.chestOf(frameId, _v) ? isoLeadTarget(_v.x - rp.x, _v.z - rp.z) : null;
    const ld = tl ? { x: tl.x + cl.x * 0.4, z: tl.z + cl.z * 0.4 } : cl;
    // Kẹp khung: người chơi luôn trong vùng an toàn; mục tiêu cũng trong vùng an toàn (tránh minimap/HUD) nếu thực hiện được, không thì ưu tiên người chơi.
    const top = tl && frameId ? isoTopEq(eng.ents.monsters.get(frameId)?.model.height ?? 0) : 0;
    const safe = tl ? clampLeadFrame(ld.x, ld.z, eng.camYaw, _v.x - rp.x, _v.z - rp.z, top) : clampLeadSafe(ld.x, ld.z, eng.camYaw);
    ld.x = safe.x;
    ld.z = safe.z;
    const kk = Math.min(1, dt * 3);
    iso.lead.x += (ld.x - iso.lead.x) * kk;
    iso.lead.z += (ld.z - iso.lead.z) * kk;
    const wantD = isoDistFor(levelId()) * (flying ? 1.35 : 1) * (1 + pull);
    iso.distCur += (wantD - iso.distCur) * Math.min(1, dt * 6);
    tx = rp.x + iso.lead.x;
    ty = rp.y + 1.0;
    tz = rp.z + iso.lead.z;
    iso.look.set(tx, ty, tz);
    let p = isoCameraPos(tx, ty, tz, iso.distCur, eng.camYaw);
    // Địa hình/vách nằm giữa camera và điểm nhìn: kéo camera lại gần (co ngay, nở từ từ) để không nhìn xuyên mặt vách từ phía sau.
    const need = isoClearScale({ x: tx, y: ty, z: tz }, p, groundAt);
    iso.occ = need < iso.occ ? need : Math.min(need, iso.occ + dt * 0.8);
    if (iso.occ < 1) p = isoCameraPos(tx, ty, tz, iso.distCur * iso.occ, eng.camYaw);
    cx = p.x;
    cy = Math.max(p.y, groundAt(p.x, p.z) + 2);
    cz = p.z;
    if (!iso.baseFar) iso.baseFar = eng.camera.far;
    if (eng.camera.far !== ISO_FAR) {
      eng.camera.far = ISO_FAR;
      eng.camera.updateProjectionMatrix();
    }
  } else if (eng.iso?.baseFar && eng.camera.far !== eng.iso.baseFar) {
    // Cảnh điện ảnh/độ kiếp dùng camera cũ: trả tầm xa gốc.
    eng.camera.far = eng.iso.baseFar;
    eng.camera.updateProjectionMatrix();
  }
  // Không để camera chui xuống đất: kéo lại gần nhân vật.
  for (let i = 0; i < 5 && !iso; i++) {
    const g = groundAt(cx, cz) + 0.7;
    if (cy >= g) break;
    const k = 0.78;
    cx = tx + (cx - tx) * k;
    cz = tz + (cz - tz) * k;
    cy = Math.max(ty + (cy - ty) * k, groundAt(cx, cz) + 0.7 - (4 - i) * 0.5);
  }
  eng.shake.update(dt, _shakePos, _shakeLook);
  const fc = FLAGS.debug ? eng.freeCam : null;
  if (fc) {
    eng.camera.position.set(fc.x, fc.y, fc.z);
    eng.camera.lookAt(fc.tx, fc.ty, fc.tz);
    if (fc.fov && Math.abs(eng.camera.fov - fc.fov) > 0.01) {
      eng.camera.fov = fc.fov;
      eng.camera.updateProjectionMatrix();
    }
    return;
  }
  eng.camera.position.set(cx + _shakePos.x, cy + _shakePos.y, cz + _shakePos.z);
  eng.camera.lookAt(tx + _shakeLook.x, ty + _shakeLook.y, tz + _shakeLook.z);
  const dfx = eng.deathFx.update(dt, ((eng.me()?.fl ?? 0) & PF_DEAD) !== 0);
  deathVisual(eng, dfx, tx, ty, tz);
  if (eng.cine.active) runCine(eng, dt);
  tribFx(eng, dt);
  // Thẻ chương đang hiện cũng ẩn bảng tên (tiêu đề không đè lên tên nhân vật).
  eng.ents.tagsHidden = eng.cine.active || eng.tribScene || (get().chapter?.until ?? 0) > Date.now();
  // Camera chéo: mục tiêu đang khóa (quái còn sống) cũng được giữ không bị vật che.
  const hasTgt = !!iso && !!eng.targetId && eng.targetKind === 'mon' && eng.ents.chestOf(eng.targetId, _v2);
  updateOcclusion(dt, eng.camera.position, _camFocus.set(rp.x, rp.y + 1.2, rp.z), rp.y, iso ? (flying ? 2 : 1) : 0, hasTgt ? _v2 : null);
  // Chuyển vào/ra camera chéo: bán kính ô địa hình và bản đồ bóng đổi theo.
  const isoOn = !!iso;
  if (eng.iso && eng.iso.applied !== isoOn) {
    eng.iso.applied = isoOn;
    eng.terrain.setIso(isoOn);
    eng.env.setIso(isoOn);
  }
  if (iso) {
    eng.camera.updateMatrixWorld();
    iso.project(eng.camera, window.innerWidth, window.innerHeight, groundAt);
    iso.updateVisuals(performance.now() / 1000);
    // Tầm nhìn ~250 m: không vẽ cảnh xa (biển mây, đảo trời, núi nền).
    if (!iso.farHidden) iso.cloudWas = eng.env.cloudSea.group.visible;
    eng.env.cloudSea.group.visible = false;
    if (eng.lacKiemSky) eng.lacKiemSky.group.visible = false;
    if (eng.lacKiemFar) eng.lacKiemFar.group.visible = false;
    iso.farHidden = true;
  } else if (eng.iso?.farHidden) {
    // Iso tạm tắt (cine/độ kiếp): hiện lại cảnh xa mà iso đã ẩn.
    eng.env.cloudSea.group.visible = eng.iso.cloudWas;
    if (eng.lacKiemSky) eng.lacKiemSky.group.visible = true;
    if (eng.lacKiemFar) eng.lacKiemFar.group.visible = true;
    eng.iso.farHidden = false;
  }
}

/** Cỏ rạp theo mình + 5 người/quái gần nhất (chỉ đọc vị trí đã nội suy của EntityManager). */
function updateGrass(eng: Game, dt: number, rp: THREE.Vector3): void {
  const pool = eng.pushPool;
  let n = 0;
  const put = (x: number, y: number, z: number, r: number) => {
    const p = pool[n] ?? (pool[n] = { x: 0, y: 0, z: 0, r: 0 });
    p.x = x;
    p.y = y;
    p.z = z;
    p.r = r;
    n++;
  };
  for (const [sid, v] of eng.ents.players) if (sid !== eng.sid) put(v.x, v.y, v.z, 1.4);
  for (const v of eng.ents.monsters.values()) {
    const r = monsterPushRadius(v.s.st === MS_DEAD, v.model.root.visible, v.barY);
    if (r > 0) put(v.x, v.y, v.z, r);
  }
  eng.pushSelf.x = rp.x;
  eng.pushSelf.y = rp.y;
  eng.pushSelf.z = rp.z;
  pickPushers(eng.pushSelf, pool, eng.pushers, 40, n);
  eng.grass.update(dt, rp, eng.pushers, eng.started ? 1 : 6);
  eng.props?.update(dt, eng.camera.position.x, eng.camera.position.z); // LOD và tầm vẽ theo CAMERA (không theo người chơi): camera cao/xa không còn vẽ prop LOD gần
  eng.lacKiemSky?.update(eng.camera, rp.x, rp.z);
  eng.thienKhuyetSky?.update(performance.now() / 1000);
  eng.vanHaiWow?.update(dt);
  eng.doanMachArt?.update(eng.iso?.applied ? eng.iso.look : eng.camera.position, !!eng.iso?.applied);
  eng.kiemTrungArt?.update(dt);
  eng.phucMachArt?.update(dt);
  eng.kinhNguyetArt?.update(dt);
  eng.thanTangArt?.update(dt);
  eng.xichTanArt?.update(dt);
  eng.bhFar?.update();
  eng.lacKiemFar?.update();
  eng.doKiepArt?.update(dt);
  eng.kimDaArt?.update(dt);
  eng.cardForest?.update(eng.camera.position.x, eng.camera.position.z);
}

/**
 * Chết và hồi sinh (P2-B5): đẩy số của `DeathFx` vào hậu kỳ (mực, khử màu), trôi camera ra sau và lên cao, nổ linh quang
 * khi sống lại. Không đụng cảnh độ kiếp: tribFx chạy sau và chỉ dùng `pulse`; chết lúc kiếp thất bại thì hai lớp chồng nhau.
 */
function deathVisual(eng: Game, d: { ink: number; desat: number; drift: number }, tx: number, ty: number, tz: number): void {
  const fx = eng.deathFx;
  if (fx.died) {
    // Cảnh đang chiếu (mở đầu, boss) nhường chỗ cho cảnh chết.
    eng.cine.skip();
    eng.vfx.burst(_v.set(tx, ty - 1.2, tz), 0x9aa6b8, 1.6, 0.5);
  }
  if (fx.revived) {
    const sid = eng.sid;
    eng.post?.flash(0.22);
    eng.vfx.reviveGlow((out) => eng.ents.chestOf(sid, out));
  }
  postParams.ink.value = d.ink;
  postParams.inkDesat.value = d.desat;
  if (d.drift > 0) {
    const k = d.drift;
    eng.camera.position.x += (eng.camera.position.x - tx) * 0.22 * k;
    eng.camera.position.z += (eng.camera.position.z - tz) * 0.22 * k;
    eng.camera.position.y += 1.6 * k;
    eng.camera.lookAt(tx, ty - 0.6 * k, tz);
  }
}

/**
 * Cảnh độ kiếp (P2-B4): trong lúc cờ PF_TRIBULATION của mình bật, màu toàn cảnh chìm dần sang tối/tím (qua `pulse` của
 * hậu kỳ) rồi trả về khi hết kiếp. Chỉ là lớp hình theo cờ server; cảnh boss đang chiếu thì nhường `pulse` cho cảnh đó.
 */
function tribFx(eng: Game, dt: number): void {
  const on = ((eng.me()?.fl ?? 0) & PF_TRIBULATION) !== 0;
  eng.tribScene = on;
  const was = eng.tribMix;
  eng.tribMix = on ? Math.min(1, was + dt / 2.5) : Math.max(0, was - dt / 1.6);
  if (eng.tribMix === 0 && was === 0) return;
  if (eng.cine.active && eng.cineKind !== 'sect') return;
  const k = eng.tribMix * eng.tribMix * (3 - 2 * eng.tribMix);
  // Trời kiếp: lam đêm ngả chàm, không nhuộm tím cả khung (art bible mục 1: tím dưới 5% khung hình, chỉ là điểm nhấn).
  // Sắc tím để dành cho tia sét và vùng báo trước.
  postParams.pulseColor.value.setRGB(0.2, 0.25, 0.4);
  postParams.pulse.value = 0.62 * k;
}

/** Gửi (và gửi lại nếu server chưa nhận) chiêu đang chờ khi hết GCD/hồi chiêu. */
function tickSkillQueue(eng: Game, now: number): void {
  const q = eng.skillQueue;
  if (q.slot < 0) return;
  const st = get();
  const cdAt = st.cds[eng.bar()[q.slot]?.id ?? ''] ?? 0;
  const slot = q.poll(Date.now(), Math.max(st.gcdAt, cdAt), cdAt > st.gcdAt, eng.ping);
  if (q.slot < 0) set({ queuedSkill: -1 });
  if (slot < 0) return;
  // Không để đánh thường gửi chồng ngay sau chiêu vừa xả.
  eng.lastAttackSend = now;
  fireSkill(eng, slot);
}

/** Tự đánh thường liên tục khi đã chọn mục tiêu và bật auto. */
function tickCombat(eng: Game, now: number, me: PState | undefined): void {
  if (!me || !eng.targetId || eng.skillQueue.slot >= 0) return;
  if (eng.targetKind === 'mon') {
    const m = eng.view.monsters.get(eng.targetId);
    if (!m || m.st === MS_DEAD) {
      eng.clearTarget();
      return;
    }
    if (eng.autoAttack && now - eng.lastAttackSend > 220) {
      const st = get();
      const dead = (me.fl & (PF_DEAD | PF_FLYING | PF_CASTING)) !== 0;
      const dist = Math.hypot(m.x - eng.cur.x, m.z - eng.cur.z);
      if (!dead && Date.now() >= st.gcdAt - 30 && dist < SKILLS[0]!.range + 1) {
        predictSkill(eng, 0, eng.bar()[0] ?? SKILLS[0]!, true);
        eng.lastAttackSend = now;
        eng.faceTargetUntil = now + 600;
        eng.send(C.SKILL, { id: SKILLS[0]!.id, t: eng.targetId, ...eng.iso?.aimMsg() });
      }
    }
  }
}

function reconcile(eng: Game, me: PState): void {
  if (me.seq === eng.lastAck && me.x === eng.lastSx && me.y === eng.lastSy && me.z === eng.lastSz && me.fl === eng.lastFl) return;
  if (me.seq > eng.lastAck && me.seq <= eng.seq) notePing(eng, eng.inputSentAt[me.seq & 127]);
  eng.lastAck = me.seq;
  eng.lastSx = me.x;
  eng.lastSy = me.y;
  eng.lastSz = me.z;
  eng.lastFl = me.fl;
  const base: MoveState = { x: me.x, y: me.y, z: me.z, vy: me.vy, grounded: me.gr, flying: (me.fl & PF_FLYING) !== 0 };
  while (eng.pending.length && eng.pending[0]!.s <= me.seq) eng.pending.shift();
  const ctx = moveCtx(eng, me);
  for (const inp of eng.pending) stepMove(base, inp, ctx);
  const dx = base.x - eng.cur.x;
  const dy = base.y - eng.cur.y;
  const dz = base.z - eng.cur.z;
  const err = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  if (eng.snapToServer || err > 12) {
    eng.snapToServer = false;
    eng.cur = base;
    eng.prev = cloneMoveState(base);
    eng.offset.set(0, 0, 0);
    eng.renderPos.set(base.x, base.y, base.z);
    return;
  }
  if (err > 1e-3) {
    eng.prev.x += dx;
    eng.prev.y += dy;
    eng.prev.z += dz;
    eng.offset.x -= dx;
    eng.offset.y -= dy;
    eng.offset.z -= dz;
  }
  eng.cur = base;
}

function moveCtx(_eng: Game, me: PState): MoveCtx {
  const dead = (me.fl & PF_DEAD) !== 0;
  const soul = get().soul;
  const scouting = (me.fl & PF_SOUL) !== 0 && soul.k === SOUL_SCOUT && !dead;
  return {
    canFly: !dead && (me.fl & PF_TRIBULATION) === 0 && (scouting || canFlyAt(me.lv, me.mp, me.x, me.y, me.z)),
    // Khựng do trúng đòn (S1): server không cho đi trong lúc cờ `PF_STAGGER` bật, dự đoán đứng yên để không bị kéo lại.
    frozen: dead || (me.fl & PF_STAGGER) !== 0,
    speedMul: 1,
    terrain: levelTerrain(),
    collision: collisionOf(levelId()),
    bound: caveBoundOf(LEVELS[levelId()]),
    sky: skyFlightUnlocked(me.lv),
    ghost: scouting ? { x: soul.bx, z: soul.bz, r: SOUL_RANGE } : undefined,
  };
}

function buildInput(eng: Game): MoveInput {
  const k = eng.keys.held;
  const typing = eng.typing();
  let mx = 0;
  let mz = 0;
  let f = 0;
  if (!typing) {
    if (isHeld(k, 'right')) mx += 1;
    if (isHeld(k, 'left')) mx -= 1;
    if (isHeld(k, 'forward')) mz += 1;
    if (isHeld(k, 'back')) mz -= 1;
    if (eng.autorun && mz === 0) mz = 1;
    // Cần ảo (U2-6) thay WASD: cùng ý định (mx, mz theo hướng camera), server chuẩn hóa và quyết định.
    if (eng.touchMove && (eng.touchMove.mx !== 0 || eng.touchMove.mz !== 0)) {
      mx = eng.touchMove.mx;
      mz = eng.touchMove.mz;
    }
    if (isHeld(k, 'up')) f |= eng.wantFly ? IN_UP : IN_JUMP;
    if (isHeld(k, 'down')) f |= IN_DOWN;
  }
  if (eng.wantFly) f |= IN_FLY;
  // Đi bằng chuột phải: cùng ý định mx/mz như WASD (hướng tới đích theo trục camera). WASD hoặc cần ảo hủy đích.
  const iso = eng.iso;
  if (iso?.dest) {
    if (mx !== 0 || mz !== 0 || typing || iso.arrived(eng.cur.x, eng.cur.z)) iso.dest = null;
    else {
      const w = worldToIntent(iso.dest.x - eng.cur.x, iso.dest.z - eng.cur.z, eng.camYaw);
      mx = w.mx;
      mz = w.mz;
    }
  }
  eng.seq++;
  return { s: eng.seq, mx, mz, yaw: eng.camYaw, f };
}

/**
 * Ping ước tính (ms): từ lúc gửi input tới lúc thấy server xác nhận seq đó trong state.
 * Gồm cả chờ tick và nhịp gửi patch của server nên cao hơn RTT thuần; chỉ để gỡ lỗi.
 */
function notePing(eng: Game, sentAt: number | undefined): void {
  if (!sentAt) return;
  const rtt = performance.now() - sentAt;
  if (rtt < 0 || rtt > 5000) return;
  eng.ping = eng.ping ? eng.ping * 0.8 + rtt * 0.2 : rtt;
}

/**
 * Khung đen/trơn liên tục (cảnh không vẽ ra gì dù vòng lặp chạy): chỉ WebGPU, 30 s đầu sau khi vào game.
 * Thu canvas về 24×14 điểm, độ lệch chuẩn độ sáng gần 0 ba lần liên tiếp thì lùi WebGL2.
 * Chạy ngay sau `post.render()` trong cùng tác vụ, lúc đó canvas WebGPU còn đọc được.
 */
function checkBlankFrame(eng: Game, now: number): void {
  if (eng.fellBack || document.hidden || !isWebGPU(eng.renderer)) return;
  if (eng.cine.active || eng.deathFx.active || ((eng.me()?.fl ?? 0) & PF_DEAD) !== 0) {
    eng.blankWatch.reset();
    return;
  }
  if (!eng.blankNextAt) {
    eng.blankNextAt = now + 4000;
    eng.loadedAt = now;
  }
  if (now < eng.blankNextAt || now > eng.loadedAt + 34000) return;
  eng.blankNextAt = now + 1500;
  if (!eng.blankProbe) {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 14;
    eng.blankProbe = c.getContext('2d', { willReadFrequently: true });
  }
  const x = eng.blankProbe;
  if (!x) return;
  try {
    x.drawImage(eng.canvas, 0, 0, 24, 14);
    const d = x.getImageData(0, 0, 24, 14).data;
    const st = frameStats(d);
    eng.lastBlank = { mean: +st.mean.toFixed(1), sd: +st.sd.toFixed(2) };
    if (eng.blankWatch.push(st, eng.lastRender.drawCalls)) {
      gpuLog.error('khung trơn liên tục', eng.lastBlank, 'lỗi:', eng.gpuErrors);
      eng.fallbackToWebGL2('blank-frame');
    }
  } catch {
    /* không đọc được canvas: không kết luận */
  }
}

/** WebGPU mất thiết bị (driver reset, tràn VRAM, GPU bị rút): cảnh đen mà vòng lặp vẫn chạy. */
export function watchGpuDevice(eng: Game): void {
  if (!isWebGPU(eng.renderer)) return;
  const dev = (
    eng.renderer.backend as {
      device?: {
        lost?: Promise<{ reason?: string; message?: string }>;
        addEventListener?: (t: string, f: (e: { error?: { message?: string } }) => void) => void;
      };
    }
  ).device;
  // Lỗi WebGPU không bắt được (validation, shader/pipeline hỏng): ghi lại để bảng F3 và console cho thấy nguyên nhân.
  dev?.addEventListener?.('uncapturederror', (e) => {
    const msg = String(e.error?.message ?? e.error ?? 'unknown').slice(0, 400);
    eng.gpuErrors.push(msg);
    if (eng.gpuErrors.length > 20) eng.gpuErrors.shift();
    gpuLog.error('uncapturederror:', msg);
  });
  void dev?.lost?.then((info) => {
    if (eng.disposed || info?.reason === 'destroyed') return;
    gpuLog.error('device lost:', info?.reason, info?.message);
    eng.fallbackToWebGL2('device-lost');
  });
}

/** Một lần/giây: nghẽn ở Cực cao thì hạ xuống Cao và báo; Cao/Vừa/Thấp là lựa chọn của người chơi nên không tự hạ; bị khóa cũng thôi. */
function autoQualityTick(eng: Game, now: number): void {
  if (!eng.started || now - eng.autoAt < 1000) return;
  eng.autoAt = now;
  const cur = get().quality;
  const next = eng.autoQuality.check(now, cur, get().qualityLock);
  if (!next) return;
  qualityLog.warn(`tự hạ ${cur} → ${next}`);
  eng.setQuality(next);
  pushToast(t('sys.quality_auto_down', { from: t('ui.settings.q.' + cur), to: t('ui.settings.q.' + next) }), 'bad');
}

/** Gợi ý preset theo GPU + máy; chỉ đặt vào store khi khác mức đang dùng. Không tự đổi preset. */
function publishQualityHint(): void {
  const n = navigator as Navigator & { deviceMemory?: number };
  const s = suggestQuality(getGpuHint(), { deviceMemory: n.deviceMemory, cores: n.hardwareConcurrency });
  set({ qualityHint: s !== get().quality ? s : null });
}

export async function describeGpu(eng: Game): Promise<void> {
  if (!isWebGPU(eng.renderer)) {
    eng.gpuInfo = 'WebGL2';
    setGpuHint(null);
    publishQualityHint();
    gpuLog.info(eng.gpuInfo);
    return;
  }
  try {
    const be = eng.renderer.backend as { device?: GPUDevice; adapter?: GPUAdapter };
    const ad = be.adapter ?? (await navigator.gpu?.requestAdapter());
    const i = ad?.info as { vendor?: string; architecture?: string; description?: string; device?: string } | undefined;
    const lim = be.device?.limits ?? ad?.limits;
    const parts = [
      `WebGPU ${i?.vendor ?? '?'} ${i?.architecture ?? ''} ${i?.description || i?.device || ''}`.trim(),
      lim
        ? `tex2D ${lim.maxTextureDimension2D} · layers ${lim.maxTextureArrayLayers} · attach ${lim.maxColorAttachmentBytesPerSample}B · uniform ${lim.maxUniformBufferBindingSize}`
        : '',
      `features ${be.device?.features?.size ?? ad?.features?.size ?? '?'}`,
    ];
    eng.gpuInfo = parts.filter(Boolean).join(' · ');
    setGpuHint({
      webgpu: true,
      vendor: i?.vendor ?? '',
      architecture: i?.architecture ?? '',
      description: `${i?.description ?? ''} ${i?.device ?? ''}`.trim(),
      maxTexture2D: ad?.limits?.maxTextureDimension2D ?? lim?.maxTextureDimension2D ?? 0,
      maxBufferSize: ad?.limits?.maxBufferSize ?? lim?.maxBufferSize ?? 0,
    }); // khả năng của adapter (device chỉ có giới hạn mặc định đã xin)
    publishQualityHint();
  } catch (e) {
    eng.gpuInfo = 'WebGPU (không đọc được adapter: ' + String(e) + ')';
  }
  gpuLog.info(eng.gpuInfo);
}

/** Chọn backend: xem `rendererChoice` (`?renderer=webgl2` chỉ cho lần nạp này). */
export function pickRenderer(_eng: Game, param: string | null): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(RENDERER_KEY);
  } catch {
    /* localStorage bị chặn: coi như chưa lưu lựa chọn backend */
  }
  const c = rendererChoice(param, stored);
  if (c.storage === 'clear') {
    try {
      localStorage.removeItem(RENDERER_KEY);
    } catch {
      /* localStorage bị chặn: không xóa được, lần sau tự chọn lại */
    }
  }
  return c.forceWebGL;
}
