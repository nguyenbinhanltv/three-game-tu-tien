# Phụ kiện hình dáng cho 4 bộ trang bị

> **Ghi chú R-1 (2026-11-18):** ảnh/video duyệt PR của hạng mục này đã gỡ khỏi repo; thư mục chỉ giữ tối đa 5 ảnh then chốt (WebP). Tên file nhắc bên dưới mà không còn trong thư mục là ảnh đã gỡ, xem lại bằng `git show c78b50c6:docs/set-accessories/<file>`.

Trước đây bộ trang bị (P3-4) chỉ đổi màu áo bằng `applyDye`. Giờ mỗi bộ có thêm phụ kiện **dựng thủ tục lúc chạy** (không Tripo, không file asset mới, không tốn credit), gắn vào xương của cả hai model (Thanh Phong, Lam Chi).

| Bộ | Ô → phụ kiện |
| --- | --- |
| Lạc Kiếm Môn Phục (ngà + lam, bạc) | Đạo bào: vai áo hai lớp viền bạc + hai dải lụa đuôi én sau lưng. Hộ uyển: bao cổ tay lam, viền bạc, nút ngọc. Đai lưng: đai lam, khóa bạc, ngọc treo + dây tua bên hông. Vân ngoa: ống ủng lam viền bạc |
| Huyền Giáp Hộ Pháp (đen thép, viền vàng) | Đạo bào: vai giáp ba tầng góc cạnh viền vàng + tấm vải đen sọc vàng sau lưng. Hộ uyển: giáp tay thép có tấm nổi. Đai lưng: đai bản rộng, khóa vàng, ngọc đỏ. Vân ngoa: giáp ống chân cao viền vàng |
| Đan Tâm Y Bát (xanh ngọc, vàng nhạt) | Đạo bào: vai áo mềm hai lớp viền vàng + dải lụa nhọn sau lưng. Ngọc bội: đĩa ngọc viền vàng treo ngực trên dây chữ V. Đai lưng: đai xanh, hồ lô thuốc treo bên hông |
| Hàn Giao Lân (lam băng, vảy) | Đạo bào: vai vảy ba lớp có ba gai băng + ba vây băng dọc sống lưng. Giới chỉ: vòng vảy băng có ngọc ở bàn tay trái |

Hiện theo **từng món đã mặc** (một món lẻ cũng hiện, không cần đủ 2 món như màu áo). Server gửi `sa` (một ký tự mỗi ô trang bị, `accessoryCode` trong `packages/shared/src/sets.ts`).

## Cách làm

- `bodyFit.ts`: đo thân một lần cho mỗi asset (dựng bản sao, phát clip idle ở t = 0, đọc vị trí xương và đỉnh đã skin theo xương chủ đạo): eo, ngực, vạt áo, bán kính cánh tay trên, cẳng tay, ống chân. Phụ kiện lấy số đo này cộng khe hở 1 cm nên vừa cả nam lẫn nữ và không chui vào áo.
- `setAccessories.ts`: dựng hình học theo bộ/ô. Phần cứng gắn cứng vào một xương, gộp thành **một `SkinnedMesh` cho mỗi loại vật liệu** (vải, cứng) dùng chung bộ xương của thân, nên theo xương miễn phí và LOD xa ẩn cùng mesh thân (LOD1 trở đi không vẽ). Không đổ bóng.
- Dải lụa và tua là mesh riêng (tối đa 2/bộ), lắc quanh trục X ra sau theo vận tốc bằng một lò xo góc (biên độ ≤ 0,36 rad), chỉ ở LOD0 trong khung nhìn. Không dùng xương lò xo của `spring.ts` vì dải lụa nằm ngoài rig của asset.
- Dựng lại model khi mã `sa` đổi (mặc/tháo đồ hiếm), hình học dựng một lần cho mỗi asset × mã và dùng chung.
- Ảnh: `pnpm shots outfit --out <thư mục>` (chạy `pnpm dev` ở PORT/CLIENT_PORT, tắt tiếng, mặc bộ bằng `/gm set <id bộ>`).

## Chi tiết hộ uyển, ống ủng, vai giáp

- Hộ uyển và ống ủng là **ống côn** (rộng ở khuỷu/đầu gối, thon ~20% về cổ tay/cổ chân), mép trên loe vát, hai vòng viền, hàng đinh tán và một tấm dày ở mặt ngoài (hộ uyển) hoặc mặt trước (lưỡi gà ống ủng), nên không còn đối xứng trụ. Hộ uyển còn có vòng khảm màu viền ở giữa. Hoa văn khắc làm bằng hình học và màu đỉnh (không có normal map riêng).
- Vai giáp Huyền Giáp (và Hàn Giao Lân, nhẹ hơn) có thêm 2–3 tầng vảy lục giác nhọn nghiêng xuống như ngói, nên không còn là nửa quả cầu trơn.

## Ngân sách

Đo bằng `__game.info()` ở sân tông môn, một người chơi (cộng cả pass bóng), thân trần → mặc đủ bộ (draw call): Lạc Kiếm +5, Huyền Giáp +4 đến +5, Đan Tâm +5, Hàn Giao +2; tam giác +1 đến 3 nghìn mỗi người (tối đa 3000 tam giác/bộ, test giữ). Chỉ LOD0 (tối đa `LOD0_MAX` = 12 người cùng lúc) có phụ kiện.

## Ảnh (GPU thật: RTX 3060 Ti, WebGPU, preset Cao)

`<bộ>-<m|f>-<truoc|sau|nghieng>.png`: đứng yên; `-chay.png` chạy ngang (dải lụa lắc, tay vung); `-bay.png` ngự kiếm; `-chem.png` đang ra chiêu chém. Các ảnh chạy, bay, chém để soát xuyên mesh: không thấy phụ kiện chui vào thân, tay hay kiếm.
