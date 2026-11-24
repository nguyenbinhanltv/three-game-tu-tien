# E4-K · Phân thân thần niệm, lĩnh vực, ô chiêu 10 (Hóa Thần sơ kỳ, cấp 28)

Gói E4-K của `docs/EXPANSION_DESIGN.md` mục 11.3 (cơ chế mục 3.1/3.4). Ảnh và video chơi thử nằm ở thư mục artifacts của phiên, không commit vào repo.

## Phân thân thần niệm (phím G)

Thực thể phụ có chủ do **server** giữ hết trạng thái (`apps/server/src/game/clone.ts`, `CloneSystem` gắn `GameSim.clone`); client chỉ gửi ý định `C.CLONE` (`CloneCmd`) và vẽ theo FX `clone_*`.

- Mở ở cấp 28 (`cloneUnlocked`). Tạo tốn 60 linh lực, sống 20 s, hồi 90 s tính từ lúc tạo (theo nhân vật, giữ qua đổi room). Đặt ngay trước mặt chủ (server bỏ qua điểm client gửi vì chưa kiểm tường/vùng cấm; `clonePlace` vẫn kẹp trong 30 m nếu sau này bật). Bấm G lần nữa thì thu về.
- Đi theo chủ khi chủ ra xa quá 14 m (bước 7 m/s, đứng cách chủ 4 m). Đánh mục tiêu của chủ: quái của chiêu gây sát thương cuối chủ vừa dùng nếu còn trong 24 m quanh phân thân, không thì quái gần phân thân nhất.
- Sát thương/hồi tính bằng chỉ số của chủ và ghi công cho chủ (kinh nghiệm, rơi đồ), nhưng **không** cộng kiếm ý/thế hay vòng sạc cho chủ. Không đánh người (tỉ thí chặn tạo).
- Tan khi: hết giờ (có chiêu cuối), thu về, chủ chết, vào độ kiếp, đang tỉ thí, rời/đổi room, hoặc vỡ (hộ pháp gánh hết khí huyết).
- **Danh sách chiêu riêng** theo công pháp, dữ liệu ở `packages/content/data/clones.json` (kiểu ở `packages/shared/src/clone.ts`, `content:check` kiểm):

| Công pháp | Chiêu | Hành vi |
| --- | --- | --- |
| Lạc Kiếm Quyết (dps) | `kiem_anh` (echo, mỗi 2 s) | Lặp chiêu cuối của chủ ở 50% sát thương (chiêu nhiều đòn thì đủ đòn, chiêu vùng thì cả vùng) |
| | `kiem_tan` (finale) | Hết giờ tự nhiên thì chém một đòn cuối ở 100% (gấp đôi một nhịp echo), vùng 6 m |
| Bất Động Kim Thân (tank) | `kim_than_hut` (taunt, mỗi 3 s, r 12 m) | Quái quanh phân thân nhắm chủ 4 s (boss nửa thời gian như Khiêu Khích); phân thân gánh 60% sát thương quái trong vùng đó đánh chủ (khí huyết phân thân = 50% của chủ) |
| Thanh Mộc Đan Kinh (support) | `moc_linh_hoi` (heal, mỗi 2 s, r 14 m) | Hồi 4% khí huyết tối đa cho mỗi đồng đội (kể cả chủ) trong vùng |

Ghi chú: thiết kế gốc ghi "hút khiêu khích" cho hộ pháp; quái vẫn chọn mục tiêu là người chơi nên "bia" được hiện thực bằng gánh sát thương (`CloneSystem.absorb`, gọi trong `damagePlayer`). Phân thân đứng yên trước quái chưa bị quái đuổi riêng.

**Trong Thiên Nhân Kiếp** phím G vẫn là thế thân của kiếp (`C.TRIB_CLONE`, E4-D, `tribnhan.ts`): `GameSim.onClone` chuyển theo `p.trib`. Phân thân thật không tham gia chắn tia lớn 40% (chưa nối; thế thân của kiếp giữ nguyên hành vi, test `hoathan.test.ts` không đổi).

**Chống khai thác**: chủ đang bay/lơ lửng, xuất khiếu hoặc mất kết nối thì không tạo được và phân thân đang có sẽ tan (quái không với tới chủ trong khi phân thân vẫn đánh); có phân thân thì không đả tọa; `echo` tôn trọng hồi chiêu gốc của chiêu (mỗi chiêu lặp lại sau `max(cd chiêu, cd echo)`, chiêu cd 60 s chỉ lặp một lần); hồi chiêu tạo phân thân giữ ở cấp tiến trình và được dọn khi đã hết hạn.

## Lĩnh vực

`apps/server/src/game/domain.ts` (`DomainSystem`, `GameSim.domain`), công thức `packages/shared/src/clone.ts` (`domainRadius`: 8 m ở cấp 25, 10 m ở 26–27, **20 m ở Hóa Thần**; `domainScale` 1,5 cho lĩnh vực lớn). Thiết kế mục 3.1 chỉ ghi lĩnh vực nhỏ ở Nguyên Anh trung kỳ nhưng chưa có mã nào, nên gói này làm cả hệ:

- Kiếm tu: chủ +6% bạo kích (`critAdd`, nhân 1,5 ở lĩnh vực lớn), cộng ở `hitMonster` và đòn phân thân.
- Hộ pháp: chủ và đồng đội trong vùng giảm 6% sát thương nhận (`reduce`, lấy mức cao nhất, không cộng dồn; 9% ở lĩnh vực lớn), áp trong `damagePlayer`.
- Đan sư: chủ và đồng đội trong vùng hồi 0,4% khí huyết tối đa mỗi giây (0,6% ở lĩnh vực lớn). **Lệch thiết kế**: bản gốc ghi "hồi +10%" (nhân hồi phục); làm bằng hồi đều để không phải sửa mọi chỗ hồi. Cân bằng lại ở E-5 nếu muốn.
- Client vẽ vòng rất nhạt dưới chân mình (`game/cloneVis.ts` `setDomain`).

## Ô chiêu 10

Ba chiêu cấp 28 trong `methods.json` (`skl_thien_kiem_hoa_hinh`, `skl_thien_kim_phap_tuong`, `skl_thien_dan_phap_gioi`) bỏ `locked`: chơi được ở Hóa Thần, kiểu chiêu (`aoe`/`buff`/`hot`), pose và FX timeline đã có từ E2-G. `thanThong10Skill` (`@dtl/content`) trả chiêu ô 10, không còn nằm trong `tierBar`. Thanh chiêu: `[8 ô chính, ô 9 (phím 0), ô 10 (phím `` ` ``, Backquote), hàng bậc cao Shift+số]`, nên **hàng Shift dời từ chỉ số `BAR_SIZE + 1` sang `BAR_SIZE + 2`** (engine, `Hud.tsx`). `content:check` bắt buộc mỗi công pháp có ô 10; chiêu cấp 24/26 vẫn `locked`.

## Kiểm

- `apps/server/src/game/clone.test.ts` (21 test): dữ liệu, tạo/thu/hồi chiêu/kẹp tầm/thiếu linh lực, hết giờ và chết, G trong kiếp, đi theo chủ, ba công pháp (echo + finale, không cộng kiếm ý/sạc, khiêu khích + gánh 60% + vỡ, hồi theo vùng), lĩnh vực (bạo kích, giảm sát thương, hồi), và tải 50 người cùng gọi.
- Tick server với 50 phân thân cùng hoạt động giữa 40 quái (`GameSim` thật, đồng hồ giả, 10 s): trung bình ~0,6 ms, p95 ~0,8 ms, lớn nhất 5 ms (ngưỡng 25 ms).
- `pnpm typecheck`, `pnpm test` (shared 214, content 43, client 755, server 670), `pnpm content:check`: sạch. Bot `security` chạy lại vì sửa `rooms.ts` (xem mô tả PR).
- Chơi thử: `pnpm shots clone --out <thư mục tuyệt đối> [--methods kiem,hophap,dansu] [--genders m,f]` (kịch bản đã gỡ ở tối ưu Đợt C) quay webm + ảnh từng công pháp (tắt tiếng, cổng 2675/5175). Chưa quay nữ.

## Chưa làm / giới hạn

- Điểm đặt phân thân theo con trỏ (server hiện bỏ qua `x,z`; cần kiểm tường/vùng cấm/tầm nhìn trước khi bật).
- Phân thân không chắn tia lớn của Thiên Nhân Kiếp, quái không đuổi riêng phân thân.
- Hình phân thân dùng chung vật liệu linh thể với nguyên anh (cỡ thật); chưa có "bóng thần niệm sau gáy / dải sao trên đạo bào" của bảng trực quan mục 3.1.
- Tooltip lĩnh vực (`ui.domain.*`) đã có chuỗi nhưng chưa gắn vào bảng nhân vật.
- Số liệu (50%, 60%, 4%, 6%...) là bản đầu, cần chơi thử rồi chỉnh ở `clones.json` và `DOMAIN_EFFECT`.
