---
name: perf-budget
description: Đo và giữ ngân sách hiệu năng của Vạn Tiên Lộ — draw call, số tam giác, bộ nhớ texture/heap, thời gian khung CPU/GPU, kích thước tải lần đầu, thời gian tick server. Dùng sau khi thay đổi render, asset, VFX, streaming hay logic server nặng, và trước khi báo một tính năng là xong.
---

# Ngân sách hiệu năng

> Hiện trạng: overlay bật bằng `?debug=1` (góc dưới phải: fps, draw call, tam giác, geometry, texture). Đo tự động bằng `pnpm size` và `pnpm bench:client` (mục "Cách đo"). Số đo mới nhất nằm ở `docs/perf-report.md`; các ghi chú đo có ngày bên dưới là lịch sử (tải đầu và asset kiến trúc đã đổi nhiều lần từ đó, `sect.glb` không còn nằm trong tải đầu), tick server p95 0,7ms với 50 bot mỗi kênh, 1,1ms với 100 bot trong một kênh (2026-11-12). Đổi room: `renderer.info.memory` đứng yên qua nhiều vòng vào/ra bí cảnh.
> M6-2 đo (15/11/2026, Chrome 157 headless, RTX 3060 Ti, 1280×720, dpr 1, Vite dev): `pnpm size` tải đầu 1,25MB/30MB (JS 437KB gzip, âm thanh nạp đầu 468KB m4a, `arch_sect` 193KB, icon 143KB, font 26KB); nạp sau khi vào 7,0MB. `pnpm bench:client` (sân/rừng/hồ, Thấp/Vừa/Cao): draw call tối đa WebGPU 86/89/122 ở sân, 157/160/184 ở rừng; WebGL2 gần như bằng; tam giác tối đa 585k (rừng, Cao); CPU `frame()` p95 ≤ 5 ms mọi tổ hợp; texture ước tính 14/25/57MB (dpr 1; dpr 2 ở Vừa ≈ 52MB); JS heap 75–148MB.
> Đếm draw call khi có hậu kỳ (từ M1-6): `engine.ts` đặt `renderer.info.autoReset = false` và gọi `renderer.info.reset()` ở đầu `frame()`, nên số trên overlay là của **cả khung** (pass cảnh + mọi pass hậu kỳ), đúng cả khi bơm khung tay bằng `__game.frame()`. Khi tự đo, đọc `renderer.info` ngay sau `frame()`, đừng reset giữa chừng. So với bản trước M1-6 (vốn đã có một pass xuất tone mapping), hậu kỳ thêm 0 lệnh vẽ ở Thấp, 3 ở Vừa và Cao (blur ngang, blur dọc, FXAA); quầng đèn đá thêm 1 ở sân. M1-6 đo (15/11/2026, Chrome headless 1584×749, Vừa, WebGPU): sân 91→95, hồ 34→37, rừng ~150 (dao động do cây nạp theo ô); CPU `frame()` p95 tối đa 5,2 ms ở Cao.
> Bơm khung tay (tắt `setAnimationLoop`) phải gọi `renderer._nodes.nodeFrame.update()` trước mỗi `__game.frame()`, như vòng lặp của three. Không gọi thì `frameId` đứng yên, pass cảnh (`PassNode`, cập nhật theo FRAME) không vẽ lại: ảnh chụp là ảnh cũ và chỉ đếm được 2 draw call của quad hậu kỳ.
> M1-7 đo (15/11/2026, Chrome headless 1280×720, cảnh thử nặng ~180 lưới VFX sống: nổ, kiếm khí, phi kiếm, mưa kiếm, sét, cột sáng, vùng tròn/chữ nhật/quạt mỗi 10 khung): material VFX tạo ra 2243 → 3; draw call tối đa (Vừa) WebGPU 427 → 253, WebGL2 441 → 274; CPU `frame()` p95 (Vừa) WebGPU 8,9 → 3,2 ms, WebGL2 6,7 → 3,9 ms. Cảnh nhàn rỗi không đổi.
> M4-1/M4-3 đo (15/11/2026, Chrome 1280×720, cùng cảnh thử nặng, đo xen kẽ main/nhánh 2 vòng): kiếm khí mới 2 lưới (sáng + mực), pháp trận 1 tấm thay vòng + đĩa / 2 tấm; dù kịch bản sau thêm chém dọc, pháp trận niệm chú và dấu chém khi trúng, draw call tối đa vẫn giảm (WebGPU Thấp/Vừa/Cao 272/274/313 → 253/256/290, WebGL2 270/272/309 → 251/257/291), pool 200 → 181 lưới, CPU `frame()` p95 trong mức nhiễu (±1 ms). Chi phí mới nằm ở fragment: pháp trận phủ cả vùng (r tới ~9 m) với ~100 phép toán/điểm ảnh; chưa đo GPU trên máy GPU tích hợp.
> V4 đo (15/11/2026, Chrome headless 1280×720, dpr 1, `pnpm bench:client` trước/sau): cỏ tương tác thêm đúng **1 draw call** ở Vừa/Cao khi có cỏ (hồ 116→117, 138→139; sân lát đá không có cỏ nên không đổi), 0 ở Thấp (tắt cỏ). Tam giác tối đa +47k ở Vừa, +120k ở Cao (rừng 584k → 704k); thung lũng cỏ dày ~13 nghìn bụi ở Cao ≈ 230k tam giác (mỗi bụi 18). CPU `frame()` p95 tối đa 6,1 ms (trước 7,5 ms, trong mức nhiễu). Dựng một ô cỏ 16 m ~0,5 ms, tối đa 1 ô/khung khi đang chơi. Hạt môi trường dùng chung ngân sách hạt: ~85/235/375 hạt sống ở Thấp/Vừa/Cao (dưới 2% ngân sách). Draw call ở rừng dao động ±15 giữa các lần đo (cây nạp theo ô), đừng đọc nhầm là do cỏ.
> Bộ nhớ render target (ước tính từ cấu hình: B/px × số px nội bộ; chưa tính shadow map 16MB ở Cao). Khử răng cưa: Thấp không, Vừa FXAA, Cao pixelRatio 2 + FXAA (không MSAA: MSAA 4x nhân 4 màu HalfFloat + bloom + depth, 89 B/px); canvas không MSAA. WebGPU chỉ có 1 hoặc 4 mẫu. Ngân sách điểm ảnh nội bộ (`QUALITY.maxPixels` trong engine.ts): Thấp 2M, Vừa 4M, Cao 8M; vượt thì hạ pixelRatio. B/px: Thấp 24, Vừa và Cao 33. 1600×900: Thấp 35MB, Vừa 107MB, Cao 190MB. Màn hình lớn (bị chặn bởi ngân sách): Thấp 48MB, Vừa 132MB, Cao 264MB. Trước M1-6 (92 B/px, không chặn): 1600×900 là 132/298/530MB, 1080p là 191/429/763MB.

> M6-1 đo (15/11/2026, `pnpm bench:load`, 20 Mbps, bản build gzip, Chrome headless RTX 3060 Ti, trung vị 6 lượt, main → M6-1): FCP tiêu đề HTML 0,11 s; JS ban đầu tới 0,29 s. WebGPU: khung game đầu − JS 1,53 → 1,52 s, vào game 3,40 → 3,46 s (nhiễu ±0,4 s), nhân vật mình về 2,76 → 1,95 s, GLB về hết 2,76 → 2,17 s, khựng sau khi vào 0. WebGL2: khung đầu − JS 1,80 → 1,59 s, vào game 3,96 → 3,47 s, hết khựng 4,12 → 3,64 s, khựng lúc tải dài nhất 882 → 533 ms. Biên dịch trước (`compileAsync`) chỉ bật trên WebGL2: trên WebGPU dựng node TSL vẫn đồng bộ và Chrome vốn biên dịch pipeline ở tiến trình GPU, đo thấy khung đầu trễ thêm ~0,5 s. Khung đầu còn ~150–300 ms dựng node cho quad hậu kỳ (chỉnh màu ~60–100 ms, bloom, FXAA) và skin GLB về sau bước biên dịch; nằm dưới màn tải.

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

### Ngân sách riêng cho preset Cực cao (`ultra`)

Cực cao chỉ dành cho GPU rời + CPU mạnh (WebGPU, `deviceMemory` ≥ 8 GB, ≥ 8 luồng); **không** đưa vào ngưỡng chung ở trên (mặc định vẫn Vừa). Ngân sách riêng:

| Chỉ số | Cực cao |
| --- | --- |
| Tam giác | ≤ 2,5 triệu (cảnh đông, rừng) |
| Texture | ≤ 400 MB (đã gồm bậc texture tải nền `game/hires/`, trần 180 MB) |
| CPU p95 mỗi khung | ≤ 12 ms (cũng là ngưỡng tự hạ) |

Tự hạ (`base/quality.ts` `AutoQuality`, nối ở `game/engine/frameLoop.ts`): trong cửa sổ 10 s, CPU p95 > 12 ms **hoặc** fps < 40 thì **chỉ Cực cao → Cao** (báo bằng toast, lưu `dtl.quality`; Cao/Vừa/Thấp là lựa chọn của người chơi nên không tự hạ); khung cách nhau > 1 s (tab ẩn, màn tải) làm cửa sổ bắt đầu lại; `dtl.qualityLock=1` (nút "Khóa mức đồ họa" ở Cài đặt) tắt tự hạ. Bench/shots luôn đặt khóa (`initScript`, `tools/perf/src/lib/game.ts`) để đo đúng preset. Gợi ý theo GPU (`suggestQuality`, chỉ hiện ở Cài đặt một lần, không tự đổi): GPU rời + RAM/luồng đủ → Cực cao, thiếu → Cao; iGPU/Apple/≤ 4 GB/≤ 4 luồng/WebGL2 → Vừa. Đo: `pnpm bench:client --presets medium,high,ultra`, `pnpm bench:crowd --presets medium,high,ultra`, kiểm đầu-cuối `pnpm shots quality`.

## Cách đo

- **Bảng F3 trong game** (`ui/DebugPanel.tsx`): thêm `?debug=1` vào URL (bản dev không cần) rồi nhấn F3. Hiện FPS và backend, thời gian khung CPU của `Game.frame()` (trung bình và cao nhất trong ~100 ms, tô vàng từ 80% và đỏ khi vượt 8 ms), draw call và tam giác của khung vừa vẽ qua mọi pass (so với 300 / 2 triệu), geometry/texture của `renderer.info.memory`, số người/quái/NPC, LOD, lưới VFX đang sống và hạt, số ô địa hình, ping. Engine chỉ điền số khi bảng đang mở. `?debug=1` còn hiện một dòng gọn ở góc dưới phải (`ms · draw · tri`).
- **Benchmark tự động**: `pnpm bench:client` (`tools/perf/src/bench.ts`). Tự chạy `pnpm dev` ở cặp cổng riêng (biến `PORT`/`CLIENT_PORT`, mặc định 2635/5135, kiểm cổng trống trước, không bao giờ dùng hay kill cổng bận), DB tạm, `AUTH_DEV_BYPASS=1`; mở Chrome cài sẵn bằng Playwright, headless, `--mute-audio`, URL `?mute=1&debug=1&auto=Bench_…` (+ `&renderer=webgl2`). Mỗi tổ hợp WebGPU/WebGL2 × Thấp/Vừa/Cao (preset đặt qua `localStorage dtl.quality` trước khi nạp trang): `/gm tp` tới sân tông môn (`SPAWN_POINT`), giữa rừng (`FOREST`), bờ đông hồ; chờ ô địa hình nạp xong; xoay camera một vòng trong 8 giây (pitch 0,38, khoảng cách 13). Ghi mỗi khung: CPU của `Game.frame()`, draw call, tam giác (đọc ngay sau `frame()`); cuối mỗi điểm: số texture/geometry, texture MB ước tính, JS heap. In bảng có cột ngân sách, lưu `bench/results/<ngày>.json` (trùng ngày thêm `_HHMMSS`; thư mục bị gitignore, số đo phụ thuộc máy), so với file trước cùng renderer/preset/kích thước/pixelRatio và báo chỉ số xấu đi quá 10%. Server luôn tắt khi xong, kể cả khi lỗi hay Ctrl+C (kill cây tiến trình đã spawn rồi kiểm hai cổng trống).
  - `pnpm bench:switch` (= `bench:client --switch 20`): nạp game ở Cao, đổi preset 20 lần (đủ mọi cặp Thấp/Vừa/Cao) trong lúc liên tục bắn VFX (mưa kiếm, sét, chém, nổ, cột sáng); không đạt nếu có lỗi console/pageerror (kể cả cảnh báo WebGPU pipeline/attachment) hoặc số geometry/texture (`renderer.info.memory` và texture GPU sống) tăng quá 2 ở cùng preset sau vòng đầu. Chạy lại sau mỗi lần sửa `render/post.ts`, `markBloom`, cách dựng pass hay nâng three.
  - `pnpm compat` (`tools/perf/src/compat.ts`, M6-4): cùng cách chạy server với bench (module chung `devserver.ts`, cổng mặc định 2645/5145). Mỗi trình duyệt (`--browsers chrome,msedge,firefox,webkit`): dò WebGPU/WebGL2/feature nén/`canPlayType`, giải mã mọi file âm thanh bằng `OfflineAudioContext`; vào game ở 3 preset (+ ép WebGL2 trên Chromium), chụp ảnh cùng góc rồi so với Chrome WebGPU (lệch trung bình/255); ở Vừa nạp mọi GLB qua `AssetCache`, parse KTX2 mẫu (`tools/perf/fixtures`), thử W/Tab/lăn/kéo/pointer lock; lượt "âm thanh thật" (không `?mute=1`, âm lượng master 0 + tắt tiếng mức trình duyệt; không chạy trên WebKit), kèm biến thể chặn `.webm` để kiểm lùi m4a. Kết quả và giới hạn của WebKit Playwright (không Web Audio/WebGPU): `docs/compat.md`.
  - Cờ: `--renderers webgpu,webgl2`, `--presets low,medium,high`, `--seconds 8`, `--size 1280x720`, `--dpr 1` (2 để giả lập HiDPI: headless mặc định dpr 1 nên Vừa/Cao không tăng pixelRatio), `--channel chrome|msedge|chromium`, `--headed`. Ví dụ đo nhanh một tổ hợp: `pnpm bench:client --renderers webgpu --presets medium --seconds 3`.
  - Không sửa code game: bench bọc `__game.frame` ở instance và bọc `backend.createTexture/destroyTexture` (three r178 không có byte texture trong `renderer.info`). Texture MB là ước tính từ kích thước/định dạng/mip, gồm render target hậu kỳ, chưa gồm canvas; `topTextures` trong JSON liệt kê texture lớn nhất.
  - Kiểm cột `backend`: nếu yêu cầu WebGPU mà ra WebGL2 thì máy/trình duyệt không có WebGPU. Điểm "CHƯA TỚI ĐIỂM" nghĩa là `/gm tp` không tới nơi, số đo không dùng được.
  - Chạy trên Vite dev (module chưa gộp, React dev) nên CPU khung hơi cao hơn bản build; dùng để so tương đối giữa hai lần đo trên cùng máy.
- **Đám đông (M6-3)**: `pnpm bench:crowd` (`tools/perf/src/crowd.ts`). Chạy `pnpm dev` ở cặp cổng riêng (mặc định 2675/5175, `RATE_LIMIT_EXEMPT=loopback`, `MAX_CLIENTS=128` để mọi bot chung kênh với client đo), chạy N bot (`pnpm bots` với `--crowd`/`--fight`/`--level`/`--tp`/`--dungeon`, kết thúc êm bằng `quit` qua stdin) rồi mở Chrome headless tắt tiếng (`?mute=1&debug=1&gputime=1`), mỗi renderer × preset nạp trang mới, đứng giữa cảnh, xoay camera một vòng. Cảnh: `san` (bot đi lại quanh chỗ hồi sinh), `rung` (bot cấp 15 đánh quái, client gọi thêm quái), `boss` (lòng chảo Kiếm Trủng trong room thế giới: bot đánh boss có xương + Kiếm Linh, chết thì gọi lại), `dungeon` (bí cảnh thật, client + 4 bot vì room tối đa 5 người). Ghi CPU `frame()` p50/p95/p99 và theo phần (`terrain`, `ents`, `matrix`, `render`…), GPU (timestamp query; WebGL2 chỉ khi có `EXT_disjoint_timer_query_webgl2`), draw call, tam giác, texture MB, heap, băng thông WebSocket của client đo, tick p95 của room (đọc `/health`), pipeline tạo mới và khung > 12 ms, **đầu dò** một khung (draw call theo `đích | loại | material | tên | geometry`), byte thuộc tính đẩy lên GPU mỗi giây, số node theo nhánh cảnh. `--profile` ghi `.cpuprofile` (mở bằng DevTools) và in 25 hàm tốn self-time nhất. Cờ: `--bots 50,100`, `--scenes san,rung,boss,dungeon`, `--renderers`, `--presets medium,high`, `--seconds 10`, `--warmup 5`. Lưu `bench/results/crowd-<ngày>.json`. Kết quả và phân tích: `docs/perf-report.md`.
  - v3cpu: `--build` đo bản build production (vite build tạm + gzip; `--no-build` dùng lại), mặc định xoay camera một vòng trước khi ghi để pipeline lần đầu thấy không rơi vào cửa sổ đo (`--cold` bỏ bước này); `CROWD_YAWS=0.25,0.5` đầu dò draw call/ảnh (`--screenshot`) ở nhiều hướng, `CROWD_DUMP=<chỉ số nhánh cảnh>` liệt kê lưới; bảng có p50 theo phần. `CROWD_HIDE=<chỉ số nhánh cảnh>` ẩn nhánh để đo chi phí biên (v3cpu 3: prop ≈ 31 µs/draw, địa hình ≈ 0); số tổng trên máy dùng chung dao động ±2 ms nên A/B phải xen kẽ ≥ 5 lượt hoặc so số draw call. Tham số URL kiểm thử: `?proplod0=<hệ số>` (ngưỡng LOD0 prop, mặc định 0,7), `?shadowhz=<Hz>` (giới hạn vẽ lại bản đồ bóng, mặc định 50), `?v3off=park1` (tắt đỗ rig LOD1).
  - `?gputime=1` bật `trackTimestamp` của renderer (chỉ cho công cụ đo; không ai resolve thì three cảnh báo hết chỗ query).
  - Đừng dùng `DynamicDrawUsage`/`StreamDrawUsage`/`dynamicBufferAttribute`: three r178 upload lại cả mảng ở mỗi lần vẽ, bỏ qua `version` và update range (`src/no-dynamic-usage.test.ts` chặn). Cập nhật bằng `needsUpdate = true` + `addUpdateRange`.
- **Thứ tự và thời gian tải**: `pnpm bench:load` (`tools/perf/src/load.ts`, M6-1). Đo trên bản build thật: `vite build` vào thư mục tạm (`VITE_SERVER_URL` trỏ server ở `PORT`), chạy riêng server game (`serverOnly` của `devserver.ts`, DB tạm, đăng nhập thử), tự phục vụ bản build ở `CLIENT_PORT` có gzip như CDN (mặc định 2655/5155). Chrome headless `--mute-audio`, URL luôn có `?mute=1`; mỗi lượt context mới (cache lạnh), CDP `Network.emulateNetworkConditions` 20 Mbps xuống / 5 Mbps lên / 20 ms. Kịch bản `login` (FCP tiêu đề HTML, JS ban đầu tới, form, cảnh nền 3D hiện) và `game` (`?auto=`: khung game đầu, vào game = màn tiêu đề mờ hết, thời điểm/thứ tự từng GLB về; rồi gọi 3 sói và ra 6 chiêu, ghi mọi khung requestAnimationFrame > 50 ms: "khựng lúc tải" bị màn tải che, "khựng sau khi vào" người chơi thấy, "hết khựng" = khung dài cuối cùng). Mục tiêu: khung game đầu < 2 s sau khi JS tới (thoát mã 1 nếu chưa đạt). Lưu `bench/results/load-<ngày>.json`, so lần trước cùng mbps/renderer. Cờ: `--runs 2`, `--scenarios login,game`, `--renderer webgpu|webgl2`, `--mbps 20`, `--latency 20`, `--no-build` (dùng lại bản build tạm), `--headed`. JSON có `frameFn`: các `Game.frame()` dài kèm thời gian theo phần (`terrain`, `ents`, `vfx`, `env`, `render`). Số đo dao động ±0,4 s giữa các lượt: so A/B bằng nhiều lượt xen kẽ (build bản cũ ở cặp cổng khác, `--no-build`).
- **Kích thước tải**: `pnpm size` (`tools/perf/src/size.ts`; tự `pnpm build` nếu chưa có `apps/client/dist`, `--build` để build lại). Cộng những gì phải tải trước khi đứng trong thế giới: HTML, JS/CSS trong `index.html` (gzip mức 9), font, `apps/client/public/assets/manifest.json` + mọi asset gọi `assets.acquire('<id>')` bằng chuỗi hằng trong `apps/client/src`, bảng icon UI, `apps/client/public/audio/manifest.json` + sprite SFX không `lazy` (tính cả webm lẫn m4a, so ngân sách với bản nặng hơn). In riêng phần nạp sau khi vào (âm môi trường, sprite lazy, chunk động, GLB theo nhu cầu). Lưu `bench/results/size-<ngày>.json`; thoát mã 1 nếu vượt 30MB (`--budget-mb` để đổi). Thêm asset nạp ở màn tải bằng cách khác (không qua `assets.acquire` với id hằng) thì sửa `size.ts` cho khớp.
- **Server**: chạy 100 bot (skill `playtest`), đọc metric `tick_ms` p95 từ log server.

## Soát asset trước khi đo

Draw call phần lớn đến từ số material: gộp slot trùng, dùng atlas/trim sheet, nhân bản bằng instance thay vì sao chép hình học (chi tiết: `.claude/skills/blender-pipeline/references/qa-checklist.md` mục 3 và `lod-collision.md`). Mảng phát sáng dùng material riêng theo vật.

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

## Lưu ý sau R-8

- Công cụ đo bọc `__game.frame`/`__game.onFx`: giữ hai phương thức này trên lớp `Game` (`apps/client/src/game/engine.ts`, phần còn lại nằm ở `game/engine/*.ts`). Tính năng mới vào đúng miền `game/<miền>/`, không nối vào `engine.ts`.
- `pnpm bench:client`: so draw call/tam giác giữa hai lần đo để chắc không đổi; CPU/fps lệch nhiều khi máy đang chạy worker khác (đo lại lúc rảnh).

## Họa Cảnh (`?style=painted`)

Giữ đúng ngân sách (dưới 300 draw call, dưới 2 triệu tam giác, CPU dưới 8 ms). Mỗi PR Họa Cảnh ghi số trước và sau cùng điểm `?at=` cho `?style=painted` và mặc định, trên cả WebGPU lẫn WebGL2; cảnh xa vẽ một lần không được tốn gì mỗi khung. So chất lượng bằng số ở cảnh thử cô lập (`tools/painted-compare`: SSIM, ΔE [CHƯA CÓ trên main: đang dựng ở nhánh riêng, dự kiến vào ở bước P2/P8; trước đó chỉ là kế hoạch]). Xem `docs/handbook/painted.md`.
