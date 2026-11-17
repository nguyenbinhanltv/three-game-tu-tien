# DV-C: bướm trang trí (bướm mạch)

Gói DV-C của `docs/DIVUC_DESIGN.md`: sinh vật trang trí bay ở các bản đồ ngoài trời. Ảnh và video duyệt ở thư mục artifact của phiên (không commit).

## Vì sao không dùng `butterfly_revamp.glb`

Yêu cầu ban đầu là dùng file CC BY `butterfly_revamp.glb` (ghi là "đã có xương"). Khi mở ra thì **đó không phải con bướm**: là một nhân vật nữ cầm kiếm, 46 nghìn tam giác, 136 xương. Tên mesh, vật liệu và xương bên trong (`64600_DaoFengBaoBei_Body_VeryHigh`, `1161_JingKe_CT_Body_Show`, `Hero`) cho thấy đây là model tướng tên "Butterfly" trích từ một game thương mại, tải lên Sketchfab với nhãn CC BY. Cùng loại vấn đề với hai file Jett/Kafka đã loại (art bible, điều cấm 10), nên **không dùng**. File gốc trong `assets-online/` không bị đụng tới.

Thay vào đó bướm được **vẽ thủ tục hoàn toàn** (lưới và hoa văn cánh sinh bằng công thức): asset của dự án, không cần ghi công, không thêm file tải nào. Nếu sau này có model bướm CC0/CC BY thật, chỉ cần thay `butterflyGeometry()` và texture; phần rải, bay, instancing giữ nguyên.

## Cách làm (`apps/client/src/game/butterflies.ts`)

- **Một lưới instanced, một draw call** cho cả đàn: `InstancedBufferGeometry` + `Mesh` (cùng cách với `grass.ts`), tối đa 48 con, **8 tam giác mỗi con** (hai cánh, mỗi cánh hai đoạn). Dữ liệu từng con ở hai thuộc tính instance: vị trí + hướng bay; pha vỗ, cỡ, chỉ số màu, nhịp vỗ.
- **Vỗ cánh trong vertex shader (TSL)**: cánh quay quanh trục thân quanh góc dựng ~35° (nhìn ngang vẫn thấy mặt cánh), đầu cánh trễ pha và cong hơn gốc, thỉnh thoảng lướt. CPU chỉ tính đường bay.
- **Hoa văn**: `wingTexel(u, v)` (hai elip cho cánh trước/sau, viền tối, gân tỏa, hai đốm sáng, thân mảnh sát bản lề) → `DataTexture` 64², cắt alpha, không blend. Màu cánh nhân từ bảng 4 màu theo level.
- **Rải xác định theo ô 8 m** quanh người chơi (`spotsNear`, quét 2 ô ≈ 16–20 m): ô nào có đàn và đàn mấy con do hàm băm quyết định, nên ai đứng cùng chỗ cũng thấy đàn ở cùng điểm. Bỏ chỗ không hợp (`suitable`): ngoài vùng chơi, nước, dốc, sàn mây và vách đảo, đỉnh cao trên 235 m. Quét lại mỗi 0,75 s; con ra khỏi tầm mờ dần 0,7 s rồi mới nhả.
- **Bay**: lượn Lissajous bán kính 1,4–3,2 m quanh điểm đàn, nhấp nhô 0,4–2 m trên mặt đất; **dạt ra khi người chơi tới gần 3 m** rồi từ từ quay lại. Độ cao mặt đất mỗi con cập nhật một lần trong 4 khung, so le.
- **Ánh sáng**: vật liệu không nhận đèn (màu nhân hệ số sáng theo thời điểm, vẫn chịu sương) để cả đàn sáng đều, không nhấp nháy theo mặt cánh. Ban đêm số con giảm 65%. Level `glow` (Thiên Khuyết) thì giữ số con và cộng phát sáng tối đa 0,6, xa trần HDR 2,4.
- Chỉ là hình ở client: server không biết, không va chạm, không chọn được.

## Level có bướm (`BUTTERFLY_LEVELS`)

| Level | Mật độ (xác suất/ô) | Con/đàn | Màu |
| --- | --- | --- | --- |
| `van_lam`, `kiem_trung` | 0,30 | 2–4 | ngọc lam, ngà, hồng hoa đào, vàng nắng sớm |
| `doan_mach` | 0,12 | 1–3 | son, rơm, ngà |
| `van_hai` | 0,22 | 2–4 | trắng, lam nhạt, hồng |
| `thien_khuyet` | 0,12 | 1–3 | lam sao, ngọc; phát sáng nhẹ ban đêm |

Phó bản trong hang/điện và sân độ kiếp không có. Khi có level `bac_hoang` (chương 5): thêm một dòng, và theo thiết kế chỉ cho bướm quanh Mạch Nhãn Tàn và bia đã thắp (cần thêm điều kiện vào `suitable`).

## Số đo (WebGPU, preset Cao, `?mood=day`, một người chơi)

| Cảnh | Bướm đang vẽ | Draw call tắt (`?bf=0`) | Draw call bật |
| --- | --- | --- | --- |
| Thung lũng Vân Lam | 26 | 110 | 117–119 |
| Sân tông môn | 19 | 132 | 133 |
| Rừng | 13 | 134 | 131–139 |
| Vân Hải | 12 | | 130 |
| Thiên Khuyết | 4 | | 41 |
| Đoạn Mạch | 4 | | 61 |

Theo thiết kế bướm thêm đúng **một draw call** và tối đa 48 × 8 = **384 tam giác**. Số đo draw call lấy trung vị 12 mẫu của `__game.info()`; chênh lệch giữa hai lần chạy (±5) là do quái và LOD thay đổi, lớn hơn phần của bướm, nên bảng này chỉ xác nhận "không tăng đáng kể", không tách được đúng +1. Tải đầu không đổi (không có file mới; texture 16 KB sinh lúc chạy). Chưa chạy `bench:client`/`bench:crowd`.

## Dùng và thử

- `?bf=0` tắt bướm (so ảnh, số đo). Số con theo preset: Thấp 16, Vừa 32, Cao 48 (`BUTTERFLY_QUALITY`).
- Đang vẽ bao nhiêu con: `__game.butterflies.count` trong console dev.
- Test hàm thuần (lưới, hoa văn, băm, rải theo ô, ngân sách): `apps/client/src/game/butterflies.test.ts`.

## Giới hạn

- Bướm không đậu (luôn bay); không có bóng đổ.
- Phát sáng ban đêm ở Thiên Khuyết mới kiểm bằng công thức (cộng tối đa 0,6), chưa chụp ảnh đêm.
- Kiếm Trủng dùng chung cảnh với Vân Lam nên cũng có bướm trong lòng chảo bí cảnh.
