// PROP-1 "Thiên Công Khai Vật": bố cục rải đúng quy tắc (không đè đường đi/vùng quái/điểm nhấn, có asset nguồn, va chạm hợp lệ).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { basePropsOf, THIEN_CONG_PROPS, terrainOf, thienCongColliders } from '@dtl/shared';
import { LEVELS } from './index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MAPS = ['van_lam', 'doan_mach', 'van_hai', 'thien_khuyet', 'bac_hoang'];

describe('thiên công khai vật (PROP-1)', () => {
  it('chỉ bày ở 5 bản đồ đã duyệt, mọi id có meta.json nguồn', () => {
    for (const lv of Object.keys(THIEN_CONG_PROPS)) expect(MAPS, lv).toContain(lv);
    const ids = new Set(Object.values(THIEN_CONG_PROPS).flatMap((l) => l.map((p) => p.id)));
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(fs.existsSync(path.join(ROOT, 'assets/source/prop', id, 'meta.json')), id).toBe(true);
  });

  it.each(MAPS)('%s: trong vùng chơi, không đè điểm nhấn đặt tay, vòng va chạm khớp địa hình', (id) => {
    const lv = LEVELS[id]!;
    const tr = terrainOf(lv);
    const B = tr.playBounds;
    const props = THIEN_CONG_PROPS[id] ?? [];
    for (const p of props) {
      expect(p.x >= B.x0 && p.x <= B.x1 && p.z >= B.z0 && p.z <= B.z1, `${p.id} ngoài vùng chơi`).toBe(true);
      for (const h of basePropsOf(id))
        expect(Math.hypot(p.x - h.x, p.z - h.z), `${p.id} đè prop đặt tay ${h.id}`).toBeGreaterThan(1.2 + (h.r ?? 0));
    }
    const cols = thienCongColliders(id);
    for (const c of cols)
      expect(
        tr.colliders.some((t) => t.x === c.x && t.z === c.z && t.r === c.r),
        'collider chưa vào địa hình',
      ).toBe(true);
  });

  it.each(MAPS)('%s: prop có va chạm không nằm trong bãi quái, điểm tinh anh, cổng, điểm xuất hiện', (id) => {
    const lv = LEVELS[id]!;
    for (const c of thienCongColliders(id)) {
      for (const camp of lv.camps ?? [])
        expect(Math.hypot(c.x - camp.x, c.z - camp.z), `vòng va chạm trong bãi ${camp.id}`).toBeGreaterThan(camp.radius + c.r);
      for (const s of lv.spawns ?? [])
        expect(Math.hypot(c.x - s.x, c.z - s.z), 'vòng va chạm trong điểm tinh anh').toBeGreaterThan(s.radius + c.r);
      for (const p of lv.portals ?? []) expect(Math.hypot(c.x - p.x, c.z - p.z), 'vòng va chạm chặn cổng').toBeGreaterThan(p.r + c.r);
      expect(Math.hypot(c.x - (lv.spawn?.x ?? 0), c.z - (lv.spawn?.z ?? 0)), 'vòng va chạm chặn điểm xuất hiện').toBeGreaterThan(6 + c.r);
    }
  });
});
