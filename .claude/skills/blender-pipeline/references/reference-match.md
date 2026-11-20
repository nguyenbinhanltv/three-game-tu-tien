# Vòng lặp "khớp ảnh tham chiếu" (headless)

Dùng khi người dùng đưa ảnh concept/multiview/ảnh mẫu và muốn asset **giống ảnh**, nhất là vật hữu cơ hoặc có mặt/tay/tượng (tượng thần Thiên Khuyết, đầu tượng, phù điêu). Mục tiêu là **hội tụ dần bằng mắt**, không phải khớp từng điểm ảnh.

> Bài học gốc: tượng Thiên Khuyết dựng bằng cách ghép primitive (hộp, ống, cầu) qua nhiều bản mà mặt vẫn không đọc được từ 100–200 m (MAP-DEBT 1, `docs/handbook/maps-levels.md`). Hai thứ cứu được: (1) **đo bằng góc máy cố định ở đúng khoảng cách chơi** (`mat110/mat150/mat200` trong `tools/perf/src/scenarios/thienkhuyet.ts`) thay vì ngắm cận trong Blender; (2) dựng khối **liền** (một lưới chạy dọc đường cong, đầu tròn/nắp bán cầu kín) thay vì ghép ống rời. Vòng lặp dưới đây biến hai điều đó thành quy trình.

Nguồn ý tưởng: `reference-image-match` + `visual-match-checklist` (blender-skills, MIT, xem `assets/LICENSES.md`), viết lại theo quy ước dự án (bpy nền qua `tools/blender/run.mjs`, không thao tác giao diện, không Blender MCP).

## Quy tắc

1. **Viết bản phân tích ảnh trước khi dựng gì** (bảng bên dưới). Không có bản này thì không bắt đầu.
2. **Khớp camera trước** — khung hình sai làm mọi vòng sau trông sai.
3. Dựng **ba tầng, từ to đến nhỏ**: silhouette/tỉ lệ → mặt phẳng và nhịp cắt (gờ, bậc, hõm, vát) → chi tiết nhỏ và đặc điểm riêng (hoa văn, mão, ngón tay). Chưa xong tầng trước thì không sang tầng sau. Hộp 90° trơ trụi nghĩa là thiếu tầng 2.
4. **Chụp so sánh sau mỗi tầng**, không dồn cuối.
5. **Tối đa 3 vòng** mỗi mục tiêu. Hết 3 vòng vẫn Miss ở "đọc được ở khoảng cách chơi" thì **đổi thiết kế** (đổi tư thế, góc, tỉ lệ đặc điểm) và báo người dùng, đừng mài tiếp (tượng ngã sấp ở MAP-DEBT 1 là ví dụ).
6. Sửa tại chỗ khi script nguồn đã có (`tools/blender/*_arch.py`): thêm/chỉnh theo tham số, không viết lại từ đầu trừ khi người dùng yêu cầu.

## Bước 0: phân tích ảnh (viết ra, ngắn)

| Mục | Ghi gì |
| --- | --- |
| Chủ thể | loại asset, hướng "trước", vai trò (nhân vật chính/phông) |
| Silhouette | khối lớn, độ thon/bè, các điểm nhô ra |
| Tỉ lệ | dài:rộng:cao; với người/tượng dùng "đơn vị đầu" (xem `character-3d/references/weights-proportions.md`) |
| Camera | góc (3/4, ngang, ngước, từ trên), ống kính (rộng/thường/tele), chủ thể chiếm bao nhiêu % khung |
| Ánh sáng | hướng sáng chính, sáng phụ, viền sáng sau lưng, màu môi trường |
| Vật liệu | đá/kim/gỗ/vải/da; nhám–bóng; mức phong hóa |
| Màu | 5–8 mã hex, đối chiếu `assets/palette.json` và mood trong `docs/art-bible.md` mục 4 |
| Đặc điểm riêng | những thứ thiếu là "sai người" (mặt, mão, trâm, hoa văn) |
| Cảm xúc | uy nghiêm, hoang tàn, tĩnh lặng… |

## Bước 1: khớp camera (headless)

Dùng **cùng định dạng góc máy với `shots`**: `{ name, eye:[x,y,z], at:[x,y,z], fov }` (tọa độ thế giới game, Y lên, fov dọc, như mảng `VIEWS` trong `tools/perf/src/scenarios/thienkhuyet.ts`). Một khai báo dùng cho cả hai nơi: Blender (ảnh dựng) và trong game (`__game.freeCam`, chỉ chạy khi URL có `?debug=1`, luôn thêm `?mute=1`).

Chuyển sang Blender (glTF import: game `(x, y, z)` → Blender `(x, -z, y)`):

```python
import math, bpy
from mathutils import Vector

def game_to_bl(p):                    # (x,y,z) game → Blender
    return Vector((p[0], -p[2], p[1]))

def make_cam(eye, at, fov_deg, aspect_w=16, aspect_h=9):
    cam = bpy.data.cameras.new('cam')
    cam.sensor_fit = 'VERTICAL'       # fov của game là fov DỌC
    cam.sensor_height = 24.0
    cam.lens = 12.0 / math.tan(math.radians(fov_deg) / 2)
    ob = bpy.data.objects.new('cam', cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = game_to_bl(eye)
    d = game_to_bl(at) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = ob
    return ob
```

Khung ảnh tham chiếu khác tỉ lệ 16:9 thì ghi rõ `--size` và cắt ảnh tham chiếu cùng tỉ lệ. Ảnh tham chiếu chỉ có góc nhìn chung (không có số): thử 3 ống kính (28/40/60 mm tương đương) rồi chọn khung có chủ thể chiếm % gần nhất; ghi lựa chọn vào bản phân tích.

Ánh sáng/xuất ảnh dựng lại từ `tools/blender/thien_cong_preview.py` (Cycles CPU, ít mẫu, chạy không cần GPU). Chưa có script `refmatch` riêng: khi cần, thêm `tools/blender/refmatch.py` (nhận `--glb`, `--views <json>`, `--out`) và job tương ứng, đừng chép lệnh rời vào skill.

## Bước 2: chụp so sánh

Mỗi vòng ra **ba ảnh**:

1. **Ảnh dựng** ở đúng góc máy (Blender), và **ảnh trong game** cùng góc (`pnpm shots <kịch bản> --out <thư mục tuyệt đối>`; thêm view vào kịch bản đã có hoặc kịch bản mới ở `tools/perf/src/scenarios/`, không viết script chụp rời). Ảnh Blender để lặp nhanh, ảnh game mới là bằng chứng cuối (sương, mood, bloom đổi cách đọc).
2. **Ảnh ghép cạnh nhau**: tham chiếu | dựng | chồng viền (silhouette của hai ảnh trên nền khác màu). Ghép bằng numpy trong chính script bpy (Blender có sẵn numpy) hoặc Pillow nếu có.
3. **Chỉ số silhouette** (nếu tham chiếu tách nền được): IoU hai mặt nạ. Đây chỉ để theo dõi xu hướng giữa các vòng, **không** là tiêu chí đạt; tiêu chí đạt là bảng chấm bên dưới.

Ảnh dành cho người duyệt để ở artifact phiên, không commit (`docs/<hạng mục>/README.md` chỉ ghi ghi chú).

## Bước 3: chấm và lập danh sách khoảng cách

Chấm từng mục **Match / Close / Miss**; đạt khi ≥ 8/10 mục Match hoặc Close và không có Miss ở mục 1–2.

| # | Mục | Hỏi |
| --- | --- | --- |
| 1 | Camera/khung | cùng hướng, cùng góc, chủ thể chiếm % tương tự? |
| 2 | Silhouette/tỉ lệ | khối lớn đúng chỗ, không thiếu/thừa khối so với ảnh? |
| 3 | **Đọc được ở khoảng cách chơi** | từ 100–200 m (hoặc khoảng cách camera chơi thật) vẫn nhận ra đặc điểm chính (mặt, tay, mão)? |
| 4 | Chiều sâu | có gờ, bậc, hõm; vát/trụ phá góc 90° ở nơi ảnh có? |
| 5 | Mật độ chi tiết | cùng cỡ với ảnh (không trống, không rối)? |
| 6 | Vật liệu | dải giá trị sáng–tối, nhám/bóng đúng loại? |
| 7 | Màu | khớp bảng màu mood, không cháy trắng? |
| 8 | Ánh sáng | hướng sáng chính, phần tối không đen kịt trừ khi ảnh vậy? |
| 9 | Đặc điểm riêng | mọi mục "đặc điểm riêng" trong bản phân tích đều có? |
| 10 | Ngân sách | tam giác/draw call/texture trong `assets/budgets.json`? |

Mỗi Miss ghi **một** sửa cụ thể, tối đa 5 mục, xếp theo thứ tự mục ở trên (camera trước, vi mô sau).

**Tự rớt, sửa trước khi nộp**: camera nhìn nhầm mặt/hướng; chủ thể quá nhỏ trong khung; mảng phát sáng làm trắng cả thân (vật liệu phát sáng dùng chung); vật nối "lơ lửng" không dính bề mặt; lưới lộ khe hở giữa các ống rời.

## Kỹ thuật dựng khối hữu cơ không ghép primitive

(Chi tiết hơn ở `procedural-assets/references/modeling-tips.md`.)

- Chi, ngón, đuôi, dải: **một lưới liền** quét dọc đường cong (Catmull-Rom hoặc Bezier) với bán kính đổi theo vị trí; đầu bằng nắp tròn kín hoặc mặt gãy có nhiễu. Không nối ống bằng cầu.
- Mặt/đầu: khối sọ → hõm hốc mắt → gờ mày → sống mũi → môi bằng **vài phép dịch có nhiễu thấp tần** lên một cầu đủ mịn, đo ở góc nhìn xa chứ không phải cận cảnh.
- Mỗi đặc điểm (mão, trâm, vòng) là mảnh riêng có tên, gắn lên bề mặt (không rơi về gốc tọa độ).
- Mọi bộ sinh nhận seed; không commit asset sinh ra mà không kèm script + seed (quy tắc chung của `procedural-assets`).
