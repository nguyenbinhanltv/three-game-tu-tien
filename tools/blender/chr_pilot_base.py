# Pilot "thân nền làm NGUỒN TRỌNG SỐ" (biến thể B): dựng thân nền nữ từ MakeHuman (addon MPFB2, CC0) → GLB gồm lưới thân (đã giảm mặt) + bộ xương Mixamo
# + trọng số MakeHuman (nhóm đỉnh `mixamorig:*`). KHÔNG vào game, không có texture: `chr_v3.py --base-weights <GLB này>` khớp nó vào nhân vật rồi chép trọng số.
# Chạy: blender --background --factory-startup --python tools/blender/chr_pilot_base.py -- <nam|nu> <ra.glb> [--tris N]
# Cần mã nguồn MPFB2 (git clone --depth 1 https://github.com/makehumancommunity/mpfb2) ở $MPFB_SRC (mặc định <dtl-asset-source>/3d/nhan-vat/chr_base_v2/_src/mpfb2/src).
# Giấy phép: lưới cơ sở, target hình thể, bộ xương Mixamo và trọng số của MPFB2 phát hành CC0 1.0 (`LICENSE.ASSETS.md` của MPFB); mã Python của MPFB (GPL) chỉ chạy như công cụ.
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SEX = argv[0] if argv else 'nu'
OUT = argv[1] if len(argv) > 1 else os.path.join(os.environ.get('TEMP', '.'), f'base_mh_{SEX}.glb')
TRIS = int(argv[argv.index('--tris') + 1]) if '--tris' in argv else 14000
ARM_DOWN = float(argv[argv.index('--arm-down') + 1]) if '--arm-down' in argv else 38.0  # độ hạ tay từ tư thế nghỉ MakeHuman (tay dang ngang) xuống chữ A
bpy.ops.wm.read_factory_settings(use_empty=True)

MPFB_SRC = os.environ.get('MPFB_SRC', 'D:/METAGRIT/dtl-asset-source/3d/nhan-vat/chr_base_v2/_src/mpfb2/src')
sys.path.insert(0, MPFB_SRC)
_user = os.path.join(os.environ.get('TEMP', '.'), 'mpfbuser')
os.makedirs(_user, exist_ok=True)
bpy.utils.extension_path_user = lambda pkg, path='', create=False: _user
import mpfb  # noqa: E402

mpfb.get_preference = lambda n: {'mpfb_shelf_label': 'MPFB'}.get(n, '')
mpfb.set_preference = lambda n, v: None
mpfb.MPFB_CONTEXTUAL_INFORMATION = {'__package__': 'mpfb', '__package_short__': 'mpfb', '__file__': mpfb.__file__}
from mpfb.services.humanservice import HumanService  # noqa: E402
from mpfb.services.targetservice import TargetService  # noqa: E402

MALE = SEX == 'nam'
macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1.0 if MALE else 0.0, age=0.5, muscle=0.5 if MALE else 0.42, weight=0.40 if MALE else 0.38,
             proportions=1.0, height=0.62 if MALE else 0.58, cupsize=0.5, firmness=0.7)
macro['race'] = {'asian': 1.0, 'caucasian': 0.0, 'african': 0.0}
body = HumanService.create_human(mask_helpers=False, macro_detail_dict=macro)
body.name = f'base_mh_{SEX}'
rig = HumanService.add_builtin_rig(body, 'mixamo')
rig.name = f'base_mh_{SEX}_rig'

bpy.context.view_layer.objects.active = body
if body.data.shape_keys:
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
for m in list(body.modifiers):
    body.modifiers.remove(m)

# Chỉ giữ thân (bỏ mắt, răng, lưỡi, mi...): nhóm đỉnh `body` của MakeHuman.
gname = {g.index: g.name for g in body.vertex_groups}
bm = bmesh.new()
bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
bmesh.ops.delete(bm, geom=[v for v in bm.verts if 'body' not in {gname.get(i) for i in v[dl].keys()}], context='VERTS')
bm.to_mesh(body.data)
bm.free()
# Nhóm `body`/`helper-*` không phải xương: bỏ khỏi nhóm đỉnh để chỉ còn trọng số Mixamo.
for g in list(body.vertex_groups):
    if not g.name.startswith('mixamorig'):
        body.vertex_groups.remove(g)

tm = body.modifiers.new('tri', 'TRIANGULATE')
bpy.ops.object.modifier_apply(modifier=tm.name)
n0 = len(body.data.polygons)
if n0 > TRIS:
    dec = body.modifiers.new('dec', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = TRIS / n0
    dec.use_collapse_triangulate = True
    dec.use_symmetry = True
    dec.symmetry_axis = 'X'
    bpy.ops.object.modifier_apply(modifier=dec.name)

# Hạ tay xuống tư thế chữ A: xoay chuỗi Arm quanh vai (đưa cả cánh tay), rồi nướng tư thế làm tư thế nghỉ.
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
bpy.context.view_layer.update()
for side, sx in (('Left', 1.0), ('Right', -1.0)):
    b = pb[f'mixamorig:{side}Arm']
    cur = (pb[f'mixamorig:{side}ForeArm'].head - b.head).normalized()
    ang = math.radians(ARM_DOWN)
    tgt = Vector((sx * math.cos(ang), 0.0, -math.sin(ang)))
    q = cur.rotation_difference(tgt)
    h = b.head.copy()
    b.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ b.matrix
    bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')
mod = body.modifiers.new('Armature', 'ARMATURE')
mod.object = rig
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')
mod = body.modifiers.new('Armature', 'ARMATURE')
mod.object = rig

# ≤ 4 xương/đỉnh, chuẩn hóa.
bpy.context.view_layer.objects.active = body
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
zs = [v.co.z for v in body.data.vertices]
print('BASE', SEX, 'verts', len(body.data.vertices), 'tris', sum(len(p.vertices) - 2 for p in body.data.polygons), 'cao', round(max(zs) - min(zs), 3), 'bones', len(rig.data.bones))

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_skins=True, export_apply=False)
print('OK', OUT)
