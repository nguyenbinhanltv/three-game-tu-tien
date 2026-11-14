import { describe, expect, it } from 'vitest';
import { HELD, isHeld, isKeyFor, KEY_ACTIONS, preventsDefault, skillSlot } from './bindings';
import { KEY_LOG_SIZE, KeyState } from './keyboard';
import { QUEUE_MAX_WAIT_MS, QUEUE_WINDOW_MS, SEND_LEAD_MS, SkillQueue } from './skillQueue';

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
    expect(HELD.down).toEqual(['KeyX', 'ShiftLeft']);
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
    expect(q.press(1, 1000, 1000 + SEND_LEAD_MS)).toBe('send');
    expect(q.slot).toBe(-1);
  });

  it('trong 0,4 giây cuối thì giữ lại và gửi khi hết chờ', () => {
    const q = new SkillQueue();
    const ready = 1000 + QUEUE_WINDOW_MS;
    expect(q.press(2, 1000, ready)).toBe('queued');
    expect(q.poll(1100, ready)).toBe(-1);
    expect(q.slot).toBe(2);
    expect(q.poll(ready - SEND_LEAD_MS, ready)).toBe(2);
    expect(q.slot).toBe(-1);
    expect(q.poll(ready + 50, ready)).toBe(-1);
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
    expect(q.poll(1300, 1300)).toBe(4);
  });

  it('cancel và hết hạn', () => {
    const q = new SkillQueue();
    expect(q.cancel()).toBe(false);
    q.press(1, 1000, 1300);
    expect(q.cancel()).toBe(true);
    expect(q.poll(2000, 1300)).toBe(-1);
    // Server kéo dài thời gian chờ mãi: bỏ sau QUEUE_MAX_WAIT_MS.
    q.press(1, 1000, 1300);
    expect(q.poll(1000 + QUEUE_MAX_WAIT_MS + 1, 9999)).toBe(-1);
    expect(q.slot).toBe(-1);
  });
});
