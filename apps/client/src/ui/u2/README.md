# UI Kit 2.0 "Mặc Kim Giản" (U2-1)

Nền tảng: token, font, họa tiết, thành phần và trang xem. Chưa thay HUD/bảng thật (U2-2…U2-4).

- Xem: `?mute=1&ui=kit` (trang xem Ngọc Giản cũ `?ui=ngj` đã gỡ ở U2-5b).
- Token (MỘT nguồn): `tokens.css`, tiền tố `--u-*`. Màu hex/rgba **chỉ** ở file này. `fonts.css` khai `@font-face`.
- Thành phần: `Panel`/`PanelTitle`/`CloseButton`, `Tabs`, `Button`, `Badge`, `Bar`, `Slot`/`IconFrame`, `Tooltip`, `Dialog`, `Toasts`, `SkillButton`, `InkBanner`; họa tiết SVG ở `patterns.tsx`. Import từ `ui/u2`.
- Quy tắc hình: HUD = sơn mài tối; mọi cửa sổ = giấy ngà; mọi ô/nút/nhãn cùng họ hình vát (`clip-path`), không `border-radius` trừ vòng tròn.
- Khóa: ESLint (`eslint.config.mjs`, `UI_STYLE_RULES`) cấm hex/rgb trong chuỗi và `style={{color:'…'}}` ở `apps/client/src/ui`; `LEGACY_UI_STYLE` liệt kê file cũ chưa chuyển (chỉ được xóa dòng). `tokens.test.ts` kiểm CSS của kit. `node tools/ui/contrast.mjs` kiểm WCAG AA token mới.
- Font: `python tools/fonts/subset_u2.py <thư mục TTF>` (xem docstring); 177 KB woff2 tổng.

## Miễn trừ có chủ ý: `win/` và `shell/`

Quy tắc "hex/rgba chỉ ở `tokens.css`" áp cho các file CSS nằm thẳng trong `u2/`. Hai thư mục con **chưa theo** quy tắc đó: `win/panel.css` và `shell/{hud,screens,ornament}.css` là CSS của bộ cũ dời vào (U2-8), còn nhiều màu cứng; `tokens.test.ts` không quét thư mục con. Đừng coi màu cứng ở đó là hợp lệ cho file mới; chuyển dần từng file sang `--u-*` rồi đưa vào danh sách kiểm.

## Token của bộ cũ (U2-8)

Bộ kit cũ (`ui/kit`, `ui/ngj`, biến `--k-*`/`--ngj-*`) đã gỡ. Giá trị của nó nằm ở `tokens.css`, **giữ nguyên** để hình không đổi:

| Nhóm | Nằm ở | Ghi chú |
| --- | --- | --- |
| `--u-p-*` | khối "chuyển từ bộ khung cửa sổ cũ" | màu/cỡ dùng bởi `ui/u2/win` và CSS các bảng; `win.css` ghi đè lại cho nền giấy ngà |
| `--u-h-*` | khối "chuyển từ Ngọc Giản" | sơn mài, giấy ngà, vàng cổ của HUD và màn tĩnh (`ui/u2/shell`) |
| khoảng cách, nét, chuyển động, phẩm chất | dùng thẳng `--u-sp-N`, `--u-line-2`, `--u-ease`, `--u-dur-fast`, `--u-dur-open`, `--u-cut-l`, `--u-q0…q5` | giá trị trùng |

Việc còn lại (không bắt buộc): gộp dần `--u-p-*`/`--u-h-*` vào token U2 gốc (`--u-gold`, `--u-giay`…), mỗi lần một nhóm kèm ảnh so sánh `tools/ui/compare.mjs`.
Khóa: `tokens.test.ts` cấm quay lại `--k-*`/`--ngj-*` hoặc tạo lại `ui/kit`, `ui/ngj`.
