# DV-3D: Xích Tẫn Khích (phó bản 1 chương 5, cấp 28, 6 đợt)

Theo `docs/DIVUC_DESIGN.md` mục 5.1. Khuôn: Phục Mạch Quật (E2-C), Thần Tàng Điện (E4-C): room `dungeon-xich_tan_khich` (`DungeonRoom`), vé một lần do `WorldRoom.onPortal` cấp, xác thực ở `static onAuth` (khóa `dgKey`, phó bản riêng), tối đa 5 người, `minLevel` 28, hồi sinh tối đa 2 lần.

## Đã làm

| Phần | Nơi |
| --- | --- |
| Level `xich_tan_khich`: 6 đợt, thưởng, `.assets.json` (mood `rift`, vỏ hang `cave`), prop thủ tục từ asset sẵn có | `levels/xich_tan_khich.json`, `shared/src/props.xichtan.ts` |
| Cổng vào ở Xích Tẫn Bình, cách poi `cong_xich_tan_khich` 18 m về phía tâm bản đồ | `levels/bac_hoang.json` `portals` (sinh bằng `tools/maps/gen-bac-hoang.mjs`) |
| Đợt 1: 10 trọng binh; đợt 2: 6 Liệt Hỏa Ma Ngưu (`charge` chồng nhau); đợt 3: Xích Tẫn Cự Khôi (lò ngực mở ba lần = `reveal` + phá thế) | `monsters.json` |
| **Đợt 4, sảnh bia** (`WaveDef.steles`): giữ Trấn Giới Bia 60 s (cộng dồn) giữa ba đợt tiếp viện (U Ảnh Cốt Lộc, Liệt Hỏa Ma Ngưu, trọng binh); bia trống quá 6 s thì tắt, giới áp 3% khí huyết tối đa mỗi giây cả đội, tiến độ đứng. Chưa giữ đủ thì không sang đợt sau | `apps/server/src/game/xichtan.ts` `SteleHold`, `rooms.ts` `startSteles` |
| Đợt 5: Tử Nhận Ma Tướng (hai đường chém nối nhau, hô lệnh gọi 4 trọng binh bằng `summon`) | `monsters.json` |
| **Đợt 6, Tử Quang Dực Chủ** (`hover` 2,5 m): pha 1 quét cánh nón + đường chém, pha 2 (65%) mưa tàn quang 5 vòng, pha 3 (30%) niệm uống mạch (`chant.drain`). **Khe mạch** (`MonsterDef.rift`): ba khe ngọc lam; kéo boss đang niệm chú đứng lên khe thì chú bị phản, boss mất thế 6 s và mất một trong 3 tầng cháy; hết tầng thì boss dừng ở 1 máu, ngã không rơi đồ riêng (cảnh gột, không có cảnh giết) | `xichtan.ts` `RiftVeins`, `rooms.ts` `startVeins` |
| Thưởng hoàn thành: 15% tu vi, Tẫn Giác, Tịnh Quang Vũ (`itm_tinh_vu`), Tử Khí Đan, Yêu Đan, mảnh cả ba bộ bậc 5 (`set_tran_khich|tan_thiet|tinh_dan_bao`); `grantDungeonReward` (transaction + idem `dungeon:xich_tan_khich:<char>:<ngày>` + ledger), mỗi người một lần mỗi ngày | `levels/xich_tan_khich.json` |
| `content:check` kiểm `steles` (bia trong vòng bí cảnh, thông số, tiếp viện) và `rift` (boss, pha, có chú, khe 3–10 m) | `packages/content/src/check.ts` |
| Test: 12 test (dữ liệu, hàm thuần, SteleHold/RiftVeins với host giả, một lượt `DungeonRoom` thật qua sáu đợt) | `apps/server/src/game/xichtan.test.ts` |
| Kịch bản chụp `pnpm shots dungeon` biết đợt giữ bia và khe mạch; thêm `--video 1` quay webm cả lượt | `tools/perf/src/scenarios/dungeon.ts` |

## Quái giữ chỗ và lệch thiết kế (ghi lại để không làm lệch thêm)

- **Cấp**: thiết kế ghi cấp 29–30 nhưng `MAX_LEVEL` hiện là 28 (`formulas.ts`), nên `minLevel` và mọi quái ở cấp 28 (như Bắc Hoang `minLevel` 28); đặt 29 thì không ai vào được. Khi nâng trần cấp, đổi `levels/xich_tan_khich.json` về 29–30 (và `fight:check` hết bị chặn cấp 28).
- **Giác Kiếm Trọng Binh**: dùng quái thật `mon_giac_kiem_trong_binh` của DV-2 đợt 2 (#224), cả đợt 1 lẫn lính gọi của Tử Nhận.
- Id boss của phó bản là `boss_xich_tan_cu_khoi` (không phải `elite_xich_tan_cu_khoi`): `elite_` dành cho bản tinh anh ngoài trời của E-bảng 6.1 về sau, để hai bản không đụng chỉ số.
- Model Tử Nhận Ma Tướng, Tử Quang Dực Chủ, Xích Tẫn Cự Khôi: **giữ chỗ**, dùng lại asset sẵn có nhuộm theo bảng `rift_*` (không làm model mới). Đọa Dực có cánh là DV2-C.
- `hpMul` quy theo nhịp đã dùng cho Tam Thủ Ngục Khuyển (thiết kế 150 → code 90, tức ×0,6): Cự Khôi 40, Tử Nhận 45, Tử Quang 75. Chưa có số đo boss (`fight:check` chỉ đo quái thường, trần cấp 28).
- **Chưa làm**: Tẫn ấn (cơ chế dính tầng khi trúng đòn/bia tắt: tạm thay bằng giới áp trừ khí huyết), mưa tàn quang theo hạt giống server và hạ thấp 6 s giữa hai lượt (tạm là `slam` 5 vòng đuổi người), "Quang tiễn" 5 đạn tản (boss chưa hỗ trợ `caster`, tạm là `line`), đường chém chéo của Tử Nhận (hai vạch cùng hướng), Trấn Giới Bia dùng prop `prop_bia_da` + vòng hazard `pool` chưa có hình riêng, nhiệm vụ `q5_xich_tan`, Anh Biến Lộ (chưa có vật phẩm).

## Soát

- `pnpm typecheck`, `pnpm test` (shared 214, content 50, client 770, server 737), `pnpm content:check`: đạt.
- `fight:check --levels 28 --mon mon_giac_kiem_trong_binh`: TTK 4,3 / 7,5 / 8,4 s (kiếm / hộ pháp / đan sư), không chết (trần cấp 28).
- `pnpm --filter @dtl/bot-client security`: tất cả ĐẠT (server cổng riêng, DB mới).

## Ảnh và video

Không commit. Bộ ảnh + video một lượt phó bản nằm ở thư mục artifact của phiên; sinh lại bằng
`pnpm shots dungeon --level xich_tan_khich --video 1 --out <thư mục tuyệt đối>` (WebGPU, tắt tiếng, tự tắt server).
