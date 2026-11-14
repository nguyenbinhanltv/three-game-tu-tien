# Phi kiếm (prop_phi_kiem): lấy lưới Tripo v02, tô lại màu theo vùng bằng script, không tốn credit Tripo.
#
# Chạy (không mở giao diện), thường qua tools/blender/run.mjs:
#   blender --background --factory-startup --python tools/blender/recolor_phi_kiem.py -- <out.glb> --src <raw_v02.glb>
#
# Vì sao: Tripo multiview v02 (task 70d2072c) cho hình đúng (lưỡi thẳng) nhưng base color toàn xám.
# Script này:
#   1. Nhập GLB, gộp mesh, giảm tam giác xuống dưới trần lớp weapon (assets/budgets.json, 3000).
#   2. Chia vùng theo chiều dọc kiếm (kiếm dựng đứng, mũi hướng +Y): lưỡi, hộ thủ, quấn chuôi, cầu chuôi, tua.
#      Ranh giới đo từ phân bố đỉnh của lưới v02 (xem bảng ZONES).
#   3. Vẽ lại base color trong không gian UV, từng điểm ảnh: màu vùng (bảng màu tâm trạng art bible v3)
#      nhân với độ sáng tương đối của texture xám gốc để giữ vân. Vùng được quyết theo vị trí 3D nội suy
#      trong tam giác nên đường ranh sắc. Điểm ảnh ngoài mọi tam giác được loang từ điểm lân cận (chống viền).
#   4. Ghi lại ORM: giữ kênh R (AO), G = roughness, B = metalness theo vùng (art bible mục 3).
#   5. Đặt gốc ở đáy vật (minY = 0), tâm XZ trên trục chuôi; thêm Empty socket_grip ở giữa chuôi.
#   6. Xuất GLB (Y lên), texture 512² (vẽ ở 1024 rồi hạ).

import sys

import bmesh
import bpy
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv or '--src' not in argv:
    raise SystemExit('Cách dùng: -- <out.glb> --src <raw_v02.glb>')
OUT = argv[0]
SRC = argv[argv.index('--src') + 1]

MAX_TRIS = 2850  # dưới trần weapon 3000, chừa chỗ cho weld/triangulate
TEX = 1024  # độ phân giải khi vẽ
OUT_TEX = 512  # cạnh texture xuất ra, theo lớp weapon trong assets/budgets.json

# Ranh giới vùng theo Y của lưới Tripo gốc (cao chuẩn hóa 1, từ -0,5 tới 0,5, mũi kiếm ở +Y).
# Đo bằng histogram đỉnh: tua (bề ngang lớn, lệch trục) < -0,425; cầu chuôi -0,425..-0,37;
# quấn chuôi -0,37..-0,26 (bề ngang ổn định 0,043); hộ thủ -0,26..-0,18 (bề sâu 0,10); trên đó là lưỡi.
# Màu: assets/palette.json (sRGB). metal/rough theo art bible mục 3.
ZONES = [
    # (tên, y_trên, màu sRGB, roughness, metalness)
    ('tassel', -0.425, '#9D392E', 0.90, 0.0),  # wood_cinnabar: tua kiếm son đỏ
    ('pommel', -0.370, '#AE8B49', 0.45, 0.9),  # wood_bronze: cầu chuôi đồng thau
    ('grip', -0.260, '#22364E', 0.85, 0.0),  # attire_elder: dây quấn chuôi lam đậm
    ('guard', -0.180, '#AE8B49', 0.45, 0.9),  # wood_bronze: hộ thủ mây
    ('blade', 9.0, '#DCE6DF', 0.35, 1.0),  # air_mist: thép ánh lạnh
]
GRIP_Y = (-0.370, -0.260)


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def zone_index(y):
    idx = np.full(y.shape, len(ZONES) - 1, dtype=np.int32)
    for i in range(len(ZONES) - 2, -1, -1):
        idx[y < ZONES[i][1]] = i
    return idx


# ---------- 1. Nhập và gộp ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit('GLB nguồn không có mesh')
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
# Bỏ cha (Empty gốc của glTF) nhưng giữ biến đổi, rồi áp biến đổi vào lưới.
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o is not obj:
        bpy.data.objects.remove(o, do_unlink=True)
me = obj.data

# Kiểm giả định của ZONES: kiếm dựng đứng, cao chuẩn hóa 1 (Z từ -0,5 tới 0,5), mũi ở +Z (hẹp hơn đáy có tua).
# Nguồn bị thay hoặc xoay thì dừng, không tô sai vùng.
_z = np.array([v.co.z for v in me.vertices], dtype=np.float32)
_xy = np.array([v.co.xy[:] for v in me.vertices], dtype=np.float32)
if abs(_z.min() + 0.5) > 0.02 or abs(_z.max() - 0.5) > 0.02:
    raise SystemExit(f'Lưới nguồn không cao chuẩn hóa 1 quanh gốc (Z {_z.min():.3f}..{_z.max():.3f}); ZONES không còn đúng')
_top = _xy[_z > 0.3]
_bot = _xy[_z < -0.43]
if len(_top) == 0 or len(_bot) == 0 or np.ptp(_top, axis=0).max() >= np.ptp(_bot, axis=0).max():
    raise SystemExit('Lưới nguồn không phải kiếm dựng đứng mũi hướng lên (đầu trên phải hẹp hơn tua ở đáy)')

# Blender là Z lên; glTF Y lên được đổi thành Z khi nhập. "Y gốc" trong ZONES = Z ở đây.
def tri_count(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


# ---------- 2. Vẽ texture theo vùng (trên lưới gốc, trước khi giảm) ----------
mat = me.materials[0]
nodes = mat.node_tree.nodes
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')


def image_from_input(sock):
    """Lần ngược từ ô vào của BSDF tới node ảnh (có thể qua Separate Color / Normal Map)."""
    stack = [sock]
    while stack:
        s = stack.pop()
        for link in s.links:
            n = link.from_node
            if n.type == 'TEX_IMAGE':
                return n.image
            stack.extend(i for i in n.inputs if i.is_linked)
    return None


img_color = image_from_input(bsdf.inputs['Base Color'])
img_orm = image_from_input(bsdf.inputs['Roughness']) or image_from_input(bsdf.inputs['Metallic'])
img_normal = image_from_input(bsdf.inputs['Normal'])
if img_color is None or img_orm is None:
    raise SystemExit('Không tìm thấy texture màu hoặc ORM trong material Tripo')


def pixels(img, size):
    if img.size[0] != size:
        img.scale(size, size)
    a = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(size, size, 4)  # hàng 0 = đáy ảnh (v = 0)


src_color = pixels(img_color, TEX)
src_orm = pixels(img_orm, TEX)
lum = src_color[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

me.calc_loop_triangles()
uv_layer = me.uv_layers.active.data
co = np.array([v.co[:] for v in me.vertices], dtype=np.float32)
zone_px = np.full((TEX, TEX), -1, dtype=np.int32)

for lt in me.loop_triangles:
    uv = np.array([uv_layer[li].uv[:] for li in lt.loops], dtype=np.float32) * TEX
    z3 = co[list(lt.vertices), 2]
    x0, y0 = np.floor(uv.min(axis=0)).astype(int)
    x1, y1 = np.ceil(uv.max(axis=0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, TEX - 1), min(y1, TEX - 1)
    if x1 < x0 or y1 < y0:
        continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-12:
        continue
    w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
    w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
    w2 = 1 - w0 - w1
    eps = -0.02  # nới mép một chút; phần hở còn lại do bước loang lấp
    inside = (w0 >= eps) & (w1 >= eps) & (w2 >= eps)
    if not inside.any():
        continue
    zi = zone_index(w0 * z3[0] + w1 * z3[1] + w2 * z3[2])
    sub = zone_px[y0:y1 + 1, x0:x1 + 1]
    sub[inside] = zi[inside]

covered = zone_px >= 0
if not covered.any():
    raise SystemExit('Không vẽ được điểm ảnh nào: UV hỏng?')

# Loang vùng sang điểm ảnh trống (đường nối UV, mipmap) bằng vài lượt dịch 4 hướng.
for _ in range(16):
    empty = zone_px < 0
    if not empty.any():
        break
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        shifted = np.roll(zone_px, (dy, dx), axis=(0, 1))
        fill = empty & (shifted >= 0)
        zone_px[fill] = shifted[fill]
        empty = zone_px < 0
zone_px[zone_px < 0] = len(ZONES) - 1

out_color = np.empty_like(src_color)
out_orm = src_orm.copy()
for i, (name, _top, hexc, rough, metal) in enumerate(ZONES):
    m = zone_px == i
    if not m.any():
        continue
    rel = lum[m] / max(float(lum[m & covered].mean()) if (m & covered).any() else float(lum[m].mean()), 1e-3)
    rel = np.clip(rel, 0.7, 1.25)[:, None]
    out_color[m, :3] = np.clip(hex_rgb(hexc)[None, :] * rel, 0, 1)
    out_orm[m, 1] = rough
    out_orm[m, 2] = metal
    print(f'[recolor] vùng {name}: {int(m.sum())} điểm ảnh')
out_color[..., 3] = 1.0
out_orm[..., 3] = 1.0

img_color.pixels.foreach_set(out_color.ravel())
img_orm.pixels.foreach_set(out_orm.ravel())
# Vẽ ở 1024 cho đường ranh mịn, rồi hạ về cạnh của lớp weapon (512) trước khi đóng gói.
for img in (img_color, img_orm, img_normal):
    if img is not None:
        img.scale(OUT_TEX, OUT_TEX)
        img.pack()

# ---------- 3. Giảm tam giác ----------
before = tri_count(me)
if before > MAX_TRIS:
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = MAX_TRIS / before
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.to_mesh(me)
bm.free()
after = tri_count(me)
print(f'[recolor] tam giác {before} → {after}')

# ---------- 4. Gốc ở đáy, tâm XZ trên trục chuôi ----------
co = np.array([v.co[:] for v in me.vertices], dtype=np.float32)
grip = co[(co[:, 2] > GRIP_Y[0]) & (co[:, 2] < GRIP_Y[1])]
cx, cy = (grip[:, 0].min() + grip[:, 0].max()) / 2, (grip[:, 1].min() + grip[:, 1].max()) / 2
zmin = float(co[:, 2].min())
me.transform(__import__('mathutils').Matrix.Translation((-cx, -cy, -zmin)))
me.update()
obj.name = 'prop_phi_kiem'
me.name = 'prop_phi_kiem'

sock = bpy.data.objects.new('socket_grip', None)
sock.empty_display_type = 'ARROWS'
sock.empty_display_size = 0.05
sock.location = (0.0, 0.0, (GRIP_Y[0] + GRIP_Y[1]) / 2 - zmin)
bpy.context.scene.collection.objects.link(sock)
sock.parent = obj
sock['socket'] = 'grip'

# ---------- 5. Xuất ----------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_extras=True,
    export_image_format='AUTO',
    export_draco_mesh_compression_enable=False,
)
print(f'[recolor] xong → {OUT}')
