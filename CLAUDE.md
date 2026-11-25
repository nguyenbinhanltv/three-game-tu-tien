# Đạp Thiên Lộ — MMORPG tu tiên 3D trên web

Game chơi riêng với bạn bè, không thương mại. Toàn bộ code, shader, script Blender và asset thủ tục do Claude làm; người dùng chạy thử, chơi và báo lỗi.

Spec đầy đủ (Claude Doc): https://claude.ai/artifact/S6ZYqLfR37PYy8NyccDjJt

## Quyết định đã chốt (2026-11-12)

| Chủ đề | Quyết định |
| --- | --- |
| Nền tảng MVP | Chỉ desktop web (Chrome, Edge, Firefox, Safari). Mobile để sau |
| Combat + camera | Từ 2026-11-23 (Thiên Nhãn): camera chéo khóa góc mặc định (FOV 32°, nghiêng 52°, khoảng cách cố định ~20 m, hướng cố định theo bản đồ, KHÔNG xoay, KHÔNG zoom); chuột phải đi tới điểm + WASD, Space né, chiêu ngắm theo con trỏ (server kiểm), chiêu đơn tự khóa mục tiêu gần con trỏ, Tab-target giữ làm phụ; GCD 1 giây |
| Client | TypeScript, Vite, Three.js `WebGPURenderer` (tự lùi WebGL2), shader viết bằng TSL, UI bằng React |
| Server | Một tiến trình Node.js chạy Colyseus. Mỗi bản đồ × kênh, mỗi bí cảnh, mỗi lần độ kiếp là một room |
| Đăng nhập | Chỉ Google. Server kiểm tra ID token, chỉ email trong danh sách mời mới vào được |
| CSDL | SQLite qua Drizzle ORM (chuyển PostgreSQL khi cần) |
| Hạ tầng | 1 VPS, asset tĩnh qua CDN |
| Quy mô | Tối đa 50 người online; test tải bằng 100 bot |
| Thế giới | Huyền Linh Giới. Bản đồ MVP: Vân Lam Sơn Mạch, tông môn Lạc Kiếm Tông |
| Cảnh giới | Theo thang Tiên Nghịch (Nhĩ Căn). MVP: Ngưng Khí 1–15 → Trúc Cơ |

## Cấu trúc repo

```
packages/shared    địa hình (heightAt), di chuyển (stepMove), công thức, giao thức, kiểu dữ liệu
packages/content   dữ liệu game JSON trong data/ (key pose IK trong data/poses/), chuỗi tiếng Việt trong data/i18n/, check.ts, sim.ts
apps/client        Vite + Three.js + React: src/base (cờ URL, level hiện tại), src/game/{core,world,entities,combat,fx,audio,camera,net,debug}, src/game/engine.ts + engine/* (lớp Game), src/render (TSL, vật liệu, VFX), src/ui, src/viewer
apps/server        Colyseus: rooms/ (base, world, dungeon, tribulation), game/sim.ts (GameSim, nối các hệ), game/{gm,combat,monsters,economy,players,artifacts,death,tribulation}/ (tách từ sim.ts ở R-7, mỗi hệ một `*System` + giao diện hẹp `*Ctx`), game/entities.ts (kiểu `PlayerEnt`/`MonEnt`/`SimHost`…, không phụ thuộc ngược để không có vòng import), game/character.ts, auth.ts, db.ts; log.ts (logger có mức, nơi duy nhất gọi console)
apps/bot-client    bot headless để test tải
tools/blender      build_sect.py (Builder + helper), thien_cong_kit.py (bộ kiến trúc mô-đun ~76 mảnh) + thien_cong_sect.py (ghép Lạc Kiếm Tông → arch_sect.glb; `-- kit <thư mục>` xuất lưới kit) + thien_cong_preview.py (ảnh 360° kit/tông môn), import_tripo.py (chuẩn hóa GLB Tripo), anim_biped_extra.py, anim_quadruped.py, anim_serpent.py, anim_bird.py, tripo_clips.py + export_anim_lib.py (clip thủ tục, thư viện `anim_human_base`), bake_impostor.py (atlas cây xa), recolor_phi_kiem.py, build_fixture_rig.py (GLB có xương cho test), run.mjs
tools/asset-pipeline  optimize.ts (gltf-transform, LOD, meshopt, KTX2, hash, manifest), `push.ts`, `pull.ts`, `gc.ts`, `r2/` (Cloudflare R2, sổ khóa `assets/asset-lock.json`), validate.ts, ktx.ts, terrain-textures.ts (texture mặt đất), impostor
tools/perf         size.ts (pnpm size), bench.ts (bench:client), load.ts (bench:load), crowd.ts (bench:crowd), compat.ts (compat), shots.ts + scenarios/ (pnpm shots <kịch bản>), lib/ (phần chung: cổng, server dev, Chrome tắt tiếng, đăng nhập thử, GM, chụp, kiểu window.__game), Playwright
tools/maps         gen-<level>.mjs: sinh level (levels/*.json) từ mã
tools/poses        gen-k5.mjs, report-k5.mjs: pose chiêu K-5
tools/vfx-forge    lò rèn texture VFX (Codex → KTX2 + contact sheet + manifest), prompt Codex, style-sheet.json (`pnpm vfx:forge`, `vfx:check`)
tools/vfx          gen-fx-*.py, recipes_*.py: sinh timeline VFX (data/fx/*.json)
tools/ui           contrast.mjs: kiểm WCAG AA token chữ
tools/docs         check.mjs (media docs), check-paths.mjs (đường dẫn trong CLAUDE.md/handbook/skill)
tools/codex-assets script sinh concept/tranh qua Codex (gen.mjs icons|portraits|loading|ui, cutin-gen, chr-v3*, mon-multiview-gen; đã gỡ bớt script một lần ở tối ưu Đợt C)
tools/calli        build.mjs + groups.json: vẽ chữ thư pháp Giao Long (font ngoài repo, `CALLI_FONT`) thành PNG trong suốt ở `apps/client/public/assets/calli/` (`pnpm calli[:check]`; KHÔNG commit font)
tools/icons        build.mjs + subjects.json: icon vật phẩm/chiêu (`pnpm icons:build|check`)
tools/palette      gen_palette.mjs: bảng màu từ `assets/palette.json` (`pnpm palette[:check]`)
tools/fonts        subset.py: cắt font
tools/audio        build.mjs + sounds.json: SFX/âm môi trường CC0 → public/audio/{sfx,amb}; compose/<id>.mjs + loop.mjs + music.json: nhạc tự soạn (MIDI + soundfont) → public/audio/music; chung manifest.json
assets             README, LICENSES.md, budgets.json, palette.json, meta.schema.json, source/<loại>/<id>/meta.json
docs               art-bible.md (nguồn chuẩn về hình ảnh, v3), handbook/ (sổ tay theo chủ đề, xem dưới), tripo-runbook.md, perf-report.md, compat.md, audio/, <hạng mục>/ (README ghi chú; ảnh duyệt PR để ở artifact phiên, không commit)
```

Chưa có: `apps/admin`. File nguồn asset lớn nằm ở `../dtl-asset-source` (cây thư mục 3d, 2d, anim, audio, vfx, texture; xem `assets/README.md`).

## Sổ tay (docs/handbook/)

CLAUDE.md giữ phần lõi. Chi tiết từng hệ thống và lệnh nằm ở `docs/handbook/<chủ đề>.md`; **PR mới sửa trang chủ đề, không nối dòng vào CLAUDE.md**.

| Trang | Nội dung |
| --- | --- |
| `commands.md` | cổng dev, `shots`, bench, compat, security, size, assets/audio build, tham số URL kiểm thử |
| `client-ui.md` | UI Ngọc Giản, cửa sổ, kit, minimap, client nhiều level, lùi WebGL2, hiệu năng client |
| `maps-levels.md` | bản đồ, phó bản, mỹ thuật từng level, truyền tống, `map:report` |
| `monsters.md` | quái, tinh anh, boss, kiểu chiêu quái |
| `vfx-forge.md` | quy trình Họa Pháp Lô (thẻ chiêu, vfx-forge, Codex, phòng thử `?vfxlab`) |
| `vfx-animation.md` | VFX timeline, animation K-*, nhân vật v2/v3, kiếm, pose |
| `assets.md` | pipeline asset, KTX2, cây, bướm, Dị Vực |
| `audio.md` | SFX, nhạc tự soạn, cân âm lượng |
| `gameplay-systems.md` | công pháp, trang bị, độ kiếp, thần thức, nguyên anh, GM |
| `quests.md` | nhiệm vụ theo chương |
| `lore-boundary.md` | ranh giới Tiên Nghịch: được/không được dùng gì, thuật ngữ đã chốt, danh sách tên cấm (`content:check`) |
| `painted.md` | phong cách Họa Cảnh `?style=painted` (nền hoạt hình vẽ tay, pilot Vân Lam): ranh giới giấy phép, các bước P1–P8, đo |
| `status.md` | hiện trạng 2026-11-15 và việc còn mở (lịch sử, đã sửa mục lệch thời) |

Script `node tools/docs/check-paths.mjs` (chạy ở CI) kiểm mọi đường dẫn file nêu trong CLAUDE.md, handbook và skill đều tồn tại.

## Lệnh thường dùng

- Client: cấu trúc `src/` và tham số URL (chỉ đọc qua `src/base/flags.ts`, `FLAG_DOCS`/`FLAGS`) ở `docs/handbook/client-ui.md`; `render/` và `base/` không import `game/`.
- `pnpm dev`: server (2567) + client (5173). Đăng nhập thử bằng đạo hiệu; `?auto=<tên>` tự đăng nhập.
- Playtest **luôn tắt tiếng**: URL game/viewer có `?mute=1` (ghép tham số khác bằng `&`, ví dụ `?mute=1&auto=<tên>`), kể cả trong `ao browser`; Chromium/Playwright thêm cờ `--mute-audio`. Tab của mình đang phát tiếng thì đóng hoặc tải lại với `?mute=1` (xem skill `playtest`).
- `pnpm lint` (R-9, ESLint + typescript-eslint, `eslint.config.mjs`): chỉ luật ranh giới/an toàn — cấm import tương đối xuyên gói (dùng `@dtl/*`), `render/` và `base/` không import `game/`/`ui/`, client không import `@dtl/content/loot`; chạy ở CI. Thêm luật theo nhóm, mỗi nhóm một PR sạch lỗi.
- `pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm sim:progress`


Điều đã rút ra từ lần soát netcode (đừng làm hỏng lại):

- Xác thực nằm ở `static onAuth` của room để chạy trước khi Colyseus giữ chỗ/tạo room; client không được gọi `create` (xem `matchMaker.controller.exposedMethods` trong `index.ts`).
- Vào bí cảnh cần vé một lần do `WorldRoom.onPortal` cấp; đừng kiểm điều kiện vào room mới ở room cũ mà không có vé.
- Không cho ra chiêu khi `airborne()`; quái bỏ đuổi mục tiêu không với tới thì hồi đầy và miễn sát thương (`evadeUntil`).
- Request listener HTTP phải bọc try/catch; `AUTH_DEV_BYPASS` tự tắt khi `NODE_ENV=production` hoặc có `GOOGLE_CLIENT_ID`.
- Bảng rơi đồ và linh thạch rơi nằm ở `packages/content/data/loot.json`, chỉ import qua `@dtl/content/loot` (server, check, sim). `monsters.json` vào bundle client nên không được chứa `drops`/`gold` (`content:check` và `apps/client/src/no-server-data.test.ts` chặn). Client chỉ biết món đã rơi qua tin nhắn `sys.loot`.
- Đạn đánh xa của quái (`caster.shape: 'bolt'`): server mô phỏng trong `tickBolts` bằng công thức chung `packages/shared/src/projectile.ts` (quét đoạn, chặn vật cản trên cả đoạn, đạn nâng theo độ cao mục tiêu lúc bắn để ngự kiếm sát đất không né được bằng cách lơ lửng), đi chung cửa sổ miễn `hazardHit` với vùng nổ; quái chết/bỏ đuổi thì đạn tan. Client chỉ nội suy từ `S.BOLT` và vẽ khi có `S.BOLT_END`.
- Gói state có `StateView` (AOI): `SchemaSerializer.applyPatches` của Colyseus 0.16 dồn byte view của mọi client vào chung một bộ đệm; tràn thì gói bị cắt và client báo `"refId" not found: undefined`. `apps/server/src/viewSerializer.ts` vá prototype để mỗi client mã hóa từ cùng offset (đừng thay serializer của room bằng lớp con: dựng Encoder lần hai làm hỏng đồng bộ). Kiểm: `pnpm bots --count 100` phải 0 dòng `refId`.
- POST `/matchmake` và bắt tay WebSocket giới hạn theo IP bằng token bucket (`apps/server/src/ratelimit.ts`, bọc ngoài listener của Colyseus, trả 429 + `Retry-After`). Env: `RATE_LIMIT_BURST` (40), `RATE_LIMIT_PER_MIN` (20), `TRUST_PROXY=1` mới đọc `X-Forwarded-For` (lấy phần tử cuối), `RATE_LIMIT_EXEMPT=loopback` cho bot ở máy dev (bị bỏ qua khi production).


## Quy tắc bất biến

- **Server quyết định mọi thứ.** Client chỉ gửi ý định (input, "dùng skill X lên Y"). Không bao giờ nhận sát thương, vị trí cuối cùng, phần thưởng từ client.
- **Mọi thay đổi vật phẩm/tiền** chạy trong một transaction, có idempotency key và ghi vào `ledger`.
- **Logic chung** (công thức, hằng số, schema) chỉ nằm trong `packages/shared`, không copy sang client/server.
- **Ngân sách hiệu năng** (desktop): dưới 300 draw call, 1–2 triệu tam giác, 512MB texture, tải lần đầu dưới 30MB, CPU dưới 8ms/khung. Thay đổi render phải kiểm tra lại.
- **Không commit nhị phân.** Asset game (GLB/KTX2/WebP/PNG/âm thanh) nằm trên Cloudflare R2, `apps/client/public` chỉ giữ manifest json + font; git theo dõi sổ khóa `assets/asset-lock.json`. Sau `assets:build`: `pnpm assets:push`; máy mới/sau merge: `pnpm assets:pull`; client đọc qua `VITE_ASSET_BASE`. Nhị phân > 200 KB trong `apps/client/public` và `docs/` bị `pnpm docs:binaries` (CI, hook `pnpm hooks:install`) chặn; ảnh duyệt PR để ở artifact phiên.
- **Chuỗi hiển thị** đi qua i18n key, không viết cứng tiếng Việt trong component.
- **Tên cảnh giới, vật phẩm, địa danh** lấy từ bảng thuật ngữ trong `packages/content/data/glossary.json`.

## Họa Cảnh (`?style=painted`)

Hướng phụ nền hoạt hình vẽ tay, chỉ bật bằng cờ, **mặc định game chưa đổi**; khi Họa Cảnh xong trên toàn bộ bản đồ sẽ thành mặc định và nguồn cũ bị gỡ (P10, P11). Nguyên tắc ở `docs/handbook/painted.md`: ít tông và một bảng màu chung; không nhiễu hay texture ảnh chụp; cảnh xa vẽ MỘT lần (núi dải sơn, mây cubemap, đồng xa một texture và thẻ cây); cỏ chi tiết chỉ vòng gần; hậu kỳ tối giản (Kuwahara, không ACES hay hạt phim); nhân vật cel và viền mực CHỜ người dùng quyết sau P7; animation cần clip start, stop, pivot, sprint, thở dốc; mọi asset mới qua bảng phong cách; đo khớp bằng SSIM và ΔE (`tools/painted-compare` (vào cùng PR #614)). Ghi công MIT (© 2026 Patch) ở `assets/LICENSES.md`; không dùng âm thanh Sonniss, không commit ảnh tham khảo.

## Skill và subagent

Skill trong `.claude/skills/`, subagent trong `.claude/agents/`. Dùng skill tương ứng trước khi làm việc trong khu vực đó:

- `threejs-client`: code render, streaming thế giới, input, UI trên canvas
- `tsl-shaders-vfx`: shader TSL, VFX chiêu theo timeline JSON (phong cách, ngân sách, cách thêm hiệu ứng, checklist kiểm), vết mực, mây, độ kiếp, grading
- `procedural-assets`: sinh địa hình, cây, đá, kiến trúc bằng code hoặc bpy
- `blender-pipeline`: script Blender headless, xuất GLB, tối ưu, kiểm tra asset
- `character-3d`: làm một bộ nhân vật v3 từ ảnh A-pose/multiview + Tripo đến game (giữ lưới gốc, rig bind A-pose, tách lưới voan/vạt/chân, clip áo bào, đo rigstretch, bảng lỗi, hướng tới mức wow)
- `colyseus-server`: rooms, schema, xác thực input, AOI, lưu DB
- `game-content`: thêm quái, skill, vật phẩm, nhiệm vụ, cảnh giới, cân bằng
- `perf-budget`: đo và giữ ngân sách hiệu năng
- `playtest`: chạy cả stack local, bot, kiểm tra trong trình duyệt
- `guizang-game-skill` (bên ngoài, AGPL-3.0, tiếng Trung): chỉ để tham khảo khi làm cảm giác đòn đánh, animation IK, VFX, camera, lỗi input. Viết cho game offline một file HTML nên khi xung đột thì quy ước dự án thắng (WebGPU/TSL, server quyết định, i18n, ngân sách). Không chép code từ repo gốc
- MCP `blender` (`.mcp.json`, `uvx mcp-for-blender`): điều khiển Blender đang mở để xem và thử dựng. Pipeline chính vẫn là script headless `tools/blender/` (xem `blender-pipeline`)

Subagent: `netcode-reviewer`, `perf-auditor`, `asset-validator`, `lore-keeper`, `vfx-reviewer` (soát PR VFX: độ đọc, chống lóa, phong cách, pool, dọn sạch, ngân sách).
