// Tách từ check.ts (tối ưu Đợt E): final.

import { fileURLToPath } from 'node:url';
import { GLOSSARY } from '../index';

import { err, errors } from './base';
import { checkLoreTerms, scanBannedDir } from '../lore';
// TN-0: ranh giới Tiên Nghịch (docs/handbook/lore-boundary.md). Các bộ thuật ngữ mượn đủ số lượng; không file nào trong
// data/ (dữ liệu game, i18n, level, fx…) chứa tên cấm: nhân vật, nơi khởi đầu, tông môn, pháp bảo trung tâm, tên truyện.
for (const e of checkLoreTerms(GLOSSARY)) err(e);
for (const e of scanBannedDir(fileURLToPath(new URL('../../data/', import.meta.url)))) err(e);

if (errors.length) {
  console.error(`\n${errors.length} lỗi nội dung:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nội dung hợp lệ.');
