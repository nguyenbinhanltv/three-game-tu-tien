// R-8: tách từ game/engine.ts (hàm nhận `g: Game`, trước là phương thức private của lớp Game).
import { C, PF_DEAD, BAR_SIZE, CLONE_UNLOCK_LEVEL } from '@dtl/shared';
import { t } from '@dtl/content';
import { closeTopPanel, get, pushToast, set, setHudPref, togglePanel, useUI } from '../../ui/store';
import { closeChapters, toggleChapters, useChapters } from '../../ui/chapters/chaptersStore';
import { unlockAudio } from '../audio/audio';
import { budgetPixelRatio } from '../../render/post';
import { isKeyFor, KEY_ACTIONS, preventsDefault, skillSlot } from '../../input/bindings';
import { QUALITY, WEBGL2_MAX_PIXELS, isWebGPU } from './common';
import { skipCine } from './cine';
import { bindTouch } from './touch';
import { onClick } from './click';
import { groundAt } from '../../base/levelCtx';
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
    eng.dragging = false;
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
        eng.iso.project(eng.camera, window.innerWidth, window.innerHeight, groundAt);
        const g = eng.iso.ground;
        if (g && !eng.typing()) {
          eng.iso.setDest(g.x, g.z, g.y);
          eng.cancelQueuedSkill();
        }
      } else if (e.button === 0) onClick(eng, e.clientX, e.clientY);
      return;
    }
    if (eng.controls === 'mouse') {
      if (!eng.locked) {
        // Bấm vào màn hình để bắt đầu nhìn bằng chuột.
        eng.wantLock = true;
        requestLock(eng);
      } else if (e.button === 0) {
        // Đang khóa con trỏ: bấm chuột trái = chọn / đánh thứ gần tâm ngắm nhất (ngắm mềm, không cần chính xác).
        onClick(eng, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight * 0.2);
      }
      return;
    }
    eng.dragging = true;
    eng.dragMoved = 0;
    eng.lastPX = e.clientX;
    eng.lastPY = e.clientY;
    c.setPointerCapture(e.pointerId);
  });
  eng.on(c, 'pointermove', (e: PointerEvent) => {
    if (eng.iso && e.pointerType !== 'touch') eng.iso.cursor = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch' || !eng.dragging) return;
    // Mất pointerup (thả chuột ngoài cửa sổ, Alt+Tab): đồng bộ lại theo nút đang giữ thật.
    if (e.buttons === 0) {
      eng.dragging = false;
      return;
    }
    const dx = e.clientX - eng.lastPX;
    const dy = e.clientY - eng.lastPY;
    eng.lastPX = e.clientX;
    eng.lastPY = e.clientY;
    eng.dragMoved += Math.abs(dx) + Math.abs(dy);
    if (eng.dragMoved > 4) {
      eng.camFrame.cancel();
      eng.camYaw -= dx * 0.0055;
      eng.camPitch = Math.max(-0.45, Math.min(1.45, eng.camPitch + dy * 0.0045));
    }
  });
  eng.on(c, 'pointerup', (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !eng.dragging) return;
    eng.dragging = false;
    try {
      c.releasePointerCapture(e.pointerId);
    } catch {
      /* con trỏ không còn được giữ (đã nhả hoặc sự kiện cũ) */
    }
    if (eng.dragMoved <= 4 && e.button === 0) onClick(eng, e.clientX, e.clientY);
  });
  // Mất capture mà không có pointerup (trình duyệt hủy, đổi cửa sổ): dừng kéo ngay, không chờ pointermove.
  // Sự kiện này đến sau pointerup thường, lúc đó dragging đã là false nên không ảnh hưởng cú bấm.
  eng.on(c, 'lostpointercapture', () => {
    eng.dragging = false;
  });
  eng.on(c, 'pointerleave', () => {
    if (eng.iso) eng.iso.cursor = null;
  });
  eng.on(document as unknown as HTMLElement, 'mousemove', (e: MouseEvent) => {
    if (!eng.locked) return;
    eng.mouseLook(e.movementX, e.movementY);
  });
  eng.on(document as unknown as HTMLElement, 'pointerlockchange', () => {
    eng.locked = document.pointerLockElement === c;
    set({ mouseLook: eng.locked });
    // Người chơi tự thả chuột (Esc): không tự khóa lại cho tới khi họ bấm vào màn hình.
    if (!eng.locked && !eng.selfUnlock) eng.wantLock = false;
    eng.selfUnlock = false;
    eng.dragging = false;
  });
  // Mở bảng, hộp thoại, chat hay khi trọng thương: thả con trỏ để bấm được giao diện; đóng lại thì khóa tiếp.
  eng.listeners.push(
    useUI.subscribe((st) => {
      const need = st.phase !== 'game' || st.windows.length > 0 || !!st.npc || st.chatOpen || (st.flags & PF_DEAD) !== 0;
      if (need === eng.uiNeedsCursor) return;
      eng.uiNeedsCursor = need;
      if (need && eng.locked) {
        eng.selfUnlock = true;
        document.exitPointerLock();
      } else if (!need && eng.wantLock && eng.controls === 'mouse' && !eng.locked) {
        requestLock(eng);
      }
    }),
  );
  eng.on(
    c,
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      eng.camFrame.cancel();
      if (eng.iso) return; // camera chéo khóa cả khoảng cách: lăn chuột không đổi camera
      eng.camDist = Math.max(3, Math.min(70, eng.camDist * (e.deltaY > 0 ? 1.12 : 0.89)));
    },
    { passive: false },
  );
}

function requestLock(eng: Game): void {
  if (eng.uiNeedsCursor) return;
  try {
    const r = eng.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    /* trình duyệt từ chối (chưa có thao tác người dùng): chờ lần bấm sau */
  }
}

export function releaseLock(eng: Game): void {
  eng.wantLock = false;
  if (eng.locked) {
    eng.selfUnlock = true;
    document.exitPointerLock();
  }
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
  if (isMoveKey(eng, code, action)) eng.cancelQueuedSkill();
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
    case 'mouseLock':
      // Alt: thả hoặc khóa lại con trỏ khi đang ở chế độ nhìn bằng chuột.
      e.preventDefault();
      if (eng.controls !== 'mouse') break;
      if (eng.locked) releaseLock(eng);
      else {
        eng.wantLock = true;
        requestLock(eng);
      }
      break;
  }
}

/** Phím làm nhân vật bắt đầu di chuyển. Kiểu 'turn': A/D xoay hướng nhìn nên không tính. */
function isMoveKey(eng: Game, code: string, action: string | undefined): boolean {
  if (action === 'autorun') return true;
  if (isKeyFor(code, 'forward') || isKeyFor(code, 'back') || isKeyFor(code, 'up')) return true;
  return eng.controls !== 'turn' && (isKeyFor(code, 'left') || isKeyFor(code, 'right'));
}
