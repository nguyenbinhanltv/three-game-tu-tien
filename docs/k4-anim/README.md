# K-4 Hệ animation

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/k4-anim/<file>`.

Chỉ là lớp hình ở client. Server vẫn quyết định sát thương, vị trí và phần thưởng (K-2); K-4 chỉ đọc cùng dữ liệu chiêu (`windup`, `hitAt[]`, `recovery`, `cancel`, `combo`, `dash` trong `skills.json`/`methods.json`) để dựng hình khớp nhịp server.

## Các phần

| Việc | Ở đâu | Cách làm |
|---|---|---|
| Lớp thân trên / thân dưới | `character/skinned.ts` (`Perform.upper|lower`), `poseLib.ts` (`maskClip`) | Đã có từ M3-4 cho chiêu IK: clip pose cắt theo xương, thân trên luôn theo chiêu, hông và chân theo chiêu khi đứng yên và theo clip di chuyển khi đang đi (`still` làm mượt 7/s). K-4 thêm các clip di chuyển K-3 để chân có đi lùi và đi ngang |
| Di chuyển đa hướng | `states.ts` (`back`, `strafeL`, `strafeR`), `shared/animrules.ts` (`locoDirOf`), `entities.ts` | `EntityManager` làm mượt vận tốc vẽ rồi suy hướng đi so với hướng nhìn; `AnimState.moveDir`. Thiếu clip K-3 thì lùi về `run` |
| Máy trạng thái chiêu theo dữ liệu | `shared/animrules.ts` (`skillTiming`, `skillPhaseAt`, `hitsPassed`), `skillPose.ts` (`performOpts`) | Không có thời gian viết cứng trong code: `windup`, `hitAt`, `end = hitAt cuối + recovery`, mốc hủy đều lấy từ chiêu (đòn thứ n của chuỗi lấy `combo.hits[n].hitAt`). Chiêu niệm chú giữ lịch theo thanh niệm |
| Cửa sổ hủy | `skinned.ts` (`cancelRecovery`, `updatePerform`) | Đã ra đòn và đang đi lại sau `cancel.move` → tắt thu về trong 0,1 s. Lướt hủy từ `cancel.dash` (ngay sau đòn đầu). Trước mốc hủy không bao giờ hủy: đòn phải ra |
| Combo 3 đòn | `skillPose.ts` (`predict`, `comboNext`), `engine.ts` (`predictSkill`) | Client đoán đòn kế bằng `comboNext` (hết `combo.window` thì về đòn 1) và lấy lại `n` của FX server làm chuẩn. Cả bấm phím lẫn tự đánh đều vào thế dự đoán. Đòn nối vào thế từ độ mạnh đòn trước (`lead`), không tụt về tư thế nền giữa hai đòn |
| Lao người | `animrules.ts` (`lungeOffset`, `lungeReach`), `skinned.ts` (`updateOffsets`) | Chỉ chuỗi đánh thường có mục tiêu: 0,5 m, đòn đẩy lùi 1,2 m, không vượt chỗ đứng sát mục tiêu, trần 1,5 m. Ghi vào `inner.position`, vị trí logic không đổi |
| Lướt hiển thị | `skinned.ts` (`dashFrom`), `entities.ts` (`posAgo`), `engine.ts` (`onFx`) | Khi FX lướt tới, hình xuất phát từ vị trí vẽ cách đây 0,3 s rồi nội suy về vị trí thật của root (server/đối soát đặt), nên đúng dù gói vị trí tới trước hay sau FX. Chạy clip `run` 2,2× trong thời lượng lướt |
| Sự kiện tại `hitAt` | `view.ts` (`SkillEvent`), `engine.ts` (`onSkillEvent`) | `windup`, `hit` (mỗi mốc một lần), `recovery`, `cancel`, `end`; theo đồng hồ animation (đứng khi hit-stop). K-6 (VFX) và K-7 (camera, âm đòn) đăng ký bằng `game.onSkillEvent(fn)`. Dev: `__game.skillLog` |
| Trúng đòn có hướng | `skinned.ts` (`hitClipFor`), `animrules.ts` (`hitDirOf`) | Hướng giật → `hit_front_1/2` (xen kẽ), `hit_back`, `hit_l`, `hit_r`; đòn nặng (`hv`) → `hit_heavy`. Không có hướng thì `hit_light` như cũ |
| Ngã → đứng dậy | `skinned.ts` (`knockdown`), `engine.ts` (`KNOCKDOWN_FRAC`) | Boss đánh nặng từ 18% máu tối đa trở lên: `knockdown` phát 1,5× (`KNOCK_RATE`), nằm 0,35 s (`KNOCK_LIE`), rồi `getup` 1,3× (`GETUP_RATE`). Người chơi vẫn đi lại được (server không khóa): đi lại chỉ kéo dậy sớm khi đã ngã xong (đang trong khoảng nằm, nhánh `sh.left <= KNOCK_LIE`), không dậy giữa lúc loạng choạng |
| Thủ thế | `playerSkins.ts` (`combatBias`, `COMBAT_HOLD`) | Vừa ra chiêu, trúng đòn hay niệm chú trong 4 s và đang cầm kiếm: đứng yên thì phát `combat_idle`. Chết thì tắt |
| Nạp K-3 lười | `playerSkins.ts` (`loadK3`) | 1,5 s sau khi mẫu nhân vật xong, nạp `anim_human_k3`, retarget từng clip một lượt `setTimeout` (không khựng khung), rồi `addClips` cho mọi bản sao đã dựng và dựng sau. Lỗi thì giữ bộ clip cũ |

## Ghi chú thiết kế

- `AnimState` không bị đổi hành vi: `moveDir` và `combat` chỉ thêm; đường cũ (quái, NPC, model khối) không đổi.
- Hủy chiêu chỉ cắt hình, không cắt hiệu quả đã hẹn: sát thương do server áp tại `hitAt` bất kể hình bị cắt thu về.
- Tự đánh trước đây không dự đoán nên đòn nối bắt đầu giữa động tác (từ `hit[0] − FX_LEAD`); giờ đi chung `predictSkill`.
- `perform.test.ts`, `playerSkins.test.ts` (mục "máy trạng thái chiêu", "clip K-3 nạp lười") và `animrules.test.ts` kiểm các điểm trên bằng clip thật.

## Số đo và ảnh

- `pnpm bench:client` (RTX 3060 Ti, Chrome, 3 điểm × 3 preset × WebGPU/WebGL2): CPU p95 từ 2,8 ms (sân, thấp) đến 7,8 ms (WebGL2/cao, rừng), dưới ngưỡng 8 ms; draw call tối đa 160 (ngân sách 300); không lỗi console. Ô WebGL2/cao ở sân tông môn chỉ 29–37 fps dù CPU 3,5 ms (GPU/bloom, lặp lại ở cả hai lần chạy; chưa đối chiếu với `main`).
- Nhật ký sự kiện ở `skill-events.json`: đòn thường `hit` tại 0,26–0,27 s sau lúc vào thế (dữ liệu `hitAt` = 0,26 s), chiêu Kiếm Khí Trảm 0,28–0,29 s (dữ liệu 0,28 s), Hộ Thể 0,38–0,39 s (0,38 s). Hủy thu về khi đi lại: sự kiện `cancel` ở 0,47–0,48 s (dữ liệu `cancel.move` = 0,46 s cho Kiếm Khí Trảm). Lướt hủy Hộ Thể ở 0,48–0,51 s (sau `cancel.dash` = 0,38 s).
- Ảnh cận cảnh (nam Thanh Phong và nữ Lam Chi, GPU thật, tắt tiếng, camera 3,4 m, góc 3/4 ngang hông, nhân vật ~45% chiều cao khung; mỗi ô 150 ms, viền đỏ = khung sự kiện `hit`): `*-combo-3-don.webp` (chuỗi 3 đòn), `*-luot-huy-thu-ve.webp` (lướt hủy thu về), `*-trung-don-co-huong.webp` (trước, phải, sau, trái, nặng), `*-nga-dung-day.webp` (ngã nằm → đứng dậy), cùng `*-chieu-kiem-khi-tram.jpg` và `*-di-chuyen-huy-thu-ve.jpg`. Chụp lại bằng `pnpm shots:k4 --out <thư mục tuyệt đối> [--dist 3.4]`.
- Ngã: clip `knockdown` dài 3,7 s (loạng choạng ~1,2 s rồi mới ngã nằm ở cuối) nên phát 1,5× (≈ 2,4 s) rồi nằm 0,35 s và `getup` 1,3× (≈ 1,25 s). Clip phát toàn thân ở lớp nền, không chia thân trên/dưới (đã kiểm trên ảnh: nằm sát đất ở 2,0–3,0 s). Đi lại chỉ kéo dậy sớm sau khi đã ngã xong.
- Chớp trúng đòn (`hitreact.ts`): trước đây trắng gần tinh (0xfff6e8, khựng lâu thì chớp lâu) che mất hình nhân vật; giờ màu kem 0xd2c8b6 / vàng dịu 0xd2a850 (chí mạng), chớp tối đa 0,06 s. Ảnh hưởng mọi nhân vật bị đánh.
- Đối chiếu `main` (cùng máy, `pnpm bench:client --renderers webgl2 --presets high`): ô sân tông môn WebGL2/cao `main` 35,1 fps (CPU p50 3,2 ms), K-4 29,1 và 37,6 fps (CPU 3,4–3,5 ms) → hiện tượng có sẵn, GPU-bound, không do K-4. Rừng 72,3 so với 67–72,6; hồ 85,6 so với 86,9–90,4.

## Ảnh then chốt

- [`nam-combo-3-don.webp`](nam-combo-3-don.webp)
- [`nam-luot-huy-thu-ve.webp`](nam-luot-huy-thu-ve.webp)
- [`nam-nga-dung-day.webp`](nam-nga-dung-day.webp)
- [`nam-trung-don-co-huong.webp`](nam-trung-don-co-huong.webp)
- [`nu-combo-3-don.webp`](nu-combo-3-don.webp)
