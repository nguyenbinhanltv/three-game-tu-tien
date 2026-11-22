import { describe, expect, it } from 'vitest';
import { CUU_KIEU_RAIL, CUU_KIEU_ROAD_HALF, DUONG_THUC_LEVEL, MAX_LEVEL, padsOfLevel, TELE_PAD, terrainOf } from '@dtl/shared';
import { LEVELS, MONSTER, NPC } from './index';

// TN-7: khung bản đồ Thiên Lộ Giới (chương 7): cấp 44–47, mọi quái trong cụm/tinh anh/boss có thật, NPC cấp vé đứng ở trạm, trận truyền tống đủ.
describe('chương 7 Thiên Lộ Giới', () => {
  const L = LEVELS.cuu_kieu!;

  it('level mở từ Dương Thực sơ kỳ, mọi vùng nằm trong 44–47', () => {
    expect(L.minLevel).toBe(DUONG_THUC_LEVEL);
    expect(L.dungeon).toBeUndefined();
    for (const z of L.zones ?? []) {
      expect(z.lvMin, z.id).toBeGreaterThanOrEqual(DUONG_THUC_LEVEL);
      expect(z.lvMax, z.id).toBeLessThanOrEqual(MAX_LEVEL);
    }
    expect((L.zones ?? []).map((z) => z.id)).toEqual(['kieu_dau', 'duong_may', 'bia_lo', 'bac_cuoi']);
  });

  it('quái trong cụm, tinh anh và boss đều có thật; boss thế giới là Kiều Thủ', () => {
    for (const c of L.camps ?? []) expect(MONSTER.has(c.mon), c.id).toBe(true);
    for (const s of L.spawns) expect(MONSTER.has(s.mon), s.mon).toBe(true);
    const boss = L.spawns.filter((s) => MONSTER.get(s.mon)?.boss);
    expect(boss.map((s) => s.mon)).toEqual(['boss_kieu_thu']);
    const camps = L.camps ?? [];
    expect(camps.length).toBeGreaterThanOrEqual(50);
  });

  it('Dẫn Kiều Nhân đứng gần trận của trạm (cấp vé cạnh nơi người chơi đến)', () => {
    const npc = NPC.get('npc_dan_kieu_nhan')!;
    expect(npc.level).toBe('cuu_kieu');
    const tram = TELE_PAD.get('ck_tp_tram')!;
    expect(Math.hypot(npc.x - tram.x, npc.z - tram.z)).toBeLessThan(60);
    expect(Math.hypot(npc.x - L.spawn!.x, npc.z - L.spawn!.z)).toBeLessThan(60);
  });

  it('năm trận truyền tống ck_*: trạm + mỗi vùng một trận', () => {
    const pads = padsOfLevel('cuu_kieu');
    expect(pads.map((p) => p.id).sort()).toEqual(['ck_tp_bac_cuoi', 'ck_tp_bia_lo', 'ck_tp_duong_may', 'ck_tp_kieu_dau', 'ck_tp_tram']);
  });

  it('lan can có va chạm (server chặn đi xuyên) ở mọi trụ trừ các lối băng ngang', () => {
    const cols = terrainOf('cuu_kieu').def.colliders;
    const off = CUU_KIEU_ROAD_HALF + 0.35;
    let posts = 0;
    for (const [fx, fz, yaw, open] of CUU_KIEU_RAIL) {
      for (const side of [-1, 1]) {
        const x = fx + Math.cos(yaw) * off * side;
        const z = fz - Math.sin(yaw) * off * side;
        const hit = cols.some((c) => Math.hypot(c.x - x, c.z - z) < 0.3 && c.r >= 0.5 && c.r <= 0.6);
        expect(hit, `${open ? 'lối mở' : 'trụ'} ${x.toFixed(1)},${z.toFixed(1)}`).toBe(!open);
        if (!open) posts++;
      }
    }
    expect(posts).toBeGreaterThan(300);
  });
});
