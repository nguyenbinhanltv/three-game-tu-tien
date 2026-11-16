# E2-D · Đan Hỏa Kiếp (Kết Đan)

Dãy khung một lần độ kiếp Kết Đan 55 s (`/gm trib ket_dan`, chạy bằng `pnpm shots:e2d --out <thư mục tuyệt đối>`, Chrome GPU thật, tắt tiếng, 1600×900). Ghi chú thiết kế/triển khai: `docs/EXPANSION_DESIGN.md` mục 10.6.

| Ảnh | Mốc | Nội dung |
| --- | --- | --- |
| `01-pha1-loi-van-tu` | ~6 s | Pha 1, như Trúc Cơ nhưng tia phụ 2 |
| `02-pha2-dan-tran-cat-canh` | ~13 s | Cắt cảnh nhìn xuống Đan Trận vừa mở (giữ HUD) |
| `03-pha2-dan-tran-bat-dau` | ~16 s | Vòng Đan Trận lam trầm, thanh ngưng đan ở HUD |
| `04-pha2-nguong-dan-giua` | ~27 s | Ngưng đan ~75%, tâm ma tràn vào |
| `04b-pha2-tia-quet-1/2` | pha 2 | Vạch sét 18×3 m báo 0,9 s đi qua vòng (nhìn từ trên) |
| `05-pha2-dan-day` | ~34 s | Thanh 100%, viên đan trên vòng ngả vàng ấm |
| `06`–`09` | pha 3 | Lôi hỏa nhuốm cam (dưới trần HDR), tia cuối khóa mệnh báo 3 s rồi nổ |
| `10-thanh-cong-ascend` | ~57 s | Vành đan quang + thẻ chương Kết Đan |
| `11-the-chuong-ket-dan` | ~59 s | Thẻ chương sau độ kiếp |
| `12-the-chuong-2-doan-mach` | — | Thẻ Chương 2 · Đoạn Mạch lần đầu tới |

Kiểm tự động: `apps/server/src/game/kettan.test.ts` (luật thanh, tiêu/hoàn vật phẩm, thất bại khi bỏ vòng, thành công lên cấp 20), `content:check` (kiếp bật phải có vật phẩm + công thức, thông số `danTran`, `peakGated`).
