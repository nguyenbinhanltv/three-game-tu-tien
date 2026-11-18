// ESLint (R-9a): chỉ luật ranh giới và an toàn, không phải bộ "recommended" (tránh phạt hàng nghìn chỗ cũ).
// Thêm luật mới thì thêm từng nhóm, mỗi nhóm một PR sạch lỗi. Chạy: pnpm lint.
import tseslint from 'typescript-eslint';

const FILES = ['**/*.{ts,tsx,mts,cts}'];
const TESTS = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/tests/**'];

/** Import tương đối xuyên gói (`../../packages/x/src`, `../../../apps/y`): dùng tên gói (`@dtl/shared`...) hoặc `exports` của gói. */
const CROSS_PACKAGE = {
  group: ['**/packages/*/**', '**/apps/*/**'],
  message:
    'Không import tương đối xuyên gói: dùng tên gói workspace (@dtl/shared, @dtl/content, @dtl/client...) hoặc đưa hàm thuần xuống packages/shared.',
};

/** Hai chỗ tools còn nhập thẳng mã client (chưa có `exports` cho @dtl/client): ghi nhận ở đây, gỡ khi dời hàm thuần xuống packages/shared (R-5). */
const CLIENT_IMPORT_EXCEPTIONS = ['tools/asset-pipeline/src/terrain-textures.ts', 'tools/audio/walkthrough/route.ts'];


/**
 * U2-1: giao diện chỉ dùng token của UI Kit 2.0 (`apps/client/src/ui/u2/tokens.css`). Cấm hex/rgb/hsl viết thẳng trong chuỗi
 * và `style={{ color: '…' }}` với màu/font/viền cứng (giá trị `var(--u-…)` hoặc biểu thức tính được thì cho qua).
 * File cũ chưa chuyển nằm ở LEGACY_UI_STYLE (danh sách co dần theo U2-2…U2-4, rỗng ở U2-5); file mới không được thêm vào đó.
 */
const STYLE_PROPS = '/^(color|background|backgroundColor|backgroundImage|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|outline|fill|stroke|boxShadow|textShadow|fontFamily|borderRadius|filter)$/';
const UI_STYLE_RULES = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "Literal[value=/(^|[ (,])#[0-9a-fA-F]{3,8}($|[ ),;])|(rgb|hsl)a?[(]/]",
      message: 'Không viết màu cứng trong UI: dùng biến --u-* (ui/u2/tokens.css) qua className hoặc var(--u-…).',
    },
    {
      selector: `JSXAttribute[name.name='style'] Property[key.name=${STYLE_PROPS}][value.type='Literal']:not([value.value=/^var[(]--u-/])`,
      message: 'style={{…}} không được đặt màu/viền/font cứng: thêm lớp CSS dùng token, hoặc truyền var(--u-…).',
    },
  ],
};
/** File UI cũ chưa chuyển sang Kit 2.0 (sinh bằng eslint ở U2-1; chỉ được xóa dòng, không thêm). */
const LEGACY_UI_STYLE = [
  'apps/client/src/ui/character/Overview.tsx',
  'apps/client/src/ui/minimap/draw.ts', // canvas 2D: màu vẽ tay, chuyển ở U2-2 (minimap)
  'apps/client/src/ui/minimap/sprites.ts',
  'apps/client/src/ui/worldmap/WorldMap.tsx',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'apps/client/public/**',
      'bench/results/**',
      'docs/**',
      'assets/**',
      '**/.vite/**',
      '**/*.d.ts',
    ],
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
          paths: [
            {
              name: '@dtl/content/loot',
              message: 'Bảng rơi đồ/linh thạch chỉ dành cho server (loot.json). Client biết món rơi qua tin sys.loot.',
            },
          ],
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
            {
              group: ['**/game/**', '../game', '../../game', '**/ui/**'],
              message: 'render/ không import game/ hay ui/: đưa phần dùng chung xuống src/base/.',
            },
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
            {
              group: ['**/game/**', '**/ui/**', '**/render/**', '../game', '../render', '../ui'],
              message: 'base/ là tầng thấp nhất của client: không import game/, render/ hay ui/.',
            },
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
  {
    files: ['apps/client/src/ui/**/*.{ts,tsx}'],
    ignores: [...TESTS, ...LEGACY_UI_STYLE],
    rules: UI_STYLE_RULES,
  },
);
