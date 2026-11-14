# Giấy phép asset

Mỗi asset đi vào game (mọi GLB trong `apps/client/public/assets/manifest.json`) phải có **đúng một dòng** trong bảng dưới. `pnpm assets:validate` báo lỗi nếu thiếu. Cột đầu ghi asset id trong dấu `` ` ``.

- **Nguồn**: Tripo (web app gói Max / API trả phí), Codex (ảnh concept), CC0 (ghi tên gói), tự sinh bằng script (ghi đường dẫn script).
- **Giấy phép**: mã SPDX nếu là giấy phép mở (`CC0-1.0`, `CC-BY-4.0`…); asset dự án tự làm hoặc sinh bằng dịch vụ trả phí ghi `dự án`.
- **Chi tiết**: task id Tripo, URL gói CC0, yêu cầu ghi công nếu có. Chi tiết đầy đủ nằm trong `assets/source/<loại>/<id>/meta.json`.

| Asset | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `arch_sect` | Tự sinh bằng script `tools/blender/build_sect.py` (Blender headless) | dự án | 2026-11-12 | Kiến trúc Lạc Kiếm Tông; không có texture, chỉ màu đỉnh |

## Font

Font web tự host trong `apps/client/public/fonts/`, subset bằng `tools/fonts/subset.py` (fonttools) từ kho [google/fonts](https://github.com/google/fonts) ghim commit `cc39c4c`. Văn bản giấy phép đầy đủ nằm cạnh file font (`OFL-*.txt`); bản quyền và giấy phép cũng giữ trong bảng `name` của từng woff2. Không font nào khai Reserved Font Name.

| File | Font gốc | Giấy phép | Ngày | Dùng cho |
| --- | --- | --- | --- | --- |
| `dtl-title.woff2` | Charm Bold, © 2018 The Charm Project Authors (Cadson Demak) | `OFL-1.1` | 2026-11-15 | Tiêu đề thư pháp trên khung hình đầu (chỉ glyph của `ui.title`), biến CSS `--font-title` |
| `dtl-display.woff2` | Alegreya SC Bold, © 2011 The Alegreya Project Authors (Huerta Tipográfica) | `OFL-1.1` | 2026-11-15 | Tên boss, biển hiệu, phụ đề màn tiêu đề (Latin + tiếng Việt), biến CSS `--font-display` |
