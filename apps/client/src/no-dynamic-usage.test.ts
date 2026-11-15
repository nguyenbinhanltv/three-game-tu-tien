// three r178 (`renderers/common/Attributes.update`) đẩy lại TOÀN BỘ thuộc tính có `usage === DynamicDrawUsage` ở mỗi
// lần vẽ (mỗi pass, mỗi khung), bỏ qua `version` và update range. M6-3 đo giữa đám đông: ~130 MB/giây upload thừa
// (cỏ, lưới địa hình thô, hạt, thanh máu). Cập nhật bộ đệm bằng `needsUpdate = true` (+ `addUpdateRange`) với usage
// mặc định; không dùng `DynamicDrawUsage`/`StreamDrawUsage` hay node TSL `dynamicBufferAttribute`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('bộ đệm GPU', () => {
  it('không dùng usage động (three r178 upload lại cả mảng mỗi lần vẽ)', () => {
    const bad = files(SRC).filter((f) => /DynamicDrawUsage|StreamDrawUsage|[dD]ynamicBufferAttribute/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
