---
name: threejs-client
description: Quy ước code client Three.js của Đạp Thiên Lộ — renderer WebGPU/WebGL2, ECS, streaming địa hình theo ô, LOD, instancing, camera, input, giải phóng bộ nhớ. Dùng khi viết hoặc sửa bất kỳ code nào trong apps/client liên quan đến render, thế giới 3D, nhân vật, camera hay vòng lặp game.
---

# Client Three.js

> Hiện trạng MVP: code nằm trong `apps/client/src/game/` (engine.ts, terrain.ts, entities.ts, models.ts, vfx.ts, env.ts, sect.ts). Chưa dùng ECS, Rapier, Web Worker, VAT; store UI là zustand ở `src/ui/store.ts`. Các mục dưới đây về ECS/VAT/worker là hướng mở rộng, không phải thứ đang có.
> Lưu ý WebGPU: không thay `geometry.index` bằng buffer mới sau khi đã vẽ — ghi đè nội dung buffer cũ và dùng `setDrawRange` (xem `Terrain.rebuildCoarseIndex`).

## Khởi tạo renderer

- Dùng `WebGPURenderer` từ `three/webgpu`; nó tự lùi về WebGL2 khi không có WebGPU. Không tạo `WebGLRenderer` riêng.
- `await renderer.init()` trước khi render khung đầu.
- Ở màn hình loading gọi `renderer.compileAsync(scene, camera)` để biên dịch shader trước, tránh giật khi skill đầu tiên nổ.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, preset.maxPixelRatio))`, preset Thấp = 1, Vừa = 1.5, Cao = 2.
- Ghim version `three` trong package.json, nâng cấp có chủ đích (API WebGPU/TSL còn thay đổi giữa các bản).

## Vòng lặp và ECS

- Một `renderer.setAnimationLoop(tick)` duy nhất. Thứ tự trong tick: input → gửi lệnh mạng → áp snapshot server + nội suy → dự đoán chuyển động bản thân → hệ thống ECS → camera → render.
- Thực thể game dùng ECS (bitecs hoặc koota) trong `packages/shared/ecs` để server dùng chung component. `Object3D` chỉ là lớp hiển thị, map từ entity id.
- Không đặt logic game trong `Object3D.userData` hay trong component React.

## Thế giới và streaming

- Địa hình chia ô 256×256m, khóa ô `"${cx}_${cz}"`. Tải ô trong bán kính R quanh người chơi, R lớn hơn khi ngự kiếm, kèm LOD thấp hơn.
- Tải asset GLB qua `assets` (`AssetCache` trong `game/assets.ts`: GLTFLoader + MeshoptDecoder + KTX2Loader, transcoder cục bộ, nạp theo `public/assets/manifest.json`, hàng đợi ưu tiên theo khoảng cách, đếm tham chiếu). File có hash nên trình duyệt/CDN cache được vĩnh viễn. Parse vẫn chạy trên luồng chính (chỉ transcoder KTX2 chạy trong worker); chưa dùng Cache Storage.
- Cây, đá, cỏ: `InstancedMesh` hoặc `BatchedMesh`; ở xa dùng impostor (billboard bake sẵn).
- NPC và quái đông: Vertex Animation Texture thay vì `SkinnedMesh` (Three.js không instancing được mesh có xương).
- Người chơi khác: 3 mức LOD; ngoài 80m chỉ còn impostor + tên; tối đa 50 nhân vật đầy đủ trên màn hình.
- Sương mù và tầng mây che biên tải. Không để người chơi nhìn thấy mép ô chưa tải.

## Giải phóng bộ nhớ

- Khi gỡ ô hoặc thực thể: `geometry.dispose()`, `material.dispose()`, `texture.dispose()` cho mọi tài nguyên không dùng chung. Tài nguyên dùng chung đi qua `AssetCache` có đếm tham chiếu.
- Không tạo `Vector3`/`Matrix4` mới trong tick; dùng biến tạm cấp module.

## Camera và input

- Camera góc thứ ba, chuột phải xoay, lăn chuột zoom, va chạm camera với địa hình qua raycast Rapier.
- Phím: WASD, Space nhảy, Tab chọn mục tiêu, 1–6 skill, F ngự kiếm. Map phím trong `apps/client/src/input/bindings.ts` để sau này cho người chơi đổi.
- Pointer lock chỉ khi giữ chuột phải; UI React vẫn nhận click.

## UI

- UI (túi đồ, nhiệm vụ, chat, bản đồ) là React nằm trên canvas, đọc trạng thái qua store (zustand). Không re-render React mỗi khung; chỉ cập nhật khi trạng thái đổi.
- Tên và thanh máu trên đầu nhân vật vẽ trong WebGL (sprite/SDF text), không dùng DOM.

## Trước khi xong việc

- Chạy skill `perf-budget` nếu thay đổi ảnh hưởng render.
- Mở game bằng skill `playtest` và nhìn tận mắt, không chỉ dựa vào typecheck.
