import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe('assetBase', () => {
  it('mọi URL asset đi qua base/assetBase.ts, không dùng BASE_URL hay đường dẫn tuyệt đối cứng', () => {
    const src = path.resolve(__dirname, '..');
    const bad: string[] = [];
    for (const f of walk(src)) {
      if (f.endsWith('assetBase.ts') || f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue;
      const text = fs.readFileSync(f, 'utf8');
      if (
        /import\.meta(\s+as\s+[^)]+\))?\)?\.env\.BASE_URL/.test(text) ||
        /['"`]\/(assets|audio|thien_y|hoa-truc|terrain[\w-]*|sky|map)\//.test(text)
      ) {
        bad.push(path.relative(src, f));
      }
    }
    expect(bad).toEqual([]);
  });
});
