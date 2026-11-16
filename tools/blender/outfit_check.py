# Kiểm xuyên lưới bằng số cho mảnh trang phục (T-2): đưa thân nền + mảnh áo vào các tư thế cực biên của những clip khó (chạy sải
# chân, chém giơ tay qua đầu, tay thả cạnh thân, cúi ngự kiếm, ngồi đả tọa, ngã) và đếm đỉnh áo nằm trong phần thân nền còn hiện
# (đầu/cổ/tay; hoặc cả thân với --keep all) cùng độ sâu lớn nhất. Bổ sung cho ảnh chụp theo clip thật trong game
# (`pnpm shots:outfit --matrix 1`): bắt xuyên lưới nhỏ mà mắt khó thấy, chạy được không cần mở game.
#
#   blender --background --factory-startup --python tools/blender/outfit_check.py -- \
#       --player assets/build/raw/chr_kiem_tu_nam.glb --outfit apps/client/public/assets/<mảnh>.<hash>.glb \
#       [--poses run,chop,arms_down,crouch,sit,fall] [--keep kept|head|all] [--tol 0.02] [--out bao-cao.json]
#
# Mỗi tư thế là một nhóm góc quay quanh trục thế giới (đổi sang trục xương q = M⁻¹·R·M như anim_biped_extra.py), chạy ở cả hai chiều
# dấu để khỏi phụ thuộc quy ước trục. Thoát mã 1 nếu độ sâu lớn nhất ở tư thế nào vượt --tol (mét, mặc định 0,02). Không thay ảnh trong game.

import json
import math
import re
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


PLAYER, OUTFIT = arg('--player'), arg('--outfit')
if not (PLAYER and OUTFIT):
    raise SystemExit('cách dùng: --player <glb thô> --outfit <glb mảnh> [--poses a,b] [--keep kept|head|all] [--tol m] [--out json]')
KEEP = arg('--keep', 'kept')
TOL = float(arg('--tol', '0.02'))
WANT = [c for c in (arg('--poses', '') or '').split(',') if c]
RANGE = 0.12


def key(n):
    return re.sub(r'[^a-z0-9]', '', re.sub(r'^mixamorig[:_]?', '', n.lower()))


def keepable(k):
    if KEEP == 'head':  # chỉ đầu/cổ: ống tay áo che bàn tay là chủ ý nên bỏ bàn tay khi soát mảnh đội đầu, cổ áo
        return k.startswith('head') or k.startswith('neck')
    return k.startswith('head') or k.startswith('neck') or 'hand' in k


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    meshes = [o for o in new if o.type == 'MESH' and len(o.data.vertices) > 100]
    return arm, meshes


# Tư thế: { khóa xương chuẩn hóa: (trục thế giới X|Y|Z, độ) }. X = ngang người, Y = trước/sau, Z = lên (Blender, trước mặt = -Y).
POSES = {
    'run': {'leftupleg': ('X', 40), 'rightupleg': ('X', -40), 'leftleg': ('X', -55), 'leftarm': ('X', -35), 'rightarm': ('X', 35), 'leftforearm': ('X', 50), 'rightforearm': ('X', 50), 'spine1': ('X', 10)},
    'chop': {'leftarm': ('X', 150), 'rightarm': ('X', 150), 'leftforearm': ('X', 30), 'rightforearm': ('X', 30), 'spine1': ('X', -15), 'spine': ('X', -10)},
    'arms_down': {'leftarm': ('Y', 70), 'rightarm': ('Y', -70), 'leftforearm': ('Y', 15), 'rightforearm': ('Y', -15)},
    'crouch': {'spine': ('X', 30), 'spine1': ('X', 25), 'leftupleg': ('X', 60), 'rightupleg': ('X', 60), 'leftleg': ('X', -70), 'rightleg': ('X', -70)},
    'sit': {'leftupleg': ('X', 90), 'rightupleg': ('X', 90), 'leftleg': ('X', -110), 'rightleg': ('X', -110), 'leftarm': ('Y', 60), 'rightarm': ('Y', -60)},
    'fall': {'hips': ('X', 80), 'spine1': ('X', 15), 'leftarm': ('X', 40), 'rightarm': ('X', -30), 'leftupleg': ('X', 25)},
}
SIGNS = (1, -1)
AX = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}

bpy.ops.wm.read_factory_settings(use_empty=True)
A, bodies = load(PLAYER)
B, garments = load(OUTFIT)
if not (A and B and bodies and garments):
    raise SystemExit('thiếu armature/mesh trong GLB đầu vào')
body = max(bodies, key=lambda o: len(o.data.vertices))
garment = max(garments, key=lambda o: len(o.data.vertices))  # LOD0
for o in bpy.data.objects:
    if o.type == 'MESH' and o not in (body, garment):
        o.hide_viewport = True
        o.hide_render = True
for arm in (A, B):
    arm.animation_data_clear()
tgt = {arm: {key(b.name): b.name for b in arm.pose.bones} for arm in (A, B)}
vg_names = {g.index: g.name for g in body.vertex_groups}


def apply(arm, pose, sign):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    for k, (axis, deg) in pose.items():
        name = tgt[arm].get(k)
        if not name:
            continue
        pb = arm.pose.bones[name]
        m = pb.bone.matrix_local.to_3x3()
        r = Matrix.Rotation(math.radians(deg * sign), 3, AX[axis])
        pb.rotation_quaternion = (m.inverted() @ r @ m).to_quaternion()


def measure():
    """{chỉ số đỉnh áo: độ sâu (m)} của đỉnh áo đang nằm trong phần thân nền còn hiện, ở tư thế hiện tại."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    bo = body.evaluated_get(dg)
    bm_ = bo.to_mesh()
    verts = [bo.matrix_world @ v.co for v in bm_.vertices]
    faces = []
    for p in bm_.polygons:
        tri = list(p.vertices)
        for i in range(1, len(tri) - 1):
            t = (tri[0], tri[i], tri[i + 1])
            if KEEP == 'all':
                faces.append(t)
                continue
            dom = []
            for vi in t:
                gs = bm_.vertices[vi].groups
                dom.append(vg_names.get(max(gs, key=lambda g: g.weight).group, '') if gs else '')
            if all(d and keepable(key(d)) for d in dom):
                faces.append(t)
    bo.to_mesh_clear()
    out = {}
    if faces:
        tree = BVHTree.FromPolygons(verts, faces)
        go = garment.evaluated_get(dg)
        gm = go.to_mesh()
        for v in gm.vertices:
            p = go.matrix_world @ v.co
            loc, nor, _i, dist = tree.find_nearest(p)
            if loc is not None and dist < RANGE and (p - loc).dot(nor) < 0:
                out[v.index] = dist
        go.to_mesh_clear()
    return out


# Tư thế nghỉ: cổ áo ôm cổ, ống tay ôm cổ tay là chủ ý; chỉ tính đỉnh MỚI chui vào thân so với lúc nghỉ.
for arm in (A, B):
    apply(arm, {}, 1)
rest = measure()
report, fail = {}, False
for pname, pose in POSES.items():
    if WANT and pname not in WANT:
        continue
    worst = (0.0, 1, 0)
    inside_sum = 0
    for sign in SIGNS:
        for arm in (A, B):
            apply(arm, pose, sign)
        now = measure()
        fresh = {i: d for i, d in now.items() if i not in rest or d > rest[i] + 0.005}
        depth = max(fresh.values(), default=0.0)
        inside_sum += len(fresh)
        if depth >= worst[0]:
            worst = (depth, sign, len(fresh))
    entry = {'maxDepth': round(worst[0], 4), 'sign': worst[1], 'insideAtWorst': worst[2], 'meanInside': round(inside_sum / len(SIGNS), 1)}
    report[pname] = entry
    flag = '  VƯỢT' if worst[0] > TOL else ''
    fail = fail or worst[0] > TOL
    print(f'[outfit_check] {pname:10s} đỉnh mới trong TB {entry["meanInside"]:6.1f}  sâu nhất {entry["maxDepth"] * 100:5.2f} cm (dấu {worst[1]:+d}){flag}')
if arg('--out'):
    json.dump({'outfit': OUTFIT, 'keep': KEEP, 'tol': TOL, 'poses': report}, open(arg('--out'), 'w', encoding='utf8'), ensure_ascii=False, indent=2)
raise SystemExit(1 if fail else 0)
