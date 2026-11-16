# E1-D: client nhiều level (`Game.enterLevel`)

Gói E1-D của mở rộng Kết Đan / Nguyên Anh / Hóa Thần (`docs/EXPANSION_DESIGN.md` 10.2 điểm 7, 11.1). Phần client; server (room theo level, vé `toLevel`) là E1-B.

## Cách hoạt động

- **`game/levelCtx.ts`**: level đang hiển thị. `heightAt/groundAt/inLakeWater/biomeAt` ở client import từ đây (không từ `@dtl/shared`) nên địa hình, nhạc theo biome, bước chân, VFX bám đất, cỏ, minimap tự theo level. Vân Lam trả đúng kết quả cũ (test `levelCtx.test.ts`). `levelAssets(id)` đọc `levels/<id>.assets.json`.
- **`levels/<id>.assets.json`** (`packages/content/data/levels/`, kiểu `LevelAssets` ở `shared/types.ts`, `LEVEL_ASSETS` ở `@dtl/content`): `mood` (preset grading), `glb` (nạp theo level), `ground` (`set` + `mask`: `manifest` mặt nạ vẽ riêng, `neutral` phẳng), `music` (bài nạp trước), `features` (tông môn, cổng, đèn lồng, hồ, biển mây, cỏ, cây, cột sáng, thực vật thủ tục), `minimap` (tên nền trong `public/map/`). `content:check` bắt level thiếu khai báo, bài nhạc/mood sai, thiếu nền minimap.
- **`Game.enterLevel(id)`** (`game/engine.ts`): (1) màn tải (`phase: 'loading'`), nạp trước GLB, stem nhạc (bài cũ vẫn phát), mặt nạ mặt đất mới (`GroundTextures.prepareMask`, chưa đụng mặt nạ cũ); (2) trong **một nhịp đồng bộ**: `unloadLevel()` gỡ + dispose địa hình, kiến trúc + GLB (`handle.release()`, đếm tham chiếu `AssetCache`), cổng, halo/đèn lồng, cây/prop, cột sáng, cỏ; `commit()` mặt nạ; `setActiveLevel`; `buildLevelA/B` dựng lại theo `features`, `Environment.setLevel` nướng lại biển mây theo địa hình, mood + sương; (3) cập nhật minimap dự phòng và store `level`. Cùng địa hình + cùng bố cục (thế giới ↔ Kiếm Trủng) chỉ đổi nhãn, không dựng lại.
- **Nối server (E1-B, đã merge #121)**: server đặt tên room theo level (`world`, `world-<id>`, `dungeon`, `dungeon-<id>`) và `TransferMsg.level`; client suy level từ `InitMsg.room` bằng `levelOfRoom`, mỗi lần vào/chuyển room `rebind` gọi `enterLevel`.
- **Minimap và bản đồ lớn** theo level: `ancientMap(name)` nạp nền `map/<name>.{webp,json}` (bỏ nền cũ khi đổi), `Minimap/WorldMap` lấy `zones`, `camps`, `nodes` từ `LEVELS[level]` và biên từ `levelTerrain().playBounds`. `pnpm minimap:build --level <id>` dựng nền cho level khác (Vân Lam: ảnh giống từng byte).
- **Level thử `thu_nghiem`** (`game/testLevel.ts`, chỉ client): đảo nổi giữa biển mây, mood đêm, không tông môn/cổng/cỏ/cây. Nút "Đổi level thử" trong F3 hoặc `__game.enterLevel('thu_nghiem')`. Đảo chính trùng chỗ tông môn nên người chơi đứng yên khớp địa hình Vân Lam của server (chưa có server cho level này, đừng chơi lâu).

## Giải phóng, không rò

`pnpm bench:levels [--cycles 5] [--renderers ..] [--out <thư mục>]` (cổng 2618/5218): Vân Lam → thu_nghiem → Vân Lam nhiều vòng; ghi `renderer.info.memory`, số đối tượng cảnh, heap JS, CPU khung. Lưu `bench/results/levels-<ngày>.json`.

Điểm cần nhớ khi thêm lớp theo level: mọi thứ tạo trong `buildLevelA/B` phải có đường dispose trong `unloadLevel`; mặt nạ/texture đang được cảnh cũ vẽ không được dispose trước khi gỡ cảnh (WebGPU báo `ImageBitmap has been detached`).

Chưa làm (E2 trở đi): `levels/<id>.assets.json` cho ba bản đồ mới, mặt nạ mặt đất `manifest` riêng của từng level (hiện level mới dùng `neutral`), tải đầu không đổi (chỉ level đầu được `prefetch`).

## Số đo (2026-11-16, RTX 3060 Ti, Chrome headless tắt tiếng)

**Đổi level 5 vòng** (`pnpm bench:levels --cycles 5`, Vân Lam từ vòng 1 → vòng 5): WebGPU geometry +0, texture +0, đối tượng cảnh +0, heap +1 MB; WebGL2 geometry +0, texture +0, heap +1 MB; 0 lỗi console. Vân Lam 130–137 geometry / 88 texture / 346 đối tượng sau mỗi vòng; level thử 73–79 geometry, 61 texture, 37–39 draw. Đổi sang level thử ~70–250 ms (cache nóng), về Vân Lam ~650–1270 ms (dựng lại tông môn + GLB).

**`bench:client` Vân Lam** (18 điểm): draw ≤ 162, tam giác ≤ 977k, texture ≤ 390 MB, 0 lỗi, mọi ô đạt, CPU p95 3,6–7,2 ms. Đối chứng cùng máy ở commit gốc: draw/tam giác/texture giống hệt, CPU p95 4,1–7,8 ms (WebGPU high ở gốc có 2 ô 9 ms do nhiễu). Lần đầu nhánh này chậm ~1–2 ms p95 ở preset thấp do gọi `levelTerrain().id` cho từng đỉnh khi dựng ô; đã gắn địa hình một lần ở `new Terrain()`.

**`pnpm size`**: tải đầu 2,51 MB / 30 MB (không đổi): level mới chỉ nạp khi `enterLevel`.
