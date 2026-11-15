# Dựng kiếm Tripo web (5 kiếm trang bị) thành model "kiếm trần" chuẩn của client. Chạy như bước `import.post` của
# import_tripo.py (sau chuẩn hóa: mét, gốc ở đáy, mọi tọa độ Blender; glTF = (x, z, -y)).
#
# Tripo dựng kiếm nằm dọc trục X (ảnh concept nhìn ngang, mũi hướng phải), mặt phẳng lưỡi trong mặt phẳng ảnh (XY glTF),
# bề dày lưỡi theo Z glTF. Script này:
#   1. Tìm đầu mũi: hai đầu trục X, đầu nào có tiết diện (YZ) nhỏ hơn trong 2% chiều dài là mũi.
#   2. Xoay kiếm đứng: mũi hướng +Y glTF (+Z Blender), cạnh lưỡi dọc X glTF, pháp tuyến mặt lưỡi dọc Z glTF.
#   3. Đặt gốc: đầu chuôi (cầu chuôi) ở Y = 0, tâm tiết diện lưỡi trên trục (X = Z = 0).
#   4. Đo chắn (tiết diện rộng nhất trong 12%–45% chiều dài tính từ cầu chuôi): `guard` (chiều cao tâm chắn) và
#      `bladeStart` (gốc lưỡi, ngay trên chắn). Tâm chuôi `grip` = giữa cầu chuôi và chắn.
#   5. Ghi extras `dtl` = {"blade": {"len", "grip", "bladeStart", "tip"}} lên mesh để client đặt kiếm lên xương `dtl_sword`
#      và vỏ sáng cường hóa (`swordGlow.ts`) bám đúng chiều dài lưỡi thật.
# Không đổi lưới nào khác; chỉ quay + tịnh tiến, rồi áp transform.

import json

import bpy
import numpy as np
from mathutils import Matrix

objs = [o for o in MESHES]
if not objs:
    fail('không có mesh để dựng kiếm')


def verts():
    pts = []
    for o in objs:
        mw = o.matrix_world
        pts.extend((mw @ v.co)[:] for v in o.data.vertices)
    return np.array(pts, dtype=np.float64)


P = verts()
x = P[:, 0]
L = x.max() - x.min()
if L <= 0:
    fail('kiếm có chiều dài 0')


def end_area(sign):
    """Kích thước tiết diện (rộng × dày) của đoạn 2% cuối ở đầu `sign` (+1 = +X, -1 = -X)."""
    edge = x.max() if sign > 0 else x.min()
    m = np.abs(x - edge) <= 0.02 * L
    if not m.any():
        return 0.0
    q = P[m]
    return float((q[:, 1].max() - q[:, 1].min()) * (q[:, 2].max() - q[:, 2].min()) + 1e-9)


tip_sign = 1 if end_area(1) <= end_area(-1) else -1

# +X (tip) → +Z Blender (đứng). Quanh trục Y: góc -90° đưa +X lên +Z; góc +90° đưa -X lên +Z.
rot = Matrix.Rotation(-tip_sign * (3.141592653589793 / 2), 4, 'Y')
for o in objs:
    o.matrix_world = rot @ o.matrix_world
bpy.context.view_layer.update()

P = verts()
z = P[:, 2]
lo, hi = z.min(), z.max()
L = hi - lo
# Tâm tiết diện lưỡi: đoạn 60–90% chiều dài.
blade = P[(z > lo + 0.6 * L) & (z < lo + 0.9 * L)]
cx = float((blade[:, 0].min() + blade[:, 0].max()) / 2)
cy = float((blade[:, 1].min() + blade[:, 1].max()) / 2)
shift = Matrix.Translation((-cx, -cy, -lo))
for o in objs:
    o.matrix_world = shift @ o.matrix_world
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.select_all(action='DESELECT')

P = verts()
z = P[:, 2]
L = float(z.max())
# Chắn: tiết diện (rộng nhất theo hai trục) lớn nhất trong 12%–45% chiều dài.
bins = np.linspace(0.12 * L, 0.45 * L, 34)
best, guard = -1.0, 0.25 * L
for a, b in zip(bins[:-1], bins[1:]):
    m = (z >= a) & (z < b)
    if m.sum() < 3:
        continue
    q = P[m]
    w = max(q[:, 0].max() - q[:, 0].min(), q[:, 1].max() - q[:, 1].min())
    if w > best:
        best, guard = w, float((a + b) / 2)
blade_start = guard + 0.03 * L
grip = guard * 0.5

info = {'len': round(L, 4), 'grip': round(grip, 4), 'guard': round(guard, 4), 'bladeStart': round(blade_start, 4), 'tipSign': tip_sign}
for o in objs:
    data = json.loads(o.get('dtl', '{}'))
    data['blade'] = info
    o['dtl'] = json.dumps(data, separators=(',', ':'))

REPORT = {'blade': info, 'maxWidth': round(best, 4)}
