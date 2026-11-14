---
name: perf-budget
description: Đo và giữ ngân sách hiệu năng của Đạp Thiên Lộ — draw call, số tam giác, bộ nhớ texture/heap, thời gian khung CPU/GPU, kích thước tải lần đầu, thời gian tick server. Dùng sau khi thay đổi render, asset, VFX, streaming hay logic server nặng, và trước khi báo một tính năng là xong.
---

# Ngân sách hiệu năng

> Hiện trạng MVP: overlay bật bằng `?debug=1` (góc dưới phải: fps, draw call, tam giác, geometry, texture). Chưa có `pnpm bench:client` và `pnpm size`; kích thước xem ở output của `pnpm build`. Số đo 2026-11-12: sân tông môn ~150 draw call, ~410 nghìn tam giác; JS 357KB gzip + sect.glb 0,8MB; tick server p95 0,7ms với 50 bot mỗi kênh, 1,1ms với 100 bot trong một kênh. Số đo 2026-11-15 (M2-8, kiến trúc qua `AssetCache`): JS chính 402KB gzip + `arch_sect` 138KB + manifest 1KB ≈ 0,54MB (trước đó ≈ 1,21MB); transcoder Basis (248KB gzip) tách file riêng, chỉ tải khi gặp texture KTX2. Đổi room: `renderer.info.memory` đứng yên qua nhiều vòng vào/ra bí cảnh.
> Đếm draw call khi có hậu kỳ (từ M1-6): `engine.ts` đặt `renderer.info.autoReset = false` và gọi `renderer.info.reset()` ở đầu `frame()`, nên số trên overlay là của **cả khung** (pass cảnh + mọi pass hậu kỳ), đúng cả khi bơm khung tay bằng `__game.frame()`. Khi tự đo, đọc `renderer.info` ngay sau `frame()`, đừng reset giữa chừng. So với bản trước M1-6 (vốn đã có một pass xuất tone mapping), hậu kỳ thêm 0 lệnh vẽ ở Thấp, 3 ở Vừa và Cao (blur ngang, blur dọc, FXAA); quầng đèn đá thêm 1 ở sân. M1-6 đo (15/11/2026, Chrome headless 1584×749, Vừa, WebGPU): sân 91→95, hồ 34→37, rừng ~150 (dao động do cây nạp theo ô); CPU `frame()` p95 tối đa 5,2 ms ở Cao.
> Bơm khung tay (tắt `setAnimationLoop`) phải gọi `renderer._nodes.nodeFrame.update()` trước mỗi `__game.frame()`, như vòng lặp của three. Không gọi thì `frameId` đứng yên, pass cảnh (`PassNode`, cập nhật theo FRAME) không vẽ lại: ảnh chụp là ảnh cũ và chỉ đếm được 2 draw call của quad hậu kỳ.
> M1-7 đo (15/11/2026, Chrome headless 1280×720, cảnh thử nặng ~180 lưới VFX sống: nổ, kiếm khí, phi kiếm, mưa kiếm, sét, cột sáng, vùng tròn/chữ nhật/quạt mỗi 10 khung): material VFX tạo ra 2243 → 3; draw call tối đa (Vừa) WebGPU 427 → 253, WebGL2 441 → 274; CPU `frame()` p95 (Vừa) WebGPU 8,9 → 3,2 ms, WebGL2 6,7 → 3,9 ms. Cảnh nhàn rỗi không đổi.
> M4-1/M4-3 đo (15/11/2026, Chrome 1280×720, cùng cảnh thử nặng, đo xen kẽ main/nhánh 2 vòng): kiếm khí mới 2 lưới (sáng + mực), pháp trận 1 tấm thay vòng + đĩa / 2 tấm; dù kịch bản sau thêm chém dọc, pháp trận niệm chú và dấu chém khi trúng, draw call tối đa vẫn giảm (WebGPU Thấp/Vừa/Cao 272/274/313 → 253/256/290, WebGL2 270/272/309 → 251/257/291), pool 200 → 181 lưới, CPU `frame()` p95 trong mức nhiễu (±1 ms). Chi phí mới nằm ở fragment: pháp trận phủ cả vùng (r tới ~9 m) với ~100 phép toán/điểm ảnh; chưa đo GPU trên máy GPU tích hợp.
> Bộ nhớ render target (ước tính từ cấu hình: B/px × số px nội bộ; chưa tính shadow map 16MB ở Cao). Khử răng cưa: Thấp không, Vừa FXAA, Cao pixelRatio 2 + FXAA (không MSAA: MSAA 4x nhân 4 màu HalfFloat + bloom + depth, 89 B/px); canvas không MSAA. WebGPU chỉ có 1 hoặc 4 mẫu. Ngân sách điểm ảnh nội bộ (`QUALITY.maxPixels` trong engine.ts): Thấp 2M, Vừa 4M, Cao 8M; vượt thì hạ pixelRatio. B/px: Thấp 24, Vừa và Cao 33. 1600×900: Thấp 35MB, Vừa 107MB, Cao 190MB. Màn hình lớn (bị chặn bởi ngân sách): Thấp 48MB, Vừa 132MB, Cao 264MB. Trước M1-6 (92 B/px, không chặn): 1600×900 là 132/298/530MB, 1080p là 191/429/763MB.

## Ngưỡng

| Chỉ số | Desktop | Mobile (sau này) |
| --- | --- | --- |
| Draw call | dưới 300 | dưới 150 |
| Tam giác trên khung | 1–2 triệu | 300–500 nghìn |
| Bộ nhớ texture | 512MB | 256MB |
| JS heap | dưới 500MB | dưới 300MB |
| Tải lần đầu trước khi vào game | dưới 30MB | dưới 20MB |
| CPU mỗi khung | dưới 8ms | dưới 16ms |
| Tick server (p95) | dưới 25ms với 100 bot | |

Máy mục tiêu: laptop GPU tích hợp đời 2022 (Intel Iris Xe / Radeon 680M) đạt 60fps ở preset Vừa.

## Cách đo

- **Overlay trong game**: mở bằng `?debug=perf` — hiện FPS, thời gian khung, `renderer.info.render.calls`, `.triangles`, `renderer.info.memory`, số thực thể, số ô địa hình đã tải.
- **Benchmark tự động**: `pnpm bench:client` mở client bằng Playwright (Chromium headless có GPU nếu máy có), bay theo đường camera cố định qua bản đồ 60 giây, ghi p50/p95 thời gian khung và giá trị lớn nhất của draw call/tam giác vào `bench/results/<ngày>.json`, so với lần trước và báo nếu xấu đi quá 10%.
- **Kích thước tải**: `pnpm build && pnpm size` — tổng JS + asset bắt buộc trước màn hình vào game.
- **Server**: chạy 100 bot (skill `playtest`), đọc metric `tick_ms` p95 từ log server.

## Khi vượt ngưỡng

Thử theo thứ tự, đo lại sau mỗi bước:

1. Gộp draw call: instancing, `BatchedMesh`, gộp material dùng chung atlas.
2. LOD mạnh hơn, giảm bán kính tải, tăng sương mù.
3. Giảm độ phân giải texture hoặc đổi sang KTX2 nếu chưa đổi.
4. Giảm số hạt VFX, tắt bớt post-processing ở preset thấp.
5. Profile CPU bằng Chrome DevTools Performance để tìm hàm nóng; tránh cấp phát trong tick.

Không hạ ngưỡng ngân sách để cho qua. Nếu thật sự không đạt, báo người dùng kèm số đo và các lựa chọn.

## Báo cáo

Khi báo xong việc có ảnh hưởng hiệu năng, ghi số đo trước/sau (FPS p95, draw call, tam giác) trong tin nhắn.
