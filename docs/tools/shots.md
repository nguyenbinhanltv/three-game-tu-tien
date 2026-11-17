# `pnpm shots <kịch bản>`: chụp ảnh và quay video kiểm thử

Một lệnh cho mọi kịch bản (R-5), thay 53 script `shots-*.ts` và 38 lệnh `shots:*` cũ.

```
pnpm shots --list                        # liệt kê kịch bản
pnpm shots <kịch bản> --help             # tham số riêng
pnpm shots <kịch bản> --out <thư mục>    # chạy
pnpm shots --out <thư mục>               # không ghi tên = points
```

Chung cho mọi kịch bản:

- `--out <thư mục>`: đường dẫn tương đối tính từ nơi gõ lệnh. Ảnh duyệt PR để ở thư mục artifact của phiên, không commit vào `docs/`.
- `--renderer webgpu|webgl2` (mặc định `webgpu`).
- Khung tự chạy `pnpm dev` ở cổng 2675/5175 với DB tạm và đăng nhập thử, mở Chrome tắt tiếng (`?mute=1`, `--mute-audio`), in lỗi console, tự tắt server kể cả khi lỗi. Chạy song song nhiều worktree thì đặt `PORT=`/`CLIENT_PORT=` khác nhau; cổng bận thì lệnh dừng, không dùng hay kill tiến trình lạ.
- `SHOT_SETTLE=<ms>`: thời gian chờ cảnh rộng ổn định trước khi chụp (mặc định 2500).

## Kịch bản

| Tên | Chụp gì | Dùng khi | Tham số chính |
| --- | --- | --- | --- |
| `points` | Cảnh cố định theo điểm; Vân Lam có 13 điểm đặt tay (mặc định 5: `san,sondao,rung,ho,dinh`), level khác suy từ dữ liệu (tâm vùng, điểm đáng chú ý, tinh anh, boss, toàn cảnh) | Ảnh trước/sau khi đổi render; duyệt bản đồ mới | `--level`, `--points a,b\|all`, `--renderers`, `--presets`, `--size`, `--query`, `--perf`, `--dry` |
| `map` | Minimap (cắt riêng) + cả màn hình + bản đồ lớn (phím M) | Sau `pnpm minimap:build`, đổi `zones`, sửa UI bản đồ | `--level`, `--sizes 1080p,1440p,4k`, `--dpr` |
| `mons` | Từng loại quái của một level, gọi ở đúng bãi của nó: dãy khung vạch báo + chết; boss thêm pha 65% và 25% máu; ghi `hazards.json` | Duyệt quái/tinh anh/boss mới, soát VFX quái | `--level`, `--only id,id`, `--frames` |
| `dungeon` | Chạy hết một phó bản theo `DungeonDef`: cổng thật, từng đợt, vạch báo + pha boss, đố ba gương, đợt phong ấn, hoàn thành | Phó bản mới hoặc đổi đợt/boss | `--level phuc_mach|kinh_nguyet|than_tang`\|kinh_nguyet\|…` |
| `asset` | Trang xem asset: tấm xoay 4 hướng + tấm clip (mỗi clip N khung) | Sau khi nhập/sửa model, rig, clip thủ tục | `--ids a,b` hoặc `--group boss_\|elite_\|mon_\|prop_`, `--clips`, `--frames`, `--zoom` (< 1 cho vật nhỏ như kiếm) |
| `vfx` | Mỗi chiêu hai webm (chậm 0,25× và thật) + tờ dãy khung có mốc hit; cả FX quái (`mon:<loại>`) và cảnh lớn (`scene_*`) | Sửa timeline `data/fx/*.json`, shader VFX, cảm giác đòn | `--skills`, `--genders`, `--fxq`, `--level`, `--old`, `--perf`, `--crowd N` |
| `outfit` | Bộ trang bị mặc thật (áo + phụ kiện) nam/nữ: đứng 3 hướng, chạy, bay, đả tọa, chém | Thêm/sửa bộ, áo `set_*`, phụ kiện, kiếm | `--sets`, `--kit <bậc> --sets kiem,hophap,dansu`, `--genders`, `--only still\|motion`, `--panel`, `--matrix`, `--query outfit=0` |
| `chrv2` | Nhân vật nền v1/v2/tóc B cùng góc: cận mặt, bán thân, toàn thân, chuyển động, chết; `stats.json` | Dựng lại thân, đầu, tóc, áo v2 | `--variant old\|v2\|v2b\|both`, `--genders`, `--sets`, `--only still` |
| `ui` | HUD ở 5 cảnh + 13 bảng lớn, nhiều cỡ màn hình, CPU của trang mỗi khung (`hud-metrics.json`) | Sửa CSS/thành phần HUD, bảng, `--ui-scale` | `--part hud\|panels`, `--only`, `--variants truoc,sau` (truoc = `?ngj=0`), `--sizes 720p,1080p,1440p,4k` |

Đo hiệu năng đám đông không phải kịch bản chụp: dùng `pnpm bench:crowd` (xem skill `perf-budget`).

## Thêm kịch bản

Tạo `tools/perf/src/scenarios/<tên>.ts` export default một `Scenario` (`lib/scenario.ts`) rồi thêm vào bảng trong `tools/perf/src/shots.ts`. Không viết script rời tự dựng server/trình duyệt. Phần dùng chung ở `tools/perf/src/lib/`:

| File | Nội dung |
| --- | --- |
| `env.ts` | Chỗ duy nhất đọc tham số dòng lệnh và biến môi trường (`opt`, `flag`, `list`, `ports`, `outDir`) |
| `devserver.ts` | Chạy `pnpm dev` ở cổng riêng, kiểm cổng trống, DB tạm, tắt cả cây tiến trình |
| `browser.ts` | `launchChrome` (tắt tiếng, WebGPU headless), `gameUrl` (luôn `mute=1`), gom lỗi console |
| `game.ts` | `openGame` (đăng nhập thử), `gm`, `cam`, `tp`, `enterLevel`, quái, vạch báo |
| `shot.ts` | `snap`, `sheet` (tờ ảnh lưới), `snapSizes`, `writeJson` |
| `charshots.ts` | Bộ góc chụp nhân vật (đứng, chạy, bay, đả tọa, chém, chết) |
| `window.ts` | Kiểu cho `window.__game`/`__viewer`; mã trong `page.evaluate` gọi thẳng, không ép `as unknown as` |

Lưu ý: hàm truyền vào `page.evaluate` không khai báo hàm có tên bên trong (tsx chèn `__name`, trình duyệt không có); cần thì viết thành chuỗi như `monAct` trong `scenarios/vfx.ts`.

## Lệnh cũ → nay

| Lệnh cũ | Nay |
| --- | --- |
| `shots` | `shots points` (mặc định) |
| `shots:e2a`, `shots:e3a`, `shots:e4a` | `shots points --level doan_mach\|van_hai\|thien_khuyet`, bản đồ: `shots map --level `--level phuc_mach|kinh_nguyet|than_tang` |
| `shots:minimap`, `shots:m4` (phần ảnh bản đồ) | `shots map` |
| `shots:e2b`, `shots:e3b`, `shots:e4b`, `shots:elitegame` | `shots mons --level `--level phuc_mach|kinh_nguyet|than_tang` |
| `shots:e2c`, `shots:e3m`, `shots:e4c` | `shots dungeon --level phuc_mach|`--level phuc_mach|kinh_nguyet|than_tang`|than_tang` |\|kinh_nguyet` |
| `shots:boss`, `shots:elite`, `shots:props`, `shots:e0` | `shots asset --group `--level phuc_mach|kinh_nguyet|than_tang` / `--ids …` |
| `shots:vfx` | `shots vfx` (bỏ `--lab3`, `--debug`) |
| `shots:outfit`, `shots:sets` | `shots outfit` |
| `shots:chrv2` | `shots chrv2` |
| `shots:ui2`, `shots:ui3` | `shots ui --part hud\|panels` |

Đã gỡ, không có thay thế (kịch bản một lần của hạng mục đã merge; mã còn trong lịch sử git, commit ngay trước R-5): `shots:method`, `party`, `p38`, `m5`, `k1`, `k3`, `k4`, `k6`, `k7`, `e2g`, `e2codex`, `e1e`, `e3j`, `gate`, `trib`, `e2d`, `e3l`, `e2h`, `e3h`, `e3h2`, `e2e`, `e3k`, `e2f`, `e3f`, `eqicons`, `kiem`, `gm`, `tdb`, `tdc`, `ngj`, `ui4`, `ui5`, `s2b`, `e4shots` (P2-E4), và `e4title.ts` (không lệnh nào gọi). README của các hạng mục đó trong `docs/` còn nhắc lệnh cũ như ghi chép lịch sử.
