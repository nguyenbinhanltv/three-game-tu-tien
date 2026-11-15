# Đạp Thiên Lộ — MMORPG tu tiên 3D trên web

Game chơi riêng với bạn bè, không thương mại. Toàn bộ code, shader, script Blender và asset thủ tục do Claude làm; người dùng chạy thử, chơi và báo lỗi.

Spec đầy đủ (Claude Doc): https://claude.ai/artifact/S6ZYqLfR37PYy8NyccDjJt

## Quyết định đã chốt (2026-11-12)

| Chủ đề | Quyết định |
| --- | --- |
| Nền tảng MVP | Chỉ desktop web (Chrome, Edge, Firefox, Safari). Mobile để sau |
| Combat | Tab-target, GCD 1 giây. Soft-lock thêm sau nếu cần |
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
apps/client        Vite + Three.js + React (src/game: engine, terrain, entities, models, vfx; src/ui)
apps/server        Colyseus: rooms.ts (World, Dungeon), game/sim.ts, game/character.ts, auth.ts, db.ts
apps/bot-client    bot headless để test tải
tools/blender      build_sect.py (kiến trúc tông môn → GLB), import_tripo.py (chuẩn hóa GLB Tripo), build_fixture_rig.py (GLB có xương cho test), run.mjs
tools/asset-pipeline  optimize.ts (gltf-transform, LOD, meshopt, KTX2, hash, manifest), validate.ts
tools/perf         size.ts (pnpm size), bench.ts (pnpm bench:client, Playwright)
tools/audio        build.mjs + sounds.json: SFX/âm môi trường CC0 → public/audio/{sfx,amb}; compose/<id>.mjs + loop.mjs + music.json: nhạc tự soạn (MIDI + soundfont) → public/audio/music; chung manifest.json
assets             README, LICENSES.md, budgets.json, meta.schema.json, source/<loại>/<id>/meta.json
```

Chưa có: `apps/admin`. File nguồn asset lớn nằm ở `../dtl-asset-source` (xem `assets/README.md`).

## Lệnh thường dùng

- `pnpm dev`: server (2567) + client (5173). Đăng nhập thử bằng đạo hiệu; `?auto=<tên>` tự đăng nhập.
- Playtest **luôn tắt tiếng**: URL game/viewer có `?mute=1` (ghép tham số khác bằng `&`, ví dụ `?mute=1&auto=<tên>`), kể cả trong `ao browser`; Chromium/Playwright thêm cờ `--mute-audio`. Tab của mình đang phát tiếng thì đóng hoặc tải lại với `?mute=1` (xem skill `playtest`).
- Nhiều worktree chạy song song: mỗi worktree một cặp cổng riêng, ví dụ `PORT=2597 CLIENT_PORT=5197 pnpm dev` (Git Bash) hoặc `$env:PORT=2597; $env:CLIENT_PORT=5197; pnpm dev` (PowerShell), hoặc ghi `PORT=`/`CLIENT_PORT=` vào `apps/server/.env.local` (gitignore). Client dev tự nối `ws://<host>:$PORT`; `VITE_SERVER_URL` (biến môi trường hoặc `apps/client/.env.local`, không đặt ở file env của server) ghi đè. Bot và security-check đọc `SERVER_URL` hoặc `PORT` (kể cả từ `.env.local`). Kiểm cổng trống trước khi chạy, không dùng hay kill server của worktree khác, tự tắt server của mình khi xong (xem skill `playtest`).
- Bộ khung UI chung (P2-C1): `apps/client/src/ui/kit/` (Panel, Header, Tabs, Button, Segmented, Slot, Tooltip, Modal, Divider, Slider, ProgressBar; biến `--k-*` trong `tokens.css`). Bảng mới import từ `./kit`; xem mọi thành phần ở `?mute=1&viewer=ui`. Bảng Cài đặt là mẫu
- `pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm sim:progress`
- `pnpm bots --count 100 --duration 120`, rồi `pnpm ledger:check`. 100 bot chung một IP sẽ bị giới hạn `/matchmake`: chạy server với `RATE_LIMIT_EXEMPT=loopback`
- `pnpm size`: tổng tải trước khi vào game (JS/CSS gzip, font, asset màn tải, âm thanh nạp đầu) so với ngân sách 30MB, lưu `bench/results/size-<ngày>.json`
- `pnpm bench:client`: Playwright Chrome headless tắt tiếng, tự chạy `pnpm dev` ở `PORT`/`CLIENT_PORT` riêng (mặc định 2635/5135) rồi tự tắt; WebGPU + WebGL2 × 3 preset, đường camera sân/rừng/hồ; draw call, tam giác, CPU khung p50/p95, texture MB; lưu `bench/results/<ngày>.json`, so lần trước. Cờ và cách đọc: skill `perf-budget`
- `pnpm bench:load`: thời gian tải ở 20 Mbps (CDP) trên bản build có gzip, tự chạy server ở 2655/5155 rồi tự tắt: FCP, JS tới, khung game đầu (mục tiêu < 2 s sau JS), vào game, thứ tự GLB về, khựng > 50 ms khi lần đầu đánh; `--renderer webgl2`, `--runs N`; lưu `bench/results/load-<ngày>.json` (skill `perf-budget`). Thứ tự tải: `apps/client/src/game/preload.ts`
- `pnpm bench:crowd`: ngân sách khi đông người (M6-3): N bot (`pnpm bots`) + 1 client đo ở sân tông môn, rừng, Kiếm Trủng đánh boss, bí cảnh; WebGPU/WebGL2 × Vừa/Cao; CPU p50/p95/p99 theo phần, GPU, draw call, tam giác, texture, heap, băng thông, tick server, đầu dò draw call, `--profile`; tự chạy `pnpm dev` ở 2675/5175 rồi tự tắt; lưu `bench/results/crowd-<ngày>.json`. Báo cáo: `docs/perf-report.md`
- `pnpm compat`: kiểm tương thích Chrome/Edge/Firefox/WebKit (Playwright, tắt tiếng, tự chạy `pnpm dev` ở 2645/5145): backend WebGPU/WebGL2, ảnh so sánh, KTX2/meshopt, giải mã Opus/AAC, input, lỗi console; kết quả `bench/results/compat-<ngày>/`, bảng tổng hợp ở `docs/compat.md`. Firefox/WebKit cài một lần: `pnpm --filter @dtl/perf exec playwright install firefox webkit`
- `pnpm --filter @dtl/bot-client security [http://localhost:<PORT>]`: kiểm tra hồi quy bảo mật (server dev phải đang chạy); chạy lại sau mỗi lần sửa `rooms.ts`, `auth.ts`, `index.ts`, `ratelimit.ts` hoặc luật di chuyển/combat. Server không được bật `RATE_LIMIT_EXEMPT`; bài cuối làm cạn xô của IP, chạy lại cả bộ sau khoảng 1 phút
- `pnpm assets:terrain`: tải 8 bộ texture mặt đất Poly Haven CC0 vào `../dtl-asset-source/texture/` rồi đóng gói WebP ra `apps/client/public/terrain/` (client nạp lười sau khung đầu, `game/groundTextures.ts`; shader trộn lớp ở `render/materials/ground.ts`, mặt nạ vùng thủ tục ở `render/groundMask.ts`). `?ground=0` tắt để so sánh
- `pnpm shots --out <thư mục> [--renderers ..] [--presets ..] [--points san,sondao,rung,ho,dinh] [--query a=b]`: chụp ảnh 5 điểm (sân tông môn, sơn đạo, rừng, ven hồ, đỉnh núi) tắt tiếng, tự chạy `pnpm dev` ở 2675/5175; dùng để làm ảnh trước/sau khi đổi render
- `pnpm assets:build`: Blender sinh GLB thô vào `assets/build/raw/` rồi tối ưu ra `apps/client/public/assets/<id>.<hash>.glb` + `manifest.json`; client nạp qua `AssetCache` (`apps/client/src/game/assets.ts`); `pnpm assets:validate` kiểm ngân sách, LICENSES, chiều cao raw/build
- `pnpm audio:build` (cần ffmpeg có libopus + aac; đặt `FFMPEG=` nếu không có trong PATH): sinh sprite SFX và âm môi trường từ `../dtl-asset-source/sfx` theo `tools/audio/sounds.json`, ghi `apps/client/public/audio/manifest.json` và khối âm thanh trong `assets/LICENSES.md`; `pnpm audio:check` chỉ kiểm khai báo, nguồn, giấy phép CC0
- `pnpm music:build [--only id,id]`: nhạc nền **tự soạn bằng code** (`tools/audio/compose/<id>.mjs`: ngũ cung, giai điệu dạng chuỗi, phân lớp) → MIDI → render bằng soundfont GeneralUser GS (spessasynth_core, tự tải về `../dtl-asset-source/audio/sf2/` có SHA-256) → vòng lặp chính xác theo ô nhịp, −16 LUFS, Opus+AAC, mục `music` (kèm `credit`) trong manifest và khối nhạc trong `assets/LICENSES.md`. Không cần cài gì ngoài `pnpm install` (ffmpeg-static). `pnpm music:check` liệt kê bài. Nhạc chiến đấu phân lớp (M4-13): ở sect/wild/dungeon có thêm stem `<vùng>_pulse`/`_edge` cùng tempo, client phát đồng bộ mẫu và chỉnh âm lượng theo mức giao chiến (`stemMusic.ts`, `stems.mjs`, `__music.state().layers`), thiếu stem thì crossfade sang `combat`. Hướng dẫn sửa bài: `docs/audio/music.md`; Suno chỉ còn là tùy chọn (`docs/audio/suno-prompts.md`). `pnpm audio:test` test hậu kỳ + soạn nhạc
- `pnpm build` rồi `pnpm start`: server phục vụ luôn bản build ở cổng 2567
- Lệnh GM trong chat (chỉ tài khoản thử): `/gm level N | xp N | gold N | give id n | tp x z | tp <địa điểm> | god [on|off] | heal | die | killall | hurt pct | spawn id [n] | tick | dye id` (`hurt` hạ máu quái quanh mình về pct% để thử pha boss; `dye` đổi màu áo, id trong `appearance.json`)
- Tham số URL kiểm thử (chỉ tài khoản thử, server kiểm trong `apps/server/src/testflags.ts`; tài khoản thật bị bỏ qua và được báo): `?god` bất tử (vẫn bị đánh, không mất máu), `?at=<địa điểm>` vào game ở điểm đặt tên trong `packages/content/data/places.json` (`tong_mon`, `thung_lung`, `rung`, `ho`, `boss`, `cong`/`kiem_trung`…, chỉ server đọc), `?show=char` (hoặc `?show=<id asset>`) mở trang xem asset. `__game.info()` trả draw call/tam giác cộng dồn mọi pass của khung vừa vẽ. Chi tiết: skill `playtest`

## Hiện trạng MVP (2026-11-12)

Đã chạy được và đã thử trong trình duyệt: đăng nhập thử, di chuyển có dự đoán + đối soát, ngự kiếm, combat tab-target 6 chiêu, 7 loại quái + boss Hàn Giao, 12 nhiệm vụ, mua bán, luyện đan, cường hóa, đả tọa, độ kiếp Trúc Cơ, bí cảnh Kiếm Trủng 4 đợt, chat, bản đồ nhỏ, kết nối lại, tự mở kênh khi đủ 50 người. Cỏ tương tác (`game/grass.ts`: 1 draw call, rạp theo mình + 5 người/quái gần nhất qua `uniformArray`, preset Thấp tắt) và hạt môi trường theo vùng quanh camera (`game/ambient.ts`, phát vào hệ hạt chung M4-5 nên không thêm draw call).

Khác với spec ban đầu (chấp nhận cho MVP, ghi lại để không làm lệch thêm):

- Không dùng ECS và Rapier: thực thể là object thường; va chạm là heightmap + hình tròn trong `shared/level.ts`.
- Chưa có AOI: cả kênh nhận trạng thái của nhau qua `@colyseus/schema`.
- Bảng DB tạo bằng DDL trong `db.ts` (không dùng drizzle-kit migrate). Đổi schema phải sửa cả DDL lẫn bảng Drizzle.
- Độ kiếp diễn ra ngay trong room thế giới, không phải room riêng.
- Bí cảnh là một lòng chảo trên cùng bản đồ (Kiếm Trủng, tây bắc), chạy trong room riêng.
- Ngự kiếm mở ở Ngưng Khí tầng 3 (spec ghi tầng 8) để người mới sớm được bay.
- Người chơi dùng Thanh Phong (`chr_kiem_tu_nam`, có xương) qua `game/character/playerSkins.ts`; màu áo nhuộm bằng shader theo `packages/content/data/appearance.json`, chọn khi tạo nhân vật (cột `characters.appearance`). Chưa có model nữ. Chiêu, bay, niệm chú dùng pose IK của M3-4 (`withPoses`); thiền dùng tư thế tạm `tam_thien`, nhảy mượn `ngu_kiem`. Ba NPC (Lạc Vân, Tố Tâm, Thiết lão) dùng model có xương `chr_npc_*` qua `game/character/npcSkins.ts` (chỉ phát idle). Phần lớn quái vẫn dựng bằng khối trong `models.ts`. Ba loài sói dùng `mon_soi_xam` có xương (`MONSTER_SKINS`). Ba boss Kiếm Trủng (Huyết Lang Vương, Kiếm Khôi, Thủ Mộ Thạch Tướng) có xương, nạp lười khi boss xuất hiện; slam/sweep phát theo `S.HAZARD` (`bossMove`, khớp lúc vùng nổ), niệm chú/choáng theo cờ `mf`. Hàn Giao vẫn thủ tục. `?models=legacy` hoặc nạp lỗi thì về model khối.
- Đăng nhập Google chưa thử với Client ID thật (chưa có); đường đăng nhập thử đã kiểm.

Điều đã rút ra từ lần soát netcode (đừng làm hỏng lại):

- Xác thực nằm ở `static onAuth` của room để chạy trước khi Colyseus giữ chỗ/tạo room; client không được gọi `create` (xem `matchMaker.controller.exposedMethods` trong `index.ts`).
- Vào bí cảnh cần vé một lần do `WorldRoom.onPortal` cấp; đừng kiểm điều kiện vào room mới ở room cũ mà không có vé.
- Không cho ra chiêu khi `airborne()`; quái bỏ đuổi mục tiêu không với tới thì hồi đầy và miễn sát thương (`evadeUntil`).
- Request listener HTTP phải bọc try/catch; `AUTH_DEV_BYPASS` tự tắt khi `NODE_ENV=production` hoặc có `GOOGLE_CLIENT_ID`.
- Bảng rơi đồ và linh thạch rơi nằm ở `packages/content/data/loot.json`, chỉ import qua `@dtl/content/loot` (server, check, sim). `monsters.json` vào bundle client nên không được chứa `drops`/`gold` (`content:check` và `apps/client/src/no-server-data.test.ts` chặn). Client chỉ biết món đã rơi qua tin nhắn `sys.loot`.
- Đạn đánh xa của quái (`caster.shape: 'bolt'`): server mô phỏng trong `tickBolts` bằng công thức chung `packages/shared/src/projectile.ts` (quét đoạn, chặn vật cản trên cả đoạn, đạn nâng theo độ cao mục tiêu lúc bắn để ngự kiếm sát đất không né được bằng cách lơ lửng), đi chung cửa sổ miễn `hazardHit` với vùng nổ; quái chết/bỏ đuổi thì đạn tan. Client chỉ nội suy từ `S.BOLT` và vẽ khi có `S.BOLT_END`.
- POST `/matchmake` và bắt tay WebSocket giới hạn theo IP bằng token bucket (`apps/server/src/ratelimit.ts`, bọc ngoài listener của Colyseus, trả 429 + `Retry-After`). Env: `RATE_LIMIT_BURST` (40), `RATE_LIMIT_PER_MIN` (20), `TRUST_PROXY=1` mới đọc `X-Forwarded-For` (lấy phần tử cuối), `RATE_LIMIT_EXEMPT=loopback` cho bot ở máy dev (bị bỏ qua khi production).

## Quy tắc bất biến

- **Server quyết định mọi thứ.** Client chỉ gửi ý định (input, "dùng skill X lên Y"). Không bao giờ nhận sát thương, vị trí cuối cùng, phần thưởng từ client.
- **Mọi thay đổi vật phẩm/tiền** chạy trong một transaction, có idempotency key và ghi vào `ledger`.
- **Logic chung** (công thức, hằng số, schema) chỉ nằm trong `packages/shared`, không copy sang client/server.
- **Ngân sách hiệu năng** (desktop): dưới 300 draw call, 1–2 triệu tam giác, 512MB texture, tải lần đầu dưới 30MB, CPU dưới 8ms/khung. Thay đổi render phải kiểm tra lại.
- **Chuỗi hiển thị** đi qua i18n key, không viết cứng tiếng Việt trong component.
- **Tên cảnh giới, vật phẩm, địa danh** lấy từ bảng thuật ngữ trong `packages/content/data/glossary.json`.

## Skill và subagent

Skill trong `.claude/skills/`, subagent trong `.claude/agents/`. Dùng skill tương ứng trước khi làm việc trong khu vực đó:

- `threejs-client`: code render, streaming thế giới, input, UI trên canvas
- `tsl-shaders-vfx`: shader TSL, hiệu ứng skill, thủy mặc, mây, độ kiếp
- `procedural-assets`: sinh địa hình, cây, đá, kiến trúc bằng code hoặc bpy
- `blender-pipeline`: script Blender headless, xuất GLB, tối ưu, kiểm tra asset
- `colyseus-server`: rooms, schema, xác thực input, AOI, lưu DB
- `game-content`: thêm quái, skill, vật phẩm, nhiệm vụ, cảnh giới, cân bằng
- `perf-budget`: đo và giữ ngân sách hiệu năng
- `playtest`: chạy cả stack local, bot, kiểm tra trong trình duyệt
- `guizang-game-skill` (bên ngoài, AGPL-3.0, tiếng Trung): chỉ để tham khảo khi làm cảm giác đòn đánh, animation IK, VFX, camera, lỗi input. Viết cho game offline một file HTML nên khi xung đột thì quy ước dự án thắng (WebGPU/TSL, server quyết định, i18n, ngân sách). Không chép code từ repo gốc
- MCP `blender` (`.mcp.json`, `uvx mcp-for-blender`): điều khiển Blender đang mở để xem và thử dựng. Pipeline chính vẫn là script headless `tools/blender/` (xem `blender-pipeline`)

Subagent: `netcode-reviewer`, `perf-auditor`, `asset-validator`, `lore-keeper`.
