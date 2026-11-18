import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Khóa token của UI Kit 2.0: màu chỉ viết ở tokens.css; CSS còn lại chỉ var(--u-*), và mọi biến dùng đều đã khai báo.
const DIR = __dirname;
const css = (f: string) => readFileSync(join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.css'));
const OTHERS = FILES.filter((f) => f !== 'tokens.css');
const NO_FF = OTHERS.filter((f) => f !== 'fonts.css'); // fonts.css khai @font-face (nơi duy nhất có tên font thật)
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(/;

/** CSS của các bảng đã chuyển sang Kit 2.0 (đường dẫn tính từ `ui/`): không màu cứng, danh sách tăng dần theo từng PR U2-3. */
const MIGRATED = ['bag/bag.css', 'character/character.css'];

describe('u2 token', () => {
  it('CSS bảng đã chuyển không có màu cứng và chỉ dùng biến --u-*/--k-* đã khai báo', () => {
    for (const f of MIGRATED) {
      const c = readFileSync(join(DIR, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(c, f).not.toMatch(COLOR);
      const declared = new Set([...readFileSync(join(DIR, 'tokens.css'), 'utf8').matchAll(/(--u-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
      for (const m of c.matchAll(/var\((--u-[a-z0-9-]+)/g)) expect(declared.has(m[1]!), `${f}: ${m[1]}`).toBe(true);
    }
  });
  it('không có màu cứng ngoài tokens.css', () => {
    for (const f of OTHERS) expect(css(f), f).not.toMatch(COLOR);
  });
  it('không border-radius ngoài vòng tròn, không font-family cứng, không đơn vị z-index số', () => {
    for (const f of NO_FF) {
      const c = css(f);
      for (const m of c.matchAll(/border-radius:\s*([^;]+);/g)) expect(m[1]!.trim(), f).toBe('50%');
      for (const m of c.matchAll(/(^|[;{\s])font-family:\s*([^;]+);/g)) expect(m[2], f).toMatch(/^var\(--u-font-/);
      for (const m of c.matchAll(/z-index:\s*([^;]+);/g)) expect(m[1], f).toMatch(/^(var\(--u-z-|[0-3]\b)/);
    }
  });
  it('mọi var(--u-*) được dùng đều đã khai báo trong tokens.css', () => {
    const declared = new Set([...css('tokens.css').matchAll(/(--u-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const f of FILES) for (const m of css(f).matchAll(/@property\s+(--u-[a-z0-9-]+)/g)) declared.add(m[1]); // biến hoạt ảnh nội bộ
    // biến cục bộ của thành phần (đặt ngay trên phần tử, không phải token): --c, --p, --cd, --sz, --qc
    for (const f of FILES)
      for (const m of css(f).matchAll(/var\((--u-[a-z0-9-]+)/g)) expect(declared.has(m[1]!), `${f}: ${m[1]}`).toBe(true);
  });
  it('tiếng Việt: mọi khóa i18n kit dùng đều có', async () => {
    const { hasString } = await import('@dtl/content');
    for (const k of [
      'ui.u2.rarity.5',
      'ui.u2.close',
      'ui.u2.ok',
      'ui.u2.cancel',
      'ui.u2.locked',
      'ui.u2.slot.empty',
      'ui.u2.rarity.0',
      'ui.u2.rarity.4',
    ])
      expect(hasString(k), k).toBe(true);
  }, 30000);
});
