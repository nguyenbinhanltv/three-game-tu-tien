# Bộ icon U2-I (2026-11-18)

Nguồn tạo: **một tờ lưới 3×2 = tối đa 6 icon cho mỗi lượt Codex** (cùng bộ trang bị/cùng nhóm trong một tờ nên đồng phong cách), cắt thành icon 256 px, rồi `pnpm icons:build` đóng atlas.

| Bước | Công cụ |
| --- | --- |
| Danh mục + prompt từng tờ | `sheets.v2.json` (tờ → danh sách id theo ô trái→phải, trên→dưới, và prompt đã dùng); bảng màu/họa tiết 16 bộ ở prompt các tờ `s_set_*` |
| Sinh | `codex-sheets.mjs` (chạy `codex exec`, tự lấy PNG ở `~/.codex/generated_images`: bước sao chép trong shell của Codex hay treo nên không dùng). Dùng: `node tools/icons/v2/codex-sheets.mjs jobs.json 3` với `jobs.json = [{id, group, prompt}]`; ghi vào thư mục artifact cố định trong mã, sửa hằng `OUT` |
| Cắt + căn giữa + QC | `slice_qc.py` (pillow, numpy) → `<DTL_ASSET_SOURCE>/2d/icons-v2/png256/<id>.png` + `qc.json` |
| Biến thức A/B | dựng từ icon chiêu gốc + chip A/B (PNG 256 trong `png256/var_*.png`) |
| Icon hệ thống | `sysicons.py` (75 icon SVG, `system-icons.v2.json`); bản chạy ở `apps/client/src/ui/u2/sysGlyphs.ts`; nhóm `hud_/mark_` cũng rasterize vào `png256/` để atlas cũ còn dùng được |
| Atlas | `pnpm icons:build` (ưu tiên `2d/icons-v2/png256` > `2d/icons` > `icons`) → `apps/client/public/assets/ui/icons-{hud,items}.<hash>.webp` + `icons.json` (version 4) |
| Kiểm | `pnpm icons:check` (hash, kích thước, ô trùng, giấy phép trong `assets/LICENSES.md`) |

Ảnh trong atlas **không có khung**: viền/ánh sáng phẩm chất do `ui/u2` (`IconFrame`/`Slot`) vẽ bằng mã; dấu ấn bộ (`SetMark`, `setEmblems.ts`) là SVG đặt ở góc icon của món có `set`.
Tên cấu trúc `sets.meta.json`: màu chủ đạo/viền/sáng của 16 bộ dùng khi viết prompt. Mọi ảnh sinh bằng Codex: **tiêu hạn mức tài khoản**, không dùng Tripo hay dịch vụ ngoài.
