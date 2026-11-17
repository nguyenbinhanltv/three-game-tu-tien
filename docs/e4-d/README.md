# E4-D + E4-L · Thiên Nhân Kiếp (độ kiếp lên Hóa Thần sơ kỳ, cấp 28)

Kiếp thứ tư trong `packages/content/data/tribulations.json` (`hoa_than`): 80 giây, room riêng `tribulation` (tổ đội tối đa 4 vào làm hộ pháp, một mình vẫn qua được), thiết kế ở `docs/EXPANSION_DESIGN.md` mục 3.3. Bật cờ `enabled` nên `peakGated` không còn chặn cấp nào (cấp 27 có bình cảnh như 15/19/23).

## Vật phẩm và điều kiện vào kiếp

- **Hóa Thần Lộ** (`itm_hoa_than_lo`): chế ở Tố Tâm (`rcp_hoa_than_lo`, cấp 27: 3 Thần Tàng Ngọc + 5 Tinh Quang Mặc + 2 Cổ Thành Phiến + 16 Yêu Đan + 8.000 linh thạch); rơi hiếm 1% ở thưởng hoàn thành Thần Tàng Điện (`levels/than_tang.json`). Tiêu khi tới sân kiếp, hoàn lại nếu trụ quá 40 s (`refundAfter`) rồi thất bại.
- Điều kiện (đủ tu vi, qua bình cảnh 27, có vật phẩm, ở ngoài phó bản) và luồng vé/room do E1-F, E3-L sẵn có; `/gm trib hoa_than` thử ngay. Nhiệm vụ `q4_hoa_than` đầy đủ là gói H (chưa làm).

## Ba pha

| Pha | Giây | Cơ chế (dữ liệu ở `phases[].nguHanh|phanThan`) |
| --- | --- | --- |
| Ngũ hành lôi | 0–25 | Năm **trận môn** (r 3 m) trên vòng r 9 m quanh chỗ đứng lúc vào kiếp, trận `i` ứng hành `ELEMENTS[i]` (Kim, Mộc, Thủy, Hỏa, Thổ), dấu vẽ bằng vạch `pool`. Mỗi 5 s (đầu tiên ở 3 s) một **tia kiếp** mang hành xoay vòng Kim→Mộc→Thủy→Hỏa→Thổ quét cả sân (báo 2,2 s, 20% khí huyết). Đứng trong trận môn **khắc chế** hành đó lúc nổ thì giảm 80% và `DmgMsg.ke = 1` (chữ "khắc" nổi cạnh số sát thương) |
| Thần niệm | 25–55 | Phím **G** (miễn phí trong kiếp, tối đa 4 lần, mỗi lần 20 s) tách **thế thân** đứng yên ở chỗ đang đứng. Hai **tia quét** (30×4 m, ở 31 s và 42 s), một **cột thiên phạt** rơi lên 3 trận môn (không gồm trận môn thứ hai) lúc 49 s, và **mạch nối thiên phạt** (35% khí huyết) khóa người độ kiếp ở 52,5 s: tránh được nếu thế thân hoặc chính thân đứng trong trận môn thứ hai (hành Mộc; thế thân gánh hết rồi tan, thân gánh còn 20% kèm `ke`). Thân chính chạy tới bù khi thế thân đã đặt chỗ khác |
| Thiên nhân hợp nhất | 55–80 | Tia lớn 11 m, báo 4 s, 75% khí huyết (`final`); thế thân còn sống chắn **40%** rồi tan, hộ pháp (cùng tổ đội, trong 12 m, tối đa 2) chắn thêm 25%. Hai tâm ma phân thân tấn công từ hai bên (`shadows`) |

Thành công: Hóa Thần sơ kỳ (cấp 28), `ascend` mang `tb: hoa_than` (thẻ chương `ascend_hn`, vòng sáng vàng sao nhạt, FX timeline `fx_dotpha_hn`/`fx_kiep_hn` bảng màu `dotpha_hn`). Thất bại: mất 15% tu vi như các kiếp trước.

## Mã

- Shared: `packages/shared/src/tribulation.ts` (kiểu `TribNguHanh`, `TribPhanThan`, hàm thuần `tribSealPos`, `nguHanhIndex`, `nguHanhSealFor`, `elemCounterOf`, hằng `TRIB_LINK_SEAL`), `C.TRIB_CLONE` (`tclone`) ở `protocol.ts`.
- Server: `apps/server/src/game/tribnhan.ts` (cơ chế `ngu_hanh`, `phan_than`, hàm thuần `sealAt`, `linkBlocker`; trạng thái ở `tr.mech`, chỉ server giữ), `trib.ts` (`HazardExtra`, `clone`, `cloneAbsorb`), `sim.ts` (`Hazard.seal` cho cờ `ke`, thế thân chắn tia khóa mệnh ở `tickHazards`, `onTribClone`), `rooms.ts` (`C.TRIB_CLONE` qua `rateOk`).
- Client: `game/engine.ts` (phím G chỉ gửi ý định, FX `nguhanh|phanthan|phanthan_end|thienphat`, chữ "khắc"), `game/vfx.ts` (`thanNiem`, `ascendGlow` Hóa Thần), `ui/Hud.tsx` + `tutien.css` (dòng hành đang giáng và trận môn cần đứng, đếm thế thân), `game/chapter.ts`, `render/vfx/palette.ts` (`dotpha_hn`).
- Thế thân là **móc riêng của kiếp**: phân thân thần niệm thật của người chơi (phím G ngoài kiếp, thực thể phụ có chủ, dùng chiêu cuối) là gói E4-K; khi đó nối vào `cloneOut` và bỏ `C.TRIB_CLONE` nếu không cần.

## Kiểm

- `apps/server/src/game/hoathan.test.ts` (15 test): dữ liệu, hàm thuần, trận môn giảm 80% + `ke`, G theo pha và giới hạn, tia quét/cột thiên phạt/mạch nối, thế thân chắn 40%, hai tâm ma, thành công/thất bại/hoàn vật phẩm, và bot "người chơi giỏi" một mình không đan (né vạch báo, đứng đúng trận môn) qua kiếp ở ≥ 6/8 hạt giống, xuống thấp dưới 60%.
- `trib.golden.test.ts` **không đổi**: Trúc Cơ giữ hành vi y hệt (thứ tự `Math.random` và thứ tự vùng) vì mọi thêm thắt nằm sau tham số mới tùy chọn của `addHazard`; test băm vẫn khớp. Không có golden cho Hóa Thần vì kiếp này có nhánh ngẫu nhiên theo vị trí người chơi (cân bằng kiểm bằng bot ở trên).
- Cân bằng bản đầu (cần chơi thử): một mình, không đan: bot giỏi còn thấp nhất ~8% khí huyết ở hạt giống thử; có đan (3 viên) và hộ pháp thì thoải mái hơn. Chỉnh trước tiên `phases[2].final.pct`, `nguHanh.pct`, `phanThan.linkPct`.

## Chưa làm / ghi chú

- Cắt cảnh điện ảnh riêng cho Hóa Thần: dùng thẻ chương `ascend_hn` và FX timeline, chưa có camera path riêng (như Nguyên Anh).
- Nhiệm vụ `q4_hoa_than` đầy đủ (gói H); icon `itm_hoa_than_lo` dùng emoji dự phòng.
- Phân thân thần niệm thật, lĩnh vực lớn, ô chiêu 10: E4-K.
