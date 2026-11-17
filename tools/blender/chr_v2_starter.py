# CHR-ROLLOUT: bộ đồ đệ tử tân thủ cho nhân vật nền v2 (thân MakeHuman không có áo). Chạy như `import.post` của import_tripo.py:
# dựng áo + quần + đai + ủng THỦ TỤC từ chính lưới thân `assets/build/raw/<player>.glb` (cùng khung, cùng xương, cùng trọng số) nên không bao giờ
# phồng hay xuyên: mỗi mặt thân thuộc vùng xương nào thì sao chép ra, đẩy theo pháp tuyến một khoảng theo mảnh. Màu phẳng (ô 64² chia 4 ô);
# áo là màu vải tham chiếu `#3B6584` để hệ nhuộm (`dye.ts`) đổi theo màu đạo bào người chơi chọn. Khối `import.starter` trong meta.json:
#   player   id nhân vật đích (GLB thô assets/build/raw/<id>.glb; dựng chr_v2_* trước)
#   tunic, pants, boots, belt   màu hex của từng mảnh (mặc định như dưới)
# Biến nhận từ import_tripo: ASSET_ID, META, REPO, fail.
import json
import math
import os
import re
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Vector

CFG = (META.get('import') or {}).get('starter') or {}  # noqa: F821
if not CFG.get('player'):
    fail('import.starter.player: thiếu id nhân vật')  # noqa: F821
COL = {'tunic': CFG.get('tunic', '#3B6584'), 'pants': CFG.get('pants', '#D9D2C0'), 'boots': CFG.get('boots', '#3B2D25'), 'belt': CFG.get('belt', '#7A5C3A')}
COL['skirt'] = COL['tunic']
OFF = {'tunic': 0.022, 'upper': 0.034, 'fore': 0.05, 'pants': 0.011, 'boots': 0.014, 'belt': 0.03, 'skirt': 0.03}
FLARE = 0.09  # tà áo choàng xòe thêm ở gấu (m)
CELL = {'tunic': (0, 0), 'pants': (1, 0), 'boots': (0, 1), 'belt': (1, 1), 'skirt': (0, 0)}

before = set(bpy.data.objects)
pg = os.path.join(REPO, 'assets', 'build', 'raw', CFG['player'] + '.glb')  # noqa: F821
if not os.path.isfile(pg):
    fail(f'chưa có GLB thô {pg}')  # noqa: F821
bpy.ops.import_scene.gltf(filepath=pg)
new = [o for o in bpy.data.objects if o not in before]
P = next((o for o in new if o.type == 'ARMATURE'), None)
bodies = [o for o in new if o.type == 'MESH']
if not P or not bodies:
    fail('GLB nhân vật thiếu armature/mesh')  # noqa: F821
body = max(bodies, key=lambda o: len(o.data.vertices))
bpy.context.view_layer.update()


def key(n):
    return re.sub(r'[^a-z0-9]', '', re.sub(r'^mixamorig[:_]?', '', n.lower()))


def region_of(k):
    if k.startswith('head') or k.startswith('neck') or 'hand' in k or k.startswith('dtl'):
        return None
    if k in ('spine1', 'spine2') or k.endswith('shoulder'):
        return 'chest'
    if k in ('spine', 'hips'):
        return 'belly'
    if k.endswith('forearm'):
        return 'forearm'
    if k.endswith('arm'):
        return 'upperArm'
    if k.endswith('upleg'):
        return 'thigh'
    if k.endswith('leg'):
        return 'calf'
    if k.endswith('foot') or 'toe' in k:
        return 'foot'
    return None


def bone_z(suffix):
    b = next(b for b in P.data.bones if key(b.name) == suffix)
    return (P.matrix_world @ b.head_local).z


ankle_z = bone_z('leftfoot')
waist_z = (bone_z('spine') + bone_z('hips')) / 2
hips_z = bone_z('hips')
collar_z = bone_z('neck') - 0.005  # đầu xương cổ = chân cổ
knee_z = bone_z('leftleg')

me = body.data
gname = {g.index: g.name for g in body.vertex_groups}
reg = []
for v in me.vertices:
    best, bw = None, 0.0
    for g in v.groups:
        if g.weight > bw:
            bw, best = g.weight, key(gname[g.group])
    reg.append(region_of(best) if best else None)

bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
bm.normal_update()
uvl = bm.loops.layers.uv.active
dl = bm.verts.layers.deform.verify()

PRIO = ['boots', 'belt', 'pants', 'tunic']
faces = []  # (mặt bmesh, mảnh)
for f in bm.faces:
    rs = [reg[v.index] for v in f.verts]
    c0 = f.calc_center_median()
    if collar_z - 0.045 < c0.z < collar_z + 0.03 and abs(c0.x) < 0.17:
        faces.append((f, 'tunic'))  # dải cổ áo: gồm cả mặt thuộc vùng cổ để trùm kín ranh vùng xương (không lòi răng cưa da)
        continue
    ok = [r for r in rs if r]
    if len(ok) < 2:
        continue
    zc = f.calc_center_median().z
    if zc > collar_z + 0.045 and all(r in ('chest', None) for r in rs) and abs(f.calc_center_median().x) < 0.2:
        continue  # cổ áo: cắt ngang một đường sạch thay vì răng cưa theo ranh vùng xương
    cand = set()
    for v, r in zip(f.verts, rs):
        if not r:
            continue
        if r == 'foot' or (r == 'calf' and v.co.z < ankle_z + 0.13):
            cand.add('boots')
        elif r in ('thigh', 'calf'):
            cand.add('pants')
        elif r == 'belly' and abs(zc - waist_z) < 0.03:
            cand.add('belt')
        else:
            cand.add('tunic')
    piece = next(p for p in PRIO if p in cand)
    faces.append((f, piece))

def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


verts = {}
out_v, out_f, out_w, out_uv = [], [], [], []


def vert_of(v, piece, off, horizontal=False, extra=0.0):
    k = (v.index, piece)
    if k not in verts:
        n = Vector((v.normal.x, v.normal.y, 0.0)).normalized() if horizontal and (v.normal.x or v.normal.y) else v.normal
        verts[k] = len(out_v)
        out_v.append(v.co + n * (off + extra))
        out_w.append(sorted(((gname[g], x) for g, x in v[dl].items()), key=lambda a: -a[1])[:4])
    return verts[k]


for f, piece in faces:
    ids = []
    for v in f.verts:
        r = reg[v.index]
        if piece == 'tunic' and r == 'upperArm':
            off = OFF['upper']
        elif piece == 'tunic' and r == 'forearm':
            off = OFF['fore']
        else:
            off = OFF[piece]
        collar = piece == 'tunic' and v.co.z > collar_z - 0.06 and abs(v.co.x) < 0.2
        ids.append(vert_of(v, piece, 0.032 if collar else off, collar))  # gần cổ: đẩy theo hướng ngang để cổ áo trùm lên chân cổ (pháp tuyến ở đây chĩa lên)
    out_f.append(ids)
    cx, cy = CELL[piece]
    out_uv.append(((cx + 0.5) / 2, (cy + 0.5) / 2))

# Tà áo choàng: bản sao các mặt đùi (từ hông tới gối) đẩy theo hướng ngang, xòe dần xuống gấu
for f in bm.faces:
    if not all(reg[v.index] in ('thigh', 'belly') for v in f.verts):
        continue
    zc = f.calc_center_median().z
    if not (knee_z + 0.05 < zc < hips_z + 0.02) or all(reg[v.index] == 'belly' for v in f.verts):
        continue
    ids = [vert_of(v, 'skirt', OFF['skirt'], True, FLARE * smooth((hips_z - v.co.z) / (hips_z - knee_z - 0.05))) for v in f.verts]
    out_f.append(ids)
    out_uv.append(((CELL['skirt'][0] + 0.5) / 2, (CELL['skirt'][1] + 0.5) / 2))
bm.free()
if len(out_f) < 500:
    fail(f'chr_v2_starter: chỉ {len(out_f)} mặt áo, kiểm lại vùng xương')  # noqa: F821

# ---------- ảnh màu 64² (4 ô) ----------
def hexrgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


px = np.ones((64, 64, 4), np.float32)
for piece, (cx, cy) in CELL.items():
    if piece != 'skirt':
        px[cy * 32:(cy + 1) * 32, cx * 32:(cx + 1) * 32, :3] = hexrgb(COL[piece])
tmp = bpy.data.images.new(ASSET_ID + '_gen', 64, 64, alpha=False)  # noqa: F821
tmp.pixels.foreach_set(px.reshape(-1))
tmp.update()
path = os.path.join(tempfile.gettempdir(), ASSET_ID + '_color.png')  # noqa: F821
tmp.filepath_raw = path
tmp.file_format = 'PNG'
tmp.save()
bpy.data.images.remove(tmp)
img = bpy.data.images.load(path)
img.name = ASSET_ID + '_color'  # noqa: F821
img.colorspace_settings.name = 'sRGB'
img.pack()

# ---------- dựng lưới ----------
saved_world = body.matrix_world.copy()
saved_parent_inv = body.matrix_parent_inverse.copy()
saved_basis = body.matrix_basis.copy()
for o in list(bpy.data.objects):
    if o is P:
        continue
    bpy.data.objects.remove(o, do_unlink=True)
gme = bpy.data.meshes.new(ASSET_ID)  # noqa: F821
b2 = bmesh.new()
bv = [b2.verts.new(c) for c in out_v]
uv2 = b2.loops.layers.uv.new('UVMap')
for ids, uv in zip(out_f, out_uv):
    try:
        f = b2.faces.new([bv[i] for i in ids])
    except ValueError:
        continue
    for lp in f.loops:
        lp[uv2].uv = uv
    f.smooth = True
b2.normal_update()
b2.to_mesh(gme)
b2.free()
G = bpy.data.objects.new(ASSET_ID, gme)  # noqa: F821
bpy.context.scene.collection.objects.link(G)
for i, w in enumerate(out_w):
    for n, x in w:
        vg = G.vertex_groups.get(n) or G.vertex_groups.new(name=n)
        vg.add([i], x, 'REPLACE')
# Cổ áo: cắt sạch theo mặt phẳng ngang ở chân cổ (bisect nội suy cả trọng số xương), thay cho răng cưa theo ranh vùng
cb = bmesh.new()
cb.from_mesh(gme)
bmesh.ops.bisect_plane(cb, geom=cb.verts[:] + cb.edges[:] + cb.faces[:], plane_co=(0, 0, collar_z + 0.035), plane_no=(0, 0, 1), clear_outer=True, clear_inner=False)
bmesh.ops.delete(cb, geom=[v for v in cb.verts if not v.link_faces], context='VERTS')
cb.to_mesh(gme)
cb.free()
mat = bpy.data.materials.new(ASSET_ID + '_mat')  # noqa: F821
mat.use_nodes = True
bs = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
tx = mat.node_tree.nodes.new('ShaderNodeTexImage')
tx.image = img
mat.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
bs.inputs['Roughness'].default_value = 0.88
bs.inputs['Metallic'].default_value = 0.0
mat.use_backface_culling = False
gme.materials.append(mat)
G.parent = P
G.matrix_basis = saved_basis
G.matrix_parent_inverse = saved_parent_inv
mod = G.modifiers.new('Armature', 'ARMATURE')
mod.object = P
bpy.context.view_layer.objects.active = G
for o in bpy.data.objects:
    o.select_set(False)
G.select_set(True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
P.animation_data_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
P.name = ASSET_ID + '_rig'  # noqa: F821
P.data.name = ASSET_ID + '_rig'  # noqa: F821
REPORT = {'player': CFG['player'], 'tris': sum(len(p.vertices) - 2 for p in gme.polygons), 'verts': len(gme.vertices), 'pieces': {p: sum(1 for _f, q in faces if q == p) for p in PRIO}}
