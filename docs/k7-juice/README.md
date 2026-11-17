# K-7: camera và âm thanh đòn

Chỉ là lớp trình diễn ở client; server không đổi, không đổi số cân bằng. Spec: `docs/AUDIT_AND_ROADMAP.md` mục 7.3.

## Đã làm

- `game/hitjuice.ts` (hàm thuần, có test): bảng hit-stop (`hitStopOf`), mức rung (`shakeOf`), pitch (`hitPitch`), lớp âm (`layersOf`, `materialOf`), FOV cận cảnh (`ultFovAt`), hàng đợi theo thời gian game (`HitQueue`).
- Hit-stop theo bảng: thường 40/0 ms; đòn 3 liên hoàn hoặc `power` ≥ 2: 55/30; bạo kích 70/40; bạo kích + nặng hoặc chiêu tối thượng 90/50 (trần 90 ms); mình trúng đòn nặng 60 ms. Nhân hệ số hạng thân như cũ (`HitReact` nhận `stop`), người khác bị bỏ khựng (`noStop`). Khựng chỉ dừng hoạt ảnh, đầu vào vẫn chạy nên phím bấm vẫn vào `skillQueue` (khựng tối đa 90 ms < cửa sổ hàng đợi 400 ms).
- Rung camera: đòn 3 `0,12`, bạo kích `0,3`, chiêu tối thượng `0,6`, mình trúng nặng `0,5`; quy tắc lấy max, decay 2,2/giây (thời gian tắt ≈ 0,055 / 0,14 / 0,27 s). Thêm rung **có hướng** (`CameraShake.kick(level, dir)`): 60% biên độ theo hướng nguồn → đích ở khung đầu, tắt nhanh gấp 3 lần phần ngẫu nhiên. Theo công tắc "Rung màn hình".
- Cận cảnh chiêu tối thượng của mình (lúc ra đòn): FOV +1,5° trong 80 ms, về trong 200 ms, kéo camera gần thêm tối đa 5%; không chặn điều khiển. Tắt cùng công tắc "Rung màn hình" trong Cài đặt (không thêm công tắc riêng để không đụng bảng UI).
- Âm đòn đúng khung `hit`: sát thương của người đang vung (đã có sự kiện `windup`, chưa tới `hitAt`) vào `HitQueue`; sự kiện `hit` của `onSkillEvent` xả hàng ngay trong khung đó (tiếng, khựng, rung), quá 0,45 s game thì `frame()` xả. Bỏ `setTimeout` trong `onDmg`. Tiếng vung (`sword`, −6 dB) đặt lịch bằng đồng hồ AudioContext (`src.start(ctx.currentTime + delay)`) tại `hitAt − 0,08 s` từ `SkillEvent.hitIn` (trường mới của sự kiện `windup`).
- Pitch ngẫu nhiên 0,92–1,08 cho mọi tiếng đòn (`sfx(..., { rate })`, ghi đè pitch riêng của từng tiếng trong manifest, không phải build lại âm thanh); đòn 3 +6%.
- Lớp âm theo công pháp và chất liệu mục tiêu bằng SFX có sẵn (không thêm asset, không đổi `LICENSES.md`): bạo kích thêm kim khí; mục tiêu đá thêm `impact`, kim thêm `block`; kiếm tu thêm kim khí ở đòn mạnh, hộ pháp thêm `impact`, đan sư thêm chuông nhẹ. Tổng lớp ≤ 0,41 (≈ +3 dB). Chiêu tối thượng của mình trúng hạ nhạc 20% trong 120 ms (`duck`).
- Giữ nguyên mixer và ducking nhạc combat phân lớp.

## Kiểm

- Test: `apps/client/src/game/hitjuice.test.ts` (bảng hit-stop, rung, pitch, lớp âm, FOV, hàng đợi, phím trong lúc khựng), `shake.test.ts` giữ nguyên.
- `pnpm shots:k7 --out docs/k7-juice` (tắt tiếng, cổng 2603/5203): ảnh dãy khung `combo-3-don.webp`, `toi-thuong-can-canh.webp`, `boss-giao-chien.webp`, nhật ký `k7-log.json`.
- Nhật ký hit → âm (`__sound.hits()`, bản dev, đọc được khi tắt tiếng): trường `synced` = sát thương tới trước khung `hit` nên tiếng xả đúng khung đó. Các lần ghi: độ lệch 0,0–1,2 ms (< 1 khung). Sát thương tới **sau** khung `hit` (trễ mạng, thường 20–230 ms trên máy chạy server cục bộ) phát ngay khi tới, ghi `synced: false`; không thể phát tiếng trúng trước khi biết có trúng.
- FOV: đo mỗi khung khi tung chiêu tối thượng, đỉnh quan sát 58,0° → 59,35° (+1,36°, lấy mẫu theo khung hình, đỉnh lý thuyết +1,5°).
- `pnpm bench:client --renderers webgpu,webgl2 --presets medium`: CPU p95 4,1–7,5 ms (< 8 ms), draw call ≤ 135, 0 lỗi console.

## Chưa làm (ghi lại)

- Tiếng tổng hợp dự phòng (khi file âm thanh chưa nạp) bỏ qua `delay`/`rate`.
- Camera tránh vào thân boss (`minBossDist` ngoài cảnh điện ảnh) và tiêu điểm lệch 3 m về mục tiêu: không nằm trong phạm vi được giao (chỉ rung, hit-stop, cận cảnh, âm).
