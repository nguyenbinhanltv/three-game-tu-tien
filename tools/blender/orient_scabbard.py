# Dựng vỏ kiếm Tripo web thành model "vỏ" chuẩn của client (T-5c). Chạy như bước `import.post` của import_tripo.py
# (sau chuẩn hóa: mét, gốc ở đáy, tọa độ Blender; glTF = (x, z, -y)).
#
# Quy ước ra: trục vỏ dọc +Y glTF, MIỆNG vỏ (đầu to, chỗ kiếm tra vào) ở Y = 0, ĐỈNH vỏ (đầu nhọn) ở Y = len; tâm tiết diện miệng ở X = Z = 0.
# Client (`game/character/scabbard.ts`) đặt miệng vỏ ở gốc lưỡi kiếm trên lưng, đỉnh vỏ về phía mũi kiếm, và phóng theo độ dài lưỡi.
# Mặt trước (hoa văn) giữ theo Tripo. Extras `dtl.scabbard` = { len }.
import json

import bpy
import numpy as np
from mathutils import Matrix

objs = [o for o in MESHES]  # noqa: F821
if not objs:
    fail('không có mesh để dựng vỏ kiếm')  # noqa: F821


def verts():
    return np.array([(o.matrix_world @ v.co)[:] for o in objs for v in o.data.vertices], dtype=np.float64)


P = verts()
c = P - P.mean(axis=0)
w, v = np.linalg.eigh(c.T @ c)
e1 = v[:, 2]  # trục dài nhất
# Trục dài → +Z Blender (đứng): quay e1 về Z, giữ tay phải.
z_axis = np.array([0.0, 0.0, 1.0])
ax = np.cross(e1, z_axis)
s = float(np.linalg.norm(ax))
if s > 1e-6:
    ax /= s
    ang = float(np.arctan2(s, float(np.dot(e1, z_axis))))
    rot = Matrix.Rotation(ang, 4, ax.tolist())
    for o in objs:
        o.matrix_world = rot @ o.matrix_world
    bpy.context.view_layer.update()
P = verts()
z = P[:, 2]
lo, hi = z.min(), z.max()
L = hi - lo


def section(sign):
    edge = hi if sign > 0 else lo
    m = np.abs(z - edge) <= 0.08 * L
    q = P[m]
    return float((q[:, 0].max() - q[:, 0].min()) * (q[:, 1].max() - q[:, 1].min()) + 1e-9)


# Đầu có tiết diện nhỏ hơn là đỉnh vỏ (nhọn) → phải ở +Z; nếu đang ở -Z thì lật 180° quanh X.
if section(-1) < section(1):
    flip = Matrix.Rotation(3.141592653589793, 4, 'X')
    for o in objs:
        o.matrix_world = flip @ o.matrix_world
    bpy.context.view_layer.update()
P = verts()
z = P[:, 2]
lo = z.min()
mouth = P[z < lo + 0.06 * (z.max() - lo)]
cx = float((mouth[:, 0].min() + mouth[:, 0].max()) / 2)
cy = float((mouth[:, 1].min() + mouth[:, 1].max()) / 2)
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
L = float(verts()[:, 2].max())
for o in objs:
    d = json.loads(o.get('dtl', '{}'))
    d['scabbard'] = {'len': round(L, 4)}
    o['dtl'] = json.dumps(d, separators=(',', ':'))
REPORT = {'scabbard': {'len': round(L, 4)}}
