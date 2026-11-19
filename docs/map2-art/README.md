# MAP-2 "Ngũ Cảnh Thiên Địa" — Đoạn Mạch Cổ Cốc

Tái thiết kế mỹ thuật Đoạn Mạch (chương 2, `doan_mach`) theo phong cách B (bán tả thực, điện ảnh, PBR), bảng màu **đỏ son + vàng thu**. Gameplay giữ nguyên (hồi sinh, NPC, cổng, đường đi, va chạm, vùng quái, nhiệm vụ). Chia PR:

1. **Ánh sáng và màu (PR này)**: mood `dm_*` 4 thời điểm, tia sáng, lá phong bay, màu đất.
2. Địa hình hẻm núi lá phong + kit + điểm wow (cổ trận khắc vách phát sáng, cầu treo gỗ, lá phong rơi, thác nhỏ).

## PR 1

- Preset `dm_dawn|dm_day|dm_dusk|dm_night` trong `assets/palette.json`; `doan_mach.assets.json` `mood: dm_day`; `?mood=dawn|day|dusk|night` đổi thời điểm (`moodVariant` trong `render/grading.ts`). Phục Mạch Quật vẫn dùng `ochre_night`.
- `godRays` trong `doan_mach.assets.json` (tâm trạm, r 520 m, 60 dải), cường độ theo mood ở `GOD_RAY_INTENSITY`.
- `AmbientKind` mới `maple`: lá phong đỏ/cam/vàng bay chéo theo gió (`world/ambient.ts`), chỉ ở `doan_mach`, thưa dần khi bay cao.
- Màu đất `ochreColor` (`world/terrain.ts`): vàng thu ↔ đỏ gạch, mảng thảm lá phong đỏ/vàng ở chỗ bằng, sa thạch nâu đỏ ở dốc.
- Chụp: `pnpm shots doanmach --out <thư mục tuyệt đối> [--tag truoc|sau] [--moods ...] [--views tram,machtinh,cauda,congmo,vachdut,toancanh] [--perf 1] [--video 1]`. Ảnh để ở artifact phiên, không commit.

## PR 2: hẻm núi, cây phong, cổ trận, cầu treo

- Địa hình: `edge` của `doan_mach.terrain.json` (và `gen-doan-mach.mjs`) từ `{amp 120, r0 300, r1 20}` thành `{amp 210, r0 252, r1 110}`: vách dựng đứng cao ~200 m, **chỉ ngoài vùng chơi** (mép chơi cách rìa thế giới 244 m nên độ cao trong vùng chơi không đổi); `map:report`: 0 chỗ kẹt.
- Vân vách sa thạch xám-đỏ theo điểm ảnh: `setGroundRedStrata` (`render/materials/ground.ts`), chỉ bật cho `doan_mach` (tầng ngang theo độ cao hai tần số, không đổi ngưỡng tuyết của Vân Lam).
- `game/world/doanMachArt.ts` (cờ `doanMachArt` trong `doan_mach.assets.json`; chỉ để nhìn, không va chạm): rừng phong theo mảng (tối đa 820 cây, 3 sắc đỏ/cam/vàng, tán 7 khối méo + pháp tuyến mịn, thân chung; 4 draw call), cổ trận khắc trên vách (tối đa 56 tấm, 1 draw call, shader `render/runeWall.ts`: vòng, tám quẻ, nhịp sáng; cường độ theo mood `RUNE_INTENSITY`: đêm rực, hoàng hôn rõ, ngày le lói), cầu treo gỗ + dây thừng + cột đỏ qua khe cát lún (970,1500)→(970,1548) (1 draw call).
- Sương ngày/bình minh giảm (`dm_day`, `dm_dawn`) để vách và tầng đá không bị che bệt.
- Chưa làm: thác nhỏ đổ xuống khe, cây dày bằng thẻ lá (cards) có LOD, bo viền/chuẩn hóa vách bằng mesh Blender (vách hiện là lưới địa hình + shader).
