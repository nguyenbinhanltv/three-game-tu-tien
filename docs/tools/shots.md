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
| `dungeonart` | Bí cảnh theo dữ liệu: các điểm nhìn cố định ở 720p+1080p, cảnh chiến đấu boss (gọi bằng GM), đo khung, video đi một lượt | Duyệt mỹ thuật phó bản (DUN-1) | `--level`, `--tag`, `--sizes`, `--views`, `--battle`, `--perf`, `--video` |
| `asset` | Trang xem asset: tấm xoay 4 hướng + tấm clip (mỗi clip N khung) | Sau khi nhập/sửa model, rig, clip thủ tục | `--ids a,b` hoặc `--group boss_\|elite_\|mon_\|prop_`, `--clips`, `--frames`, `--zoom` (< 1 cho vật nhỏ như kiếm) |
| `vfx` | Mỗi chiêu hai webm (chậm 0,25× và thật) + tờ dãy khung có mốc hit; cả FX quái (`mon:<loại>`) và cảnh lớn (`scene_*`) | Sửa timeline `data/fx/*.json`, shader VFX, cảm giác đòn | `--skills`, `--genders`, `--fxq`, `--level`, `--old`, `--perf`, `--crowd N` |
| `vs2` | HUD ba công pháp cho hệ kỹ năng VS-2: thanh tài nguyên riêng (rỗng, đang tích, đầy, tooltip), ô chiêu sáng khi chuỗi mở + tooltip chuỗi, ấn trên đầu quái/thanh thủ lĩnh/người chơi, ở 1080p + 720p | Sửa `ui/u2/hud/ResourceBar.tsx`, luật tài nguyên/chuỗi/ấn/nhánh/tư thế | `--step res,chain,marks,branch,stance,joint`, `--sizes`, `--only` |
| `n7` | Nhân vật người chơi trước/sau khi đổi mặc định (N-7): cận 3 phái × nam/nữ bằng camera tự do theo hướng thân, đám đông N bot mặc luân phiên 12 bộ × 2 giới ở sân tông môn; 1080p + 720p; `<tag>-so-do.json` có draw call, tam giác, heap sau GC, MB hình học | So nhân vật v1 (`--query chr=v1 --tag truoc`) với mặc định v3; đo nhanh đám đông sau khi đổi model/LOD nhân vật | `--dye` (chỉ chụp nhuộm: 4 màu đạo bào trên đồ khởi đầu + nhuộm tủ trên 5 bộ), `--tag`, `--query`, `--bots 20,50`, `--radius`, `--genders`, `--quality`, `--no-close`, `--no-crowd` |
| `realmaura` | Hào quang cảnh giới (Kết Đan → Ảnh Biến) × 3 đạo: 1080p + 720p, dãy khung pháp tướng, video; `--perf` đo draw call tắt/bật | Sửa `game/fx/realmAura*.ts`, thẻ pháp tướng | `--daos`, `--realms`, `--video`, `--perf`, `--others N`, `--only stills\|phantom` |
| `ui` | HUD ở 5 cảnh + 13 bảng lớn, nhiều cỡ màn hình, CPU của trang mỗi khung (`hud-metrics.json`) | Sửa CSS/thành phần HUD, bảng, `--ui-scale` | `--part hud\|panels`, `--only`, `--variants truoc,sau` (chỉ là nhãn tên ảnh: chạy một lần trên bản trước, một lần trên bản sau để so; HUD cũ `?ngj=0` đã gỡ), `--sizes 720p,1080p,1440p,4k` |
| `huyenkiep` | Huyền Kiếp (TN-6): chín kiếp nhỏ ở 720p + 1080p (mốc giờ + sự kiện hình); người lái giữ phím W/A/S/D thật (Tuyết Kiếp chấm tốc độ nên không dịch chuyển tức thời), bấm X, ra đòn | Sửa cơ chế `hk_*`, VFX chín kiếp, HUD kiếp lực | `--chains ngoai,noi,hon`, `--stages 1,2,3`, `--sizes`, `--video`, `--pitch`, `--dist`, `--fxq` |
| `ngusuy` | Thiên Nhân Ngũ Suy (TN-4): từng ải ở 720p + 1080p (đầu ải, giữa ải, cuối ải, kết ải); kịch bản tự thao tác đúng từng ải qua `__game.suyLog` | Sửa cơ chế `suy_*`, HUD thanh suy khí, VFX năm ải | `--stages 1,2,3,4,5`, `--sizes`, `--video`, `--pitch`, `--dist` |

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
