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
