# DUN-1 — thiết kế lại các bí cảnh theo phong cách B (bước 3 "Ngũ Cảnh Thiên Địa")

Mỗi bí cảnh một bảng màu + một điểm nhìn "wow" hợp chủ đề, vật liệu PBR, giữ nguyên gameplay (vùng boss, đợt quái, cơ chế, va chạm, cổng vào/ra, kịch bản kiếp). Chia PR mỗi lần 1–2 bí cảnh.

| PR | Bí cảnh | Trạng thái |
| --- | --- | --- |
| 1 | Kiếm Trủng (`kiem_trung`) | PR này |
| tiếp | Phục Mạch, Kính Nguyệt, Thần Tàng, Kim Dạ Cung, Xích Tẫn Khích, Độ Kiếp (+ Bắc Hoang) | chưa làm |

## PR 1: Kiếm Trủng — nghĩa địa kiếm cổ

- **Bảng màu**: mood `kt` (một thời điểm cố định, `assets/palette.json`): xám lam thép lạnh, nắng trắng lạnh từ cao (sườn đá xa tối hơn sàn, không phủ sáng), cặn rỉ nâu đỏ, sương lạnh thấp (`heightFog`), `fogDensity` 0,0011. `moodVariant('kt') = 'kt'`.
- **Huyệt kiếm** (`buildSwordCaveShell`, `game/world/caveShell.ts`): vòm hang cao r 170 / h 110 (một draw call, màu theo đỉnh), vỉa tầng + nhũ đá, ô trời mở ở đỉnh. Bật bằng khối `cave` trong `kiem_trung.assets.json` + `kiemTrungArt: true`. Địa hình giữ nguyên (cao nguyên phẳng `KIEM_TRUNG`, r phẳng 78), vòm chỉ che chân trời nên không đổi đi lại/va chạm.
- **Đất**: bộ texture `terrain-slate` (Poly Haven CC0), màu đỉnh `ktGroundColor` (đá xám lam, mảng tro, vệt rỉ dày dần ra vành, sàn đài chiến sẫm), `setGroundNoSnow` (không phủ tuyết ở đỉnh), vách `setGroundRedStrata` tông xám lam tối.
- **Cảnh** `game/world/kiemTrungArt.ts` (cờ `kiemTrungArt`, chỉ để nhìn, không va chạm, tất định):
  - ~1.160 kiếm nhỏ cắm đất: kiếm nguyên cắm lưỡi xuống (tấm chắn đồng, chuôi quấn) + lưỡi gãy lởm chởm; mỗi loại một `InstancedMesh`; chừa khu giữa r < 26, lối từ cổng (dải 9 m phía nam) — hàm `swordKeepOut`, có test.
  - 18 cự kiếm cao 14–62 m (`planGiants`): một thanh 62 m ở rìa bắc đối diện lối vào (điểm nhìn đầu tiên), vành ngoài còn lại; vật liệu PBR (kim loại 0,5, nhám 0,46), rãnh khí xanh phát sáng (`emissiveNode`, nhịp thở chậm). Cao hơn vòm là test đỏ (`kiemTrungArt.test.ts`).
  - Kiếm trận khắc sàn đài chiến (vòng + tám thanh kiếm tỏa ra, canvas 1024², cộng sáng, độ đục 0,16 — đủ mờ để vạch báo của boss vẫn đọc rõ nhất).
  - Tia sáng `godRays` rọi qua ô trời mở (`GOD_RAY_INTENSITY.kt`); bướm hoa thay bằng ngài linh lam nhạt phát sáng (`butterflies.ts`).
- **Gỡ**: kiến trúc tông môn và đảo bay Lạc Kiếm (`sect`, `arch_sect`, `lacKiemSky`) không còn dựng trong bí cảnh (không ai thấy được từ đây, tốn ~1M tam giác).
- **Ngân sách (preset Cao, `--perf 1`)**: 64–72 draw call, ~0,42–0,45M tam giác (trước: 105–111 draw call, ~1,41M), khung ~8,3 ms (headless). Dưới 1,8M tam giác.
- **Chụp**: kịch bản mới `pnpm shots dungeonart --level <id> --out <thư mục tuyệt đối> [--tag truoc|sau] [--sizes 720p,1080p] [--views a,b] [--battle 1] [--perf 1] [--video 1]`: các điểm nhìn của level (bảng `VIEWS` trong `tools/perf/src/scenarios/dungeonart.ts`, level chưa khai báo dùng bộ chung), cảnh chiến đấu boss (`--battle 1`: gọi boss cuối bằng GM, vạch báo + pha cuối), video đi một lượt. Ảnh/video để ở artifact phiên, không commit.

## Chưa làm / ghi chú

- Cự kiếm là khối lăng trụ thủ tục (chưa có mesh Blender chi tiết: tấm chắn cong, khắc vân); PR sau có thể thay bằng kit Blender/PROP-1 khi PROP-1 merge.
- Ô trời mở là màu đỉnh, chưa có mặt trăng/mây thật; chùm tia sáng đã đủ gợi.
- Tông ngoài sảnh giữ cho phiên bản sau: đài chiến vẫn là cao nguyên Vân Lam cũ (chỉ đổi màu/texture), chưa dựng vành đá bao.
