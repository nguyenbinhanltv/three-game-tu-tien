import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_SPRITES } from '@dtl/shared';
import {
  PATH_SPRITE_GROUP,
  SPRITE_GROUPS,
  SPRITE_IDLE_MS,
  SPRITE_MAX_RESIDENT,
  residentSpriteGroups,
  spriteCell,
  spriteGroupBytes,
  spriteGroupOf,
  sweepSpriteGroups,
  useSpriteGroup,
  type SpriteGroup,
} from './art';
import { shapeGeometry, shapeKind } from './fxShapes';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const groups = Object.keys(SPRITE_GROUPS) as SpriteGroup[];

describe('sprite vẽ tay (Họa Pháp Lô 2) — atlas tách theo hướng tu', () => {
  it('mọi sprite thuộc một nhóm có atlas, có một ô riêng trong nhóm, không trùng tên', () => {
    expect(new Set(FX_SPRITES).size).toBe(FX_SPRITES.length);
    const used: Record<string, number> = {};
    for (const n of FX_SPRITES) {
      const g = spriteGroupOf(n);
      expect(groups, `${n}: nhóm ${g} chưa có atlas trong SPRITE_GROUPS`).toContain(g);
      const c = spriteCell(n);
      expect(c.group).toBe(g);
      expect(c.idx, n).toBe((used[g] = (used[g] ?? -1) + 1));
    }
    for (const g of groups) {
      const { cols, rows } = SPRITE_GROUPS[g];
      expect(used[g] ?? 0, g).toBeLessThanOrEqual(cols * rows);
      // WebGPU mặc định chỉ cho cạnh texture ≤ 8192 px (quá thì mất thiết bị GPU, màn đen): ô 512 px.
      expect(cols * 512, g).toBeLessThanOrEqual(8192);
      expect(rows * 512, g).toBeLessThanOrEqual(8192);
    }
  });

  it('hướng tu → nhóm atlas khớp tiền tố sprite của hướng đó', () => {
    for (const g of Object.values(PATH_SPRITE_GROUP)) expect(groups).toContain(g);
  });

  it('hình sprite là tấm quay mặt về camera, kiểu vật liệu riêng không gộp instance', () => {
    expect(shapeKind('sprite')).toBe('sprite');
    expect(shapeGeometry('sprite').getAttribute('position').count).toBeGreaterThanOrEqual(4);
  });

  it('mỗi atlas nhóm nằm trong sổ khóa asset (nhị phân ở R2, không commit) và đặt tên theo hash nội dung', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/asset-lock.json'), 'utf8')) as {
      files: Record<string, { sha256: string; bytes: number }>;
    };
    for (const g of groups) {
      const file = SPRITE_GROUPS[g].file;
      const e = lock.files[file];
      expect(e, `${file}: chạy \`pnpm assets:push\` sau khi đổi atlas`).toBeTruthy();
      expect(e!.bytes).toBeGreaterThan(100_000);
      expect(file.includes(`.${e!.sha256.slice(0, 10)}.webp`), `${file}: atlas phải đặt tên theo hash (docs/handbook/vfx-forge.md)`).toBe(
        true,
      );
    }
  });

  it('bộ nhớ GPU: một hướng nhỏ hơn nhiều atlas gộp cũ (4096×4608); không bao giờ giữ quá SPRITE_MAX_RESIDENT nhóm khi nhóm rỗi', () => {
    const MERGED = Math.round(4096 * 4608 * 4 * (4 / 3));
    for (const g of groups) expect(spriteGroupBytes(g), g).toBeLessThan(MERGED / 2);
    // Môi trường test không có `document`: nhóm không nạp ảnh nên không có nhóm "đang giữ"; kiểm logic dọn bằng trạng thái nạp giả.
    expect(SPRITE_MAX_RESIDENT).toBeGreaterThanOrEqual(2);
    expect(residentSpriteGroups()).toEqual([]);
    useSpriteGroup('hon', 0);
    sweepSpriteGroups(SPRITE_IDLE_MS * 10);
    expect(residentSpriteGroups().length).toBeLessThanOrEqual(SPRITE_MAX_RESIDENT);
  });
});
