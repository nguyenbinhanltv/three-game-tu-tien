# Icon skill / vật phẩm M4-7

- Prompt chung: `docs/prompts/codex.md` mục 9; chủ thể: `subjects.json`.
- PNG nguồn: `<DTL_ASSET_SOURCE>/icons/<id>.png` (mặc định cạnh repo gốc, không cạnh worktree). Mỗi icon được sinh riêng bằng công cụ ảnh tích hợp Codex; không cần API key.
- `pnpm icons:build`: thu ảnh về 128×128, ghép 8×4 ô thành atlas WebP quality 90, hash tên file. Chỉ xóa các atlas cũ do script này quản lý.
- Có `toktx` trong `TOKTX`, PATH hoặc thư mục KTX-Software mặc định: xuất thêm KTX2 UASTC sRGB. Không có thì ghi rõ và giữ WebP. UI DOM dùng WebP.
- `pnpm icons:check`: kiểm hash/dung lượng/kích thước atlas, ID, ô không trùng và nguồn trong LICENSES. Chạy cùng `pnpm content:check`, không cần PNG nguồn trong CI.
- `node tools/icons/build.mjs --preview <absolute-artifact-path>/icon-sheet.html`: xuất trang tự chứa ảnh để duyệt cả 29 icon ở 48, 64, 128px. Đăng ký trang bằng Orchestrator artifact.

`icon` là ID ổn định, `iconFallback` giữ emoji cũ. `ContentIcon` dùng chung cho HUD, túi đồ, trang bị, cửa hàng, công thức, cường hóa và phần thưởng. Thiếu ID hoặc tải atlas lỗi thì hiện fallback. Các nhãn/tooltip vẫn lấy từ i18n của control cha.

## Icon trang bị (28 món, P3-1/3-4)

`tools/icons/equipment.mjs` dựng bằng Blender (`render_equipment.py`, bảng chất liệu và màu bộ ở đầu file: vải/da/thiết/ngọc/đồng/vân cho đồ thường; Lạc Kiếm ngà+lam, Huyền Giáp đen+đồng, Đan Tâm ngọc bích+vàng nhạt, Hàn Giao Lân bạc băng+lam ngọc cho đồ bộ), ghép lên nền và khung đồng cùng họ M4-7 rồi ghi PNG 1024 vào `<DTL_ASSET_SOURCE>/icons`. Không dùng Tripo hay dịch vụ ngoài. Chạy `node tools/icons/equipment.mjs [id…]` rồi `pnpm icons:build`. Danh sách lấy từ `data/equipment/templates.json` và `setItems.json` (có trong `defs` của `build.mjs`). Atlas 8×9; ô đã có giữ nguyên chỗ, icon mới lấp ô trống.
