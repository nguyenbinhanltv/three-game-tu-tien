import { describe, expect, it } from 'vitest';
import { FX_TIMELINE } from '@dtl/content';
import { FX_PALETTE } from '../../render/vfx/palette';
import { EnvFx, ENV_MAX_HERBS, type EnvGate, type EnvHerb } from './envFx';
import type { FxRunner } from './fxTimeline';

function setup(gates: EnvGate[], herbs: EnvHerb[]) {
  const started: string[] = [];
  const actors: unknown[] = [];
  const runner = {
    startAt: (tl: { skill: string }, o: { actor: unknown }) => {
      started.push(tl.skill);
      actors.push(o.actor);
    },
  } as unknown as FxRunner;
  const fx = new EnvFx(runner, { camera: () => ({ position: { x: 0, z: 0 } }), live: () => 0, gates: () => gates, herbs: () => herbs });
  return { fx, started, actors };
}

describe('hình môi trường (HPL2 PR3)', () => {
  it('có timeline và bảng màu cho cổng, linh thảo, hái, hồi sinh', () => {
    for (const k of ['fx_env_gate', 'fx_env_gate_flat', 'fx_env_herb', 'fx_env_gather', 'fx_env_revive'])
      expect(FX_TIMELINE.get(k), k).toBeTruthy();
    expect(FX_PALETTE.env_gate).toBeTruthy();
    expect(FX_PALETTE.env_revive).toBeTruthy();
  });
  it('cổng phát lại theo chu kỳ khi ở gần, bỏ khi xa', () => {
    const near: EnvGate = { id: 'a', x: 10, y: 0, z: 0, flat: false, center: 3.6 };
    const far: EnvGate = { id: 'b', x: 500, y: 0, z: 0, flat: true, center: 3.6 };
    const { fx, started } = setup([near, far], []);
    fx.update(0.3);
    expect(started).toEqual(['fx_env_gate']);
    fx.update(0.3);
    expect(started.length).toBe(1);
    fx.update(1.5);
    expect(started.length).toBe(2);
  });
  it('cổng phẳng dùng timeline riêng', () => {
    const { fx, started } = setup([{ id: 'f', x: 5, y: 0, z: 0, flat: true, center: 3.6 }], []);
    fx.update(0.3);
    expect(started).toEqual(['fx_env_gate_flat']);
  });
  it('điểm hái: tối đa ENV_MAX_HERBS điểm gần nhất, bỏ điểm xa', () => {
    const herbs: EnvHerb[] = Array.from({ length: 12 }, (_, i) => ({ id: 'h' + i, x: 3 + i, y: 0, z: 0 }));
    herbs.push({ id: 'xa', x: 300, y: 0, z: 0 });
    const { fx, started } = setup([], herbs);
    fx.update(0.3);
    expect(started.length).toBe(ENV_MAX_HERBS);
    expect(started.every((k) => k === 'fx_env_herb')).toBe(true);
  });
  it('hái và hồi sinh phát đúng timeline', () => {
    const { fx, started } = setup([], []);
    fx.gather({ id: 'g', x: 1, y: 0, z: 1, chest: 0.6 }, true);
    fx.revive({ id: 'p', x: 0, y: 0, z: 0, chest: 1.15 }, false);
    expect(started).toEqual(['fx_env_gather', 'fx_env_revive']);
  });
  it('hồi sinh bám theo thực thể sống: tin respawn tới trước bản vá vị trí mới nên không chụp toạ độ chỗ chết', () => {
    const { fx, started, actors } = setup([], []);
    const live = { x: 10, y: 0, z: 10, yaw: 0, model: {} };
    // Toạ độ trong EnvPoint là chỗ chết (vị trí cũ); thực thể sống sẽ được dời sang điểm hồi sinh sau đó.
    fx.revive({ id: 'p', x: 10, y: 0, z: 10, chest: 1.15 }, false, live);
    expect(started).toEqual(['fx_env_revive']);
    expect(actors[0]).toBe(live);
    live.x = 500;
    expect((actors[0] as typeof live).x).toBe(500);
  });
  it('timeline hồi sinh dùng at self + follow cho mọi hình để bám thực thể', () => {
    const tl = FX_TIMELINE.get('fx_env_revive')!;
    const meshes = tl.events.filter((e) => e.type === 'mesh') as { at?: string; follow?: boolean }[];
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      expect(m.at).toBe('self');
      expect(m.follow).toBe(true);
    }
  });
});
