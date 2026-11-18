# DV3-J: cân bằng chương 5 (Hóa Thần 28 → Anh Biến 32)

`pnpm sim:progress` có thêm khối **Nhịp chương 5** (`[pace5]`, `packages/content/src/sim.ts`): cụm quái Bắc Hoang, nhiệm vụ `q5_*`/`s5_*`, Xích Tẫn Khích (cấp 28), Kim Dạ Cung (cấp 31), hai boss ngoài trời, tâm ma, chế Anh Biến Lộ, Nhật Thực Kiếp. Mục tiêu 10 giờ ±12%.

| | Trước (xpMul cũ) | Sau |
| --- | --- | --- |
| Kiếm tu | 13,16 giờ | 10,05 giờ |
| Hộ pháp | 13,50 giờ | 10,30 giờ |
| Đan sư | 13,43 giờ | 10,25 giờ |

Đổi dữ liệu: `xpMul` ×1,4 cho 4 quái thường và 4 tinh anh Bắc Hoang; `mon_giac_kiem_trong_binh` hpMul 1,5 → 1,7 (TTK cấp 31 Kiếm tu 3,7 s → 3,8 s); Kim Dạ Miên Phiến (cần 3 mỗi lần chế Anh Biến Lộ, nguồn trước đó chỉ ≈ 2,1) nay ≈ 6,0 nhờ boss Tẫn Hỏa Kiếm Cơ 1–2 (chắc chắn), Kim Dạ Ma Hậu 2–3 và `q5_kim_da` thưởng thêm 2. `s5_cham_ba` đổi mục tiêu sang tinh anh Dạ Minh Lộc Vương (Khô Lộc Lâm), `minLevel` 33 → 28: quái cũ chỉ có trong phó bản và không có asset nguồn để đặt ra bản đồ. `q5_ngu_bia` đã không còn mục tiêu Huyết Giác Ma Tướng (nay 5 bia `touch`). Kẹp cấp 28 của `gen-bac-hoang.mjs` đã gỡ từ DV-3K; không cần sinh lại bản đồ.

Giả định chưa kiểm bằng người: Nhật Thực Kiếp qua 75% (chưa mô phỏng cơ chế), đồ bậc 5 mặc 20/40/60/80% ở cấp 28–31.
