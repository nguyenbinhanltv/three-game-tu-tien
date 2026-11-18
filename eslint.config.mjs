// ESLint (R-9a): chỉ luật ranh giới và an toàn, không phải bộ "recommended" (tránh phạt hàng nghìn chỗ cũ).
// Thêm luật mới thì thêm từng nhóm, mỗi nhóm một PR sạch lỗi. Chạy: pnpm lint.
import tseslint from 'typescript-eslint';

const FILES = ['**/*.{ts,tsx,mts,cts}'];
const TESTS = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/tests/**'];

/** Import tương đối xuyên gói (`../../packages/x/src`, `../../../apps/y`): dùng tên gói (`@dtl/shared`...) hoặc `exports` của gói. */
const CROSS_PACKAGE = {
  group: ['**/packages/*/**', '**/apps/*/**'],
  message: 'Không import tương đối xuyên gói: dùng tên gói workspace (@dtl/shared, @dtl/content, @dtl/client...) hoặc đưa hàm thuần xuống packages/shared.',
};

/** Hai chỗ tools còn nhập thẳng mã client (chưa có `exports` cho @dtl/client): ghi nhận ở đây, gỡ khi dời hàm thuần xuống packages/shared (R-5). */
const CLIENT_IMPORT_EXCEPTIONS = ['tools/asset-pipeline/src/terrain-textures.ts', 'tools/audio/walkthrough/route.ts'];

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', 'apps/client/public/**', 'bench/results/**', 'docs/**', 'assets/**', '**/.vite/**', '**/*.d.ts'],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: FILES,
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    // Đăng ký plugin (không bật luật) để các chú thích `eslint-disable @typescript-eslint/...` sẵn có không báo "không thấy luật".
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-restricted-imports': ['error', { patterns: [CROSS_PACKAGE] }],
      // Khối catch rỗng nuốt lỗi âm thầm: ghi log hoặc chú thích lý do bên trong (khối có chú thích không bị tính là rỗng).
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    // Server: mọi dòng log đi qua apps/server/src/log.ts (có mức). Công cụ dòng lệnh (src/tools) và test được in thẳng.
    files: ['apps/server/src/**/*.ts'],
    ignores: ['apps/server/src/log.ts', 'apps/server/src/tools/**', ...TESTS],
    rules: { 'no-console': 'error' },
  },
  {
    // Client: không đọc dữ liệu chỉ của server (bảng rơi đồ) — `monsters.json` vào bundle client (xem CLAUDE.md, no-server-data.test.ts).
    files: ['apps/client/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [CROSS_PACKAGE],
          paths: [{ name: '@dtl/content/loot', message: 'Bảng rơi đồ/linh thạch chỉ dành cho server (loot.json). Client biết món rơi qua tin sys.loot.' }],
        },
      ],
    },
  },
  {
    // Phân tầng client: render/ (đồ họa thuần) và base/ (tầng thấp nhất) không phụ thuộc game/ hay ui/.
    files: ['apps/client/src/render/**/*.{ts,tsx}'],
    ignores: TESTS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            CROSS_PACKAGE,
            { group: ['**/game/**', '../game', '../../game', '**/ui/**'], message: 'render/ không import game/ hay ui/: đưa phần dùng chung xuống src/base/.' },
          ],
          paths: [{ name: '@dtl/content/loot', message: 'Chỉ dành cho server.' }],
        },
      ],
    },
  },
  {
    files: ['apps/client/src/base/**/*.{ts,tsx}'],
    ignores: TESTS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            CROSS_PACKAGE,
            { group: ['**/game/**', '**/ui/**', '**/render/**', '../game', '../render', '../ui'], message: 'base/ là tầng thấp nhất của client: không import game/, render/ hay ui/.' },
          ],
          paths: [{ name: '@dtl/content/loot', message: 'Chỉ dành cho server.' }],
        },
      ],
    },
  },
  {
    files: CLIENT_IMPORT_EXCEPTIONS,
    rules: { 'no-restricted-imports': 'off' },
  },
);
