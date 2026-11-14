# Giấy phép asset

Mỗi asset đi vào game (mọi GLB trong `apps/client/public/assets/manifest.json`) phải có **đúng một dòng** trong bảng dưới. `pnpm assets:validate` báo lỗi nếu thiếu. Cột đầu ghi asset id trong dấu `` ` ``.

- **Nguồn**: Tripo (web app gói Max / API trả phí), Codex (ảnh concept), CC0 (ghi tên gói), tự sinh bằng script (ghi đường dẫn script).
- **Giấy phép**: mã SPDX nếu là giấy phép mở (`CC0-1.0`, `CC-BY-4.0`…); asset dự án tự làm hoặc sinh bằng dịch vụ trả phí ghi `dự án`.
- **Chi tiết**: task id Tripo, URL gói CC0, yêu cầu ghi công nếu có. Chi tiết đầy đủ nằm trong `assets/source/<loại>/<id>/meta.json`.

| Asset | Nguồn | Giấy phép | Ngày | Chi tiết |
| --- | --- | --- | --- | --- |
| `arch_sect` | Tự sinh bằng script `tools/blender/build_sect.py` (Blender headless) | dự án | 2026-11-12 | Kiến trúc Lạc Kiếm Tông; không có texture, chỉ màu đỉnh |
| `prop_lo_dan` | Tripo API (image→3D v3.1) + Codex (concept) | dự án | 2026-11-15 | task `bf2c9afd-c009-472c-abb5-21b01acdc63d` |
| `prop_linh_thao` | Tripo API (image→3D v3.1) + Codex (concept) | dự án | 2026-11-15 | task `eec1fb46-1922-479c-95c4-939052c05a4b` |
