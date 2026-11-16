import { describe, expect, it } from 'vitest';
import { HELD, isHeld, isKeyFor, KEY_ACTIONS, preventsDefault, skillSlot } from './bindings';
import { KEY_LOG_SIZE, KeyState } from './keyboard';
import { MAX_SENDS, QUEUE_MAX_WAIT_MS, QUEUE_WINDOW_MS, RESEND_MS, SERVER_TICK_MS, SkillQueue } from './skillQueue';

describe('bindings', () => {
  it('giữ đúng bảng phím cũ', () => {
    expect(KEY_ACTIONS.Tab).toBe('target');
    expect(KEY_ACTIONS.KeyF).toBe('fly');
    expect(KEY_ACTIONS.KeyB).toBe('bag');
    expect(KEY_ACTIONS.KeyI).toBe('bag');
    expect(KEY_ACTIONS.KeyJ).toBe('quests');
    expect(KEY_ACTIONS.Escape).toBe('cancel');
    expect(KEY_ACTIONS.AltRight).toBe('mouseLock');
    expect(KEY_ACTIONS.F3).toBe('debug');
    expect(HELD.down).toEqual(['ShiftLeft']);
  });

  it('E2-E: V là thần thức, T là bản mệnh pháp bảo, bảng Công pháp chuyển sang K; không phím nào trùng', () => {
    expect(KEY_ACTIONS.KeyV).toBe('spirit');
    expect(KEY_ACTIONS.KeyX).toBe('soul');
    expect(KEY_ACTIONS.KeyT).toBe('bonded');
    expect(KEY_ACTIONS.KeyK).toBe('method');
    expect(Object.values(KEY_ACTIONS).filter((a) => a === 'method')).toHaveLength(1);
  });

  it('phím số → ô chiêu', () => {
    expect(skillSlot('Digit1')).toBe(0);
    expect(skillSlot('Digit6')).toBe(5);
    expect(skillSlot('Digit0')).toBe(-1);
    expect(skillSlot('KeyQ')).toBe(-1);
  });

  it('isHeld/isKeyFor/preventsDefault', () => {
    expect(isHeld(new Set(['NumpadAdd']), 'zoomIn')).toBe(true);
    expect(isHeld(new Set(['KeyW']), 'back')).toBe(false);
    expect(isKeyFor('ShiftLeft', 'down')).toBe(true);
    expect(isKeyFor('KeyW', 'left')).toBe(false);
    expect(preventsDefault('Space')).toBe(true);
    expect(preventsDefault('ArrowUp')).toBe(true);
    expect(preventsDefault('F3')).toBe(true);
    expect(preventsDefault('KeyW')).toBe(false);
  });
});

describe('KeyState', () => {
  const press = (k: KeyState, code: string, alt = false): void => {
    k.onDown(code, alt, false);
    k.press(code);
  };

  it('nhấn hướng ngược chiều thì bỏ hướng cũ', () => {
    const k = new KeyState(() => 0);
    press(k, 'KeyW');
    press(k, 'KeyS');
    expect([...k.held]).toEqual(['KeyS']);
    k.onUp('KeyS');
    expect(k.held.size).toBe(0);
  });

  it('Ctrl/Cmd xóa sạch phím đang giữ', () => {
    const k = new KeyState(() => 0);
    press(k, 'KeyW');
    press(k, 'KeyA');
    k.onDown('ControlLeft', false, false);
    expect(k.has('KeyW')).toBe(false);
    expect(k.has('KeyA')).toBe(false);
  });

  it('chạm Alt không xóa; thả Alt sau tổ hợp Alt+phím thì xóa', () => {
    const k = new KeyState(() => 0);
    press(k, 'KeyW');
    press(k, 'AltLeft');
    k.onUp('AltLeft');
    expect(k.has('KeyW')).toBe(true);
    press(k, 'AltLeft');
    press(k, 'KeyD', true);
    k.onUp('AltLeft');
    expect(k.held.size).toBe(0);
  });

  it('Shift không tính là tổ hợp Alt', () => {
    const k = new KeyState(() => 0);
    press(k, 'KeyW');
    press(k, 'AltLeft');
    k.onDown('ShiftLeft', true, false);
    k.onUp('AltLeft');
    expect(k.has('KeyW')).toBe(true);
  });

  it('nhật ký giữ 8 sự kiện gần nhất, bỏ phím lặp', () => {
    let t = 0;
    const k = new KeyState(() => t++);
    k.onDown('KeyW', false, false);
    k.onDown('KeyW', false, true);
    expect(k.log).toHaveLength(1);
    for (let i = 0; i < 10; i++) k.onUp('KeyQ');
    k.clear('blur');
    expect(k.log).toHaveLength(KEY_LOG_SIZE);
    expect(k.log.at(-1)).toMatchObject({ kind: 'clear', code: 'blur' });
  });
});

describe('SkillQueue', () => {
  it('đã hết chờ thì gửi ngay', () => {
    const q = new SkillQueue();
    expect(q.press(1, 1000, 1000)).toBe('send');
    expect(q.press(1, 1000, 900)).toBe('send');
    expect(q.slot).toBe(-1);
  });

  it('chờ GCD: giữ lại, gửi đúng mốc (không gửi sớm), ở lại tới khi server xác nhận', () => {
    const q = new SkillQueue();
    const ready = 1000 + QUEUE_WINDOW_MS;
    expect(q.press(2, 1000, ready)).toBe('queued');
    expect(q.poll(ready - 1, ready, false)).toBe(-1);
    expect(q.poll(ready, ready, false)).toBe(2);
    // Đã gửi nhưng chưa có S.CD mới: vẫn trong hàng (còn viền sáng), chưa gửi lại ngay.
    expect(q.slot).toBe(2);
    expect(q.poll(ready + 20, ready, false)).toBe(-1);
    // S.CD mới: GCD nhảy lên sau lần gửi → xong.
    expect(q.poll(ready + 30, ready + 1000, false)).toBe(-1);
    expect(q.slot).toBe(-1);
  });

  it('chờ hồi chiêu riêng: gửi muộn hơn mốc một tick (server không nới hồi chiêu)', () => {
    const q = new SkillQueue();
    q.press(3, 1000, 1300);
    expect(q.poll(1300, 1300, true)).toBe(-1);
    expect(q.poll(1300 + SERVER_TICK_MS - 1, 1300, true)).toBe(-1);
    expect(q.poll(1300 + SERVER_TICK_MS, 1300, true)).toBe(3);
  });

  it('server bỏ im lặng: gửi lại sau RESEND_MS, tối đa MAX_SENDS lần rồi bỏ', () => {
    const q = new SkillQueue();
    q.press(1, 1000, 1300);
    let t = 1300;
    const sent: number[] = [];
    for (; t < 1300 + RESEND_MS * (MAX_SENDS + 2); t += 10) if (q.poll(t, 1300, false) >= 0) sent.push(t);
    expect(sent).toEqual(Array.from({ length: MAX_SENDS }, (_, k) => 1300 + k * RESEND_MS));
    expect(q.slot).toBe(-1);
  });

  it('ping cao thì giãn khoảng gửi lại theo ping + một tick', () => {
    const q = new SkillQueue();
    q.press(1, 1000, 1300);
    expect(q.poll(1300, 1300, false, 150)).toBe(1);
    expect(q.poll(1300 + RESEND_MS, 1300, false, 150)).toBe(-1);
    expect(q.poll(1300 + 150 + SERVER_TICK_MS, 1300, false, 150)).toBe(1);
  });

  it('lần gửi lại được nhận thì dừng gửi', () => {
    const q = new SkillQueue();
    q.press(1, 1000, 1300);
    expect(q.poll(1300, 1300, false)).toBe(1);
    expect(q.poll(1300 + RESEND_MS, 1300, false)).toBe(1);
    expect(q.poll(1300 + RESEND_MS + 16, 2400, false)).toBe(-1);
    expect(q.slot).toBe(-1);
  });

  it('còn chờ lâu thì gửi như cũ (server tự từ chối), không đụng hàng đợi', () => {
    const q = new SkillQueue();
    q.press(1, 1000, 1300);
    expect(q.press(3, 1000, 1000 + QUEUE_WINDOW_MS + 1)).toBe('send');
    expect(q.slot).toBe(1);
  });

  it('bấm chiêu khác thì thay chiêu đang chờ', () => {
    const q = new SkillQueue();
    q.press(1, 1000, 1300);
    expect(q.press(4, 1100, 1300)).toBe('queued');
    expect(q.poll(1300, 1300, false)).toBe(4);
  });

  it('cancel và hết hạn', () => {
    const q = new SkillQueue();
    expect(q.cancel()).toBe(false);
    q.press(1, 1000, 1300);
    expect(q.cancel()).toBe(true);
    expect(q.poll(2000, 1300, false)).toBe(-1);
    // Server kéo dài thời gian chờ mãi: bỏ sau QUEUE_MAX_WAIT_MS.
    q.press(1, 1000, 1300);
    expect(q.poll(1000 + QUEUE_MAX_WAIT_MS + 1, 9999, false)).toBe(-1);
    expect(q.slot).toBe(-1);
  });
});
