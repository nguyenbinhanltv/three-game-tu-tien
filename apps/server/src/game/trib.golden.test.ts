import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, S, type HazardMsg } from '@dtl/shared';

// E1-F: độ kiếp Trúc Cơ phải giữ HÀNH VI Y HỆT sau khi đưa hằng số sang `tribulations.json`.
// Chạy toàn bộ 40 s với Math.random cố định, băm mọi vùng sét phát ra (vị trí, kích thước, báo trước, hình; bỏ hạt giống hình ảnh `sd` vì không tất định) và sát thương.
process.env.DB_FILE = ':memory:';

type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => vi.restoreAllMocks());

describe('độ kiếp Trúc Cơ: bản chuẩn hành vi', () => {
  for (const seed of [1, 7, 2026]) {
    it(`toàn bộ 40 s, hạt giống ${seed}`, () => {
      vi.spyOn(Math, 'random').mockImplementation(rng(seed));
      const sent: { type: string; msg: unknown }[] = [];
      const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
      const X = 2040;
      const Z = 2040;
      const sim = new GameSim(new WorldState(), host as never, {
        levelId: 'van_lam',
        roomName: 'test',
        spawn: { x: X, z: Z },
        respawn: { x: X, z: Z },
        persistPosition: false,
      });
      const char = Character.create(7000 + seed, 'gold' + seed);
      char.level = 15;
      char.recalc();
      char.hp = char.mhp = 10_000_000;
      char.mp = char.mmp;
      const p = sim.addPlayer({ sessionId: 'g' + seed, send: () => undefined } as never, char, true, 'g' + seed);
      p.move.x = X;
      p.move.z = Z;
      p.move.y = groundAt(X, Z);
      const priv = sim as unknown as { tickTribulation(p: Ent): void; tickHazards(): void };
      const D = 40;
      sim.now = 1_000_000;
      p.trib = { endAt: sim.now + D * 1000, nextAt: sim.now + 3000, n: 0, fin: false, pills: 0 } as never;
      const t0 = sim.now;
      for (let i = 0; i < D * 20 + 5; i++) {
        char.hp = char.mhp;
        p.s.hp = p.s.mhp;
        priv.tickTribulation(p);
        priv.tickHazards();
        sim.now += 50;
        if (!p.trib) break;
      }
      const rows = sent
        .filter((x) => x.type === S.HAZARD || x.type === S.DMG)
        .map((x) => JSON.stringify([x.type, { ...(x.msg as object), sd: undefined }]));
      if (process.env.TRIB_DUMP) writeFileSync(process.env.TRIB_DUMP + seed, rows.join('\n'));
      const sha = createHash('sha1').update(rows.join('\n')).digest('hex');
      expect({ n: rows.length, ended: !p.trib, t: sim.now - t0, sha }).toMatchSnapshot();
      expect((sent.find((x) => x.type === S.HAZARD)?.msg as HazardMsg).kind).toBe('lightning');
    });
  }
});

// TN-4: Thiên Nhân Ngũ Suy. Người chơi mẫu (tribsuy.testutil.ts) thao tác đúng cả năm ải với Math.random cố định; băm mọi vùng báo,
// sát thương và FX của chuỗi (`suy`, `suymark`, `suyreveal`, `suyok`). Đổi số trong `tribulations.json` hay luật trong tribsuy.ts thì bản chuẩn đổi theo.
describe('Thiên Nhân Ngũ Suy: bản chuẩn hành vi', () => {
  for (const seed of [3, 11, 2026]) {
    it(`cả chuỗi năm ải, hạt giống ${seed}`, async () => {
      const { runSuy } = await import('./tribsuy.testutil');
      const { TRIB_DEFS, TRIB_LEVEL } = await import('@dtl/shared');
      const { LEVELS } = await import('@dtl/content');
      vi.spyOn(Math, 'random').mockImplementation(rng(seed));
      const sent: { type: string; msg: unknown }[] = [];
      const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
      const spawn = LEVELS[TRIB_LEVEL]!.dungeon!.spawn;
      const sim = new GameSim(new WorldState(), host as never, {
        levelId: TRIB_LEVEL,
        roomName: 'tribulation',
        spawn,
        respawn: spawn,
        persistPosition: false,
      });
      const def = TRIB_DEFS.ngu_suy;
      const char = Character.create(7100 + seed, 'suygold' + seed);
      char.level = def.from;
      char.recalc();
      char.hp = char.mhp;
      char.mp = char.mmp;
      const p = sim.addPlayer({ sessionId: 'sg' + seed, send: () => undefined } as never, char, true, 'sg' + seed);
      p.move.x = spawn.x;
      p.move.z = spawn.z;
      p.move.y = groundAt(spawn.x, spawn.z);
      sim.now = 2_000_000;
      const t0 = sim.now;
      expect(sim.beginTribulation(p, def, false)).toBe(true);
      runSuy(sim, p, def.duration + 5, true);
      const rows = sent
        .filter((x) => x.type === S.HAZARD || x.type === S.DMG || (x.type === S.FX && String((x.msg as { t: string }).t).startsWith('suy')))
        .map((x) => JSON.stringify([x.type, { ...(x.msg as object), sd: undefined }]));
      if (process.env.TRIB_DUMP) writeFileSync(process.env.TRIB_DUMP + 'suy' + seed, rows.join('\n'));
      const sha = createHash('sha1').update(rows.join('\n')).digest('hex');
      expect({ n: rows.length, ended: !p.trib, t: sim.now - t0, cleared: char.meta.suy, sha }).toMatchSnapshot();
      expect(char.meta.suy).toBe(def.phases.length);
    });
  }
});

// TN-6: Huyền Kiếp. Người chơi mẫu (tribhuyen.testutil.ts) thao tác đúng cả ba kiếp nhỏ của từng chuỗi với Math.random cố định; băm vùng báo,
// sát thương và FX của chuỗi (`suy` = thanh kiếp lực, `hkmark`, `suyok`). Đổi số trong `tribulations.json` hay luật trong tribhuyen.ts thì bản chuẩn đổi theo.
describe('Huyền Kiếp: bản chuẩn hành vi', () => {
  for (const id of ['huyen_ngoai', 'huyen_noi', 'huyen_hon'] as const) {
    it(`cả chuỗi ${id}, hạt giống 2026`, async () => {
      const { runHk } = await import('./tribhuyen.testutil');
      const { TRIB_DEFS, TRIB_LEVEL, chainCleared } = await import('@dtl/shared');
      const { LEVELS } = await import('@dtl/content');
      vi.spyOn(Math, 'random').mockImplementation(rng(2026));
      const sent: { type: string; msg: unknown }[] = [];
      const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
      const spawn = LEVELS[TRIB_LEVEL]!.dungeon!.spawn;
      const sim = new GameSim(new WorldState(), host as never, {
        levelId: TRIB_LEVEL,
        roomName: 'tribulation',
        spawn,
        respawn: spawn,
        persistPosition: false,
      });
      const def = TRIB_DEFS[id];
      const char = Character.create(7300 + def.phases.length + id.length, 'hkgold' + id);
      char.level = def.from;
      char.recalc();
      char.hp = char.mhp;
      char.mp = char.mmp;
      const p = sim.addPlayer({ sessionId: 'hg' + id, send: () => undefined } as never, char, true, 'hg' + id);
      p.move.x = spawn.x;
      p.move.z = spawn.z;
      p.move.y = groundAt(spawn.x, spawn.z);
      sim.now = 3_000_000;
      const t0 = sim.now;
      expect(sim.beginTribulation(p, def, false)).toBe(true);
      runHk(sim, p, def.duration + 5, true);
      const rows = sent
        .filter((x) => {
          const t = String((x.msg as { t?: string }).t ?? '');
          return x.type === S.HAZARD || x.type === S.DMG || (x.type === S.FX && (t.startsWith('suy') || t === 'hkmark'));
        })
        .map((x) => JSON.stringify([x.type, { ...(x.msg as object), sd: undefined, src: undefined, dst: undefined }]));
      const sha = createHash('sha1').update(rows.join('\n')).digest('hex');
      expect({ n: rows.length, ended: !p.trib, t: sim.now - t0, cleared: chainCleared(char.meta, def), sha }).toMatchSnapshot();
      expect(chainCleared(char.meta, def)).toBe(def.phases.length);
    });
  }
});
