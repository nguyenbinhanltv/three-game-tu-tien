---
name: threejs-client
description: Quy ước code client Three.js của Đạp Thiên Lộ — renderer WebGPU/WebGL2, ECS, streaming địa hình theo ô, LOD, instancing, camera, input, giải phóng bộ nhớ. Dùng khi viết hoặc sửa bất kỳ code nào trong apps/client liên quan đến render, thế giới 3D, nhân vật, camera hay vòng lặp game.
---

# Client Three.js

> Hiện trạng (2026-11-15): code nằm trong `apps/client/src/game/` (engine.ts, terrain.ts, entities.ts, models.ts, vfx.ts, env.ts, sect.ts, props.ts, preload.ts, assets.ts, cutscene.ts, camZones.ts, audio.ts…), `game/character/` (`SkinnedCharacter`, `playerSkins`, `npcSkins`, `monsterSkins`, `ikpose`, `animLib`), `render/` (TSL: materials, atmosphere, grading, post, vfx) và `ui/` (React + `ui/kit/`). **Chưa dùng ECS, Rapier, Web Worker, VAT**; thực thể là object thường, va chạm là heightmap + hình tròn của `packages/shared`. Store UI là zustand ở `src/ui/store.ts`. Các mục dưới đây về ECS/VAT/worker/Rapier là hướng mở rộng, không phải thứ đang có; đừng viết như thể chúng tồn tại.
> Lưu ý WebGPU: không thay `geometry.index` bằng buffer mới sau khi đã vẽ — ghi đè nội dung buffer cũ và dùng `setDrawRange` (xem `Terrain.rebuildCoarseIndex`).

## Khởi tạo renderer

- Dùng `WebGPURenderer` từ `three/webgpu`; nó tự lùi về WebGL2 khi không có WebGPU. Không tạo `WebGLRenderer` riêng.
- `await renderer.init()` trước khi render khung đầu.
- Ở màn hình loading gọi `renderer.compileAsync(scene, camera)` để biên dịch shader trước, tránh giật khi skill đầu tiên nổ.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, preset.maxPixelRatio))`, preset Thấp = 1, Vừa = 1.5, Cao = 2.
- Ghim version `three` trong package.json, nâng cấp có chủ đích (API WebGPU/TSL còn thay đổi giữa các bản).

## Vòng lặp (ECS là hướng mở rộng)

- Một `renderer.setAnimationLoop(tick)` duy nhất. Thứ tự trong tick: input → gửi lệnh mạng → áp snapshot server + nội suy → dự đoán chuyển động bản thân → hệ thống ECS → camera → render.
- Hiện tại thực thể là object thường trong `entities.ts` (người, quái, NPC); trạng thái do server gửi, `Object3D` chỉ là lớp hiển thị. ECS (bitecs/koota) trong `packages/shared/ecs` mới là ý định, chưa có.
- Không đặt logic game trong `Object3D.userData` hay trong component React.

## Thế giới và streaming

- Địa hình chia ô 256×256m, khóa ô `"${cx}_${cz}"`. Tải ô trong bán kính R quanh người chơi, R lớn hơn khi ngự kiếm, kèm LOD thấp hơn.
- Tải asset GLB qua `assets` (`AssetCache` trong `game/assets.ts`: GLTFLoader + MeshoptDecoder + KTX2Loader, transcoder cục bộ, nạp theo `public/assets/manifest.json`, hàng đợi ưu tiên theo khoảng cách, đếm tham chiếu). File có hash nên trình duyệt/CDN cache được vĩnh viễn. Parse vẫn chạy trên luồng chính (chỉ transcoder KTX2 chạy trong worker); chưa dùng Cache Storage.
- Thứ tự tải "khung hình đầu trước" (M6-1, `game/preload.ts`): HTML có tiêu đề + nền sương; JS dựng thế giới thủ tục không chờ file; `prefetchWorldAssets()` (gọi trong `Game.connect`) tải trước byte GLB qua `assets.prefetch` theo ưu tiên tính như khoảng cách (nhân vật mình 0, `arch_sect` theo vị trí, quái 120, phi kiếm 400), 2 luồng song song; nơi dùng vẫn `acquire` như cũ và chỉ parse. Thêm GLB cần ngay lúc vào game thì thêm vào `prefetchWorldAssets`, cùng thang ưu tiên. Nhạc/âm môi trường chỉ tải sau thao tác đầu tiên (AudioContext). Không chặn vào game bởi GLB: chưa về thì dùng model khối.
- Biên dịch trước (M6-1): `Game.start` gọi `vfx.update(0)` rồi `PostPipeline.compileScene()` (`renderer.compileAsync` với đúng render target + MRT của pass cảnh, tạm tắt frustum culling) trước vòng vẽ đầu. Luôn biên dịch cả cảnh: biên dịch cây con chưa nằm trong cảnh ra shader khác (khóa cache gồm scene). Khi đang chờ biên dịch (`Game.compiling > 0`) `frame()` bỏ qua: three r178 vẽ với pipeline WebGPU còn dở là lỗi. Quad hậu kỳ không biên dịch trước được. Đo bằng `pnpm bench:load` (skill `perf-budget`).
- Cây (5 loài Tripo), đá, cỏ: `InstancedMesh`/pool toàn cục theo loài × mức LOD (`props.ts`, rải theo ô ở `propScatter.ts`); cây xa hơn `TREE_START` dùng impostor hai tấm cắt chéo từ atlas (`treeImpostor.ts`, bake bằng `pnpm assets:impostor`). Cỏ: `grass.ts`, 1 draw call, preset Thấp tắt.
- NPC và quái đông: hiện dùng `SkinnedMesh` có ngân sách: `applyLodBudget` trong `entities.ts` cho tối đa `LOD0_MAX` thể gần nhất trong khung nhìn LOD0 (và đổ bóng), còn lại LOD1+, ngoài khung nhìn không cập nhật mixer. Vertex Animation Texture là hướng mở rộng nếu `pnpm bench:crowd` báo vượt.
- Người chơi khác: cùng cơ chế LOD theo camera ở trên (model có xương nhiều mức LOD qua pipeline); hiệu ứng của người khác giảm hạt, bước chân chỉ trong 26 m. Impostor nhân vật là hướng mở rộng (impostor đang có chỉ dành cho cây xa: `treeImpostor.ts`).
- Sương mù và tầng mây che biên tải. Không để người chơi nhìn thấy mép ô chưa tải.

## Giải phóng bộ nhớ

- Khi gỡ ô hoặc thực thể: `geometry.dispose()`, `material.dispose()`, `texture.dispose()` cho mọi tài nguyên không dùng chung. Tài nguyên dùng chung đi qua `AssetCache` có đếm tham chiếu.
- Không tạo `Vector3`/`Matrix4` mới trong tick; dùng biến tạm cấp module.

## Camera và input

- Camera góc thứ ba, chuột phải xoay, lăn chuột zoom. Camera theo khu (P2-E4, `game/camZones.ts`) nhân khoảng cách/cộng góc ngẩng/đổi FOV theo vùng, trọng số giảm mượt qua ranh; cảnh điện ảnh (`game/cutscene.ts`: mở đầu, boss xuất hiện, chuyển pha), thẻ chương và cảnh độ kiếp/chết là lớp riêng, bỏ qua được và không đổi luật. Chưa có raycast Rapier cho camera.
- Phím: WASD, Space nhảy, Tab chọn mục tiêu, phím số cho thanh chiêu 8 ô, F ngự kiếm, Z đả tọa, B/C/L/V/P/M/H/O mở bảng (xem `KEY_ACTIONS`). Map phím trong `apps/client/src/input/bindings.ts` để sau này cho người chơi đổi.
- Pointer lock chỉ khi giữ chuột phải; UI React vẫn nhận click.

## UI

- UI (túi đồ, nhiệm vụ, chat, bản đồ, nhân vật, Thiết lão, công pháp, tổ đội) là React nằm trên canvas, đọc trạng thái qua store (zustand). Bảng mới dùng bộ khung `ui/kit/` (xem `?mute=1&viewer=ui`), chuỗi qua i18n. Không re-render React mỗi khung; chỉ cập nhật khi trạng thái đổi.
- Tên và thanh máu trên đầu nhân vật vẽ trong WebGL (sprite/SDF text), không dùng DOM.

## Trước khi xong việc

- Chạy skill `perf-budget` nếu thay đổi ảnh hưởng render (`pnpm bench:client` là số đo chuẩn).
- Mở game bằng skill `playtest` và nhìn tận mắt, không chỉ dựa vào typecheck.
