// `pnpm i18n:orphans`: chỉ chạy kiểm khóa chuỗi mồ côi (cũng nằm trong `content:check`). Luật ở checkparts/i18nOrphans.ts.
import { errors } from './checkparts/base';
import './checkparts/i18nOrphans';

if (errors.length) {
  console.error(`${errors.length} khóa chuỗi có vấn đề:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Khóa chuỗi: không có khóa mồ côi.');
