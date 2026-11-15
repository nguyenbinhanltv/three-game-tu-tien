# K-1: khảo sát chiêu và trang xem chiêu (mốc "trước")

Kế hoạch gốc: bước K-1 của kế hoạch kỹ năng và animation (2026-11-16). Bước này **không đổi gameplay**: chỉ thêm công cụ xem, ảnh mốc "trước" và bảng thời gian hiện tại, để K-2 (dữ liệu chiêu và server) và K-5 (chiêu IK mới) có số liệu so sánh.

## Trang xem chiêu

`http://localhost:5173/?mute=1&show=skill&id=<id chiêu hoặc id pose>[&model=char]`

- Không có `model`: rig mẫu sinh bằng code (không cần asset). `model=char`: model Thanh Phong thật (cần `pnpm assets:build`).
- `id` nhận id chiêu (`skl_kiem_khi_tram`) hoặc id pose (`kiem_khi_tram`); đổi chiêu bằng ô chọn, URL tự cập nhật.
- Phát/dừng, bước ±1/30 s (◀ ▶), thanh kéo thời gian có vạch **khung khóa** (vàng) và thanh **khung vung** (đỏ), tốc độ 0,1× / 0,25× / 0,5× / 1×.
- Camera: trước, bên, sau, chéo, tự quay, chuột để xoay tự do. Đè khung xương lên hình. Người chuẩn 1,7 m ẩn sẵn (bật lại ở mục Hiển thị).
- **Đầu dò số** theo khung đang xem: tay phải/trái so với vai (m), cổ chân [x, nhấc, z] (đơn vị tham chiếu của dữ liệu pose, nhấc ≈ 0 là chạm đất), hướng mũi và lưỡi kiếm.
- Bảng thời gian của chiêu ngay trong bảng bên phải.
- Từ console: `__viewer.seek(t)`, `__viewer.setView('side')`, `__viewer.probeText()`.

Code: `apps/client/src/viewer/SkillPanel.tsx`, `skillTiming.ts` (tính bảng thời gian, có test), phần điều khiển trong `scene.ts`.

## Ảnh mốc "trước"

(Script ghi PNG; tệp trong repo đã nén sang JPG cho nhẹ.) Dựng lại bằng `pnpm shots:k1 --out <thư mục tuyệt đối> [--mode viewer|game|table|all] [--model fixture|char] [--only skl_...]` (tự chạy `pnpm dev` ở `PORT`/`CLIENT_PORT`, tắt tiếng).

| Tệp | Nội dung |
| --- | --- |
| `viewer-<pose>.jpg` | Trang xem chiêu, model Thanh Phong, dừng ở từng khung khóa (cộng lúc ra đòn / hết đòn), hai góc (chéo, bên). Viền đỏ = trong khung vung |
| `game-<pose>.jpg` | Trong game: bấm chiêu ở 0 ms rồi chụp liên tục, mỗi ảnh ghi số ms thật từ lúc bấm (ảnh chụp mất khoảng 100–200 ms nên mốc thưa hơn viewer) |
| `bang-thoi-gian.md` | Bảng thời gian 12 chiêu (sinh bởi `--mode table`) |

## Bảng thời gian hiện tại

Xem `bang-thoi-gian.md` (giây). Cách đọc cột:

- **Khung khóa**: số key và thời điểm từng key trong pose IK. Cả 12 chiêu đều **6 khung** (chuẩn kế hoạch mới: 7–9).
- **Vào thế → ra đòn** = `hit[0]` của pose; **khung vung** = `hit` `[từ, tới]`; **thu về** = thời lượng − `hit[1]`.
- **Server áp**: tính từ lúc bấm. Server **không chờ animation**: chiêu không niệm áp ngay (0 s), chiêu niệm (Lôi Đình Nhất Kiếm, 1,5 s) áp khi hết niệm.
- **Hình ra đòn**: lúc nhát vung chạm khung `hit[0]` kể từ lúc bấm. Chiêu ngay: vào thế từ lúc bấm nên ra đòn ở `hit[0]`. Chiêu niệm: động tác xếp lịch (`SkillPoses.onCast`) để ra đòn đúng lúc niệm xong.
- **FX + số**: client giữ hiệu ứng và số sát thương của đòn mình bấm lại tối đa `MAX_HOLD` = 0,25 s để chờ nhát vung (`game/skillPose.ts`).
- **GCD** = 1,0 s (`packages/shared/src/formulas.ts`), mọi pose dài ≤ GCD (`validateSkillPose`).

### Nhận xét cho K-2 / K-5

1. **Chiêu ngay**: server trừ máu quái ở 0 s nhưng nhát vung chạm ở 0,26–0,50 s. Client trễ FX 0,25 s nên số/hiệu ứng vẫn **sớm hơn nhát vung 0,01–0,25 s** (Vạn Kiếm Quy Tông chênh nhiều nhất: ra đòn 0,50 s, FX 0,25 s). Đó là "đánh hụt rồi mới mất máu" mà kế hoạch nêu; K-2 dời lúc áp sát thương về `hitAt` sẽ xóa chênh này.
2. **Chiêu niệm**: đã khớp (chênh 0).
3. **Không chiêu nào có pha dồn lực khựng ~0,08 s**: các key 2–3 cách nhau 0,10–0,18 s nhưng không có đoạn giữ.
4. **Thu về dài** 0,30–0,50 s với pose dài 0,8–1,0 s; pose kết ở thế gần giống thế nghỉ, chưa phải thủ thế chiến đấu (chưa có clip thủ thế, xem hướng dẫn tải clip Tripo).
5. Mọi pose dài 0,80–1,00 s, sát GCD: chiêu nối nhau gần như không có khe hủy sớm.

## Việc kiểm

- `pnpm typecheck`, `pnpm --filter @dtl/client test` (có `viewer/skillTiming.test.ts`: 12 chiêu, khung vung trong clip, chiêu niệm khớp lúc server áp, `?show=skill` không bị hiểu là id asset).
- Viewer: kiểm bằng mắt ở WebGPU (Chrome headless) cho cả 12 chiêu; chưa kiểm Firefox/Safari.
