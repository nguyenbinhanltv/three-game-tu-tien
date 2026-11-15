import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { HIT_FEEL } from '@dtl/shared';
import {
  COMBO3_PITCH,
  HIT_PITCH_SPREAD,
  HIT_STOP,
  HIT_STOP_CAP,
  HitQueue,
  SwingGuard,
  SWING_MARGIN,
  hitPitch,
  hitStopOf,
  LAYER_GAIN_CAP,
  layersOf,
  materialOf,
  shakeOf,
  SHAKE_LEVEL,
  ULT_FOV,
  ultFovAt,
  whooshDelay,
  type HitCtx,
} from './hitjuice';

const base: HitCtx = { crit: false, heavy: false, combo3: false, power: 0, ult: false, victimIsMe: false, byMe: true };
const c = (o: Partial<HitCtx>): HitCtx => ({ ...base, ...o });

describe('bảng hit-stop (7.3)', () => {
  it('đòn thường: mục tiêu 40 ms, người đánh không khựng', () => {
    expect(hitStopOf(c({}))).toEqual({ target: 0.04, attacker: 0 });
  });
  it('đòn 3 liên hoàn hoặc power ≥ 2: 55/30', () => {
    expect(hitStopOf(c({ combo3: true }))).toEqual({ target: 0.055, attacker: 0.03 });
    expect(hitStopOf(c({ power: 2.3 }))).toEqual({ target: 0.055, attacker: 0.03 });
    expect(hitStopOf(c({ power: 1.7 })).target).toBe(0.04);
  });
  it('bạo kích 70/40; bạo kích + nặng và chiêu tối thượng 90/50 (trần)', () => {
    expect(hitStopOf(c({ crit: true }))).toEqual({ target: 0.07, attacker: 0.04 });
    expect(hitStopOf(c({ crit: true, heavy: true }))).toEqual({ target: 0.09, attacker: 0.05 });
    expect(hitStopOf(c({ ult: true }))).toEqual({ target: 0.09, attacker: 0.05 });
  });
  it('mình trúng đòn nặng: 60 ms', () => {
    expect(hitStopOf(c({ victimIsMe: true, heavy: true, byMe: false })).target).toBe(0.06);
    expect(hitStopOf(c({ victimIsMe: true, byMe: false })).target).toBe(0.04);
  });
  it('chỉ mức trên cùng được vượt 70 ms; không mức nào vượt trần 90 ms', () => {
    const all: Partial<HitCtx>[] = [{}, { combo3: true }, { power: 3 }, { crit: true }, { crit: true, heavy: true }, { ult: true }, { heavy: true, victimIsMe: true }];
    for (const o of all) {
      const r = hitStopOf(c(o));
      expect(r.target).toBeLessThanOrEqual(HIT_STOP_CAP);
      expect(r.attacker).toBeLessThanOrEqual(HIT_STOP_CAP);
      if (!o.ult && !(o.crit && o.heavy)) expect(r.target).toBeLessThanOrEqual(0.07);
    }
    expect(HIT_STOP_CAP).toBe(0.09);
  });
  it('người khác ra đòn: người đánh không khựng; hệ số hạng thân chỉ giảm', () => {
    expect(hitStopOf(c({ byMe: false, crit: true })).attacker).toBe(0);
    for (const f of Object.values(HIT_FEEL)) expect(f.stop).toBeLessThanOrEqual(1);
    expect(HIT_STOP.light.attacker).toBe(0);
  });
});

describe('hit-stop trong HitReact', () => {
  it('ghi đè `stop` theo bảng, nhân hệ số hạng thân, kẹp trần 90 ms', async () => {
    const { HitReact } = await import('./hitreact');
    const h = new HitReact([]);
    h.feel = HIT_FEEL.boss;
    h.react({ stop: 0.09 });
    // 0,09 × 0,75 = 67,5 ms: dt 50 ms còn khựng hẳn, dt kế tiếp chỉ khựng nốt 17,5 ms.
    expect(h.update(0.05)).toBeCloseTo(0, 6);
    expect(h.update(0.05)).toBeCloseTo(0.05 - 0.0175, 5);
    const h2 = new HitReact([]);
    h2.hitStop(5);
    expect(h2.update(0.2)).toBeCloseTo(0.2 - 0.09, 5);
  });
  it('đòn thường 40 ms chỉ khựng trong 40 ms', async () => {
    const { HitReact } = await import('./hitreact');
    const h = new HitReact([]);
    h.react({});
    expect(h.update(0.1)).toBeCloseTo(0.06, 5);
  });
});

describe('lệnh bấm trong lúc khựng', () => {
  it('khựng tối đa 90 ms luôn nhỏ hơn cửa sổ hàng đợi chiêu, và hàng đợi nhận phím bất kể hit-stop', async () => {
    const { SkillQueue, QUEUE_WINDOW_MS } = await import('../input/skillQueue');
    expect(HIT_STOP_CAP * 1000).toBeLessThan(QUEUE_WINDOW_MS);
    const q = new SkillQueue();
    // Đang khựng: animation dt = 0 nhưng đồng hồ thật và đầu vào vẫn chạy; bấm khi còn 60 ms tới hết GCD thì vào hàng.
    expect(q.press(2, 1000, 1060)).toBe('queued');
    expect(q.slot).toBe(2);
  });
});

describe('rung camera theo mức (7.3)', () => {
  it('đòn thường của mình trúng không rung; đòn 3 0,12; bạo kích 0,3; tối thượng 0,6; mình trúng nặng 0,5', () => {
    expect(shakeOf(c({}))).toBe(0);
    expect(shakeOf(c({ combo3: true }))).toBe(0.12);
    expect(shakeOf(c({ crit: true }))).toBe(0.3);
    expect(shakeOf(c({ ult: true, crit: true }))).toBe(0.6);
    expect(shakeOf(c({ heavy: true, victimIsMe: true, byMe: false }))).toBe(0.5);
    expect(shakeOf(c({ crit: true, byMe: false }))).toBe(0);
    expect(SHAKE_LEVEL.ult).toBe(0.6);
  });
});

describe('CameraShake có hướng', async () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  });
  const { CameraShake, SHAKE } = await import('./shake');
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();

  it('khung đầu lệch theo hướng đòn', () => {
    const s = new CameraShake();
    s.kick(SHAKE.crit, { x: 3, z: 0 });
    s.update(0.001, p, l);
    // Phần hướng: 0,6 × 0,3 × 0,22 ≈ 0,04 m về +x.
    expect(p.x).toBeGreaterThan(0.03);
    expect(Math.abs(p.z)).toBeLessThan(0.05);
  });
  it('vẫn lấy max khi có hướng; đòn yếu hơn không xoay hướng', () => {
    const s = new CameraShake();
    s.kick(0.5, { x: 1, z: 0 });
    s.kick(0.3, { x: 0, z: 1 });
    s.update(0.001, p, l);
    expect(s.level).toBeCloseTo(0.5, 2);
    expect(p.x).toBeGreaterThan(0.05);
  });
  it('tắt công tắc thì không rung', () => {
    const s = new CameraShake();
    s.setEnabled(false);
    s.kick(0.6, { x: 1, z: 0 });
    expect(s.level).toBe(0);
    s.setEnabled(true);
  });
  it('thời gian tắt của các mức ≈ 0,05 / 0,14 / 0,27 s (decay 2,2/giây)', () => {
    const t = (lv: number) => {
      const s = new CameraShake();
      s.kick(lv);
      let n = 0;
      while (s.level > 0 && n < 1000) {
        s.update(0.001, p, l);
        n++;
      }
      return n / 1000;
    };
    expect(t(SHAKE_LEVEL.combo3)).toBeCloseTo(0.055, 1);
    expect(t(SHAKE_LEVEL.crit)).toBeCloseTo(0.14, 1);
    expect(t(SHAKE_LEVEL.ult)).toBeCloseTo(0.27, 1);
  });
});

describe('âm đòn', () => {
  it('pitch trong 0,92–1,08; đòn 3 cao hơn một bậc (+6%)', () => {
    for (let i = 0; i <= 20; i++) {
      const r = hitPitch(false, i / 20);
      expect(r).toBeGreaterThanOrEqual(1 - HIT_PITCH_SPREAD - 1e-9);
      expect(r).toBeLessThanOrEqual(1 + HIT_PITCH_SPREAD + 1e-9);
    }
    expect(hitPitch(false, 0)).toBeCloseTo(0.92, 6);
    expect(hitPitch(false, 1)).toBeCloseTo(1.08, 6);
    expect(hitPitch(true, 0.5)).toBeCloseTo(COMBO3_PITCH, 6);
  });
  it('tiếng vung ở hitAt − 0,08 s, không âm', () => {
    expect(whooshDelay(0.26)).toBeCloseTo(0.18, 6);
    expect(whooshDelay(0.06)).toBe(0);
  });
  it('lớp âm theo chất liệu/công pháp, bạo kích luôn có kim khí, tổng không quá +3 dB', () => {
    expect(materialOf({ model: 'ape', elem: 'tho' })).toBe('stone');
    expect(materialOf({ model: 'fox', elem: 'kim' })).toBe('metal');
    expect(materialOf({ model: 'wolf', elem: 'moc' })).toBe('flesh');
    expect(materialOf(undefined)).toBe('flesh');
    expect(layersOf({ material: 'flesh', crit: false, strong: false })).toEqual([]);
    expect(layersOf({ material: 'flesh', crit: true, strong: false }).map((x) => x.sfx)).toContain('crit');
    expect(layersOf({ material: 'stone', crit: false, strong: false }).map((x) => x.sfx)).toContain('impact');
    expect(layersOf({ method: 'bat_dong_kim_than', material: 'flesh', crit: false, strong: false }).map((x) => x.sfx)).toContain('impact');
    for (const method of [undefined, 'lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh']) {
      for (const material of ['flesh', 'stone', 'metal'] as const) {
        const sum = layersOf({ method, material, crit: true, strong: true }).reduce((a, l) => a + l.gain, 0);
        expect(sum).toBeLessThanOrEqual(LAYER_GAIN_CAP + 1e-9);
      }
    }
  });
});

describe('cận cảnh tối thượng', () => {
  it('FOV +1,5° trong 80 ms rồi về 0 sau 200 ms', () => {
    expect(ultFovAt(0)).toBe(0);
    expect(ultFovAt(ULT_FOV.rise)).toBeCloseTo(1.5, 6);
    expect(ultFovAt(ULT_FOV.rise + ULT_FOV.fall / 2)).toBeCloseTo(0.75, 6);
    expect(ultFovAt(ULT_FOV.rise + ULT_FOV.fall)).toBe(0);
  });
});

describe('hàng đợi theo thời gian game', () => {
  it('khung hit xả đúng việc của người đó, quá hạn thì xả theo đồng hồ game', () => {
    const q = new HitQueue<string>();
    q.push('a', 'a1', 0.45);
    q.push('b', 'b1', 0.45);
    q.push('a', 'a2', 0.45);
    expect(q.has('a')).toBe(true);
    expect(q.release('a')).toEqual(['a1', 'a2']);
    expect(q.size).toBe(1);
    expect(q.tick(0.4)).toEqual([]);
    expect(q.tick(0.06)).toEqual(['b1']);
    expect(q.size).toBe(0);
  });
  it('bước khung tay (dt lớn) vẫn xả đúng một lần', () => {
    const q = new HitQueue<number>();
    q.push('x', 1, 0.1);
    expect(q.tick(5)).toEqual([1]);
    expect(q.tick(5)).toEqual([]);
  });
});

describe('SwingGuard (cờ đang vung tự hết hạn)', () => {
  it('đang vung tới hitAt + dư; hết hạn thì không treo dù không có hit/cancel/end (ngã, bị gỡ)', () => {
    const g = new SwingGuard();
    g.begin('a', 0.26, 1000);
    expect(g.active('a', 1000 + 100)).toBe(true);
    expect(g.active('a', 1000 + (0.26 + SWING_MARGIN) * 1000 - 1)).toBe(true);
    expect(g.active('a', 1000 + (0.26 + SWING_MARGIN) * 1000 + 1)).toBe(false);
    // Sau khi hết hạn, sát thương kế tiếp (DoT, đạn, người vào lại tầm nhìn) không bị giữ.
    expect(g.active('a', 5000)).toBe(false);
  });
  it('hit/cancel xóa ngay; người khác không bị ảnh hưởng', () => {
    const g = new SwingGuard();
    g.begin('a', 0.5, 0);
    g.begin('b', 0.5, 0);
    g.delete('a');
    expect(g.active('a', 10)).toBe(false);
    expect(g.active('b', 10)).toBe(true);
    expect(g.active('zzz', 10)).toBe(false);
  });
});
