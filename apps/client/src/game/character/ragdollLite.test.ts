import { describe, expect, it } from 'vitest';
import { impulseOfTier, RAG_CFG, RAG_JOINTS, RagLite } from './ragdollLite';

const run = (r: RagLite, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) r.update(1 / 60);
};

describe('ragdoll nhẹ (T5)', () => {
  it('không xung thì đứng yên', () => {
    const r = new RagLite();
    run(r, 1);
    expect(r.active).toBe(false);
  });
  it('bị đẩy về trước thì thân cúi, đầu hất ngược; rồi tắt về 0', () => {
    const r = new RagLite();
    r.impulse(1, 0, 1);
    let spine = 0;
    let head = 0;
    for (let i = 0; i < 20; i++) {
      r.update(1 / 60);
      spine = Math.max(spine, r.ang.spine_03[0]);
      head = Math.min(head, r.ang.head[0]);
    }
    expect(spine).toBeGreaterThan(0.05);
    expect(head).toBeLessThan(-0.05);
    run(r, 3);
    expect(r.active).toBe(false);
  });
  it('vung quá đà: có đổi dấu trước khi tắt (lò xo lỏng)', () => {
    const r = new RagLite();
    r.impulse(1, 0, 1);
    let neg = false;
    for (let i = 0; i < 90; i++) {
      r.update(1 / 60);
      if (r.ang.spine_03[0] < -0.005) neg = true;
    }
    expect(neg).toBe(true);
  });
  it('bị đẩy sang trái: hai tay vung đối xứng (roll ngược dấu)', () => {
    const r = new RagLite();
    r.impulse(0, 1, 1);
    run(r, 0.1);
    expect(r.ang.upperarm_l[1] * r.ang.upperarm_r[1]).toBeLessThan(0);
  });
  it('mạnh theo cấp đòn, và kẹp góc tối đa', () => {
    expect(impulseOfTier(0, false, false)).toBeLessThan(impulseOfTier(2, false, false));
    expect(impulseOfTier(undefined, true, false)).toBe(impulseOfTier(2, false, false));
    const r = new RagLite();
    r.impulse(1, 1, 50);
    run(r, 0.3);
    for (const j of RAG_JOINTS) for (const a of r.ang[j]) expect(Math.abs(a)).toBeLessThanOrEqual(RAG_CFG[j].max + 1e-9);
  });
  it('lỏng hơn khi ngã: biên độ lớn hơn và tắt chậm hơn', () => {
    const a = new RagLite();
    const b = new RagLite();
    b.loose = 1;
    a.impulse(1, 0, 1);
    b.impulse(1, 0, 1);
    let pa = 0;
    let pb = 0;
    for (let i = 0; i < 30; i++) {
      a.update(1 / 60);
      b.update(1 / 60);
      pa = Math.max(pa, Math.abs(a.ang.spine_03[0]));
      pb = Math.max(pb, Math.abs(b.ang.spine_03[0]));
    }
    expect(pb).toBeGreaterThanOrEqual(pa);
  });
  it('dt lớn không nổ số', () => {
    const r = new RagLite();
    r.impulse(1, 1, 1.4);
    r.update(0.5);
    for (const j of RAG_JOINTS) for (const a of r.ang[j]) expect(Number.isFinite(a)).toBe(true);
  });
  it('reset', () => {
    const r = new RagLite();
    r.impulse(1, 1, 1);
    r.update(0.05);
    r.reset();
    expect(r.active).toBe(false);
  });
});
