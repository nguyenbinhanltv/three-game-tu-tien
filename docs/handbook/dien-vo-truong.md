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

## `pnpm shots labui`

`pnpm shots labui --out <thư mục> --query style=dahoa [--only tools,contrast,motion,windows] [--win char,wardrobe] [--winwait 900]`

- `tools`: bấm nút thật các công cụ trên rồi đối chiếu trạng thái game (20 mục).
- `contrast`: **tương phản chữ HUD trên nền thật** (WCAG AA). Dồn HUD nặng nhất, lấy hộp + màu của từng dòng chữ, chụp lại với chữ trong suốt để có nền ngay dưới chữ, tính tỉ lệ tương phản theo từng điểm ảnh; dòng có phân vị 10% dưới 4,5 (chữ lớn: 3) bị báo, kèm ảnh đánh dấu `contrast-1-danh-dau.png` (đỏ: không có bóng chữ; cam: có bóng chữ nên thực tế dễ đọc hơn con số). Chữ tô bằng nền cắt theo chữ (tên boss) không đo được, đếm riêng.
- `windows`: dựng nhân vật đủ đồ (ba bộ `kit`, đủ chiêu, HUD nặng) rồi mở TỪNG cửa sổ (nhân vật, túi, công pháp, nhiệm vụ, bản đồ, tổ đội, tủ ngoại trang, cài đặt, trợ giúp) ở năm cỡ màn 1280×720 → 2560×1440; báo cửa sổ tràn khỏi khung nhìn, dòng chữ bị cắt (tràn ngang trong ô ẩn phần thừa) và lỗi console sinh ra khi mở từng cửa sổ; ảnh ở `win/<cửa sổ>-<rộng>x<cao>.png`.
- `motion`: bật "Giảm chuyển động", gọi mọi khoảnh khắc rồi đếm animation CSS trong HUD còn **dịch chuyển/phóng/xoay** (mờ dần và đổi màu không tính).

## Phòng đã chỉ ra (lượt đầu 27/11, Dạ Họa 720p)

- **Đã sửa:** khi bật Giảm chuyển động, thông báo nổi vẫn trượt xuống (`toast-in`) và hai dải letterbox của thẻ chương vẫn kéo dãn (`chapter-bar`) → thông báo hiện tại chỗ, letterbox mờ dần (`apps/client/src/styles.css`, `apps/client/src/styles2.css`). Đo lại: 6 animation dịch chuyển lúc thường, 0 khi bật giảm.
- **Chưa sửa, tương phản (18/92 dòng dưới ngưỡng):** số trên thanh máu/linh lực của mình và của tổ đội (chữ nằm vắt qua mép phần đã đầy và phần rỗng của thanh: 1,3–2,6); dòng chat hệ thống trên nền game không có tấm lót (1,0–1,5 ở chỗ nền sáng); tên mục tiêu (1,4); dòng phụ của thanh boss; nhãn phím Q/F/Z và nút +/− của bản đồ nhỏ (3,8–4,4, sát ngưỡng). Hầu hết có bóng chữ nên vẫn đọc được; ưu tiên là số trên thanh và chat.
- **Đã sửa, bố cục:** chồng lời mời (`.pty-invites`, trước cố định cách mép trên 70 px) đè lên thanh boss và khung mục tiêu khi đang đánh boss → `InviteStack` (`apps/client/src/ui/Party.tsx`) đo đáy các khung giữa phía trên và hạ chồng xuống dưới (201 px khi có thanh boss + khung mục tiêu, đè 0 px²); thông báo nổi coi chồng lời mời là khung phải né.
- **Đã sửa, cửa sổ Tổ đội:** ở màn 720p tên thành viên bị ép còn hai chữ ("Th…") vì hai nút Giao quyền / Mời ra chiếm hết hàng → hàng cho xuống dòng, tên giữ tối thiểu 14 ký tự (`apps/client/src/ui/party.css`). Tên thử của phòng (`LAB_NAMES`) đổi về đúng 14 ký tự, mức tối đa server cho đặt; tên 27 ký tự trước đây không tồn tại trong game nên gây báo động giả.
- **Đã sửa, lỗi thật ở Dạ Họa / Họa Cảnh:** mở **Tủ ngoại trang** (và bảng Nhân vật khi đang mặc bộ v3) thì khung xem trước 3D TRỐNG, console báo WGSL `structures must have at least one member: struct OutputType` cho `fragment_tripo_material_…`, lặp mỗi khung. Nguyên nhân: ở các phong cách này vật liệu nhân vật v3 mang `mrtNode` ghi mặt nạ vào đích phụ `aux` (`markVfxMask`); khung xem trước vẽ vào đích một màu, không có MRT của renderer, nên `mrtNode` thay luôn đầu ra màu và shader không còn đầu ra nào. Sửa ở `apps/client/src/game/camera/charPreview.ts`: khi cờ `painted` bật, đích xem trước có hai màu (`output`, `aux`) và renderer được đặt MRT cùng bố cục trong lúc vẽ. Phong cách mặc định không đổi đường vẽ. Kiểm: `pnpm shots labui --query style=dahoa --only windows` 0 lỗi console (trước 246), ảnh `win/wardrobe-*.png` có nhân vật (`--win wardrobe --winwait 3500` để chờ dựng xong).
- **Chưa sửa, nhỏ:** dòng "Nội tại" của bảng Công pháp bị cắt ở 1280×720 và 1366×768 (`.mp-passive`); thông báo nổi vẽ ĐÈ lên cửa sổ đang mở ở giữa màn hình; ô gợi ý "Chọn nhánh mốc…" cạnh thanh chiêu bị ép thành cột chữ hẹp.

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

Sáu cảnh nằm trong sàn nhiễu của phòng: Dạ Họa không vỡ trên đường lùi WebGL2 ở cả hai preset. Cảnh cận lệch vì hào quang cảnh giới (mây lam quanh nhân vật) chuyển động giữa hai lượt chụp, soi ảnh không thấy lớp nào mất; muốn so cảnh cận cho chặt thì phải dừng lớp hình trước khi chụp (chưa làm).
