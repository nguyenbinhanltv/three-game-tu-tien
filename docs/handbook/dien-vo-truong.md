# Diễn Võ Trường: công cụ phòng tập (từ đợt công cụ 27/11 tối)

Phòng tập GM và lịch sử V0 → V2c đầu nằm ở `docs/handbook/da-canh.md` (mục Diễn Võ Trường). Trang này ghi các **công cụ** thêm từ lúc chia hai tuyến việc (tuyến VFX + cổng đo ghi tiếp ở `da-canh.md`). Nguyên tắc không đổi: mọi công cụ ở đây chỉ là lớp hình ở máy mình hoặc lệnh GM trong phòng riêng; **không đổi mặc định của game**, không ghi vào nhân vật thật.

Mã: nút ở `apps/client/src/ui/DebugPanel.tsx` (F3 → Diễn Võ), hàm ngoài lớp Game ở `apps/client/src/game/engine/lab.ts`, kịch bản kiểm `pnpm shots labui` (`tools/perf/src/scenarios/labui.ts`).

## Bảng F3 dùng được ở 720p

- Bảng rộng 460 px (trước 360) và mặc định hiện **số đo gọn** (FPS, thời gian khung, draw call + tam giác, VFX). Nút "Đủ số đo" ở hàng nhóm GM mở lại bảng đầy đủ; lựa chọn nhớ ở `localStorage` `dtl.debugCompact`. Bản không có nút GM luôn hiện đủ.
- Lý do: bảng không cuộn được bằng chuột; với bảy nhóm con, hàng nút của nhóm Giao diện đã nằm dưới đáy màn 720p (29 nút bị khuất khi đo lần đầu). Playwright tự cuộn nên kiểm cũ không bắt được; `labui` giờ so đáy từng nút với đáy phần nhìn thấy của bảng.

## Khu Giao diện, đợt hai (V2c)

- **Nhật ký điều khiển** (nút cùng tên): lớp phủ cạnh bảng F3, mỗi lệnh chiêu/né một dòng — phím, *chờ ở máy* (phím → lúc client gửi, gồm cả thời gian lệnh bấm sớm nằm chờ hết GCD), *server trả lời* (gửi → tin hồi chiêu `S.CD` về), *trúng* (gửi → sát thương đầu tiên của mình về). Dòng đầu ghi ping thật + ping giả và ô chiêu đang được giữ. Lớp thuần `LabTrace` (`apps/client/src/game/debug/labTrace.ts`, có test); engine chỉ gọi ở hai chỗ tin đi (`Game.send`, trước ping giả) và tin về (`bindRoom`, sau ping giả). Tắt nút thì gỡ hết bộ nghe, engine không ghi gì. Số đo mẫu ở máy dev: server trả lời 28–88 ms, trúng ~300–320 ms sau khi gửi (Kiếm Khí Trảm); bật ping giả 150 ms thì server trả lời 166–208 ms.
- **HUD của mình** (Số thật / Máu 50% / 25% / 10% / Linh lực 5%): máu và linh lực GIẢ trên HUD (`labVitalsSet`, đọc ở `hudSync`), để soi thanh máu, viền máu thấp, ô chiêu thiếu linh lực mà không phải để quái đánh. State của server không đổi (kịch bản kiểm máu thật vẫn 100%).
- **Gọi khoảnh khắc** thêm: Bảng tổng kết (bốn dòng, tên dài, một người gục), Lời mời (tổ đội + tỉ thí), Thẻ chiêu cuối. `Game.labMoment('clear')` dọn các khoảnh khắc còn treo.
- **Kiểm máy yếu** (nhóm Nền và màu): Cao / Vừa / Thấp đổi preset ngay và khóa preset (đây là cài đặt của máy đang chơi, như trong Cài đặt, không phải mặc định game); "WebGL2 (tải lại)" / "WebGPU (tải lại)" tải lại trang với `?renderer=`. Bộ ảnh máy yếu vẫn chụp bằng `pnpm shots dienvo --quality low --renderer webgl2 --base <bộ gốc>`.

## Nhóm con "Nhịp và HUD" (V2c, đợt ba)

Nhóm con thứ tám của tab Diễn Võ (`FeelLab`), tách khỏi Giao diện để cả hai nằm trọn khung 720p:

- Hàng **HUD của mình** và nút **Nhật ký điều khiển** (chuyển từ nhóm Giao diện sang).
- **Tốc độ hiệu ứng giao diện** 100 / 50 / 25 / 10%: đặt `playbackRate` cho MỌI animation và transition CSS (`labUiRate`, lặp theo khung hình nên áp cả cho animation sinh ra sau đó) để soi nhịp bật bảng, thông báo, thẻ chương. Không đụng lớp 3D (đã có nhóm Thời gian).
- **Bốn token thời lượng** của bộ giao diện (`--u-dur-fast` 120, `--u-dur` 180, `--u-dur-open` 250, `--u-dur-ink` 400 ms ở `apps/client/src/ui/u2/tokens.css`): nút − / + mỗi lần 20 ms, "Về mặc định" bỏ ghi đè. Chỉ ghi đè trên `<html>` trong phiên; muốn đổi thật thì sửa `tokens.css` qua commit.
- `__game.labx` (`makeLabX` ở `apps/client/src/game/engine/lab.ts`): cổng gọi công cụ từ console / Playwright — `window(id)` (đóng hết rồi mở một cửa sổ), `uiRate`, `uiToken`, `vitals`, `preset`. Công cụ mới thêm vào đây, không thêm phương thức vào lớp Game.

## Xưởng âm thanh và xưởng animation (V2d)

Hai nhóm con mới của tab Diễn Võ. Chơi thử tự động luôn tắt tiếng, nên phần âm thanh được dựng để ĐỌC SỐ khi tắt tiếng; người dùng bật tiếng thì nghe trực tiếp.

**Âm thanh** (`SoundLab`):

- Chọn một tiếng (âm tổng hợp + tên trong manifest đã tải, `sfxNames`) rồi **Phát**.
- **Đo tiếng**: bật đầu dò `sfxProbe` ở `apps/client/src/game/audio/audio.ts` — ghi mọi LỜI GỌI phát tiếng kèm lý do bị bỏ (`mute` tắt tiếng, `quiet` quá nhỏ, `throttle` trùng tên trong 45 ms, `idle` chưa mở khóa). Bảng hiện số tiếng trong 2 giây, **đỉnh dồn** (nhiều tiếng nhất trong 0,1 giây và tổng âm lượng yêu cầu của cửa sổ đó: ước lượng độ dồn khi nhiều người cùng đánh, không phải dB) và mức ra loa thật (dBFS, `audioLevel`, đo sau âm lượng tổng; tắt tiếng thì báo im). Thống kê là hàm thuần `sfxStats` (`apps/client/src/game/debug/sfxStats.ts`, có test).
- **Lệch tiếng so với mốc trúng** của một chiêu, đo từ DỮ LIỆU timeline (`fxAudioReport`, `apps/client/src/game/debug/fxAudio.ts`, có test): mốc trúng = `hitstop`/`impact` sớm nhất, tiếng = `soundAt`/`sound`; lệch quá 60 ms thì báo sớm/muộn. Nút "Phát chiêu" phát timeline đó lên mục tiêu.
- **Nhạc**: Theo trận / Yên / Giao chiến / Đánh boss ép đầu vào giao chiến của đạo diễn nhạc (`MusicController.labForce`, `apps/client/src/game/audio/music.ts`) để nghe chuyển cảnh mà không cần quái; hysteresis của đạo diễn vẫn áp dụng. Cạnh đó là bài đang phát và mức lớp giao chiến.

**Động tác** (`PoseLab`):

- Tìm và chọn một trong 130 pose, **Diễn** cho nhân vật của mình (chỉ hình, không ra chiêu). Dòng thông tin đặt cạnh nhau thời lượng pose, khung trúng của pose và mốc trúng mà SERVER tính cho chiêu dùng pose đó.
- **Dừng hình ở** Dồn lực / Đỉnh đòn / +30 ms / Thu đòn: dừng lớp hình, diễn lại từ đầu rồi bước đúng số khung 1/60 s tới mốc (`labPoseSeek`); chạy tiếp bằng nhóm Thời gian. Kiểm: đồng hồ pose 0,400 s tại mốc 0,400 s.
- Chưa làm: xem chuyển tiếp đứng → chạy → dừng → né, hai bộ nhân vật cạnh nhau cùng một clip; đo trượt chân vẫn dùng `pnpm shots chrv3feet`.

`pnpm shots labui --only sound,anim` bấm nút thật 11 mục và in bảng lệch tiếng của mọi chiêu.

**Phòng đã chỉ ra (dữ liệu 104 timeline `skl_*`, 28/11):** 82 chiêu có tiếng khớp mốc trúng (không chiêu nào lệch quá 60 ms). **17 chiêu KHÔNG có sự kiện tiếng nào trong timeline**: `cu_bo_xung`, `hoi_nguyen_thuat`, `kiem_anh_bo`, `kiem_dan_ban_menh`, `kiem_vu_tam_diep`, `linh_khi_ho_the`, `loi_chich`, `loi_giap`, `loi_lien`, `loi_the`, `nghich_kiem_chuyen_phong`, `pha_phong_tien`, `phan_anh_kiem_anh`, `phi_kiem`, `thiem_loi_bo`, `thuan_di_tram`, `tran_kiem` (có thể vẫn có tiếng chung lúc ra chiêu từ đường khác; cần người nghe xác nhận). 5 chiêu không có mốc trúng (không khựng hình, không khung va chạm): `kim_thien_co`, `luu_huong_bo`, `ngu_kiem_tran`, `thai_hu_ho_tran`, `u_anh_bo` (đều là chiêu trận/bộ pháp, có thể cố ý). Sửa dữ liệu timeline là việc của tuyến VFX.

**Đã sửa (28/11, chỉ thêm sự kiện tiếng, không đổi lớp hình):** 15 trong 17 chiêu câm có `soundAt` bằng id tiếng sẵn có. Bộ pháp (`cu_bo_xung`, `kiem_anh_bo`, `pha_phong_tien`, `thiem_loi_bo`, `nghich_kiem_chuyen_phong`): một tiếng vút lúc lao. `kiem_vu_tam_diep`, `thuan_di_tram`: vút ở mốc gồng + tiếng trúng đúng mốc khựng (lệch 0 ms). `kiem_dan_ban_menh`, `phan_anh_kiem_anh`, `loi_the`: tiếng niệm ở mốc gồng. Năm chiêu mà loại fx đã có tiếng chung lúc ra chiêu (`playFxSound` ở `apps/client/src/game/engine/fxMsgs.ts`: heal, shield, rain, sword) — `hoi_nguyen_thuat`, `linh_khi_ho_the`, `loi_giap`, `loi_lien`, `loi_chich` — chỉ thêm tiếng báo trước ở mốc gồng để không chồng hai tiếng ở t = 0. Bảng sau khi sửa: 84 khớp, 18 có tiếng nhưng không có mốc trúng, 2 câm. **Cố ý để nguyên:** `phi_kiem`, `tran_kiem` (đòn thường: tiếng vung đặt lịch từ sự kiện `windup`, tiếng trúng do sát thương thật phát; thêm vào timeline sẽ kêu cả khi đánh trượt và chồng tiếng), và KHÔNG thêm mốc trúng cho năm chiêu trận/bộ pháp/thế thủ: `hitstop`/`impact` là khựng hình và khung va chạm thật, đặt vào chiêu không đánh trúng ai sẽ làm sai cảm giác; với các loại này 'không có mốc trúng' là đúng.

## Tab Diễn Võ: mười hai nhóm con (28/11)

Cảnh và nhân vật, Quái trong phòng, Hiệu ứng, Nền và màu, Phong cách, Giao diện, Nhịp và HUD, Âm thanh, Động tác, Cân bằng, Chỉnh phòng, Thời gian. `apps/client/src/ui/DebugPanel.tsx` là nơi DUY NHẤT gắn nhóm con; công cụ của tuyến khác viết thành component riêng rồi gắn vào đây:

- Âm thanh và Động tác có thêm `CastControls` / `ClipControls` của xưởng đo lúc chạy (`apps/client/src/ui/lab/WorkshopLab.tsx`).
- **Chỉnh phòng**: `RoomEditPanel` của trình chỉnh phòng V3 (`apps/client/src/ui/lab-editor/RoomEditPanel.tsx`), chỉ có ở bản dev và nạp lười (`lazy` + `import.meta.env.DEV`) để mã trình chỉnh không vào bundle bản build; phím F4 vẫn mở bản nổi của cùng component. Kịch bản kiểm riêng: `pnpm shots roomedit`.
- **Cân bằng** (`BalanceLab`): nút cho các lệnh của bàn cân bằng và sân boss (`/gm dps`, `/gm dummy`, `/gm boss`, `/gm phase`, `/gm hp`, `/gm cast`; chi tiết lệnh ở `docs/handbook/dien-vo-can-bang.md`). Mỗi nút gửi một lệnh; server bỏ lệnh chat cách nhau dưới khoảng một giây nên bấm thong thả.

`pnpm shots labui --only panel` soát MỌI nhóm con (đọc danh sách từ chính bảng nên nhóm mới tự được soát): mọi nút/ô nằm trong khung 720p, mở không sinh lỗi console; rồi bấm nút thật Đặt hình nộm, Gọi vào hố boss, tua máu 25% và đối chiếu quái trong phòng (16/16). Chạy lại sau mỗi lần có công cụ mới gắn vào tab.

## `pnpm shots labui`

`pnpm shots labui --out <thư mục> --query style=dahoa [--only tools,contrast,motion,windows,sound,anim,panel] [--win char,wardrobe] [--winwait 900]`

- `tools`: bấm nút thật các công cụ trên rồi đối chiếu trạng thái game (20 mục).
- `contrast`: **tương phản chữ HUD trên nền thật** (WCAG AA). Dồn HUD nặng nhất, lấy hộp + màu của từng dòng chữ, chụp lại với chữ trong suốt để có nền ngay dưới chữ, tính tỉ lệ tương phản theo từng điểm ảnh; dòng có phân vị 10% dưới 4,5 (chữ lớn: 3) bị báo, kèm ảnh đánh dấu `contrast-1-danh-dau.png` (đỏ: không có bóng chữ; cam: có bóng chữ nên thực tế dễ đọc hơn con số). Chữ tô bằng nền cắt theo chữ (tên boss) không đo được, đếm riêng.
- `windows`: dựng nhân vật đủ đồ (ba bộ `kit`, đủ chiêu, HUD nặng) rồi mở TỪNG cửa sổ (nhân vật, túi, công pháp, nhiệm vụ, bản đồ, tổ đội, tủ ngoại trang, cài đặt, trợ giúp) ở năm cỡ màn 1280×720 → 2560×1440; báo cửa sổ tràn khỏi khung nhìn, dòng chữ bị cắt (tràn ngang trong ô ẩn phần thừa) và lỗi console sinh ra khi mở từng cửa sổ; ảnh ở `win/<cửa sổ>-<rộng>x<cao>.png`.
- `motion`: bật "Giảm chuyển động", gọi mọi khoảnh khắc rồi đếm animation CSS trong HUD còn **dịch chuyển/phóng/xoay** (mờ dần và đổi màu không tính).

## Phòng đã chỉ ra (lượt đầu 27/11, Dạ Họa 720p)

- **Đã sửa:** khi bật Giảm chuyển động, thông báo nổi vẫn trượt xuống (`toast-in`) và hai dải letterbox của thẻ chương vẫn kéo dãn (`chapter-bar`) → thông báo hiện tại chỗ, letterbox mờ dần (`apps/client/src/styles.css`, `apps/client/src/styles2.css`). Đo lại: 6 animation dịch chuyển lúc thường, 0 khi bật giảm.
- **Đã sửa, tương phản (28/11):** số trên thanh máu/linh lực của mình, của tổ đội, khung mục tiêu, thanh boss và thanh niệm chú (chữ sáng nằm vắt qua phần đầy màu sáng và phần rỗng: 1,3–2,6) → viền mực 2 px vẽ dưới nét chữ (`.gauge-text` ở `apps/client/src/styles.css`, `.u2-bar__text` ở `apps/client/src/ui/u2/u2.css`, `.u2h-boss-text` ở `apps/client/src/ui/u2/hud/hud.css`). Phép đo tính chữ có viền ≥ 1,5 px so với màu viền. Lượt đầu 18/92 dòng dưới ngưỡng, nay 8/73. Nhãn phím trên ô chiêu (`.u2h-key`, 4,4) và dấu +/− của bản đồ nhỏ (`.mm2-bead`, 3,8–4,0) cũng đã sửa (28/11): nhãn phím có viền mực; dấu +/− dùng mực đậm nhất, nét dày (thử viền mực thì nét mảnh bị nuốt thành khối xám nên bỏ). **Còn lại:** ba dòng chat (1,0–1,5) là báo oan — dòng đã cuộn khỏi khung chat nên ảnh nền ở vị trí đó là thứ khác, phép đo chưa loại chữ bị khung cha cắt.
- **Đã sửa, bố cục:** chồng lời mời (`.pty-invites`, trước cố định cách mép trên 70 px) đè lên thanh boss và khung mục tiêu khi đang đánh boss → `InviteStack` (`apps/client/src/ui/Party.tsx`) đo đáy các khung giữa phía trên và hạ chồng xuống dưới (201 px khi có thanh boss + khung mục tiêu, đè 0 px²); thông báo nổi coi chồng lời mời là khung phải né.
- **Đã sửa, cửa sổ Tổ đội:** ở màn 720p tên thành viên bị ép còn hai chữ ("Th…") vì hai nút Giao quyền / Mời ra chiếm hết hàng → hàng cho xuống dòng, tên giữ tối thiểu 14 ký tự (`apps/client/src/ui/party.css`). Tên thử của phòng (`LAB_NAMES`) đổi về đúng 14 ký tự, mức tối đa server cho đặt; tên 27 ký tự trước đây không tồn tại trong game nên gây báo động giả.
- **Đã sửa, lỗi thật ở Dạ Họa / Họa Cảnh:** mở **Tủ ngoại trang** (và bảng Nhân vật khi đang mặc bộ v3) thì khung xem trước 3D TRỐNG, console báo WGSL `structures must have at least one member: struct OutputType` cho `fragment_tripo_material_…`, lặp mỗi khung. Nguyên nhân: ở các phong cách này vật liệu nhân vật v3 mang `mrtNode` ghi mặt nạ vào đích phụ `aux` (`markVfxMask`); khung xem trước vẽ vào đích một màu, không có MRT của renderer, nên `mrtNode` thay luôn đầu ra màu và shader không còn đầu ra nào. Sửa ở `apps/client/src/game/camera/charPreview.ts`: khi cờ `painted` bật, đích xem trước có hai màu (`output`, `aux`) và renderer được đặt MRT cùng bố cục trong lúc vẽ. Phong cách mặc định không đổi đường vẽ. Kiểm: `pnpm shots labui --query style=dahoa --only windows` 0 lỗi console (trước 246), ảnh `win/wardrobe-*.png` có nhân vật (`--win wardrobe --winwait 3500` để chờ dựng xong).
- **Đã sửa (28/11):** ở bố cục thanh ngang, chip nhắc "Chọn nhánh mốc… (phím K)" và chip phân thân bị ép thành cột chữ hẹp (mỗi từ một dòng, ~60 px) vì vùng chip nằm cạnh hàng ô tiện ích chỉ còn phần thừa của 640 px → vùng chip rộng 0 trong bố cục, mỗi chip một dòng tràn sang phải (`apps/client/src/ui/u2/hud/hud.css`); `labui` kiểm chip cao không quá hai dòng.
- **Chưa sửa, nhỏ:** dòng "Nội tại" của bảng Công pháp bị cắt bằng dấu ba chấm ở 1280×720 và 1366×768 (`.mp-passive`, do bố cục gọn cho màn thấp; ở cỡ này bảng chỉ còn chỗ cho ô chọn công pháp).
- **Thông báo nổi đè lên cửa sổ đang mở: GIỮ NGUYÊN có chủ ý (28/11).** Đã xét ba cách: (1) hạ thông báo xuống dưới cửa sổ → mất phản hồi của chính thao tác trong cửa sổ ("không đủ linh thạch", "túi đầy"); (2) dời lên sát mép trên → chỗ đó là khung mục tiêu và thanh boss, bộ né của thông báo lại đẩy nó xuống; (3) dời xuống trên thanh chiêu → cửa sổ cao tới ~490/720 px, chỉ còn ~30 px. Thông báo tự tan sau 3,2 giây nên chấp nhận che tạm.
- **Phép đo tương phản đã chặt hơn (28/11):** bỏ chữ đang mờ dần (độ đục < 0,9) vì màu đo được là màu giữa chừng; lượt đầu có vài dòng chat đang tan bị báo oan.

## Bộ ảnh gốc (chụp lại 27/11 tối)

- Bộ gốc mới của `pnpm shots dienvo`: `D:/claude-tmp/dvt-golden3` (ngoài repo; Dạ Họa 720p, WebGPU preset Cao, 23 cảnh mẫu), thay bộ `dvt-golden` (9 cảnh, chụp trước khi có máy quay cận, 8 cảnh cận và các bản sửa viền/đạo cụ). Dùng làm `--base` cho các lượt sau.
- So với bộ cũ (SSIM / ΔE00): sáu cảnh sàn đấu 0,961–0,972 / 0,44–0,63 (trong sàn nhiễu của phòng); `dao_cu` 0,944 / 1,41 và `anh_sang` 0,941 / 1,33 (đạo cụ được nâng sáng và thêm ánh viền); `nhan_vat_can` 0,774 / 9,15 vì nay chụp bằng máy quay cận (thay đổi cố ý). Tám cảnh `can_*` và sáu cảnh đang đánh chưa có trong bộ cũ nên không so.
- Số đo mỗi cảnh: 29–57 draw call, 215–306 nghìn tam giác (ngân sách 300 / 2 triệu).
- Che thân ở cảnh đang đánh (lớn nhất qua bốn mốc): `kiem_chem_quet` 60%, `kiem_chieu_2` 34%, `kiem_ap_sat` 12%, ba cảnh còn lại dưới 10%. Đòn chém quét đang trên ngưỡng 45% (lượt đo 27/11 trưa là 47%): việc của tuyến VFX.

## Kiểm máy yếu với bộ gốc mới (27/11 tối)

`pnpm shots dienvo --quality low|medium --renderer webgl2 --base D:/claude-tmp/dvt-golden3 --only soi_thuong,tinh_anh,bay_dong,boss,nhan_vat_can,dao_cu,anh_sang` (Dạ Họa 720p):

| Cảnh | WebGL2 + Vừa | WebGL2 + Thấp |
| --- | --- | --- |
| sáu cảnh sàn, đạo cụ, ánh sáng | 0,963–0,972 | 0,941–0,969 |
| `nhan_vat_can` (máy quay cận) | 0,871 | 0,892 |

**Lưu ý khi so cảnh cận (28/11):** vòng ấn lớn dưới chân ở các cảnh `can_*` là hiệu ứng của LẦN DỰNG NHÂN VẬT ĐẦU TIÊN trong phiên chụp, nên có hay không tùy thứ tự cảnh trong `--only` (chụp riêng một cảnh thì có; cảnh cận đứng sau một cảnh cận khác thì không). So cảnh cận phải dùng CÙNG danh sách `--only` với bộ gốc; chênh 0,83–0,90 giữa hai danh sách khác nhau không phải thụt lùi (đã thử A/B ba lượt khi gỡ cờ V4).

Sáu cảnh nằm trong sàn nhiễu của phòng: Dạ Họa không vỡ trên đường lùi WebGL2 ở cả hai preset. Cảnh cận lệch vì hào quang cảnh giới (mây lam quanh nhân vật) chuyển động giữa hai lượt chụp, soi ảnh không thấy lớp nào mất; muốn so cảnh cận cho chặt thì phải dừng lớp hình trước khi chụp (chưa làm).

## V3: nạp lại dữ liệu tức thì và chế độ chỉnh phòng (28/11)

Chỉ có ở máy phát triển. Bản build của client không chứa mã này (nạp động sau `import.meta.env.DEV` ở `apps/client/src/main.tsx`); server chỉ bật khi đăng nhập thử đang bật (`config.devBypass`, tự tắt ở production hoặc khi có `GOOGLE_CLIENT_ID`).

### Nạp lại dữ liệu tức thì

Sửa rồi lưu một file "nóng" thì phòng nhận ngay, **không tải lại trang, không khởi động lại server, không rời phòng**:

| File | Client | Server dev |
| --- | --- | --- |
| `packages/content/data/fx/*.json` (timeline đã khai báo) | vá tại chỗ; đang ở phòng tập thì tự phát lại hiệu ứng vừa sửa | vá (server không dùng) |
| `packages/content/data/poses/*.json` có `hit` (pose CHIÊU) | vá tại chỗ, quên clip đã nướng (`forgetPoseBake`, `forgetMannequinPose`); đòn kế dùng bản mới | vá (server không dùng) |
| `packages/content/data/lab/scenes.json` | danh sách cảnh của tab Diễn Võ đổi ngay | `/gm scene` dùng bản mới |
| `packages/content/data/i18n/vi.json`, `vi.ui.json` | chuỗi đổi ở lần vẽ kế của giao diện | chuỗi tin hệ thống đổi |
| `packages/shared/src/props.dienvo.layout.json` (bố cục phòng) | dựng lại đạo cụ, quầng đèn, đèn điểm | điểm gọi quái đổi |

- Đường đi: plugin Vite `apps/client/dtlHotData.ts` chặn việc tải lại trang cho các file trên và gửi nội dung mới qua sự kiện HMR `dtl:data`; `apps/client/src/game/editor/hotData.ts` nhận và gọi `applyHotData` (`packages/content/src/hot.ts`, đường import `@dtl/content/hot`). Server: `apps/server/src/devReload.ts` theo dõi cùng các file bằng `fs.watch` và gọi cùng hàm.
- Cách vá: giữ nguyên danh tính đối tượng/mảng đã xuất (`FX_TIMELINE.get(id)`, `LAB_SCENES`, `DIEN_VO_PROPS`) và thay nội dung bên trong. JSON hỏng (đang ghi dở) hoặc sai luật thì giữ bản cũ và báo trong nhật ký của bảng Chỉnh phòng.
- **Chưa nóng** (vẫn như trước): pose NỀN (không có `hit`: đứng, bay, niệm chú… đã nối vào bảng clip lúc dựng nhân vật nên trang tự tải lại), timeline/chuỗi có **id mới** (phải khai báo import rồi tải lại), và mọi dữ liệu luật chơi hay phần thưởng (`skills.json`, `monsters.json`, `items.json`, `loot.json`, level…): client tải lại trang, server phải khởi động lại tay. Cố ý: không có đường nào đổi luật chơi của server đang chạy.
- `tsx watch` của server khởi động lại mỗi khi một file JSON nó nạp đổi, nên trước V3 sửa một timeline fx là rớt khỏi phòng ("Mất kết nối"). Script `dev` của `apps/server/package.json` nay loại các file nóng khỏi việc theo dõi (`--exclude`); `devReload` vá chúng tại chỗ. File dữ liệu khác vẫn làm server khởi động lại như cũ.

Kiểm: `pnpm --filter @dtl/perf exec tsx src/roomedit.ts --out <thư mục> --query style=dahoa` (`tools/perf/src/scenarios/roomedit.ts`, 19 mục bằng chuột và nút thật: sửa fx và pose chiêu không tải lại trang, JSON hỏng giữ bản cũ, kéo thả có bản xem trước thật, lăn chuột xoay, thêm, hoàn tác, lưu, server đặt quái đúng điểm gọi, sửa tay file bố cục). Kịch bản sửa rồi trả lại `fx_blink.json`, `poses/kiem_khi_tram.json` và file bố cục.

### Chế độ chỉnh phòng

Vào phòng (`/gm dvt`), bấm **F4** mở bảng "Chỉnh phòng" → "Bật chỉnh phòng". Mỗi đạo cụ có một vòng tròn trên sàn (lam: đạo cụ, vàng: đèn đá, vạch chỉ mặt trước); điểm gọi quái là vòng nhỏ có số (lục: sàn đấu, tím: hố boss).

- **Kéo** vòng tròn để dời (bám lưới 0,25 m, giữ Alt để bỏ bám). **Lăn chuột**: xoay 15°; **Shift + lăn**: phóng 5%; **Delete**: xóa; **Ctrl+Z**: hoàn tác (50 bước); **Esc**: bỏ chọn. Bảng có nút tương ứng, cùng nút bật tắt va chạm. Trong lúc kéo, món đồ THẬT chạy theo chuột (dựng ở một lớp riêng chỉ chứa món đó), không chỉ vòng tay nắm.
- **Thêm**: đạo cụ (chọn id trong danh sách), đèn đá, điểm gọi quái của sàn đấu / hố boss; món mới hiện cách nhân vật 2,5 m về phía trên màn hình.
- **Đèn** của phòng chính là đạo cụ `prop_den_da`: dời đèn thì quầng sáng và đèn điểm đi theo.
- **Điểm gọi quái**: quái thứ n của `/gm spawn` hay của cảnh mẫu đứng ở điểm thứ n của khu (`dienVoSpawnAt`); hết điểm thì xếp vòng quanh tâm khu như cũ. Không đặt điểm nào thì phòng y như trước V3.
- **Lưu vào file** ghi `packages/shared/src/props.dienvo.layout.json` (mỗi đạo cụ một dòng) qua cổng `POST /__lab/layout` của Vite dev; server tự nạp lại. Muốn giữ thì commit file đó. **Bỏ thay đổi** đọc lại file.
- Trước khi lưu, mọi thay đổi chỉ là hình ở máy mình; server không nhận gì từ trình chỉnh. Điểm gọi quái vì thế chỉ có hiệu lực sau khi Lưu.
- Luật của bố cục nằm ở `checkDienVoLayout` (`packages/shared/src/props.dienvo.ts`): đạo cụ trong sàn 48 × 48 m, tỉ lệ 0,05–5, điểm gọi quái trong khu của nó và cách mép ≥ 1 m. Cổng ghi file và server đều kiểm bằng hàm này.

Mã: `apps/client/src/game/editor/` (`roomLayout.ts` phép sửa thuần có test, `roomEdit.ts` tay nắm + chuột + lưu, `boot.ts` điểm vào), bảng `apps/client/src/ui/lab-editor/RoomEditPanel.tsx` (dùng lớp CSS của bảng F3 nên nhúng thẳng được vào tab Diễn Võ). Cổng cho console / Playwright: `__labEdit.editor()` (`enable`, `select`, `moveSel`, `addProp`, `addSpawn`, `save`, `revert`, `layout`), `__labEdit.hot()`.

### Hàng rào

- Cổng ghi file chỉ tồn tại trong `vite dev`, chỉ nhận từ loopback, cần header `x-dtl-lab` + `content-type: application/json`, chỉ ghi đúng một file sau khi qua `checkDienVoLayout`, thân tối đa 64 KB.
- Server không có tin nhắn hay lệnh GM nào kích nạp lại; nguồn duy nhất là file trên đĩa của máy chạy server, và danh sách file nóng (`hotKind`) không gồm dữ liệu luật chơi hay phần thưởng (có test).
- `setDienVoLayout` từ chối bố cục sai và giữ bản đang dùng.

## Xưởng âm thanh + xưởng animation, phần ĐO lúc chạy (V2d, đợt hai 28/11)

Bổ sung cho hai nhóm con "Âm thanh" và "Động tác" ở trên (phát từng tiếng, bảng lệch từ dữ liệu, diễn pose). Phần này đo trên game đang chạy. Mã: `apps/client/src/game/debug/sfxCast.ts`, `apps/client/src/game/debug/animWorkshop.ts`, `apps/client/src/game/debug/footSlide.ts`, `apps/client/src/game/debug/blendLog.ts`, nút + lớp phủ số đo ở `apps/client/src/ui/lab/WorkshopLab.tsx`, kịch bản `pnpm shots xuong` (`tools/perf/src/scenarios/xuong.ts`).

### Lệch tiếng so với khung trúng, theo từng chiêu

- Nút **Lệch theo chiêu**: engine đánh mốc cho chiêu của MÌNH (vào thế, khung trúng của hoạt ảnh, sát thương server về; `castMark` gọi từ `apps/client/src/game/engine/fxMsgs.ts`, không làm gì khi nút tắt) và ghép với nhật ký lời gọi phát tiếng (`sfxProbe`). Lớp phủ cạnh bảng F3 hiện mỗi chiêu một dòng (đòn thường tách từng đòn của chuỗi):
  - *Khung trúng − dữ liệu*: hoạt ảnh ra đòn sớm/muộn bao nhiêu so với `hitAt` của chiêu.
  - *Sát thương về*: tin sát thương của server tới so với khung trúng. Âm = về trước, được giữ chờ khung trúng nên tiếng rơi đúng khung; dương = về muộn, tiếng trúng, khựng hình và số sát thương cùng muộn chừng đó.
  - *Tiếng vung*, *Tiếng trúng* (trung vị) và *Xấu nhất*; quá ±60 ms (`CAST_TOL_MS`) thì tô vàng.
- Nhật ký tiếng ghi cả khi `?mute=1` (kèm độ trễ đặt lịch của tiếng vung và luật giãn 45 ms), nên số đo khi tắt tiếng giống hệt khi bật. Mọi mốc là `performance.now()`: đo ở tốc độ lớp hình 100%.
- Dòng đầu ghi **độ trễ ra loa của máy** (`audioLatencyMs`): tiếng tới tai muộn hơn mọi số trong bảng chừng đó (tai nghe Bluetooth có thể trên 150 ms); game không bù được phần này.

### Đồng hồ từng bus

- `busMeter(true)` / `busMeterRead()` (`apps/client/src/game/audio/audio.ts`): đỉnh, trung bình, đỉnh giữ và số lần chạm trần 0 dBFS của bốn bus và của `sum` (tổng bốn bus, tức thứ ra loa khi âm lượng tổng 100%). Đo SAU mức bus, TRƯỚC âm lượng tổng, nên **đo được cả khi tắt tiếng**: lúc đồng hồ bật, SFX vẫn chạy qua bus, âm lượng tổng vẫn bằng 0 nên loa im.
- `labBusMix(bus, mức | null)`: đổi mức trộn một bus TRONG PHIÊN để thử cân âm; mặc định vẫn là `apps/client/src/game/audio/audioMix.json`, muốn đổi thật thì sửa file đó rồi `pnpm audio:levels`.

### Xưởng animation

- Nhóm nút **Soi** (Mình / Mục tiêu): làm việc qua cổng `labAnim()` của model (`MannequinCharacter`, `SkinnedCharacter` và lớp con, tức nhân vật v3, quái, boss có xương).
- **Ép clip** + thanh kéo + ◀ ▶ (mỗi bấm 1/30 giây) + **Phát lặp** + **Thả**: ép model đứng ở một mốc của BẤT KỲ clip nào nó có (68 clip với nhân vật v3; quái có idle, run, attack, hit, death…). Xưởng dùng action riêng trên bản sao clip và tạm tắt action của game ngay trước `mixer.update`, nên thả ra là game điều khiển lại, không phải dựng lại gì. Lớp phụ sau mixer (thở, chân bám đất, nhìn mục tiêu) vẫn chạy: đó là thứ người chơi thấy.
- **Đo chân và chuyển clip** (lớp phủ):
  - *Trượt chân* theo clip nền đang trội: chân đang trụ (xương mũi bàn chân `ball_l`/`ball_r`, cao không quá 3 cm so với đáy của 1,2 giây gần nhất và lên xuống dưới 1 m/s) mà vẫn dịch ngang thì là trượt. Báo cm trượt trên mỗi mét đi (tô vàng khi trên 12), cm/s lúc trụ, đỉnh. Dịch chuyển tức thời (trên 8 m/s) không tính. Quái bốn chân của bộ Tripo đặt tên xương `leg_fl_2`… nên chưa đo được chân (báo "không tìm thấy xương bàn chân").
  - *Chuyển clip*: mỗi lần clip TRỘI đổi (clip cũ tắt hẳn hoặc clip mới chiếm gần hết; các clip đi/chạy đổi trọng số qua lại theo tốc độ thì không tính) ghi thời gian clip mới lên, bước nhảy trọng số lớn nhất trong một khung (từ 0,5 = đổi cứng), tốc độ xoay khớp lớn nhất lúc đó (từ 900°/s tô vàng) và TÊN xương xoay nhanh nhất.
- Lưu ý khi đọc: clip đi/chạy của nhân vật v3 chạy với `timeScale = 0` (pha do model đồng bộ tay) nên KHÔNG dùng `action.isRunning()` để biết clip nào đang góp tư thế; xưởng dùng trọng số hiệu dụng.

### `pnpm shots xuong`

`pnpm shots xuong --out <thư mục> --query style=dahoa [--only cast,anim,loud] [--paths kiem_tu,the_tu] [--ping 150] [--bots 8]`

- `cast`: từng lối tu, dựng nhân vật thử, ra từng ô chiêu lên một con sói khóa máu, in bảng lệch và ghi `xuong.json`.
- `anim`: chạy tới / lùi / ngang / dừng / né bằng phím thật rồi in trượt chân và chuyển clip; ép clip cho mình và cho quái, chụp ảnh, thả, kiểm game điều khiển lại.
- `stopfade`: thử A/B thời gian mờ vào của clip dừng (`PATCH_TUNE.stopFade` ở `apps/client/src/game/character/mannequin.ts`, chỉ đổi trong phiên).
- `ui`: gắn hai nhóm nút vào trang rồi bấm nút thật (6 mục).
- `loud`: mình đánh bầy sói, rồi thêm ĐÁM ĐÔNG TỔNG HỢP (tiếng đòn của 8 người đứng cách 3 đến 9 m, bắn qua đúng hàm `sfx` của game); in đỉnh giữ từng bus, mật độ lời gọi, và kiểm bộ chặn đỉnh bằng `OfflineAudioContext`. Bot thật (`--fight`) vào phòng nhưng client chưa thấy chúng (chưa rõ vì sao), nên số "8 người" hiện là tổng hợp.

### Phòng đã chỉ ra (28/11, Dạ Họa 720p, máy dev)

- **Đã sửa, vỡ tiếng:** chỉ MỘT người ra chiêu, bus SFX đã chạm +0,3 đến +0,8 dBFS (tiếng vung + tiếng trúng + lớp chồng rơi cùng lúc; 2 đến 3 cửa sổ đo chạm trần trong 12 giây), tức loa bị xén cứng ở âm lượng tổng 100%. Thêm **bộ chặn đỉnh mềm** sau âm lượng tổng (`softLimiter` ở `apps/client/src/game/audio/audio.ts`, đường cong ở `apps/client/src/game/audio/limiter.ts`): WaveShaper tĩnh, dưới −3 dBFS giữ nguyên từng mẫu, trên đó bo dần, không bao giờ vượt 0 dBFS; không trễ, không tự nâng âm lượng như máy nén. Kiểm trên WebAudio thật: sin 0,5 → 0,5; sin 1,5 → 0,997; sin 6 → 1,0. Đám đông tổng hợp 8 người + mình: đỉnh −0,5 dBFS, 47/490 tiếng bị luật giãn 45 ms bỏ; tức đỉnh là do chiêu của chính mình, không phải do đông người.
- **Đã sửa, tiếng trúng đi sau nhát chém khi có ping:** động tác chiêu của mình bắt đầu ngay khi bấm (dự đoán), còn sát thương về sau đúng một vòng mạng; tiếng trúng, khựng hình, rung và số sát thương đều chờ sát thương. Đo: ping 0 thì chiêu thường muộn 5 đến 60 ms (trong dung sai); **ping giả 150 ms thì muộn 141 đến 222 ms** (9/26 dòng quá dung sai). Đòn nối chuỗi của đòn thường không bị, vì lệnh đã được gửi sớm theo ping (`attackLeadMs`). Sửa: nhịp vào thế của đòn dự đoán diễn chậm lại vừa đủ để khung trúng rơi đúng lúc sát thương về (`windupWarp` ở `apps/client/src/game/character/mannequin.ts`, độ bù `netLagOf` ở `apps/client/src/game/combat/skillPose.ts` = ping engine ước − 30 ms, trần 150 ms; chỉ chiêu thường và đòn mở đầu chuỗi). Sau sửa ở ping giả 150: −10 đến +81 ms (2/26 dòng, sát ngưỡng); ping 0: bù 28 ms, 0 dòng hỏng. Động tác vẫn bắt đầu ngay khi bấm; server không đổi gì.
- **Chưa sửa, cần nhìn bằng mắt:** lúc DỪNG chạy, clip dừng (`PM_Sprint_To_Idle`, `PM_Run_To_Idle`) lên trong ~58 ms và đùi xoay tới 1700 đến 2700°/s (lúc chạy thường 500 đến 900). Thử mờ vào 0,06 / 0,10 / 0,14 / 0,18 giây: trung vị 1878 / 1889 / 998 / 1095°/s. Mức 0,14 giảm gần một nửa, nhưng clip nền bị hạ về 0 trong ~0,08 giây nên với mờ vào dài hơn tổng trọng số tụt dưới 1 và three trộn thêm tư thế gốc; chưa đổi mặc định (`PATCH_TUNE.stopFade` vẫn 0,06). Muốn sửa đúng thì cho clip nền tắt theo đúng nhịp clip dừng lên (trong `blendBases`).
- **Đủ 9 lối tu ở ping 0 (sau các sửa trên):** 124 chiêu/đòn đã ra, 70 có tiếng trúng; trung vị của lệch xấu nhất 0 ms. Đòn thường thứ hai của vài lối có lần lẻ lệch 65 đến 107 ms (trung vị vẫn 0 đến 46). Chín chiêu của Hồn tu, Cổ tu, Cấm chế sư hiện "sát thương về" muộn 130 đến 1555 ms: đó là triệu hồi, trận, hút máu, độc (sát thương tới sau theo thiết kế), bảng xếp vào loại *sát thương tới sau* khi quá 300 ms (`CAST_DELAYED_MS`), không tính là lệch. **Giới hạn:** tin sát thương không mang id chiêu, nên khi đang có nguồn sát thương kéo dài (thú triệu hồi, trận, độc) thì cột "sát thương về" của chiêu ra sau bị lẫn; ba dòng 130 đến 237 ms (`skl_lac_thu_dai_tran`, `skl_co_bao`, `skl_pha_diet_cam`) rơi vào trường hợp này, muốn chắc thì đo từng chiêu sau `/gm labreset`.
- **Đỉnh bus SFX theo lối tu (một người, trước bộ chặn đỉnh):** Thể tu +1,2 dBFS, Cổ tu +1,0, Lôi tu +0,8, Kiếm tu +0,6; năm lối còn lại −0,4 đến −1,6. Tức bốn lối đang vượt 0 dBFS khi đánh một mình.
- **Trượt chân của nhân vật v3 trong ngưỡng:** chạy nhanh 2,8 cm/m, chạy 5,3 cm/m, nhịp dừng 5,5 cm/m (ngưỡng báo 12). Chân trụ mỗi bước chỉ ~90 ms ở tốc độ chạy nhanh.
- **Bài học đo:** `action.isRunning()` trả false cho clip đi/chạy (xem trên); ở 120 khung/giây ngưỡng vận tốc dọc 0,35 m/s nhỏ hơn nhiễu; hàm mặt đất `walkableGround` thấp hơn sàn phòng tập 20 cm nên độ cao bàn chân tính theo mặt sàn nhân vật đang đứng.

### Lượt quét 28/11 rạng sáng (9 lối tu ở ping 0 và ping giả 150 ms, 12 quái/boss)

`pnpm shots xuong --only cast --ping 150`, `--only mons`, `--only bossfade` (Dạ Họa 720p).

- **Tiếng so với khung trúng, ping giả 150 ms, đủ 9 lối tu (sau bù trễ mạng):** 40 chiêu thường có sát thương trực tiếp lệch trung vị +12 ms; 81 đòn thường trung vị 0 ms, không đòn nào quá 60 ms.
- **ĐÍNH CHÍNH (28/11 sáng), ba chiêu từng báo "sát thương về muộn" là quy nhầm:** `skl_co_bao`, `skl_lac_thu_dai_tran`, `skl_pha_diet_cam` từng hiện muộn 130 đến 281 ms ở cả hai mức ping. Đo lại với `/gm dps` (tin sát thương khi đó mang id chiêu `sk`, '(dot)' cho sát thương theo thời gian): trong cửa sổ đo không có sát thương nào của chính ba chiêu này; số cũ là sát thương của cổ độc/trận bị gán nhầm. Bên server đo riêng cũng ra đúng `hitAt` (Cổ Bạo +450 ms, Phá Diệt Cấm +200 ms; Lạc Thư Đại Trận là trận, nhịp sát thương đầu +2100 ms). Không có gì phải sửa. `pnpm shots xuong --only cast` nay tự bật `/gm dps` nên bảng chỉ nhận sát thương của ĐÚNG chiêu; thêm `--skills id1,id2` để đo riêng vài chiêu.
- **Đã sửa, boss vào đòn lớn bị giật:** đòn `slam` / `sweep` mờ vào trong 0,07 giây, mà boss ở tầm camera chỉ cập nhật xương 30 Hz nên chỉ còn hai bước (bước nhảy trọng số 0,24); bắp tay xoay tới 5951°/s khi đang niệm chuyển sang đập (`boss_thu_mo_tuong`). Đo ba mức trên 4 boss, 9 lần vào đòn mỗi mức: 0,07 s → trung vị 1399°/s, lớn nhất 5951; **0,14 s → 1257 / 2514**; 0,20 s → 958 / 2155. Đặt `SKIN_TUNE.moveFade` = 0,14 (`apps/client/src/game/character/skinned.ts`). Quái dùng `crossFadeFrom` nên tổng trọng số luôn bằng 1 (không lẫn tư thế gốc như nhân vật v3), và thời điểm đòn chạm không đổi.
- **Đã sửa, mức ra loa quá sát trần:** một người ra chiêu, đỉnh bus SFX của 9 lối tu nằm từ −1,6 đến +1,2 dBFS, tức gần như đòn nào cũng lọt vào vùng bộ chặn đỉnh phải bo (trên −3 dBFS). Thêm khoảng trống 3 dB trước bộ chặn đỉnh (`HEADROOM` ở `apps/client/src/game/audio/limiter.ts`, áp cho cả bốn bus nên cân bằng giữa nhạc, môi trường, SFX, giao diện giữ nguyên): đỉnh còn −4,6 đến −1,8 dBFS. Game nhỏ đi 3 dB ở cùng mức thanh trượt; chưa ai NGHE thử, muốn về như cũ thì đặt `HEADROOM` = 1.
- **Phép đo đã chỉnh:** tốc độ xoay khớp chia theo khoảng thời gian thật giữa hai lần xương đổi (trước đây chia theo một khung vẽ, thổi phồng 2 đến 4 lần với model cập nhật xương thưa). Bàn chân của quái dựng thủ tục nhận theo chuỗi `leg_<chân>_<số>`.
- **Chưa kết luận được, trượt chân của quái:** bộ đo nhận chân trụ theo độ nhấc (3 cm), mà clip chạy của quái bốn chân nhấc chân thấp hơn thế nên chân nào cũng bị coi là trụ và số trượt ra bằng tốc độ thân (27 đến 55 cm/m lúc chạy). Cần đổi sang nhận chân trụ theo vận tốc so với thân rồi mới biết clip nào trượt thật. Rết và giao long không có chân.
- **Chưa sửa, nhân vật v3 dừng chạy:** vẫn như ghi ở trên (đang chờ đợt gỡ cờ ở `mannequin.ts` xong).

## Ngân sách hiệu năng của phòng (Dạ Họa, đo 28/11)

`pnpm --filter @dtl/perf exec tsx src/roomperf.ts --out <thư mục> --query style=dahoa [--seconds 3] [--bots 8] [--only id1,crowd] [--quality high]` (`tools/perf/src/scenarios/roomperf.ts`): nạp từng cảnh mẫu của `lab/scenes.json` (cảnh có `act` thì đo TRONG LÚC đánh) và một cảnh đông (client + 8 bot chung phòng: lúc đứng, rồi lúc mình đánh bầy 8 sói không chết), mỗi cảnh ghi 3 giây (cảnh đông đang đánh 5 giây). CPU = thời gian `Game.frame()`; GPU = timestamp query (`?gputime=1`); texture = ước tính từ kích thước, định dạng, mip, gồm cả render target (cùng cách với `pnpm bench:client`). Kết quả ra `roomperf.md` + `roomperf.json`.

Điều kiện đo: Chrome headless 1280×720, dpr 1, WebGPU, preset Cao, Vite dev, một lượt, máy đang có worker khác chạy (CPU/GPU chỉ để so tương đối; draw call, tam giác, texture thì lặp lại được). Ngân sách: dưới 300 draw call, tối đa 2 triệu tam giác, 512 MB texture, CPU dưới 8 ms.

| Cảnh | Loại | Draw call (lớn nhất) | Tam giác | CPU ms (tb / p95) | GPU ms | Texture MB | fps | Ngân sách |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `soi_thuong` | tĩnh | 40 | 266 nghìn | 1.76 / 2.20 | 1.42 | 278 | 120 | đạt |
| `soi_vo_the` | tĩnh | 40 | 268 nghìn | 1.73 / 2.30 | 1.44 | 278 | 120 | đạt |
| `soi_yeu_diem` | tĩnh | 46 | 270 nghìn | 1.76 / 2.30 | 1.46 | 288.7 | 120 | đạt |
| `tinh_anh` | tĩnh | 40 | 273 nghìn | 1.74 / 2.20 | 1.48 | 293.5 | 120 | đạt |
| `bay_dong` | tĩnh | 59 | 354 nghìn | 1.90 / 2.50 | 1.5 | 293.5 | 120 | đạt |
| `boss` | tĩnh | 49 | 290 nghìn | 1.76 / 2.20 | 1.49 | 322 | 120 | đạt |
| `nhan_vat_can` | tĩnh | 33 | 219 nghìn | 1.55 / 2.00 | 1.83 | 322 | 120 | đạt |
| `can_bat_dong_kim_than` | tĩnh | 34 | 217 nghìn | 1.53 / 1.90 | 1.79 | 322 | 120 | đạt |
| `can_thanh_moc_dan_kinh` | tĩnh | 33 | 217 nghìn | 1.45 / 1.90 | 1.45 | 322 | 120 | đạt |
| `can_dan_hon_kinh` | tĩnh | 33 | 218 nghìn | 1.50 / 2.00 | 1.52 | 322 | 120 | đạt |
| `can_liet_nhan_dao_kinh` | tĩnh | 28 | 215 nghìn | 1.75 / 2.30 | 1.59 | 322 | 120 | đạt |
| `can_co_than_quyet` | tĩnh | 29 | 214 nghìn | 1.79 / 2.20 | 0.87 | 322 | 120 | đạt |
| `can_duong_co_kinh` | tĩnh | 29 | 218 nghìn | 1.49 / 1.90 | 1.84 | 322 | 120 | đạt |
| `can_cuu_tieu_loi_kinh` | tĩnh | 29 | 218 nghìn | 1.43 / 1.90 | 1.67 | 322 | 120 | đạt |
| `can_cam_che_kinh` | tĩnh | 29 | 216 nghìn | 1.50 / 1.90 | 1.79 | 322 | 120 | đạt |
| `dao_cu` | tĩnh | 51 | 285 nghìn | 1.74 / 2.20 | 1.37 | 327.5 | 120 | đạt |
| `anh_sang` | tĩnh | 39 | 268 nghìn | 1.60 / 2.10 | 1.27 | 334.2 | 120 | đạt |
| `kiem_chem_quet` | đang đánh | 66 | 297 nghìn | 2.29 / 3.10 | 1.02 | 334.2 | 112 | đạt |
| `kiem_ap_sat` | đang đánh | 66 | 377 nghìn | 2.02 / 2.60 | 1.43 | 334.2 | 113 | đạt |
| `kiem_chieu_1` | đang đánh | 54 | 283 nghìn | 1.96 / 2.60 | 1.08 | 334.2 | 119 | đạt |
| `kiem_chieu_2` | đang đánh | 47 | 281 nghìn | 1.88 / 2.40 | 0.57 | 334.2 | 119 | đạt |
| `kiem_chieu_3` | đang đánh | 60 | 294 nghìn | 2.03 / 2.50 | 1.12 | 334.2 | 120 | đạt |
| `kiem_chieu_4` | đang đánh | 48 | 281 nghìn | 1.90 / 2.40 | 1.29 | 334.2 | 120 | đạt |
| `crowd_8_dung` | đông | 49 | 560 nghìn | 1.93 / 2.50 | 1.47 | 310.4 | 120 | đạt |
| `crowd_8_danh` | đông | 101 | 752 nghìn | 3.12 / 4.30 | 1.03 | 322.7 | 118 | đạt |

- **Cả 25 cảnh đạt.** Nặng nhất là cảnh đông đang đánh: 101 draw call (34% ngân sách), 752 nghìn tam giác (38%), CPU 3,1 ms trung bình / 4,3 ms p95 (39% / 54%).
- **Texture là chỉ số sát nhất: 278 → 334 MB (54–65% của 512 MB)**, và chỉ tăng dần theo số cảnh đã nạp trong một phiên (quái, boss, bộ nhân vật của 9 lối tu nạp vào rồi ở lại). Lớn nhất: một mảng texture 1024² nhiều lớp 42,7 MB, các texture 2048² đủ mip 21,3 MB mỗi cái (trong đó có normal của bộ áo v3), bóng đổ 2048² 16 MB. Chưa vượt nên chưa sửa; nếu phòng thêm nhiều bộ nhân vật/boss trong một phiên thì đây là chỗ chạm trần trước.
- Cảnh cận nhân vật có GPU cao nhất (1,5–1,8 ms) dù ít draw call nhất: nhân vật chiếm nhiều điểm ảnh.
- Chưa đo: preset Vừa/Thấp, WebGL2, 1080p, và máy mục tiêu (GPU tích hợp). Số trên là của máy dev có GPU rời.

### Trượt chân của quái, đo theo vận tốc (28/11 sáng)

- **Phép đo mới** (`StrideSlip` ở `apps/client/src/game/debug/footSlide.ts`, cột `stride` của `snapshot()`): lúc bàn chân trụ là lúc nó đi chậm nhất theo hướng thân đang đi; lấy phân vị 15% của (vận tốc bàn chân dọc hướng đi ÷ tốc độ thân) theo từng clip. 0 = chân trụ đứng yên; dương = chân trôi tới (clip phát chậm); âm = bị kéo lùi (clip phát nhanh); quá ±25% thì báo. Chỉ lấy mẫu ở khung xương vừa đổi (quái ở tầm camera chạy mixer 30 Hz). Không cần biết chân nhấc cao bao nhiêu nên dùng được cho quái bốn chân. `pnpm shots xuong --only mons [--mons id1,id2]` in số này kèm hệ số nên nhân vào `refSpeed`.
- **Đã sửa, `refSpeed` đặt lệch** (`apps/client/src/game/character/monsterSkins.ts`; clip chạy, trước → sau): Hỏa Vân Hồ 2,0 → 2,85 (−43% → −9%; clip đi −186% → +10%), Kiếm Linh cùng model 2,0 → 2,85 (sau: −7%), Huyết Nha Lang 4,3 → 1,65 (+62% → +17%), Kiếm Khôi 4,6 → 4,0 (+26% → −7%). Huyết Lang Vương 2,7 → 3,2 còn +22%: số của con này dao động giữa các lượt (72 đến 164 mẫu), chưa chắc đã tốt hơn. Không đổi: sói +11%, heo +11%, thạch viên −2%, Thủ Mộ Tướng +7%.
- **Đã sửa, quái trôi trong tư thế đánh:** đánh xong server cho đuổi tiếp ngay, clip đòn ở client còn dài nên thân đi 3 đến 6 m/s mà chân không bước. Quái đi nhanh hơn 1,5 m/s liên tục 0,25 giây thì nhả clip đòn thường (`GLIDE_SPEED`, `GLIDE_HOLD` ở `apps/client/src/game/character/skinned.ts`; không áp cho đòn lớn của boss và người chơi). Số mẫu "đang trôi mà clip `attack` còn trội" của sói, thạch viên, Huyết Lang Vương, Kiếm Khôi: 782 → 370 trong cùng kịch bản. Phần còn lại là 0,25 giây chờ + 0,16 giây mờ ra của mỗi đòn khi mình chạy liên tục.
- **Chưa sửa:** Kính Nguyệt Chân Quân chạy +45% (`refSpeed` 1,3 đã chạm trần tốc độ phát 2,6 lần, phải dựng lại clip chạy sải dài hơn); boss đang `slam` / `sweep` mà thân đi 5 m/s thì chân trôi 75 đến 100% (lao/nhảy có chủ ý hay không là việc của sân boss); mới quét 13 trên 94 quái; lớp phủ F3 chưa hiện cột này (đọc qua kịch bản).

## Vùng trúng thật và độ khớp của vạch báo (28/11)

**Lớp vẽ vùng trúng thật** (chỉ bản dev): nút "Vùng trúng thật" trong bảng Chỉnh phòng (F4; component `ZoneOverlayToggle` ở `apps/client/src/ui/lab-editor/RoomEditPanel.tsx` để gắn vào tab Diễn Võ) hoặc `__labEdit.zones().toggle()`. Mỗi vùng sát thương hiện một viền mảnh trên sàn: lam nhạt cho đòn vùng của quái/boss, lục nhạt cho chiêu của người chơi; viền mờ trong lúc báo, sáng hẳn đúng lúc server phán định rồi tan sau 0,7 giây.

- **Không thêm gì ở server.** Đòn vùng của quái: tin `S.HAZARD` mà mọi client vốn nhận mang NGUYÊN hình server lưu và kiểm bằng `inHazard` (`packages/shared/src/combat.ts`), nên viền là vùng thật, không phải ước lượng (test so 2000 điểm mỗi hình với `inHazard`). Chiêu vùng và chiêu đường thẳng của người chơi: tâm, bán kính, điểm cuối, bề rộng có sẵn trong tin `S.FX`. Vì chỉ dùng dữ liệu client thường đã có, lớp này không mở đường nào để biết trước hay né đòn.
- **Giới hạn:** đòn thường chém quét của hướng cận chiến vẽ cung theo vị trí người đánh và mục tiêu LÚC TIN TỚI (server tính hướng lúc trúng; lệch tối đa một nhịp đồng bộ), và chưa cộng bán kính thân quái mà server cộng thêm. Đòn đánh đơn, đạn của quái và phản đòn không có vùng nên không vẽ.
- Mã: `apps/client/src/game/editor/zoneShapes.ts` (hình, thuần, có test), `apps/client/src/game/editor/zoneOverlay.ts` (nghe tin, vẽ viền, nhật ký `log`).

**Đo vạch báo so với vùng thật:** `pnpm --filter @dtl/perf exec tsx src/zonecheck.ts --out <thư mục> --query style=dahoa [--mons id1,id2 | all] [--kinds slam,line]` (`tools/perf/src/scenarios/zonecheck.ts`). Mỗi chiêu: `/gm boss`, `/gm cast <loại> loop`, dừng lớp hình 120 ms trước lúc phán định, chụp hai ảnh cùng khung có và không có nhóm VFX; phần chênh là vạch báo người chơi thật sự thấy. *Phủ* = phần vùng thật có vạch vẽ lên; *Tràn* = vạch vẽ ngoài vùng (trong vòng 3 m), tính theo diện tích vùng. Ảnh ra có chú giải: mép vùng thật (lục), phần vùng không có vạch (lam), phần tràn (vàng).

Dạ Họa 720p, WebGPU preset Cao; hai lượt đo cho số lệch nhau dưới 5 điểm phần trăm:

| Quái | Chiêu | Vùng thật | Báo trước (s) | Phủ | Tràn | Nhận xét |
| --- | --- | --- | --- | --- | --- | --- |
| `boss_huyet_lang_vuong` | slam | tròn r 5,5 | 1,70 | 97% | 6% |  |
| `boss_han_giao` | slam | tròn r 5,5 | 1,70 | 98% | 25% |  |
| `boss_han_giao` | chant | tròn r 12 | 0,90 | 54% | 5% | vạch tô không kín vùng r 12 |
| `boss_kiem_khoi` | slam | tròn r 5,5 | 1,70 | 97% | 17% |  |
| `boss_dia_mach_long` | slam | tròn r 6 | 1,60 | 44% | 19% | đúng cỡ; vạch là pháp trận NÉT (không tô) nên phủ thấp |
| `boss_dia_mach_long` | line | chữ nhật 30,0 × 4 | 2,00 | 86% | 35% |  |
| `boss_van_hai_kinh_vuong` | slam | tròn r 7 | 1,50 | 95% | 18% |  |
| `boss_van_hai_kinh_vuong` | line | chữ nhật 40,0 × 6 | 2,00 | 95% | 36% |  |
| `boss_kinh_nguyet_chan_quan` | sweep | quạt r 14, 70° | 1,40 | 91% | 28% |  |
| `boss_thien_khuyet_thu_linh` | slam | tròn r 8 | 1,50 | 76% | 12% | mép ngoài mờ |
| `boss_thien_khuyet_thu_linh` | line | chữ nhật 20,0 × 4 | 1,80 | 91% | 28% |  |
| `boss_kim_da_ma_hau` | slam | tròn r 8 | 1,30 | 22% | 9% | **thiếu vạch báo trên sàn** (chỉ có vòng đỏ nhỏ dưới chân boss) |
| `boss_kim_da_ma_hau` | chant | tròn r 12 | 1,00 | 26% | 5% | **thiếu vạch báo trên sàn** |
| `boss_tan_hoa_kiem_co` | sweep | quạt r 9, 80° | 1,20 | 76% | 35% |  |
| `elite_xich_sa_ngo_cong` | burrow | tròn r 3 | 2,00 | 87% | 22% |  |
| `elite_kinh_dien_ma_quan` | line | chữ nhật 9,0 × 3 | 1,10 | 98% | 59% |  |

- **Không chiêu nào vẽ SAI CỠ hay SAI HÌNH**: ở mọi chiêu có vạch, mép vạch trùng mép vùng thật; bán kính trong thẻ chiêu (`data/vfx/cards/mon`) bằng `ai` của quái. Không có lệch nào ở dữ liệu quái hay server.
- **Lệch thật, phía hiệu ứng: Kim Dạ Ma Hậu.** Cả đập (r 8, quanh người chơi) lẫn niệm chú (r 12, quanh boss) gần như KHÔNG có vạch báo trên sàn ở 120 ms trước lúc trúng (phủ 22–26%); thứ nhìn thấy chỉ là một vòng đỏ nhỏ dưới chân boss. Người chơi dính đòn 8–12 m mà không được báo.
- Phủ thấp nhưng đúng cỡ: Địa Mạch Long đập (pháp trận nét vàng, không tô, 44%), Hàn Giao niệm chú (54%), Thiên Khuyết Thủ Lĩnh đập (76%). Đọc được hình nhưng phần ruột vùng không được tô.
- "Tràn" 5–37% phần lớn KHÔNG phải vạch báo to hơn thật: nó gồm quầng sáng quanh mép, hào quang và hiệu ứng khác của boss nằm chung nhóm VFX, và thân boss/người chơi. Chỉ dùng cột này để tìm chiêu tràn bất thường, không coi là số tuyệt đối.
- **Chưa đo được:** `charge` và `leap` (boss chỉ ra khi người chơi đứng xa; kịch bản đứng gần), `caster` (đạn, không có vùng). Trong một phiên, các quái đo SAU Kim Dạ Ma Hậu không ra chiêu nữa (chưa rõ vì sao; đo riêng từng con thì được) nên ba dòng cuối bảng lấy từ lượt chạy riêng.
