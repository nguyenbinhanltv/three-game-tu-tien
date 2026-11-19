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

- Địa hình: `edge` của `doan_mach.terrain.json` (và `gen-doan-mach.mjs`) từ `{amp 120, r0 300, r1 20}` thành `{amp 210, r0 252, r1 110}`: vách dựng đứng cao ~200 m ngoài vùng chơi. **Lưu ý**: công thức cũ đã nâng địa hình ở dải cách rìa thế giới 254–300 m, dải này nằm trong vùng đi được (`playWall` = 770 nên người chơi tới chỗ cách rìa 254 m; tại 254 m cũ nâng ~8,6 m). Với `r0 = 252` dải đó về 0, tức mặt đất ven vùng chơi (~46 m) **hạ tới ~8,6 m** trên cả server lẫn client. `map:report`: 0 chỗ kẹt, độ phủ đạt chuẩn.
- Cầu treo là cầu đi được thật: `TerrainDef.bridges` (`cau_treo_sa_lun`, cờ `own`: `SkyIslands` không dựng cầu xích; `halfW` 1,25, `sag` 2,4) sinh từ `gen-doan-mach.mjs`, mặt cầu `bridgeDeckY` dùng chung server/client, lưới cầu ở `game/world/doanMachArt.ts` bám cùng đường võng.
- **Không có tường vô hình dưới cầu** (cách (a) của review): địa hình là heightfield nên `withBridges` kéo dải `halfW + 0,8` quanh trục cầu lên mặt cầu, ai đi dọc đáy khe tới đó gặp một bậc cao 8–11 m. Chọn vẽ đúng phần bị nâng thành khối đá xây hiện hình (đập đá chống cầu, các lớp đá lệch nhẹ + trụ chống mỗi ~8 m) trong lưới cầu `bridgeGeometry` (`bridgeFill` ở `game/world/doanMachArt.ts`); test kiểm mọi điểm bị nâng > 0,5 m đều nằm trong khối lấp và khối chạm đáy khe tới sát ván cầu. Khối đá lấp thay cho gầm trống của cầu treo. `map:report`/BFS đáy khe: hai bên khe và các điểm `kiem_gay_2`, `itm_hoang_sa_thao` vẫn tới được từ trạm. Cách (b) (dời cầu) không khả thi: toàn bản đồ chỉ có một khe sâu đủ cho cầu.
- Vân vách sa thạch xám-đỏ theo điểm ảnh: `setGroundRedStrata` (`render/materials/ground.ts`), chỉ bật cho `doan_mach`; không dùng khung texture 11 m (lặp thành ô caro) mà dựng từ nhiễu theo tọa độ dọc vách và độ cao: tầng méo, hai thang đỏ gạch ↔ xám, khe nứt dọc, gờ đá.
- `game/world/doanMachArt.ts` (cờ `doanMachArt`; chỉ để nhìn, không va chạm):
  - Rừng phong thẻ lá alpha (tối đa 700 cây + 3 cây lớn điểm nhìn, ba sắc đỏ/cam/vàng; thân + tán 42 thẻ vẽ lá phong năm thùy bằng canvas, pháp tuyến hướng ra ngoài; 4 draw call). **Vùng cấm trồng** (hàm `exclusions`, có test): lõi lòng sông `rb_*` (0,9 `flatR`), trạm, cổng (`portals`), điểm nhiệm vụ (`spots`), điểm đáng chú ý, NPC, nút thu thập, trại quái, điểm hồi sinh, đường hộ tống (đệm 14 m), cầu, vật cản.
  - Cổ trận khắc vách (tối đa 90 tấm, 1 draw call, `render/runeWall.ts`: vòng, tám quẻ, nhịp sáng; cường độ theo mood `RUNE_INTENSITY`).
  - Cầu treo gỗ + dây thừng + cột đỏ (1 draw call).
- Lá phong bay (`AmbientKind` `maple`) to hơn, dày hơn PR1.
- Sương ngày/bình minh giảm (`dm_day`, `dm_dawn`) để vách không bị che bệt.
- Chưa làm: thác nhỏ đổ xuống khe, cây thẻ lá có LOD, bo viền vách bằng mesh Blender, thay mô hình cây khô (`prop_cay_goc_kho` là prop dùng chung, có va chạm).

## PR 3: chỉnh nhỏ sau duyệt

- Vách: bỏ phần méo tần số cao (`nB*18`) của tầng ngang (nguyên nhân sọc mảnh); thêm vệt loang dọc kéo theo chiều cao, gờ đá chỉ ở một số tầng, đỏ gạch ↔ xám rõ hơn. Vẫn tính theo điểm ảnh, chỉ `doan_mach`.
- Lá phong bay là lá thật: `render/mapleLeaves.ts`, 360 thẻ lá phong năm thùy (alpha test, một `InstancedMesh`, một draw call), chuyển động hoàn toàn trên GPU (rơi, gió chéo, lắc, lật hai trục) trong hộp 70×26×70 m cuộn vòng quanh camera; màu đỏ/cam/vàng theo từng lá, độ sáng theo mood (`LEAF_LIGHT`: đêm tối đi). Hạt tròn `maple` ở `ambient.ts` giảm còn 6/s. `DoanMachArt.update(camera)` gọi mỗi khung ở `frameLoop.ts`.
- Cổ trận: quầng sáng đỏ-vàng quanh nét khắc, cường độ đêm 1,7 (ngày 0,4), tối đa 130 tấm (cách nhau ≥ 38 m), lớn 28–44 m.
