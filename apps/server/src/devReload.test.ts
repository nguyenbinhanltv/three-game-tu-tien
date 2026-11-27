import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DIEN_VO_LAYOUT, dienVoSpawnAt } from '@dtl/shared';
import { LAB_SCENES } from '@dtl/content';
import { HOT_LAYOUT_PATH } from '@dtl/content/hot';
import { config } from './config';
import { reloadFile, startDevReload } from './devReload';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const tmp: string[] = [];
function rootWith(rel: string, text: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-hot-'));
  tmp.push(root);
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
  return root;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('devReload: nạp lại dữ liệu tức thì phía server', () => {
  it('chỉ bật theo cờ đăng nhập thử; tắt thì không theo dõi gì', () => {
    expect(startDevReload(false)).toBeNull();
    // Mặc định đi theo config.devBypass (tự tắt ở production hoặc khi có GOOGLE_CLIENT_ID).
    const stop = startDevReload(undefined, rootWith('packages/content/data/lab/scenes.json', '[]'));
    expect(stop === null).toBe(!config.devBypass);
    stop?.();
  });

  it('bật ở máy phát triển thì trả hàm dừng', () => {
    const stop = startDevReload(true, rootWith('packages/content/data/lab/scenes.json', '[]'));
    expect(typeof stop).toBe('function');
    stop?.();
  });

  it('từ chối file ngoài danh sách nóng (luật chơi, phần thưởng, mã nguồn)', () => {
    for (const rel of ['packages/content/data/loot.json', 'packages/content/data/skills.json', 'apps/server/src/config.ts', '../x.json'])
      expect(reloadFile(rel), rel).toMatchObject({ ok: false, kind: null });
  });

  it('cảnh mẫu và bố cục phòng: đọc từ đĩa, vá tại chỗ; file hỏng thì giữ bản cũ', () => {
    const s0 = clone(LAB_SCENES);
    const l0 = clone(DIEN_VO_LAYOUT);
    const relS = 'packages/content/data/lab/scenes.json';
    try {
      expect(reloadFile(relS, rootWith(relS, JSON.stringify([s0[0]]))).ok).toBe(true);
      expect(LAB_SCENES.length).toBe(1);
      expect(reloadFile(relS, rootWith(relS, '[{"id": "dang_ghi_do"')).ok).toBe(false);
      expect(LAB_SCENES.length).toBe(1);

      const next = { ...l0, spawns: { arena: [{ x: 1296, z: 986 }], boss: [] } };
      expect(reloadFile(HOT_LAYOUT_PATH, rootWith(HOT_LAYOUT_PATH, JSON.stringify(next))).ok).toBe(true);
      expect(dienVoSpawnAt(0, 2, false)).toEqual({ x: 1296, z: 986 });
      // Điểm gọi quái ngoài khu: server không nhận.
      const bad = { ...l0, spawns: { arena: [{ x: 1200, z: 900 }], boss: [] } };
      expect(reloadFile(HOT_LAYOUT_PATH, rootWith(HOT_LAYOUT_PATH, JSON.stringify(bad))).ok).toBe(false);
      expect(dienVoSpawnAt(0, 2, false)).toEqual({ x: 1296, z: 986 });
    } finally {
      reloadFile(relS, rootWith(relS, JSON.stringify(s0)));
      reloadFile(HOT_LAYOUT_PATH, rootWith(HOT_LAYOUT_PATH, JSON.stringify(l0)));
    }
    expect(clone(LAB_SCENES)).toEqual(s0);
    expect(clone(DIEN_VO_LAYOUT)).toEqual(l0);
  });
});
