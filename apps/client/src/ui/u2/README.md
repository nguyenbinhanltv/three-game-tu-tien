# UI Kit 2.0 "Mặc Kim Giản" (U2-1)

Nền tảng: token, font, họa tiết, thành phần và trang xem. Chưa thay HUD/bảng thật (U2-2…U2-4).

- Xem: `?mute=1&ui=kit` (bản Ngọc Giản cũ còn ở `?ui=ngj`, gỡ ở U2-5).
- Token (MỘT nguồn): `tokens.css`, tiền tố `--u-*`. Màu hex/rgba **chỉ** ở file này. `fonts.css` khai `@font-face`.
- Thành phần: `Panel`/`PanelTitle`/`CloseButton`, `Tabs`, `Button`, `Badge`, `Bar`, `Slot`/`IconFrame`, `Tooltip`, `Dialog`, `Toasts`, `SkillButton`, `InkBanner`; họa tiết SVG ở `patterns.tsx`. Import từ `ui/u2`.
- Quy tắc hình: HUD = sơn mài tối; mọi cửa sổ = giấy ngà; mọi ô/nút/nhãn cùng họ hình vát (`clip-path`), không `border-radius` trừ vòng tròn.
- Khóa: ESLint (`eslint.config.mjs`, `UI_STYLE_RULES`) cấm hex/rgb trong chuỗi và `style={{color:'…'}}` ở `apps/client/src/ui`; `LEGACY_UI_STYLE` liệt kê file cũ chưa chuyển (chỉ được xóa dòng). `tokens.test.ts` kiểm CSS của kit. `node tools/ui/contrast.mjs` kiểm WCAG AA token mới.
- Font: `python tools/fonts/subset_u2.py <thư mục TTF>` (xem docstring); 177 KB woff2 tổng.

## Bảng ánh xạ biến cũ → `--u-*`

| Cũ | Mới |
| --- | --- |
| `--ngj-lacquer`, `--k-night-0` | `--u-ink-1` (HUD), `--u-ink-0` (sâu nhất) |
| `--ngj-lacquer-hi`, `--k-night-2` | `--u-ink-2` |
| `--ngj-gold`, `--k-bronze` | `--u-gold` |
| `--ngj-gold-hi`, `--k-bronze-hi`, `--k-gold` | `--u-gold-hi` / `--u-gold-text` (chữ) |
| `--ngj-gold-lo`, `--k-bronze-lo` | `--u-gold-lo` |
| `--ngj-ivory`, `--k-paper` | `--u-giay` (nền giấy), `--u-chu` (chữ trên tối) |
| `--ngj-ivory-lo`, `--k-paper-2` | `--u-giay-lo` |
| `--ngj-ink`, `--k-text-ink` | `--u-muc` |
| `--ngj-ink-dim`, `--k-text-ink-dim` | `--u-muc-dim` |
| `--k-text`, `--k-text-dim` | `--u-chu`, `--u-chu-dim` |
| `--ngj-jade`, `--k-jade`, `--k-ngoc` | `--u-ngoc` / `--u-ngoc-hi` |
| `--ngj-jade-lo` | `--u-ngoc-lo` |
| `--ngj-crimson`, `--k-cinnabar` | `--u-son` |
| `--ngj-crimson-hi`, `--k-cinnabar-hi` | `--u-son-hi` |
| `--ngj-q0…q4`, `--k-q0…q4` | `--u-q0…q4` (giữ giá trị) |
| `--ngj-line` | `--u-line-2` |
| `--k-cut-s/m/l` | `--u-cut-s/m/l` (6/9/12 px) |
| `--ngj-font-title|body`, `--font-display` | `--u-font-head|body|display` |
