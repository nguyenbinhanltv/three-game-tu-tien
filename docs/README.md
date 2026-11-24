# docs/

Tài liệu thiết kế và ghi chú theo từng hạng mục của Vạn Tiên Lộ. Sổ tay chính là `CLAUDE.md` ở gốc repo; mỗi thư mục con ở đây ứng với một hạng mục (PR) và có `README.md` riêng.

## Quy ước ảnh và video (từ R-1, 2026-11-18)

- **Ảnh/video duyệt PR không commit vào repo.** Worker ghi chúng vào thư mục artifact của phiên (`pnpm shots <kịch bản> --out <thư mục artifact>`) và dẫn trong mô tả PR.
- Mỗi thư mục `docs/<hạng mục>/` chỉ giữ `README.md` và **tối đa 3–5 ảnh then chốt**: WebP, cạnh dài ≤ 1600 px, ≤ 300 KB mỗi ảnh. Ảnh nào giữ thì README phải nêu tên hoặc liên kết tới.
- Không PNG trong `docs/`; không file nào trên 400 KB; cả `docs/` dưới 60 MB.
- Ngoại lệ về số lượng: ảnh concept đang dùng để dựng asset (`asset-concepts/`, `outfit-concepts*/`, `chr-v2-concept/`) và ảnh dẫn chứng của `AUDIT_AND_ROADMAP.md` (`audit/`).

Kiểm bằng `pnpm docs:check` (`tools/docs/check.mjs`): báo lỗi khi vi phạm ba giới hạn trên hoặc khi một liên kết ảnh trong file `.md` trỏ tới file không tồn tại; cảnh báo khi có ảnh không được file `.md` nào nhắc tên.

## Ảnh cũ

Đợt dọn R-1 đã gỡ khoảng 870 MB ảnh duyệt PR cũ (không viết lại lịch sử git). Cần xem lại thì lấy từ commit ngay trước đợt dọn:

```bash
git show c78b50c6:docs/<thư mục>/<file> > /tmp/<file>
git ls-tree -r --name-only c78b50c6 docs/<thư mục>/
```

README của các thư mục bị gỡ ảnh có dòng "Ghi chú R-1" ở đầu; tên file nhắc trong bài mà không còn trong thư mục là ảnh đã gỡ.

## Tài liệu cấp cao nhất

| File | Nội dung |
| --- | --- |
| `art-bible.md` | Nguồn chuẩn về hình ảnh (v3, bán tả thực điện ảnh) |
| `GAME_DESIGN_CORE.md` | Thiết kế lõi: combat, cảnh giới, độ kiếp |
| `EXPANSION_DESIGN.md` | Thiết kế mở rộng Kết Đan / Nguyên Anh / Hóa Thần |
| `DIVUC_DESIGN.md` | Thiết kế chương 5 Bắc Hoang Dị Vực (quyết định mục 15 đã chốt 2026-11-18) |
| `ASSET_CONCEPTS.md` | Danh sách asset người dùng tự dựng trên Tripo, kèm ảnh concept |
| `AUDIT_AND_ROADMAP.md` | Soát lỗi và lộ trình Sprint 2 |
| `tripo-runbook.md` | Quy trình Tripo → Blender → GLB |
| `perf-report.md`, `compat.md` | Báo cáo hiệu năng, tương thích trình duyệt |
| `gm-commands.md` | Bảng lệnh GM |
| `e2j-balance.md`, `e3j-balance.md` | Ghi chú cân bằng chương 2–3 |
| `inventory.md` | Túi đồ (TD-A): giao thức cho client |
