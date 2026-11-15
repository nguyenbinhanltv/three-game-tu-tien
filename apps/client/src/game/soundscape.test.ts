import { describe, expect, it } from 'vitest';
import { SECT } from '@dtl/shared';
import type { SpatialLoop } from './audio';
import { BELL_FIRST, buildSources, KINDS, makeCrackle, pickActive, Soundscape, type SpatialApi, templeBellPartials } from './soundscape';

// Vị trí bầu đèn như SECT_LANTERNS (sect.ts): z = 2080..2118 cách 12 m, x = SECT.x ± 7,5.
const LANTERNS = (() => {
  const out: { x: number; z: number }[] = [];
  for (let z = 2080; z <= 2118; z += 12) for (const sx of [-1, 1]) out.push({ x: SECT.x + sx * 7.5, z });
  return out;
})();

describe('buildSources / pickActive', () => {
  const src = buildSources(LANTERNS);
  it('có đủ ba loại nguồn', () => {
    for (const k of ['lantern', 'water', 'bell'] as const) expect(src.some((s) => s.kind === k)).toBe(true);
  });
  it('chỉ lấy nguồn trong tầm, tối đa `cap` nguồn gần nhất mỗi loại, sắp theo khoảng cách', () => {
    const a = pickActive(src, SECT.x, 2100);
    const lamps = a.filter((x) => x.s.kind === 'lantern');
    expect(lamps.length).toBe(KINDS.lantern.cap);
    for (let i = 1; i < lamps.length; i++) expect(lamps[i].d).toBeGreaterThanOrEqual(lamps[i - 1].d);
    expect(a.every((x) => x.d <= KINDS[x.s.kind].range)).toBe(true);
  });
  it('ở xa thì không có nguồn nào', () => {
    expect(pickActive(src, 100, 100)).toEqual([]);
  });
  it('chuông chỉ nghe trong tầm của nó', () => {
    expect(pickActive(src, SECT.x, 2004 + 100).some((x) => x.s.kind === 'bell')).toBe(true);
    expect(pickActive(src, SECT.x, 2004 + 400).some((x) => x.s.kind === 'bell')).toBe(false);
  });
});

describe('makeCrackle', () => {
  const sr = 24000;
  const a = makeCrackle(sr, 7);
  it('tất định, đỉnh 0,85, RMS vừa đủ nghe, tiếng nổ nổi hẳn lên khỏi nền', () => {
    expect(Array.from(makeCrackle(sr, 7).slice(0, 50))).toEqual(Array.from(a.slice(0, 50)));
    let e = 0;
    let pk = 0;
    for (const v of a) {
      e += v * v;
      pk = Math.max(pk, Math.abs(v));
    }
    const rms = Math.sqrt(e / a.length);
    expect(rms).toBeGreaterThan(0.05);
    expect(rms).toBeLessThan(0.2);
    expect(pk).toBeLessThan(0.86);
    expect(pk).toBeGreaterThan(0.7);
    expect(pk / rms).toBeGreaterThan(4);
  });
  it('vòng lặp liền mạch: bước nhảy ở điểm nối không lớn hơn bước nhảy thường thấy', () => {
    let maxStep = 0;
    for (let i = 1; i < a.length; i++) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]));
    expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThanOrEqual(maxStep);
  });
});

describe('templeBellPartials', () => {
  it('nốt trầm, có bồi âm và tiếng thứ hai nối theo', () => {
    const p = templeBellPartials();
    expect(Math.min(...p.map((x) => x.freq))).toBeLessThan(150);
    expect(p.some((x) => x.delay > 0.5)).toBe(true);
    expect(p.every((x) => x.dur > 0 && x.gain > 0)).toBe(true);
  });
});

function fakeApi() {
  const loops: { kind: string; x: number; z: number; stopped: boolean; gain: number }[] = [];
  const bells: { x: number; z: number; volume: number }[] = [];
  const api: SpatialApi = {
    ready: () => true,
    loop: async (kind, x, z) => {
      const rec = { kind, x, z, stopped: false, gain: 0 };
      loops.push(rec);
      const l: SpatialLoop = { fade: (g) => void (rec.gain = g), stop: () => void (rec.stopped = true) };
      return l;
    },
    bell: (x, z, _o, volume) => {
      bells.push({ x, z, volume });
      return true;
    },
  };
  return { api, loops, bells };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Soundscape', () => {
  it('bật nguồn gần, tắt khi rời xa, ghi nhật ký', async () => {
    const f = fakeApi();
    const logs: string[] = [];
    const sc = new Soundscape(buildSources(LANTERNS), f.api, (m) => logs.push(m));
    sc.update(SECT.x, 2100, 0);
    await flush();
    expect(sc.state().filter((s) => s.kind === 'lantern').length).toBe(KINDS.lantern.cap);
    expect(f.loops.filter((l) => l.kind === 'crackle').length).toBe(KINDS.lantern.cap);
    expect(f.loops.every((l) => l.gain === KINDS.lantern.gain)).toBe(true);
    expect(logs.some((l) => l.includes('+lantern#'))).toBe(true);
    sc.update(100, 100, 1);
    expect(sc.state()).toEqual([]);
    expect(f.loops.every((l) => l.stopped)).toBe(true);
    expect(logs.some((l) => l.includes('-lantern#'))).toBe(true);
  });
  it('chưa mở khóa/tắt tiếng: vẫn ghi nhận nguồn hoạt động nhưng không dựng âm; mở khóa thì dựng bù', async () => {
    let ready = false;
    const f = fakeApi();
    const sc = new Soundscape(buildSources(LANTERNS), { ...f.api, ready: () => ready });
    sc.update(SECT.x, 2100, 0);
    await flush();
    expect(sc.state().length).toBeGreaterThan(0);
    expect(sc.state().every((s) => !s.playing)).toBe(true);
    expect(f.loops.length).toBe(0);
    ready = true;
    sc.update(SECT.x, 2100, 1);
    await flush();
    expect(f.loops.length).toBeGreaterThan(0);
    expect(sc.state().some((s) => s.playing)).toBe(true);
  });
  it('rời đi trong lúc chờ tải: nguồn dựng xong được dừng ngay, không rò', async () => {
    const f = fakeApi();
    const releases: (() => void)[] = [];
    const slow: SpatialApi = {
      ...f.api,
      loop: (k, x, z, o, r) =>
        new Promise((res) => {
          releases.push(() => void f.api.loop(k, x, z, o, r).then(res));
        }),
    };
    const sc = new Soundscape(buildSources(LANTERNS), slow);
    sc.update(SECT.x, 2100, 0);
    sc.update(100, 100, 1);
    for (const r of releases) r();
    await flush();
    await flush();
    expect(f.loops.length).toBeGreaterThan(0);
    expect(f.loops.every((l) => l.stopped)).toBe(true);
  });
  it('chuông xa: lần đầu trong khoảng BELL_FIRST khi đứng trong tầm; ra khỏi tầm rồi quay lại thì hẹn lại', () => {
    const f = fakeApi();
    const sc = new Soundscape(buildSources(LANTERNS), f.api).seed(() => 0.5);
    sc.update(SECT.x, 2100, 0);
    sc.update(SECT.x, 2100, BELL_FIRST[0] - 1);
    expect(f.bells.length).toBe(0);
    sc.update(SECT.x, 2100, BELL_FIRST[1] + 1);
    expect(f.bells.length).toBe(1);
    expect(f.bells[0].volume).toBe(KINDS.bell.gain);
    sc.update(SECT.x, 2100, BELL_FIRST[1] + 2);
    expect(f.bells.length).toBe(1);
    sc.update(100, 100, 200);
    sc.update(SECT.x, 2100, 201);
    expect(f.bells.length).toBe(1);
  });
});
