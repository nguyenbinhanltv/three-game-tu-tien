import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildItemSources } from './sources';

const file = fileURLToPath(new URL('../data/itemsources.json', import.meta.url));
const text = JSON.stringify(buildItemSources(), null, 1) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== text) {
    console.error('itemsources.json đã cũ: chạy pnpm --filter @dtl/content sources:build');
    process.exit(1);
  }
  console.log('itemsources.json khớp loot.json.');
} else {
  fs.writeFileSync(file, text);
  console.log('Đã ghi', file);
}
