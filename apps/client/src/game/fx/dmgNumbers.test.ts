import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { DamageNumbers } from './vfx';

// Không có DOM trong test: giả đủ phần `DamageNumbers.spawn` dùng.
(globalThis as { document?: unknown }).document = {
  createElement: () => ({ className: '', textContent: '', style: {}, remove() {} }),
};

describe('số sát thương: gom số nhỏ', () => {
  const layer = { appendChild() {} } as unknown as HTMLElement;
  const p = new THREE.Vector3();

  it('số thường liên tiếp lên cùng mục tiêu gom thành một số cộng dồn', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.spawn('7', p, 'hit', 'm1', 7);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]!.el.textContent).toBe('17');
  });
  it('mục tiêu khác, số chí mạng, số nặng không gom', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.spawn('7', p, 'hit', 'm2', 7);
    d.spawn('30!', p, 'crit', 'm1');
    d.spawn('40', p, 'hit hv', 'm1', 40);
    expect(d.items).toHaveLength(4);
  });
  it('quá cửa sổ gom thì bật số mới', () => {
    const d = new DamageNumbers(layer);
    d.spawn('10', p, 'hit', 'm1', 10);
    d.items[0]!.t = 0.5;
    d.spawn('7', p, 'hit', 'm1', 7);
    expect(d.items).toHaveLength(2);
  });
});
