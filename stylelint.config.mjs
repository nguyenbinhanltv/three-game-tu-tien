// Stylelint (U2-9): CSS của client chỉ dùng token --u-* ; mã màu (hex/rgb/hsl/hwb/lab/oklch…) chỉ nằm ở
// apps/client/src/ui/u2/tokens.css. Chạy trong `pnpm lint`. File cũ chưa dọn nằm ở LEGACY_CSS (danh sách chỉ co, xoá dòng khi dọn xong;
// PR cuối của U2-9 làm rỗng). Không thêm file mới vào đó.

/** Miễn trừ vĩnh viễn, có lý do. */
const EXEMPT_CSS = [
  'apps/client/src/ui/u2/tokens.css', // nguồn token duy nhất
];

/** Miễn trừ tạm: đã rỗng (U2-9). Không thêm file vào đây. */
const LEGACY_CSS = [];

export default {
  ignoreFiles: ['**/node_modules/**', '**/dist/**', 'apps/client/public/**', 'docs/**', 'assets/**'],
  rules: {
    'color-no-hex': [true, { message: 'Không viết mã màu hex: dùng var(--u-*) từ ui/u2/tokens.css.' }],
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
      { message: 'Không viết màu hàm (rgb/hsl/…) ngoài tokens.css: dùng var(--u-*), hoặc color-mix(in srgb, var(--u-*) N%, transparent).' },
    ],
  },
  overrides: [
    {
      files: [...EXEMPT_CSS, ...LEGACY_CSS],
      rules: { 'color-no-hex': null, 'function-disallowed-list': null },
    },
  ],
};
