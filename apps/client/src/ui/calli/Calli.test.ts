import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { t } from '@dtl/content';
import manifest from '../../base/calliManifest.json';
import { METHOD_SKILLS } from '@dtl/content';
import { calliOf } from '../../base/calli';
import { calliFilesOf } from './Calli';

describe('calliOf', () => {
  it('có ảnh cho cảnh giới và địa danh đã vẽ', () => {
    for (const k of ['realm.16', 'realm.32', 'ui.chapter.sect.title', 'ui.chapter.ch5.title', 'ui.chapter.trib.title']) {
      expect(calliOf(k)?.file, k).toMatch(/\.png$/);
    }
  });
  it('không có ảnh cho chuỗi chưa vẽ hoặc key không tồn tại', () => {
    expect(calliOf('ui.bag')).toBeUndefined();
    expect(calliOf('khong.ton.tai')).toBeUndefined();
  });
  it('chữ trong manifest khớp i18n hiện tại (ảnh không cũ)', () => {
    for (const e of Object.values(manifest as Record<string, { key: string; text: string }>)) expect(e.text).toBe(t(e.key));
  });
});

describe('calliFilesOf (nạp trước thẻ chiêu tối thượng)', () => {
  it('mọi chiêu tối thượng có đúng ảnh trong manifest', () => {
    // Đao tu và Cổ Thần (TN-5, PR1 dữ liệu; chữ Cổ Thần Nhất Kích cũng làm ở PR giao diện) (PR dữ liệu + server): chữ thư pháp của Trảm Sơn Đao làm ở PR giao diện (cần `pnpm calli` với font ngoài repo,
    // font Giao Long không có trong máy này); tới lúc đó thẻ chiêu tối thượng của nó lùi về chữ thường. Xóa ngoại lệ khi ảnh vào manifest.
    const PENDING = new Set(['skl_tram_son_dao', 'skl_co_trieu', 'skl_co_than_nhat_kich', 'skl_mau_don_cam']);
    const keys = METHOD_SKILLS.filter((s) => s.ult && !PENDING.has(s.id)).map((s) => `skill.${s.id}.name`);
    expect(calliFilesOf([...PENDING].map((id) => `skill.${id}.name`))).toEqual([]);
    expect(keys.length).toBeGreaterThan(0);
    const files = calliFilesOf(keys);
    expect(files).toHaveLength(keys.length);
    const known = new Set(Object.values(manifest as Record<string, { file: string }>).map((e) => e.file));
    for (const f of files) expect(known.has(f), f).toBe(true);
  });
  it('bỏ key chưa có ảnh', () => {
    expect(calliFilesOf(['khong.ton.tai', 'ui.bag'])).toEqual([]);
  });
});

describe('tên bộ trang phục', () => {
  it('mọi key set.*.name trong i18n đều có ảnh thư pháp (bộ mới thêm sau không bị sót)', () => {
    const dir = new URL('../../../../../packages/content/data/i18n/', import.meta.url);
    const keys = new Set<string>();
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json'))
        for (const k of Object.keys(JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')))) if (/^set\.[a-z_]+\.name$/.test(k)) keys.add(k);
    }
    expect(keys.size).toBeGreaterThanOrEqual(16);
    for (const k of keys) expect(calliOf(k), k).toBeDefined();
  });
});
