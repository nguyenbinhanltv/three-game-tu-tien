# P3-9 Tổ đội và tỉ thí

Server quyết định mọi thứ; client chỉ gửi ý định (`pty`, `duel`) và hiển thị (`pty`, `inv`, `duel`).

## Tổ đội (tối đa 4 người)

- Lập: `/moi <đạo hiệu>` trong chat hoặc nút **Mời** ở bảng Tổ đội (phím **P**). Người nhận hiện thẻ Nhận lời / Từ chối, hết hạn sau 30 giây.
- Chỉ trưởng nhóm mời, đuổi, giao quyền, đổi chia đồ. Trưởng nhóm rời thì thành viên kế tiếp lên. Còn 1 người thì giải tán.
- Tổ đội sống ở cấp tiến trình (`apps/server/src/game/party.ts`), qua mọi kênh và room bí cảnh; ngoại tuyến quá 2 phút thì bị mời ra. Không lưu DB (khởi động lại server thì giải tán).
- Chống spam: 1 lời mời / 2 giây và 8 / phút mỗi người, tối đa 3 lời chờ mỗi người nhận, cùng một cặp phải chờ 15 giây sau khi bị từ chối/hết hạn, không mời trùng lời đang chờ. Nhận lời cần có lời mời thật (server giữ), nên không giả mạo được.
- Khung tổ đội dưới khung nhân vật: tên, vai trò, cảnh giới, máu, linh lực; chat tổ đội `/p <lời>`; `/roi` rời tổ đội.

## Chia tu vi (`packages/shared/src/party.ts`)

Đồng đội còn sống, cùng room, cách chỗ quái chết ≤ 45 m được chia, kể cả khi không ra đòn (Hộ pháp, Đan sư). Trọng số theo khoảng cách: ≤ 25 m trọn phần, ≤ 45 m nửa phần, xa hơn không được chia (và không làm loãng phần người khác).

Tổng tu vi nhân `1 + 0,2 × (số người được chia − 1)`: 2 người 1,2×; 3 người 1,4×; 4 người 1,6×. Chia theo trọng số rồi nhân hệ số cảnh giới riêng. Mỗi người đánh một mình vẫn nhận trọn như cũ; vào đội 4 người mỗi người nhận 40% nhưng hạ quái nhanh hơn nhiều. Người đánh mà ở xa hoặc đã ngã thì tính riêng như người đơn. Đồng đội trong tầm cũng được tính nhiệm vụ diệt quái.

## Chia đồ

- **Theo lượt** (mặc định): mỗi lần hạ quái thường một người nhận đồ (vật phẩm và trang bị roll một lần), theo vòng tròn, bỏ qua người hết lượt thưởng bí cảnh; mọi người đều nhận linh thạch.
- **Tự do**: ai trong tầm cũng tự roll phần của mình như đánh một mình.
- **Boss**: luôn mỗi người một phần riêng (đúng thiết kế "ai đóng góp đều có rương riêng").
- Không lộ tỉ lệ rơi: client chỉ nhận món đã vào túi qua `sys.loot`. Mỗi lần nhận đồ vẫn là một transaction + dòng ledger.

## Cộng hưởng vai trò

Vai trò theo công pháp: Kiếm tu (`lac_kiem_quyet`), Hộ pháp (`bat_dong_kim_than`), Đan sư (`thanh_moc_dan_kinh`). Đủ ba vai trò, còn sống, đứng trong 40 m của nhau thì mỗi người trong cụm nhận: +5% tu vi, +5% sát thương gây ra, −5% sát thương nhận. Khung tổ đội hiện nhãn **Cộng hưởng**.

## Tỉ thí (võ đài sân Lạc Kiếm Tông)

- Chỉ ở kênh thế giới, cả hai đứng trong võ đài (bán kính 26 m quanh sân). Mời bằng `/tithi <đạo hiệu>` hoặc nút **Tỉ thí**, đối phương Nhận lời. Đếm ngược 3 giây rồi đánh; thắng khi đối thủ cạn máu; **Chịu thua**; rời võ đài quá 4 giây thì thua; quá 3 phút thì hòa; rời room hoặc ngã do quái thì hủy.
- Đấu tập: vào trận đầy máu và linh lực, hết trận trả lại đúng như trước trận. Không ai ngã thật (máu tối thiểu 1), không mất tu vi/đồ, **không tu vi, không linh thạch, không đồ rơi, không tính nhiệm vụ, không nạp sạc/kiếm ý**. Chiêu đánh người nhân 0,6.
- Chống lợi dụng: chiêu đánh người chỉ nhắm được đúng đối thủ (id người lạ hoặc đồng đội bị từ chối); người thứ ba không đánh hay hồi máu/khiên cho người đang tỉ thí; trong trận không dùng đan dược hay đổi trang bị; cùng một cặp nghỉ 10 giây giữa hai trận; lời thách đấu cũng chịu giới hạn tần suất như lời mời tổ đội.

## Ảnh

Chụp bằng `pnpm shots:party` (3 tab, Chrome GPU thật, WebGPU, tắt tiếng): `party-invite`, `party-frame-resonance`, `party-frame-member`, `party-panel`, `loot-turn-a/b`, `duel-invite`, `duel-countdown`, `duel-fight`, `duel-fight-b`, `duel-result-win`, `duel-result-lose`.

## Kiểm tra

`pnpm --filter @dtl/server test` (`game/party.test.ts`), `pnpm --filter @dtl/shared test` (`party.test.ts`), `pnpm --filter @dtl/bot-client security` (mục 16), `pnpm bots --count 100 --duration 120` + `pnpm ledger:check`.
