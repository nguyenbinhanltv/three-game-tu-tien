# P3-8: pháp bảo phụ và đan dược

Ngày 2026-11-15. Ba pháp bảo dựng trên Tripo web (H3.1, 3000 mặt, texture 2K, PBR), concept Codex. Ảnh chụp bằng GPU thật (WebGPU, tắt tiếng): `pnpm shots:p38 --out docs/p3-8` (cổng `PORT`/`CLIENT_PORT`).

## Pháp bảo (ô 8 "Pháp bảo phụ", phím 9 hoặc bấm ô)

| Pháp bảo | Kỹ năng | Hồi chiêu / linh lực | Nội tại (mỗi cấp) | Cách hiện |
|---|---|---|---|---|
| Tử Kim Hồ Lô (`itm_tu_kim_ho_lo`, cảnh giới 6) | Hấp Linh: hút tối đa 5 quái trong 12 m, mỗi quái hồi 7% linh lực tối đa (tinh anh gấp đôi) | 24 s / 0 | linh lực tối đa +4% | treo hông trái, khi dùng bay vòng quanh người |
| Trấn Hồn Linh (`itm_tran_hon_linh`, cảnh giới 9) | Trấn Hồn: quái đang giao chiến trong 14 m choáng 2,5 s; boss +35% phá thế và bị ngắt chú nếu đúng cửa sổ | 30 s / 25 | phá thế lên boss +6% | treo hông phải, khi dùng lơ lửng trước người và rung |
| Thanh Liên Ấn (`itm_thanh_lien_an`, cảnh giới 12) | Liên Quang Hộ Thể: khiên 18% khí huyết tối đa cho mình và đồng đội tổ đội trong 22 m, 4 s | 40 s / 30 | phòng ngự +3% | đeo sau lưng, khi dùng nâng lên trên đầu và xoay chậm |

- Cấp 1–5: mỗi cấp +12% sức mạnh kỹ năng, −4% hồi chiêu. Lên cấp bằng linh khí nạp khi hạ quái đang đeo pháp bảo (quái thường 1, tinh anh 3, boss 15; quái thấp hơn mình quá 5 cấp không nạp). Cần 60/150/300/500 linh khí cho cấp 2/3/4/5.
- Có được bằng chế ở Thiết lão (tab "Luyện bảo"): mỗi người một món mỗi loại, cần cảnh giới và nguyên liệu (Yêu Đan, Kiếm Phách, Thiết Tinh, Huyết Linh Chi, Hàn Giao Nội Đan), một transaction + idem + ledger.
- Server quyết hết: hồi chiêu, linh lực, mục tiêu, hiệu ứng (`apps/server/src/game/sim.ts` `onArtifact`, `artifact.ts`). Client chỉ gửi `art` không tham số. Tiến độ lưu trong `characters.meta.art` (không đổi DDL). `S.METHOD` mang `art` (cấp, linh khí) và `buffs`.
- Công thức: `packages/shared/src/artifacts.ts`. Dữ liệu: `packages/content/data/artifacts.json`.
- Animation thủ tục (không xương, không clip): `apps/client/src/game/artifactVis.ts`, tư thế nghỉ/kích hoạt là hàm thuần có test. VFX nhẹ: một vòng sáng dưới chân, tia hút của Hồ Lô, chớp nhỏ của Linh; không trụ sáng, không chớp toàn cảnh.
- Model: lớp ngân sách mới `artifact` (1000–3000 tam giác, LOD 40%/15%, texture 512) trong `assets/budgets.json`. Tam giác LOD0 sau tối ưu: Hồ Lô 2918, Linh 2942, Ấn 2767.
- Icon: 3 pháp bảo + 3 đan theo họ icon M4-7 (atlas thêm một hàng, 8×6).

## Đan: phẩm chất và đan tăng sức

- Phẩm Hạ/Trung/Thượng do server roll từng viên khi luyện (`rollPillQuality`, `randomInt`), lưu ở trường `plus` của ô túi (đan không có cường hóa). Chồng chung ô chỉ khi cùng phẩm. Vết roll nằm trong lý do ledger (`roll=pill:…`).
- Xác suất: thường Hạ 62% / Trung 30% / Thượng 8%; công pháp Thanh Mộc Đan Kinh Hạ 34% / Trung 40% / Thượng 26%. Hiệu lực ×1 / ×1,2 / ×1,45 (hồi máu, hồi linh lực, tu vi Tụ Khí Đan, mức và thời gian buff). Phá Cảnh Đan, Trúc Cơ Đan, bí tịch không có phẩm.
- Đan tăng sức (10 phút, làm mới không cộng dồn): Kim Cương Đan phòng ngự +15%, Bạo Huyết Đan bạo kích +8% (trần chung 40%), Mãnh Lực Đan công kích +10%. Lưu trong `characters.meta.buffs` (giờ hết hạn theo đồng hồ server), hiện ở hàng buff trên thanh chiêu.
- Công thức luyện ở Dược sư Tố Tâm, bảng luyện hiện tỉ lệ phẩm (xanh khi đang theo Đan Kinh).

## Kiểm

`pnpm typecheck`, `pnpm test` (shared 125, client 334, server 165, asset-pipeline 17), `pnpm content:check`, `pnpm assets:validate` (0 lỗi), `pnpm sim:progress` (nhịp lên cấp không đổi), `pnpm --filter @dtl/bot-client security` (thêm bài 17: pháp bảo và đan), `pnpm bots --count 100 --duration 120` rồi `pnpm ledger:check` (khớp), `pnpm bench:client` (đạt ngân sách ở cả sáu tổ hợp).

## Ảnh

| Ảnh | Nội dung |
|---|---|
| `ho-lo-deo.jpg`, `ho-lo-tooltip.jpg`, `ho-lo-kich-hoat*.jpg` | Hồ Lô: đeo, ô thanh chiêu + tooltip, kích hoạt |
| `linh-deo.jpg`, `linh-tooltip.jpg`, `linh-kich-hoat*.jpg` | Trấn Hồn Linh |
| `an-deo.jpg`, `an-tooltip.jpg`, `an-kich-hoat*.jpg` | Thanh Liên Ấn (khiên) |
| `luyen-dan-bang.jpg`, `luyen-dan-ket-qua.jpg`, `tui-dan-pham-chat.jpg` | Bảng luyện đan có tỉ lệ phẩm, kết quả, túi đan theo phẩm |
| `buff-dan-tang-suc.jpg` | Hàng buff đan tăng sức |
| `luyen-bao-bang.jpg` | Tab "Luyện bảo" ở Thiết lão |
