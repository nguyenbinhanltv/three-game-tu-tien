// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import { C, BAR_SIZE, CLONE_UNLOCK_LEVEL } from '@dtl/shared';
import { t } from '@dtl/content';
import { levelId } from '../../base/levelCtx';
import { spotAt } from '../camera/vista';
import { closeTopPanel, get, pushToast, set, setHudPref, togglePanel } from '../../ui/store';
import { closeChapters, toggleChapters, useChapters } from '../../ui/chapters/chaptersStore';
import { unlockAudio } from '../audio/audio';
import { budgetPixelRatio } from '../../render/post';
import { isKeyFor, KEY_ACTIONS, preventsDefault, skillSlot } from '../../input/bindings';
import { QUALITY, WEBGL2_MAX_PIXELS, isWebGPU } from './common';
import { skipCine } from './cine';
import { bindTouch } from './touch';
import { onClick } from './click';
import { pickGround } from '../camera/pickGround';
import type { Game } from '../engine';

/**
 * Tab ẩn: dừng vòng lặp render nhưng giữ kết nối (Colyseus vẫn nhận state qua WebSocket, server
 * tự cho nhân vật đứng yên khi thiếu input). Hiện lại: bắt về vị trí server rồi chạy tiếp.
 */
function setHidden(eng: Game, hidden: boolean): void {
  if (eng.disposed || !eng.renderer) return;
  if (hidden) {
    eng.renderer.setAnimationLoop(null);
    eng.cancelQueuedSkill();
    return;
  }
  eng.lastT = performance.now();
  eng.acc = 0;
  eng.pending.length = 0;
  eng.snapToServer = true;
  eng.renderer.setAnimationLoop(() => eng.frame());
}

export function bindInput(eng: Game): void {
  eng.on(window, 'resize', () => onResize(eng));
  // Chống kẹt phím (luật chi tiết ở `KeyState`): mất focus, đổi tab, rời trang thì xóa sạch tập phím.
  eng.on(window, 'blur', () => eng.keys.clear('blur'));
  eng.on(window, 'focus', () => eng.keys.clear('focus'));
  eng.on(window, 'pagehide', () => eng.keys.clear('pagehide'));
  eng.on(document as unknown as HTMLElement, 'visibilitychange', () => {
    eng.keys.clear('visibility');
    setHidden(eng, document.hidden);
  });
  // Bấm chuột ở bất cứ đâu (kể cả trên HUD) cũng bỏ qua cảnh mở đầu, đúng như gợi ý "bấm phím bất kỳ".
  eng.on(window, 'pointerdown', () => skipCine(eng), { capture: true });
  eng.on(window, 'keydown', (e: KeyboardEvent) => {
    // Bản đồ chương (modal toàn màn) đang mở: chỉ Esc/N đóng nó, mọi phím khác không đi vào game (không chạy, ra chiêu, hủy mục tiêu sau tấm bản đồ).
    if (useChapters.getState().open) {
      if (e.code === 'Escape' || e.code === 'KeyN') {
        e.preventDefault();
        closeChapters();
      }
      return;
    }
    if (!e.repeat) skipCine(eng);
    eng.keys.onDown(e.code, e.altKey, e.repeat);
    onKeyDown(eng, e);
  });
  eng.on(window, 'keyup', (e: KeyboardEvent) => {
    eng.keys.onUp(e.code);
    if (e.code === 'KeyV') eng.spiritHold(false);
  });
  const c = eng.canvas;
  eng.on(c, 'contextmenu', (e: Event) => e.preventDefault());
  bindTouch(eng);
  eng.on(c, 'pointerdown', (e: PointerEvent) => {
    unlockAudio();
    skipCine(eng);
    c.focus();
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (e.pointerType === 'touch') return; // cảm ứng: `engine/touch.ts`
    if (eng.iso) {
      // Camera chéo: chuột phải = đi tới điểm (chỉ ý định, như WASD); chuột trái = chọn/đánh. Không kéo xoay.
      eng.iso.cursor = { x: e.clientX, y: e.clientY };
      if (e.button === 2) {
        eng.iso.project(eng.camera, window.innerWidth, window.innerHeight, pickGround(eng.renderPos));
        const g = eng.iso.ground;
        if (g && !eng.typing()) {
          eng.iso.setDest(g.x, g.z, g.y);
          eng.cancelQueuedSkill();
        }
      } else if (e.button === 0) onClick(eng, e.clientX, e.clientY);
      return;
    }
  });
  eng.on(c, 'pointermove', (e: PointerEvent) => {
    if (eng.iso && e.pointerType !== 'touch') eng.iso.cursor = { x: e.clientX, y: e.clientY };
  });
  eng.on(c, 'pointerleave', () => {
    if (eng.iso) eng.iso.cursor = null;
  });
  eng.on(
    c,
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      eng.camFrame.cancel(); // camera chéo khóa cả khoảng cách: lăn chuột không đổi camera
    },
    { passive: false },
  );
}

export function onResize(eng: Game): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const q = QUALITY[get().quality] ?? QUALITY.medium!;
  // WebGL2 nghẽn GPU ở preset Cao (T6: 25–67 fps ở pixelRatio ~2): hạ ngân sách điểm ảnh xuống bằng preset Vừa.
  const maxPixels = isWebGPU(eng.renderer) ? q.maxPixels : Math.min(q.maxPixels, WEBGL2_MAX_PIXELS);
  eng.renderer.setPixelRatio(budgetPixelRatio(w, h, q.pixelRatio, maxPixels));
  eng.renderer.setSize(w, h);
  eng.camera.aspect = w / h;
  eng.camera.updateProjectionMatrix();
}

function onKeyDown(eng: Game, e: KeyboardEvent): void {
  unlockAudio();
  if (get().phase !== 'game') return;
  if (eng.typing()) return;
  const code = e.code;
  const action = KEY_ACTIONS[code];
  if (action === 'target') {
    e.preventDefault();
    const id = eng.ents.nextTarget(eng.targetId, eng.cur.x, eng.cur.z);
    if (id) eng.setTarget(id, 'mon');
    return;
  }
  if (preventsDefault(code)) e.preventDefault();
  if (e.repeat) return;
  // Camera chéo: Space = né về phía con trỏ (server kiểm hồi, quãng, khung bất tử). Ngự kiếm vẫn dùng Space để bay lên.
  if (eng.iso && code === 'Space' && !eng.wantFly && !eng.cur.flying) {
    eng.send(C.DODGE, eng.iso.aimMsg());
    return;
  }
  eng.keys.press(code);
  // Bắt đầu di chuyển thì hủy chiêu đang chờ (M1-11).
  if (isMoveKey(code, action)) eng.cancelQueuedSkill();
  // Ô chiêu 9, thần thông Kết Đan (E2-E): phím 0 (phím 9 vẫn là pháp bảo phụ).
  if (code === 'Digit0' && !e.shiftKey) {
    if (eng.bar().length > BAR_SIZE) eng.useSkill(BAR_SIZE);
    else pushToast(t('ui.method.empty_slot'), 'info');
    return;
  }
  // Ô chiêu 10, thần thông Hóa Thần (E4-K): phím ` (Backquote; `-` là zoom camera; phím 0 vẫn là ô 9).
  if (code === 'Backquote' && !e.shiftKey) {
    if (eng.bar().length > BAR_SIZE + 1) eng.useSkill(BAR_SIZE + 1);
    else pushToast(t('ui.method.empty_slot'), 'info');
    return;
  }
  // Xuất khiếu trong Tam Trọng Kiếp (E3-L, móc tạm: E3-K sẽ nối phím X thật). Chỉ gửi ý định, server kiểm pha, hồi chiêu.
  // Cùng phím X trong ải Thần Thức Suy (TN-4) là ngưng thần soi lôi ẩn.
  if (
    code === 'KeyX' &&
    !e.shiftKey &&
    (eng.tribId === 'nguyen_anh' || eng.tribId === 'ngu_suy' || eng.tribId.startsWith('huyen_')) &&
    get().tribEnd > Date.now()
  ) {
    eng.send(C.TRIB_SOUL, {});
    return;
  }
  // Phím G: trong Thiên Nhân Kiếp là thế thân của kiếp (E4-D), ngoài kiếp là phân thân thần niệm (E4-K, Hóa Thần).
  // Chỉ gửi ý định; server kiểm cấp, linh lực, hồi chiêu, tần suất, nơi đặt.
  if (code === 'KeyU') {
    eng.vista.dismiss(spotAt(levelId(), eng.renderPos.x, eng.renderPos.z));
    return;
  }
  if (code === 'KeyG' && !e.shiftKey) {
    if (eng.tribId === 'hoa_than' && get().tribEnd > Date.now()) eng.send(C.TRIB_CLONE, {});
    else if ((get().char?.level ?? 0) >= CLONE_UNLOCK_LEVEL) eng.send(C.CLONE, {});
    return;
  }
  const slot = skillSlot(code);
  if (slot >= 0) {
    if (e.shiftKey) {
      // Hàng chiêu bậc cao (E2-G): Shift + số, sau ô 9.
      const tier = BAR_SIZE + 2 + slot;
      if (tier < eng.bar().length) eng.useSkill(tier);
      return;
    }
    if (slot < Math.min(eng.bar().length, BAR_SIZE)) eng.useSkill(slot);
    else if (slot < BAR_SIZE) pushToast(t('ui.method.empty_slot'), 'info');
    else if (slot === BAR_SIZE) eng.useArtifact();
    return;
  }
  if (isKeyFor(code, 'forward') || isKeyFor(code, 'back')) eng.autorun = false;
  switch (action) {
    case 'fly':
      eng.toggleFly();
      break;
    case 'meditate':
      eng.toggleMeditate();
      break;
    case 'interact':
      eng.interact();
      break;
    case 'autorun':
      eng.autorun = !eng.autorun;
      break;
    case 'dash':
      eng.useDash();
      break;
    case 'stance':
      eng.useStance();
      break;
    case 'spirit':
      eng.spiritHold(true);
      break;
    case 'soul':
      eng.soulToggle();
      break;
    case 'bonded':
      eng.useBonded();
      break;
    case 'bag':
      togglePanel('bag');
      break;
    case 'char':
      togglePanel('char');
      break;
    case 'quests':
      togglePanel('quests');
      break;
    case 'method':
      togglePanel('method');
      break;
    case 'party':
      togglePanel('party');
      break;
    case 'map':
      togglePanel('map');
      break;
    case 'journey':
      toggleChapters(); // Bản đồ chương (U2-4)
      break;
    case 'help':
      togglePanel('help');
      break;
    case 'settings':
      togglePanel('settings');
      break;
    case 'chat':
      // Đang thu gọn thì Enter mở lại hẳn (lưu), không chỉ mở tạm để gõ rồi lại thu.
      if (get().chatCollapsed) setHudPref('chatCollapsed', false);
      set({ chatOpen: true });
      break;
    case 'cancel':
      // Esc lần lượt: hủy chiêu đang chờ → đóng bảng/hội thoại → bỏ chọn mục tiêu.
      if (eng.cancelQueuedSkill()) break;
      if (closeTopPanel()) break;
      if (get().npc) set({ npc: null });
      else eng.clearTarget();
      break;
    case 'debug':
      // Bảng F3 chỉ mở ở bản dev hoặc khi URL có ?debug.
      if (eng.debugOk) set({ debugOpen: !get().debugOpen });
      eng.hudAt = 0;
      break;
  }
}

/** Phím làm nhân vật bắt đầu di chuyển. */
function isMoveKey(code: string, action: string | undefined): boolean {
  if (action === 'autorun') return true;
  if (isKeyFor(code, 'forward') || isKeyFor(code, 'back') || isKeyFor(code, 'up')) return true;
  return isKeyFor(code, 'left') || isKeyFor(code, 'right');
}
