---
name: perf-budget
description: Đo và giữ ngân sách hiệu năng của Đạp Thiên Lộ — draw call, số tam giác, bộ nhớ texture/heap, thời gian khung CPU/GPU, kích thước tải lần đầu, thời gian tick server. Dùng sau khi thay đổi render, asset, VFX, streaming hay logic server nặng, và trước khi báo một tính năng là xong.
---

# Ngân sách hiệu năng

> Hiện trạng MVP: overlay bật bằng `?debug=1` (góc dưới phải: fps, draw call, tam giác, geometry, texture). Chưa có `pnpm bench:client` và `pnpm size`; kích thước xem ở output của `pnpm build`. Số đo 2026-11-12: sân tông môn ~150 draw call, ~410 nghìn tam giác; JS 357KB gzip + sect.glb 0,8MB; tick server p95 0,7ms với 50 bot mỗi kênh, 1,1ms với 100 bot trong một kênh.
> Đếm draw call khi có hậu kỳ (từ M1-6): `engine.ts` đặt `renderer.info.autoReset = false` và gọi `renderer.info.reset()` ở đầu `frame()`, nên số trên overlay là của **cả khung** (pass cảnh + mọi pass hậu kỳ), đúng cả khi bơm khung tay bằng `__game.frame()`. Khi tự đo, đọc `renderer.info` ngay sau `frame()`, đừng reset giữa chừng. So với bản trước M1-6 (vốn đã có một pass xuất tone mapping), hậu kỳ thêm 0 lệnh vẽ ở Thấp, 3 ở Vừa (blur ngang, blur dọc, FXAA), 2 ở Cao; quầng đèn đá thêm 1 ở sân. M1-6 đo (15/11/2026, Chrome headless 1584×749, Vừa, WebGPU): sân 91→95, hồ 34→37, rừng ~150 (dao động do cây nạp theo ô); CPU `frame()` p95 tối đa 5,2 ms ở Cao.
> Bộ nhớ render target (ước tính từ cấu hình: B/px × số px nội bộ; chưa tính shadow map 16MB ở Cao). Khử răng cưa: Thấp không, Vừa FXAA, Cao MSAA 4x; canvas không MSAA. WebGPU chỉ có 1 hoặc 4 mẫu. Ngân sách điểm ảnh nội bộ (`QUALITY.maxPixels` trong engine.ts): Thấp 2M, Vừa 4M, Cao 5,5M; vượt thì hạ pixelRatio. B/px: Thấp 24, Vừa 33, Cao 89. 1600×900: Thấp 35MB, Vừa 107MB, Cao 490MB. 1920×1080 trở lên: Thấp 48MB, Vừa 132MB, Cao 490MB (bị chặn bởi ngân sách). Trước M1-6 (92 B/px, không chặn): 1600×900 là 132/298/530MB, 1080p là 191/429/763MB.

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
