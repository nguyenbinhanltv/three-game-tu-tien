---
name: threejs-client
description: Quy ước code client Three.js của Đạp Thiên Lộ — renderer WebGPU/WebGL2, streaming địa hình theo ô, LOD, instancing, camera, input, giải phóng bộ nhớ. Dùng khi viết hoặc sửa bất kỳ code nào trong apps/client liên quan đến render, thế giới 3D, nhân vật, camera hay vòng lặp game.
---

# Client Three.js

> Hiện trạng (2026-11-18, sau R-8): `apps/client/src/` chia tầng. `base/` (tầng thấp nhất: `flags.ts` = mọi tham số URL có kiểu, `levelCtx.ts` = level đang hiển thị, `groundTextures.ts`, `testLevel.ts`); `render/` (TSL, vật liệu, VFX; **không import `game/` hay `ui/`**, ESLint ép); `game/{core,world,entities,combat,fx,audio,camera,net,debug}/` theo miền; `game/character/`; `game/engine.ts` (lớp `Game`: trạng thái và API) + `game/engine/*.ts` (phần tách ra, mỗi hàm nhận `eng: Game`: `fxMsgs` xử lý tin FX/sát thương, `frameLoop` vòng khung + camera + dự đoán, `levelLoad` dựng/gỡ level, `input`, `hudSync`, `cine`, `room`; hằng số dùng chung ở `common.ts`); `ui/`. Mới thêm code vào đúng miền, không nối vào `engine.ts`; không file nào quá 1200 dòng, madge 0 vòng. `Game.frame()`/`Game.onFx()` giữ làm phương thức mỏng vì công cụ đo (`bench`, `compat`, `shots vfx`) bọc `__game.frame`/`__game.onFx`.
> Lưu ý WebGPU: không thay `geometry.index` bằng buffer mới sau khi đã vẽ — ghi đè nội dung buffer cũ và dùng `setDrawRange` (xem `Terrain.rebuildCoarseIndex`).

## Khởi tạo renderer

- Dùng `WebGPURenderer` từ `three/webgpu`; nó tự lùi về WebGL2 khi không có WebGPU. Không tạo `WebGLRenderer` riêng.
- `await renderer.init()` trước khi render khung đầu.
- Ở màn hình loading gọi `renderer.compileAsync(scene, camera)` để biên dịch shader trước, tránh giật khi skill đầu tiên nổ.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, preset.maxPixelRatio))`, preset Thấp = 1, Vừa = 1.5, Cao = 2.
- Ghim version `three` trong package.json, nâng cấp có chủ đích (API WebGPU/TSL còn thay đổi giữa các bản).

## Vòng lặp

- Một `renderer.setAnimationLoop(tick)` duy nhất. Thứ tự trong tick: input → gửi lệnh mạng → áp snapshot server + nội suy → dự đoán chuyển động bản thân → hệ thống ECS → camera → render.
- Thực thể là object thường trong `game/entities/entities.ts` (`PlayerVis`/`MonVis` ở `entityVis.ts`; người, quái, NPC); trạng thái do server gửi, `Object3D` chỉ là lớp hiển thị. Không dùng ECS.
- Không đặt logic game trong `Object3D.userData` hay trong component React.

## Thế giới và streaming

- Địa hình chia ô 256×256m, khóa ô `"${cx}_${cz}"`. Tải ô trong bán kính R quanh người chơi, R lớn hơn khi ngự kiếm, kèm LOD thấp hơn.
- Tải asset GLB qua `assets` (`AssetCache` trong `game/core/assets.ts`: GLTFLoader + MeshoptDecoder + KTX2Loader, transcoder cục bộ, nạp theo `public/assets/manifest.json`, hàng đợi ưu tiên theo khoảng cách, đếm tham chiếu). File có hash nên trình duyệt/CDN cache được vĩnh viễn. Parse vẫn chạy trên luồng chính (chỉ transcoder KTX2 chạy trong worker); chưa dùng Cache Storage.
- Thứ tự tải "khung hình đầu trước" (M6-1, `game/core/preload.ts`): HTML có tiêu đề + nền sương; JS dựng thế giới thủ tục không chờ file; `prefetchWorldAssets()` (gọi trong `Game.connect`) tải trước byte GLB qua `assets.prefetch` theo ưu tiên tính như khoảng cách (nhân vật mình 0, `arch_sect` theo vị trí, quái 120, phi kiếm 400), 2 luồng song song; nơi dùng vẫn `acquire` như cũ và chỉ parse. Thêm GLB cần ngay lúc vào game thì thêm vào `prefetchWorldAssets`, cùng thang ưu tiên. Nhạc/âm môi trường chỉ tải sau thao tác đầu tiên (AudioContext). Không chặn vào game bởi GLB: chưa về thì dùng model khối.
- Biên dịch trước (M6-1): `Game.start` gọi `vfx.update(0)` rồi `PostPipeline.compileScene()` (`renderer.compileAsync` với đúng render target + MRT của pass cảnh, tạm tắt frustum culling) trước vòng vẽ đầu. Luôn biên dịch cả cảnh: biên dịch cây con chưa nằm trong cảnh ra shader khác (khóa cache gồm scene). Khi đang chờ biên dịch (`Game.compiling > 0`) `frame()` bỏ qua: three r178 vẽ với pipeline WebGPU còn dở là lỗi. Quad hậu kỳ không biên dịch trước được. Đo bằng `pnpm bench:load` (skill `perf-budget`).
- Cây (5 loài Tripo), đá, cỏ: `InstancedMesh`/pool toàn cục theo loài × mức LOD (`props.ts`, rải theo ô ở `propScatter.ts`); cây xa hơn `TREE_START` dùng impostor hai tấm cắt chéo từ atlas (`treeImpostor.ts`, bake bằng `pnpm assets:impostor`). Cỏ: `grass.ts`, 1 draw call, preset Thấp tắt.
- NPC và quái đông: hiện dùng `SkinnedMesh` có ngân sách: `applyLodBudget` trong `entities.ts` cho tối đa `LOD0_MAX` thể gần nhất trong khung nhìn LOD0 (và đổ bóng), còn lại LOD1+, ngoài khung nhìn không cập nhật mixer. Vertex Animation Texture là hướng mở rộng nếu `pnpm bench:crowd` báo vượt.
- Người chơi khác: cùng cơ chế LOD theo camera ở trên (model có xương nhiều mức LOD qua pipeline); hiệu ứng của người khác giảm hạt, bước chân chỉ trong 26 m. Impostor nhân vật là hướng mở rộng (impostor đang có chỉ dành cho cây xa: `treeImpostor.ts`).
- Sương mù và tầng mây che biên tải. Không để người chơi nhìn thấy mép ô chưa tải.

## Giải phóng bộ nhớ

- Khi gỡ ô hoặc thực thể: `geometry.dispose()`, `material.dispose()`, `texture.dispose()` cho mọi tài nguyên không dùng chung. Tài nguyên dùng chung đi qua `AssetCache` có đếm tham chiếu.
- Không tạo `Vector3`/`Matrix4` mới trong tick; dùng biến tạm cấp module.

## Camera và input

- Camera chéo khóa góc là mặc định (Thiên Nhãn, P5c): `game/camera/iso.ts` + `isoRig.ts`, hướng cố định theo bản đồ (`ISO_YAW`), khoảng cách khóa, không xoay, không zoom, chuột phải đi tới điểm; vật che mờ qua `withSightFade`/`archWrap` (`game/world/occlusion.ts`) — prop/cây/vách cao mới phải bật `sight`. Camera cũ (chuột phải xoay, lăn chuột zoom, khóa con trỏ kiểu FPS) đã gỡ; chỉ cảnh điện ảnh (`cine`) tự đặt camera. Camera theo khu (P2-E4, `game/camera/camZones.ts`) nhân khoảng cách/cộng góc ngẩng/đổi FOV theo vùng, trọng số giảm mượt qua ranh; cảnh điện ảnh (`game/camera/cutscene.ts`: mở đầu, boss xuất hiện, chuyển pha), thẻ chương và cảnh độ kiếp/chết là lớp riêng, bỏ qua được và không đổi luật. Chưa có raycast Rapier cho camera.
- Phím: WASD, Space nhảy, Tab chọn mục tiêu, phím số cho thanh chiêu 8 ô, F ngự kiếm, Z đả tọa, B/C/L/V/P/M/H/O mở bảng (xem `KEY_ACTIONS`). Map phím trong `apps/client/src/input/bindings.ts` để sau này cho người chơi đổi.
- Chuột: phải = đi tới điểm, trái = chọn/đánh (UI React vẫn nhận click); Space = né về phía con trỏ. Không khóa con trỏ, không kéo xoay camera.

## UI

- UI là React nằm trên canvas, đọc trạng thái qua store (zustand), chuỗi qua i18n. Không re-render React mỗi khung; chỉ cập nhật khi trạng thái đổi.
- **UI Kit 2.0 "Mặc Kim Giản"** (`apps/client/src/ui/u2/`, xem `?mute=1&ui=kit`) là bộ khung duy nhất cho bảng/HUD mới: import từ `ui/u2` (Panel, Tabs, Button, Badge, Bar, Slot/IconFrame, Tooltip, Dialog, SkillButton, SysGlyph, SetMark…). Màu/khoảng cách/font **chỉ** là biến `--u-*` ở `apps/client/src/ui/u2/tokens.css` (dải: mực `ink`, kim `gold`, son, ngọc, giấy, Ngọc Thanh `thanh`, phẩm chất `q0–q5`); **không** viết hex/rgb trong TSX hay CSS mới (ESLint `UI_STYLE_RULES` và `apps/client/src/ui/u2/tokens.test.ts` chặn; Stylelint chặn màu cứng ở mọi CSS; chỉ 3 file canvas 2D trong `CANVAS_UI_STYLE` được miễn vĩnh viễn, không thêm file khác). Hình khối: vát góc `--u-cut-*` bằng `clip-path`, không `border-radius` trừ vòng tròn. HUD = sơn mài tối, cửa sổ = giấy ngà; icon vật phẩm/chiêu qua `ContentIcon`/`UiIcon` (atlas, ảnh không có khung: khung và viền phẩm chất do `IconFrame`/`Slot`), icon hệ thống là `SysGlyph` (`apps/client/src/ui/u2/sysGlyphs.ts`, sinh từ `tools/icons/v2/sysicons.py`).
- Thêm bảng mới: dùng `PanelWindow`/`Panel` (vỏ U2), kích thước theo vùng thiết kế (`ui/u2/hud/layout.ts`, chia `--ui-scale` vì `zoom` nhân vw/vh), không chồng lên vùng cụm kỹ năng/hub. Màn toàn màn (Bản đồ chương, `ui/chapters/`) có store riêng và chặn phím game khi mở (`game/engine/input.ts`).
- Màn tiêu đề/tải dùng nền sơn thủy nhiều lớp (`ui/u2/boot/`), tranh nạp lười qua `art.json`; luôn tôn trọng Giảm chuyển động (`data-reduce-motion`).
- **Kiểm UI:** `pnpm shots ui [--part hud|panels|extra] --sizes 720p,1080p,1440p --out <thư mục>` (mọi cảnh, mặc định 3 cỡ); so hai lần chạy bằng `node tools/ui/compare.mjs <trước> <sau> <ra> [--min 0.2]` (ảnh ghép + % điểm ảnh lệch); workflow tay `UI compare` (`.github/workflows/ui-compare.yml`) làm việc đó trên CI. Tắt tiếng: `?mute=1` + `--mute-audio` (khung `shots` đã làm sẵn).
- Tên và thanh máu trên đầu nhân vật vẽ trong WebGL (sprite/SDF text), không dùng DOM.

## Cờ URL và lint

- Tham số URL chỉ đọc qua `base/flags.ts` (`FLAGS`, `FLAG_DOCS`); không dùng `new URLSearchParams(location.search)` nơi khác. Cờ mới: thêm vào `Flags`, `readFlags`, `FLAG_DOCS` (phạm vi `user|diag|test|viewer`).
- `pnpm lint` (ESLint): cấm import tương đối xuyên gói, `render/` và `base/` không import `game/`/`ui/`, client không import `@dtl/content/loot`. TypeScript bật `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride` (tham số cố ý không dùng đặt `_x`).

## Trước khi xong việc

- Chạy skill `perf-budget` nếu thay đổi ảnh hưởng render (`pnpm bench:client` là số đo chuẩn).
- Mở game bằng skill `playtest` và nhìn tận mắt, không chỉ dựa vào typecheck.
