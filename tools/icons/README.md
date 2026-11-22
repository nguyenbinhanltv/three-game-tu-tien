# Icon skill / vật phẩm M4-7

- Prompt chung: `docs/prompts/codex.md` mục 9; chủ thể: `subjects.json`.
- PNG nguồn: `<DTL_ASSET_SOURCE>/2d/icon/v1/<id>.png` (mặc định cạnh repo gốc, không cạnh worktree). Mỗi icon được sinh riêng bằng công cụ ảnh tích hợp Codex; không cần API key.
- `pnpm icons:build`: thu ảnh về 128×128, ghép 8×4 ô thành atlas WebP quality 90, hash tên file. Chỉ xóa các atlas cũ do script này quản lý.
- Có `toktx` trong `TOKTX`, PATH hoặc thư mục KTX-Software mặc định: xuất thêm KTX2 UASTC sRGB. Không có thì ghi rõ và giữ WebP. UI DOM dùng WebP.
- `pnpm icons:check`: kiểm hash/dung lượng/kích thước atlas, ID, ô không trùng và nguồn trong LICENSES. Chạy cùng `pnpm content:check`, không cần PNG nguồn trong CI.
- `node tools/icons/build.mjs --preview <absolute-artifact-path>/icon-sheet.html`: xuất trang tự chứa ảnh để duyệt cả 29 icon ở 48, 64, 128px. Đăng ký trang bằng Orchestrator artifact.

`icon` là ID ổn định, `iconFallback` giữ emoji cũ. `ContentIcon` dùng chung cho HUD, túi đồ, trang bị, cửa hàng, công thức, cường hóa và phần thưởng. Thiếu ID hoặc tải atlas lỗi thì hiện fallback. Các nhãn/tooltip vẫn lấy từ i18n của control cha.

## Icon trang bị (28 món, P3-1/3-4)

`tools/icons/equipment.mjs` dựng bằng Blender (`render_equipment.py`, bảng chất liệu và màu bộ ở đầu file: vải/da/thiết/ngọc/đồng/vân cho đồ thường; Lạc Kiếm ngà+lam, Huyền Giáp đen+đồng, Đan Tâm ngọc bích+vàng nhạt, Hàn Giao Lân bạc băng+lam ngọc cho đồ bộ), ghép lên nền và khung đồng cùng họ M4-7 rồi ghi PNG 1024 vào `<DTL_ASSET_SOURCE>/icons`. Không dùng Tripo hay dịch vụ ngoài. Chạy `node tools/icons/equipment.mjs [id…]` rồi `pnpm icons:build`. Danh sách lấy từ `data/equipment/templates.json` và `setItems.json` (có trong `defs` của `build.mjs`). Atlas 8×9; ô đã có giữ nguyên chỗ, icon mới lấp ô trống.

## Bộ icon U2-I (2026-11-18)

Atlas hiện tại do `pnpm icons:build` đóng từ **PNG 256 px của bộ U2-I** (`<DTL_ASSET_SOURCE>/2d/icon/v2/png256/`, ưu tiên cao nhất), icon không có viền (khung do `ui/u2` vẽ bằng mã). Cách sinh (tờ 3×2 mỗi lượt Codex), cắt/QC, 75 icon hệ thống SVG và dấu ấn bộ: `tools/icons/v2/README.md`. Icon hệ thống có SVG (`hud_*`, `mark_*`, `cur_*`, `st_*`, `ui_*`, `sys_*`) được `UiIcon` vẽ thẳng từ `ui/u2/sysGlyphs.ts`, không qua atlas.

Bổ sung 2026-11-22 (nợ hướng tu phần 2): 9 icon chiêu mốc 24/28 của Đao tu / Cổ tu / Cấm chế sư (`skl_thuan_dao_tram`, `skl_huyet_chien_the`, `skl_doan_thien_dao`, `skl_phan_co_thuat`, `skl_kim_thien_co`, `skl_van_co_phe_the`, `skl_dia_sat_tran`, `skl_thai_hu_ho_tran`, `skl_lac_thu_dai_tran`) sinh bằng Codex ở hai tờ `s_path_2428_a/b` (3×2, khung 3:2 1536×1024) và cắt thẳng theo ô 512 px xuống 256 px (không dùng `slice_qc.py`: bước căn giữa/đệm viền làm nhòe vệt khi chủ thể chạm biên ô). Các chiêu hướng tu khác vẫn dùng emoji dự phòng.
