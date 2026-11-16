# E3-K: nguyên anh xuất khiếu, ngự không, thuấn di

Mở ở **Nguyên Anh sơ kỳ (cấp 24)** theo `docs/EXPANSION_DESIGN.md` 2.5 và 11.3. Dùng `/gm level 24` để thử. Server quyết định mọi thứ; client chỉ gửi ý định (phím X, Q) và vẽ.

## Luật

| Cơ chế | Luật | Code |
| --- | --- | --- |
| **Xuất khiếu cứu mạng** | Chết ở cấp ≥ 24: nguyên anh thoát ra 10 s (cờ `PF_SOUL`), **không mất tu vi**, rồi hồi sinh ở điểm an toàn của room với **30% khí huyết**; bấm "Hồi sinh" sớm cũng được 30%. Mỗi **10 phút** một lần (theo nhân vật, giữ qua đổi room), lần sau chết như thường. Không áp dụng ở phó bản có `maxRevives` (sẽ qua mặt giới hạn lượt hồi sinh), lúc độ kiếp, thử tâm ma | `apps/server/src/game/soul.ts` (`onDeath`, `consumeDeath`), `sim.ts` `killPlayer`/`onRespawn` |
| **Xuất khiếu chủ động (X)** | Nguyên anh rời thân xác tối đa 20 s: bay tự do **xuyên kiến trúc** (không xuyên vách địa hình/ranh vùng chơi), trong **60 m** quanh thân xác, cao ≤ 30 m so với đất; không nhận sát thương, quái không đuổi, không ra chiêu/dùng đồ/mua bán (chỉ nhận input, chat, thần thức, đánh dấu, tổ đội). Nhập lại bằng X, hết giờ, hoặc khi rời room/chuyển room/lưu (vị trí lưu luôn là của thân xác). Hồi chiêu 30 s, không dùng được khi vừa giao chiến (5 s), đang niệm, độ kiếp, tỉ thí, thiền | `soul.ts`, `shared/src/movement.ts` (`MoveCtx.ghost`) |
| **Ngự không** | Từ cấp 24 bay trong **30 m** so với mặt đất không cần kiếm, **miễn linh lực** (Trúc Cơ chỉ 20 m), **chậm hơn ngự kiếm 15%** (`SKY_SPEED_MUL`); trên 30 m là ngự kiếm như cũ (tốn linh lực, tốc độ đủ) | `movement.ts` (`freeFlight`, `MoveCtx.sky`), `sim.ts` `applyInput` |
| **Thuấn di (Q)** | Thay Lướt cơ bản (`skl_kiem_anh_bo`, `skl_thiet_bich_xung`, `skl_luu_huong_bo`) từ cấp 24: **12 m**, hồi **14 s**. Vẫn lập đường bằng `planDash` (không xuyên vách/kiến trúc/ranh bản đồ, chặn dốc đứng); đường bị chặn thì không tốn linh lực, không hồi chiêu. Không dùng khi đang bay (luật cũ "không ra chiêu khi `airborne()`"), chết, hay dạng nguyên anh. Chiêu bậc cao (`dash.pierce|push`) không đổi | `sim.ts` `onDash`, `shared/src/soul.ts` (`blinkReplaces`) |

Phím: **X** nay là xuất khiếu; bay xuống chỉ còn **Shift** (trước đây X hoặc Shift).

## Hình

- Bóng anh (`game/soulVis.ts`): giọt trắng xanh cộng sáng, độ đục 0,5, cao ~1 m, lơ lửng; thân xác bỏ lại có cột sáng mảnh + vòng chân + vòng giới hạn 60 m (chỉ chủ nhân thấy thân xác; người khác chỉ thấy bóng anh). Chết: bóng anh bay vòng cung về điểm an toàn trong 10 s. Thuấn di: hai vòng đứng ở điểm đi/đến và một vệt nối. Không lóa che nhân vật (art bible v3).
- Ngự không: pose lặp mới `ngu_khong` (đứng thẳng lơ lửng, không kiếm; `states.ts` trạng thái `sky`, `AnimState.sky`); phi kiếm chỉ hiện khi bay trên 30 m.
- HUD: ô **X** cạnh thần thức (hồi chiêu, đếm ngược lúc đang xuất khiếu, tooltip kèm hồi chiêu cứu mạng); bảng chết đổi lời khi nguyên anh thoát ra. Icon ô X đang dùng biểu tượng dự phòng (👻), chưa có icon vẽ.

## Kiểm

- `packages/shared/src/soul.test.ts` (ngự không, ghost xuyên va chạm, giới hạn tầm/độ cao), `apps/server/src/game/soul.test.ts` (17 ca: chưa mở, xuất khiếu/nhập lại, hết giờ, hồi chiêu, giao chiến, bất khả xâm phạm, drop, cứu mạng 30%/không mất tu vi/10 phút, thuấn di 12 m/hồi 14 s/chặn ranh/đang bay/chết/dạng nguyên anh, ngự không không tốn linh lực).
- `pnpm --filter @dtl/bot-client security`: thêm mục g (chưa Nguyên Anh từ chối, xuất khiếu, không rời 60 m, không ra chiêu, nhập lại đúng chỗ, rác/spam lúc hồi chiêu). Tất cả ĐẠT.
- `pnpm bots --count 100 --duration 120`: 0 dòng `refId`, tick p95 4–6 ms trên máy đang chạy nhiều tiến trình khác; `pnpm ledger:check`: sổ cái khớp.
- `pnpm shots:e3k --out <thư mục tuyệt đối>` chụp lại các ảnh dưới đây (WebGPU, tắt tiếng).

## Ảnh

| Ảnh | Nội dung |
| --- | --- |
| `01`, `02`, `03` | Thanh chiêu trước/sau Nguyên Anh (ô X), tooltip xuất khiếu |
| `04`, `05` | Ngự không (không kiếm, dưới 30 m), trên 30 m ngự kiếm |
| `06`, `07` | Thuấn di (vừa dịch, tan) |
| `08`, `09`, `10`, `11`, `12` | Xuất khiếu: vừa rời thân xác, bay xa (thân xác ở lại, vòng 60 m), nút X, nhập lại, hồi chiêu |
| `13`, `14`, `15` | Chết ở Nguyên Anh: nguyên anh thoát ra, bảng đếm ngược, hồi sinh 30% |

`e3k-log.json`: số đo từ lần chụp (khoảng cách thuấn di 12,00 m, vị trí xuất khiếu/nhập lại).

## Giới hạn, việc để lại

- Thân xác lúc xuất khiếu chủ động **không hiện với người khác** (chỉ bóng anh); nếu cần thân xác thật đứng lại thì phải thêm thực thể phụ (E4-K phân thân có thể dùng chung).
- Môn phong ấn và việc xuyên tường mở cửa (E4-M, `q4_xuat_khieu`) chưa nối: `MoveCtx.ghost` đã xuyên `terrain.colliders`; cổng phong ấn phải là collider (hoặc kiểm riêng) khi làm E4-M.
- Hồi chiêu cứu mạng/thám thính giữ trong bộ nhớ tiến trình (mất khi khởi động lại server).
- Icon ô X cần vẽ (`tools/icons`).
