import { describe, expect, it } from 'vitest';
import { MS_DEAD, PF_DEAD, PF_FLYING, PF_MEDITATING, SECT } from '@dtl/shared';
import { FootstepDriver, HEAR, PER_FRAME, StepClock, stepVolume, strideFor, WINDOW_MAX } from './footsteps';

describe('StepClock', () => {
  it('phát bước theo quãng đường, không theo thời gian', () => {
    const c = new StepClock();
    c.advance(0, 0, 5, true);
    let steps = 0;
    for (let i = 1; i <= 300; i++) steps += c.advance(i * 0.1, 0, 5, true);
    const expected = 30 / strideFor(5);
    expect(steps).toBeGreaterThanOrEqual(Math.floor(expected));
    expect(steps).toBeLessThanOrEqual(Math.ceil(expected) + 1);
  });
  it('đứng yên hay không đi bộ thì im; dịch chuyển xa không tính', () => {
    const c = new StepClock();
    let n = 0;
    for (let i = 0; i < 100; i++) n += c.advance(0, 0, 0, false);
    expect(n).toBe(0);
    c.advance(0, 0, 5, true);
    expect(c.advance(500, 500, 5, true)).toBe(0);
  });
  it('khung rất dài chỉ phát một bước', () => {
    const c = new StepClock();
    c.advance(0, 0, 5, true);
    expect(c.advance(7, 0, 5, true)).toBe(1);
    expect(c.advance(7.01, 0, 5, true)).toBe(0);
  });
});

describe('stepVolume', () => {
  it('mình cố định; người khác nhỏ dần, hết ở tầm nghe', () => {
    expect(stepVolume(0, true, false)).toBeGreaterThan(stepVolume(5, false, false));
    expect(stepVolume(5, false, false)).toBeGreaterThan(stepVolume(20, false, false));
    expect(stepVolume(HEAR, false, false)).toBe(0);
  });
});

interface P {
  x: number;
  z: number;
  speed: number;
  s: { fl: number; gr?: boolean };
  model?: { plants?: number; plantSense?: boolean };
}
interface M {
  x: number;
  z: number;
  speed: number;
  s: { st: number };
}

function rig(level: 'van_lam' | 'kiem_trung' = 'van_lam') {
  const calls: { name: string; vol: number; at: unknown }[] = [];
  const logs: string[] = [];
  const d = new FootstepDriver(
    level,
    (name, vol, at) => calls.push({ name, vol, at }),
    (m) => logs.push(m),
  );
  const players = new Map<string, P>();
  const monsters = new Map<string, M>();
  /** Chạy `seconds` giây, 60 khung/s; ai có speed > 0 thì đi theo +x với tốc độ `vx`. */
  function run(seconds: number, vx: number, me: P, t0 = 0) {
    for (let f = 0; f < seconds * 60; f++) {
      for (const p of players.values()) if (p.speed > 0) p.x += vx / 60;
      for (const m of monsters.values()) if (m.speed > 0) m.x += vx / 60;
      d.update({ players, monsters }, 'me', me, false, t0 + (f * 1000) / 60);
    }
  }
  return { d, calls, logs, players, monsters, run };
}

describe('FootstepDriver', () => {
  it('mình đi trên sân đá phát step_stone, đúng nhịp', () => {
    const r = rig();
    const me: P = { x: SECT.x - 20, z: SECT.z - 44, speed: 5, s: { fl: 0 } }; // sân chính điện (còn lát đá sau MAP-1; phần khác của đỉnh là cỏ)
    r.players.set('me', me);
    r.run(6, 5, me);
    expect(r.calls.length).toBeGreaterThan(8);
    expect(r.calls.every((c) => c.name === 'step_stone')).toBe(true);
    expect(r.d.stats.local).toBe(r.calls.length);
    expect(r.logs.some((l) => l.includes('stone:mình'))).toBe(true);
  });
  it('bí cảnh là nền đá; bay/thiền/chết/đứng yên thì im', () => {
    const r = rig('kiem_trung');
    const me: P = { x: 900, z: 1000, speed: 5, s: { fl: 0 } };
    r.players.set('me', me);
    r.run(3, 5, me);
    const walked = r.calls.length;
    expect(walked).toBeGreaterThan(3);
    expect(r.calls.every((c) => c.name === 'step_stone')).toBe(true);
    for (const fl of [PF_FLYING, PF_MEDITATING, PF_DEAD]) {
      me.s.fl = fl;
      r.run(2, 5, me, 10000);
    }
    me.s.fl = 0;
    me.speed = 0;
    r.run(2, 5, me, 20000);
    expect(r.calls.length).toBe(walked);
  });
  it('người và quái ở xa hơn tầm nghe thì không phát', () => {
    const r = rig();
    const me: P = { x: SECT.x, z: 2090, speed: 0, s: { fl: 0 } };
    r.players.set('me', me);
    r.players.set('far', { x: SECT.x + HEAR + 30, z: 2090, speed: 5, s: { fl: 0 } });
    r.monsters.set('far', { x: SECT.x - HEAR - 30, z: 2090, speed: 5, s: { st: 1 } });
    r.run(4, 5, me);
    expect(r.calls.length).toBe(0);
  });
  it('giới hạn số nguồn: đông người quanh mình không vượt số bước mỗi khung và mỗi cửa sổ; mình luôn được phát', () => {
    const r = rig();
    const me: P = { x: SECT.x - 20, z: SECT.z - 44, speed: 5, s: { fl: 0 } }; // sân chính điện (còn lát đá sau MAP-1; phần khác của đỉnh là cỏ)
    r.players.set('me', me);
    for (let i = 0; i < 40; i++)
      r.players.set('o' + i, { x: SECT.x - 20 + (i % 8), z: SECT.z - 44 + 2 + Math.floor(i / 8), speed: 5, s: { fl: 0 } });
    for (let i = 0; i < 10; i++) r.monsters.set('m' + i, { x: SECT.x - 23 - i, z: SECT.z - 44 - 4, speed: 5, s: { st: 1 } });
    let perFrameMax = 0;
    let before = 0;
    for (let f = 0; f < 600; f++) {
      for (const p of r.players.values()) p.x += 5 / 60;
      for (const m of r.monsters.values()) m.x += 5 / 60;
      r.d.update({ players: r.players, monsters: r.monsters }, 'me', me, false, (f * 1000) / 60);
      perFrameMax = Math.max(perFrameMax, r.calls.length - before);
      before = r.calls.length;
    }
    // Mỗi khung: tối đa PER_FRAME bước người khác + 1 bước của mình.
    expect(perFrameMax).toBeLessThanOrEqual(PER_FRAME + 1);
    // 10 giây, cửa sổ 120 ms: tối đa WINDOW_MAX bước người khác mỗi cửa sổ.
    expect(r.d.stats.other).toBeLessThanOrEqual(Math.ceil((10000 / 120) * WINDOW_MAX) + WINDOW_MAX);
    expect(r.d.stats.dropped).toBeGreaterThan(0);
    expect(r.d.stats.local).toBeGreaterThan(10);
  });
  it('quái chết không có bước', () => {
    const r = rig();
    const me: P = { x: SECT.x, z: 2090, speed: 0, s: { fl: 0 } };
    r.players.set('me', me);
    r.monsters.set('dead', { x: SECT.x + 3, z: 2090, speed: 5, s: { st: MS_DEAD } });
    r.run(3, 5, me);
    expect(r.calls.length).toBe(0);
  });
});

describe('FootstepDriver: bàn chân thật (CharacterView.plants)', () => {
  const sect = () => ({ x: SECT.x - 20, z: SECT.z - 44 });
  it('model có plantSense: tiếng phát đúng khung số lần chạm đất tăng, không theo quãng đường', () => {
    const r = rig();
    const model = { plants: 0, plantSense: true };
    const me: P = { ...sect(), speed: 5, s: { fl: 0 }, model };
    r.players.set('me', me);
    r.run(0.5, 0, me); // khung đầu chỉ ghi mốc: không có tiếng giả
    expect(r.calls.length).toBe(0);
    // thân đứng yên (không đi quãng đường nào) mà chân chạm đất hai lần ở hai khung khác nhau: đúng hai tiếng, đúng khung đó
    const at = (t: number) => r.d.update({ players: r.players, monsters: r.monsters }, 'me', me, false, t);
    model.plants = 1;
    at(1000);
    expect(r.calls.length).toBe(1);
    at(1016);
    expect(r.calls.length).toBe(1);
    model.plants = 2;
    at(1033);
    expect(r.calls.length).toBe(2);
  });
  it('bước cuối của nhịp dừng (tốc độ đã về 0) vẫn có tiếng; bay/chết/thiền thì im', () => {
    const r = rig();
    const model = { plants: 0, plantSense: true };
    const me: P = { ...sect(), speed: 0, s: { fl: 0 }, model };
    r.players.set('me', me);
    r.run(0.2, 0, me);
    model.plants = 1;
    r.run(0.1, 0, me);
    expect(r.calls.length).toBe(1);
    for (const fl of [PF_FLYING, PF_MEDITATING, PF_DEAD]) {
      me.s.fl = fl;
      model.plants++;
      r.run(0.1, 0, me, 5000);
    }
    expect(r.calls.length).toBe(1);
  });
  it('mất plantSense thì quay về đếm quãng đường; có lại thì không bắn dồn các bước đã bỏ lỡ', () => {
    const r = rig();
    const model = { plants: 0, plantSense: false };
    const me: P = { ...sect(), speed: 5, s: { fl: 0 }, model };
    r.players.set('me', me);
    r.run(3, 5, me);
    const byDistance = r.calls.length;
    expect(byDistance).toBeGreaterThan(3);
    model.plants = 40;
    model.plantSense = true;
    r.run(0.1, 5, me, 10000);
    expect(r.calls.length).toBe(byDistance);
    model.plants = 41;
    r.run(0.1, 5, me, 11000);
    expect(r.calls.length).toBe(byDistance + 1);
  });
  it('người khác ở xa hơn tầm nghe không phát dù model báo chạm đất', () => {
    const r = rig();
    const me: P = { ...sect(), speed: 0, s: { fl: 0 } };
    const model = { plants: 0, plantSense: true };
    r.players.set('me', me);
    r.players.set('far', { x: SECT.x + HEAR + 30, z: SECT.z, speed: 5, s: { fl: 0 }, model });
    r.run(0.1, 0, me);
    model.plants = 3;
    r.run(0.1, 0, me, 100);
    expect(r.calls.length).toBe(0);
  });
});
