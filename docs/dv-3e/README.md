# DV-3E: Kim Dạ Cung (phó bản 2 chương 5, cấp 28, 6 đợt)

Theo `docs/DIVUC_DESIGN.md` mục 5.2, cùng khuôn với Xích Tẫn Khích (DV-3D, `docs/dv-3d/`): room `dungeon-kim_da_cung` (`DungeonRoom` ở `apps/server/src/rooms/dungeon.ts`), vé một lần do `WorldRoom.onPortal` cấp (kiểm `minLevel`, kéo đồng đội trong tổ đội), xác thực ở `static onAuth` (khóa `dgKey`, phó bản riêng), tối đa 5 người, hồi sinh tối đa 2 lần, thưởng qua `grantDungeonReward` (transaction + idem `dungeon:kim_da_cung:<char>:<ngày>` + ledger).

## Đã làm

| Đợt | Nội dung | Cơ chế (server quyết định) |
| --- | --- | --- |
| 1 | 8 Giác Kiếm Trọng Binh + 2 Triền Bố Châm Bà | Châm Bà (`kd.mend`) mỗi 6 s hồi 8% khí huyết cho bầy trong 14 m; bị choáng/mất thế thì ngừng; hạ nó trước |
| 2 | 6 U Ảnh Cốt Lộc | `reveal` sẵn có |
| 3 | 2 Huyết Giác Ma Tướng (tinh anh đôi) | `kd.twin`: một con chết thì con kia nổi giận (sát thương ×1,6) |
| 4 | Hành lang đèn | Đố **bốn** cột đèn (tổng quát hóa `MirrorPuzzle`: 3–4 điểm, khóa tin `kd_lamp`); sai/hết giờ: 4 trọng binh; giải xong: Ma Hậu giảm 15% sát thương (`bossDmgMul`) |
| 5 | **Tẫn Hỏa Kiếm Cơ** (boss phụ) | Vệt lửa Tẫn Hỏa do AI quái (`MonsterTrail`, #235) làm; không có cơ chế riêng ở `kimda.ts` (bản `kd.trail` đã gỡ để khỏi sát thương đôi) |
| 6 | **Kim Dạ Ma Hậu** (boss) | Pha 1: slam + chú + triệu thị vệ (đã có). Pha 2 (65%) **Mặc cả** (`kd.bargain`): mỗi lần niệm chú có thêm Bóng Kim Dạ niệm chú ở phía đối diện sảnh (cách ≥ 18 m); chú xong mà bóng còn sống thì cả đội mất 20% khí huyết tối đa; ngắt được chú của bà thì cả hai chú tan, không phạt. Bóng là đệ tử của boss (`minionOf`): không tu vi, không rơi đồ, không tính hạ. Pha 3 (30%) **Kim dạ** (`kd.night`): chỉ hai vòng bia sáng, ngoài vòng mất 4%/s; Ma Hậu dập luân phiên từng bia (báo 2,2 s, bia tắt 7 s), bia không người giữ quá 6 s cũng tắt |

- Cổng: Kim Dạ Ngoại Uyển trên Bắc Hoang, cách poi `cong_kim_da_cung` 18 m về tâm bản đồ (`levels/bac_hoang.json` `portals`, và `tools/maps/gen-bac-hoang.mjs`).
- Kiến trúc cung điện (thủ tục, một lớp `palace: 'gilt'` ở `kim_da_cung.assets.json`): vỏ cung, sàn đá tím thẫm vân kim dát, hàng cột + gờ ngang + tấm màn nhung treo giữa các cột, quầng đèn vàng (`apps/client/src/game/caveShell.ts`, bảng màu `PALACE.gilt`: `rift_gilt` trên nền đen tím). Prop bày: vòng cột, hành lang đèn kép, hai bia Kim dạ, ngai + tượng canh, bốn đèn đố (`shared/src/props.kimda.ts`).
- Client: cột bia `kd_stele` (`FxMsg`, `Vfx.kdStele`: vàng sáng / tím tắt), vạch báo vùng nổ và vệt lửa dùng `pool` sẵn có, cột đố thứ tư màu tím.
- Dữ liệu: `kd` (`MonsterKimDa` ở `packages/shared/src/types.ts`) trong `monsters.json`, kiểm ở `content:check`; vật phẩm `itm_kim_da_mien` (Kim Dạ Miện Phiến); thưởng 15% tu vi, Tẫn Giác, Kim Dạ Miện Phiến, mảnh cả ba bộ bậc 5.
- Nhiệm vụ: đích `kim_da_cung` đã chuyển từ `PENDING_DUNGEON_TARGET` sang `DUNGEON_QUEST_TARGET` (`q5_kim_da`).
- Khác với #227: Ma Hậu **không** có sàn 1 máu; chết qua `killMonster` chung như mọi boss thường (rơi đồ, tu vi, nhiệm vụ). Bóng niệm chú và gỡ quái đi qua `removeAt`, không qua đường giết.

Mã: `apps/server/src/game/kimda.ts` (`KimDaSystem`, hàm thuần `inAny|shadowSpot|trailPoints`), test `kimda.test.ts` (dữ liệu, hàm thuần, host giả, một lượt `DungeonRoom` qua sáu đợt).

## Lệch thiết kế (ghi lại để không làm lệch thêm)

- **Cấp 28** thay vì 31 (`MAX_LEVEL` 28), như DV-3D.
- **Id quái đổi tiền tố `kd`**: `mon_kd_trien_bo_cham_ba`, `elite_kd_huyet_giac_ma_tuong`. Id `elite_huyet_giac_ma_tuong` / `elite_trien_bo_cham_ba` đã được nhiệm vụ DV3-H (`q5_ngu_bia`, `s5_cham_ba`) dành cho tinh anh ngoài trời ở Kim Dạ Ngoại Uyển (việc khác).
- **Tẫn ấn chưa có**: phạt mặc cả tạm là 20% khí huyết tối đa cả đội (thiết kế: 5 tầng Tẫn ấn).
- **Phân thân thần niệm** chưa tính là người giữ bia (pha Kim dạ chỉ đếm người thật).
- **Sân hẹp dần** của Kiếm Cơ chưa làm; thay bằng vệt lửa.
- **Châm Bà, Huyết Giác** dùng lại lưới DV-2 đợt 2 nhuộm màu (không model mới); Kiếm Cơ và Ma Hậu dùng model DV-2 đợt 3 (#231). Skin của hai boss vẫn gắn `level: 'bac_hoang'` nên không nạp trước khi vào phó bản, chỉ nạp khi xuất hiện.
- Hai boss này vẫn còn bản đứng tạm ngoài trời ở Kim Dạ Ngoại Uyển (`gen-bac-hoang.mjs`, chỉ có cơ chế gốc, không có `kd`): gỡ khi chuyển sang tinh anh ngoài trời.
- Chưa làm: Anh Biến Lộ (chưa có vật phẩm), nhiệm vụ nối phó bản ngoài `q5_kim_da`/`q5_ngu_bia` sẵn có.

## Soát

- `pnpm typecheck`, `pnpm test` (shared 214, content 50, client 796, server 759+), `pnpm content:check`: đạt.
- `fight:check --levels 28 --mon mon_kd_trien_bo_cham_ba`: TTK 3,9 / 4,6 / 8,2 s (kiếm / hộ pháp / đan sư), không chết.
- `pnpm --filter @dtl/bot-client security` (server cổng riêng, DB mới, bật đăng nhập dev): 139 ĐẠT, 0 HỎNG.

## Ảnh và video

Không commit. Sinh lại bằng `pnpm shots dungeon --level kim_da_cung --video 1 --out <thư mục tuyệt đối>` (WebGPU, tắt tiếng, tự tắt server); bản lưu ở thư mục artifact của phiên.

## Dọn khi boss rời trận

`KimDaSystem.cleanup` dọn bia Kim dạ và bóng mặc cả khi Ma Hậu chết, rút lui về pha trước, đang `evadeUntil` hoặc `MS_RETURN` (leash/wipe); tinh anh đôi cuồng nộ mà về chỗ thì trả sức đánh gốc và đếm lại. Test ở `kimda.test.ts`.
