# Công cụ đa level (E1-G)

Mọi công cụ nhận `--level <id>` (mặc định `van_lam`). Level thật nằm ở `packages/content/data/levels/<id>.json` + `TerrainDef` đăng ký ở `@dtl/shared`;
**level thử `thu_nho`** (`packages/content/src/fixtures.ts`, `ensureLevel('thu_nho')`) là bản đồ phẳng 1 km, hai vùng cấp 16–24, để kiểm công cụ khi chưa có bản đồ mở rộng (E2-A). Nó không nằm trong `LEVELS` của game.

| Lệnh | Ghi chú |
| --- | --- |
| `pnpm map:report --level <id> [--png x.png] [--json x.json]` | Diện tích/mật độ vùng, khoảng cách, độ phủ, quét chỗ kẹt. Mục tông môn/cổng/Kiếm Trủng/NPC chỉ in cho Vân Lam; level khác lấy tâm vùng chơi làm tâm. Kết quả Vân Lam không đổi so với trước E1-G. |
| `pnpm minimap:build --level <id>` | Ghi `apps/client/public/map/<id>.webp` + `.json`. Phủ vùng chơi ± 100 m (hoặc cả thế giới nếu không có ranh); đường mòn tự nối tâm các vùng theo cấp (`autoTrails`). Vân Lam: ảnh giống từng byte. |
| `pnpm shots --level <id> [--dry]` | Điểm chụp suy từ dữ liệu level (`tools/perf/src/levelpoints.ts`: tâm vùng, điểm đáng chú ý, tinh anh, boss, toàn cảnh), thêm `level=<id>` vào URL, ảnh có tiền tố level. `--dry` chỉ in điểm. |
| `pnpm bench:client --level <id>` | Cùng bộ điểm, ghi `level` vào `settings` của kết quả. |
| `pnpm content:check` | Chạy `checkLevel` (`packages/content/src/levelcheck.ts`) cho **mọi** level trong `LEVELS`. |
| `pnpm --filter @dtl/server fight:check [--levels 4,15,16,22,28] [--mon <id>] [--strict]` | Chọn quái từ bãi của mọi level; cấp vượt mọi bãi hiện có thì ngoại suy (`*`). `--strict` thoát 1 nếu TTK ngoài 3,5–8,5 s hoặc có ca chết. |

`shots`/`bench:client --level <id>` (khác Vân Lam) cần server và client hiểu tham số `level` (E1-B, E1-D); trước đó URL vẫn mở Vân Lam và chỉ có `/gm tp` tới tọa độ của level. `bench:crowd` còn gắn với Vân Lam.

## `content:check` cho một level

- Vùng: id hợp lệ/không trùng, màu `#rrggbb`, nhạc trong danh sách, khoảng cấp 1–`MAX_LEVEL` (28), đa giác ≥ 1000 m² và nằm trong vùng chơi.
- Camp: trong đa giác đúng vùng và khoảng cấp, 3–4 con, bán kính 18–30 m, không dưới nước, không đè collider (+1 m) hay prop (`propsOf(level)`).
- Mật độ quái thường (camp + ranged) / tổng diện tích vùng: **Vân Lam** giữ ngưỡng M-1 (300–380 con); **level mới 100–140 quái/km²**. Tinh anh 2–3 mỗi vùng, đúng cấp vùng.
- Spawn (tinh anh/boss) và node: trong vùng chơi, không đè collider, cấp 1–28, có `respawn`; id quái tồn tại; level mới còn cần `assets/source/mon/<id>/` (skin Tripo #115–#117).
- Prop bày: asset `assets/source/prop/<id>/` tồn tại (chỗ gắn `PROP_LIB` khi #118 vào: thay `assetExists('prop', …)` trong `levelcheck.ts`).
- Truyền Tống Trận của level (`TELE_PADS` lọc theo `level`, thiếu = `van_lam`): mỗi vùng đúng một trận, có trận mở sẵn, đứng trong vùng, chỗ bằng, không đè collider/prop/bãi quái/điểm sinh.

Test: `pnpm --filter @dtl/content test` (ca đạt + ca lỗi cố ý), `pnpm --filter @dtl/perf test` (điểm chụp), `apps/server/src/game/balance.test.ts` (thang 28 cấp: số đòn hạ quái 8–14, máu mất mỗi đòn 5–10%, không nhảy độ khó ở cấp 16/20/24/28).
