# CHR-PROTO: dựng thân nền nam/nữ từ MakeHuman (MPFB2, CC0) → GLB rig Mixamo dùng như `rig_v01.glb` của Tripo cho import_tripo.py.
# Chạy: blender --background --factory-startup --python tools/blender/chr_base_v2.py -- <nam|nu> <thư mục ra> [--tris N] [--blend]
# Cần mã nguồn MPFB2 (git clone --depth 1 https://github.com/makehumancommunity/mpfb2) ở $MPFB_SRC (mặc định
# <dtl-asset-source>/3d/nhan-vat/chr_base_v2/_src/mpfb2/src). MPFB không chạy như addon ở chế độ nền nên vá vài hàm tùy chọn trước khi import.
# Việc làm: macro (Á Đông, trẻ, cao ráo) → rig Mixamo + trọng số MakeHuman (đi kèm MPFB) → bỏ lưới phụ (răng, lưỡi, váy...) giữ thân + mắt
# → giảm mặt đồng đều (Decimate collapse, đối xứng X) → ép tư thế chữ T như asset Tripo → vẽ albedo 1K theo UV MakeHuman
# (da, đồ lót, môi, lông mày, má) → xuất GLB gồm lưới thân (+ đầu tạm) và lưới mắt (hai vật liệu).
# Ra: <thư mục ra>/rig_v01.glb (nguồn cho import_tripo) + preview.json (số liệu).
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SEX = argv[0] if argv else 'nam'
OUT = argv[1] if len(argv) > 1 else os.path.join(os.environ.get('TEMP', '.'), 'chr_v2')
TRIS = int(argv[argv.index('--tris') + 1]) if '--tris' in argv else 6500
SAVE_BLEND = '--blend' in argv
ARM_DOWN = float(argv[argv.index('--arm-down') + 1]) if '--arm-down' in argv else 9.0
os.makedirs(OUT, exist_ok=True)
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
TEX = 1024

# ---------- 1. dựng người ----------
macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1.0 if MALE else 0.0, age=0.5, muscle=0.5 if MALE else 0.42, weight=0.40 if MALE else 0.38,
             proportions=1.0, height=0.62 if MALE else 0.58, cupsize=0.5, firmness=0.7)
macro['race'] = {'asian': 1.0, 'caucasian': 0.0, 'african': 0.0}
body = HumanService.create_human(mask_helpers=False, macro_detail_dict=macro)
body.name = f'chr_v2_{SEX}'
rig = HumanService.add_builtin_rig(body, 'mixamo')
rig.name = f'chr_v2_{SEX}_rig'
print('RIG', len(rig.data.bones), 'bones, verts', len(body.data.vertices))

# nướng shape key vào lưới; gỡ modifier để áp Triangulate/Decimate, gắn armature lại ở cuối
bpy.context.view_layer.objects.active = body
if body.data.shape_keys:
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
for m in list(body.modifiers):
    body.modifiers.remove(m)

# ---------- 2. chỉ giữ thân + mắt ----------
gname = {g.index: g.name for g in body.vertex_groups}
bm = bmesh.new()
bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
KEEP = {'body', 'helper-l-eye', 'helper-r-eye'}
EYE = {'helper-l-eye', 'helper-r-eye'}
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not any(gname.get(i) in KEEP for i in v[dl].keys())], context='VERTS')
bm.to_mesh(body.data)
bm.free()

bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
eye_vs = set()
for v in body.data.vertices:
    names = {body.vertex_groups[g.group].name for g in v.groups}
    if names & EYE and 'body' not in names:
        eye_vs.add(v.index)
for p in body.data.polygons:
    p.select = all(i in eye_vs for i in p.vertices)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='SELECTED')
bpy.ops.object.mode_set(mode='OBJECT')
eyes = [o for o in bpy.context.selected_objects if o != body][0]
eyes.name = f'chr_v2_{SEX}_eyes'
print('body verts', len(body.data.vertices), 'eye verts', len(eyes.data.vertices))


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def apply_mod(obj, mod):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------- 3. giảm mặt thân ----------
bpy.context.view_layer.objects.active = body
tm = body.modifiers.new('tri', 'TRIANGULATE')
apply_mod(body, tm)
n0 = len(body.data.polygons)
dec = body.modifiers.new('dec', 'DECIMATE')
dec.decimate_type = 'COLLAPSE'
dec.ratio = TRIS / n0
dec.use_collapse_triangulate = True
dec.use_symmetry = True
dec.symmetry_axis = 'X'
apply_mod(body, dec)
print('body tris', n0, '->', tri_count(body))
tm = eyes.modifiers.new('tri', 'TRIANGULATE')
apply_mod(eyes, tm)

# ---------- 4. tư thế chữ T (như rig Tripo/Mixamo của các nhân vật hiện có) ----------
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
for side, sx in (('Left', 1.0), ('Right', -1.0)):
    chain = [f'mixamorig:{side}Arm', f'mixamorig:{side}ForeArm', f'mixamorig:{side}Hand']
    for i in range(2):
        b0 = chain[i]
        bpy.context.view_layer.update()
        cur = (pb[chain[i + 1]].head - pb[chain[i]].head).normalized()
        # Hướng nghỉ đo từ chr_kiem_tu_nam (thư viện clip chung được dựng trên đó): tay trên chúc xuống 10,3°, cẳng tay gập ra trước 21° (-Y).
        tgt = Vector((sx * math.cos(math.radians(10.3)), 0, -math.sin(math.radians(10.3)))) if i == 0 else Vector((sx * 0.93, -0.363, -0.059)).normalized()
        # Thân MakeHuman vai rộng, tay dài hơn: hạ thêm ARM_DOWN° để tay buông sát thân (clip chung xoay quanh tư thế nghỉ nên mọi clip lệch cùng một góc).
        hx, hy = tgt.x, tgt.y
        hl = math.hypot(hx, hy)
        ang = math.asin(max(-1.0, min(1.0, -tgt.z))) + math.radians(ARM_DOWN)
        tgt = Vector((hx / hl * math.cos(ang), hy / hl * math.cos(ang), -math.sin(ang)))
        q = cur.rotation_difference(tgt)
        h = pb[b0].head.copy()
        r = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h)
        pb[b0].matrix = r @ pb[b0].matrix
        bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')

for obj in (body, eyes):
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    apply_mod(obj, mod)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')
for obj in (body, eyes):
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
bpy.context.view_layer.update()

# ---------- 5. vẽ albedo 1K theo UV MakeHuman ----------
zs = [v.co.z for v in body.data.vertices]
ZMIN, ZMAX = min(zs), max(zs)
H = ZMAX - ZMIN


def vgroup_weight(name):
    w = np.zeros(len(body.data.vertices), np.float32)
    if name in body.vertex_groups:
        gi = body.vertex_groups[name].index
        for v in body.data.vertices:
            for g in v.groups:
                if g.group == gi:
                    w[v.index] = g.weight
    return w


chan = {k: vgroup_weight(k) for k in ('lips', 'nipple', 'fingernails', 'toenails', 'ears')}
me = body.data
uvl = me.uv_layers.active.data
me.calc_loop_triangles()
P = np.zeros((TEX, TEX, 3), np.float32)
CH = np.zeros((TEX, TEX, len(chan)), np.float32)
COV = np.zeros((TEX, TEX), bool)
keys = list(chan.keys())
cw = np.stack([chan[k] for k in keys], 1)
vco = np.array([v.co[:] for v in me.vertices], np.float32)
for tri in me.loop_triangles:
    uv = np.array([uvl[l].uv[:] for l in tri.loops], np.float32) * TEX
    x0, y0 = np.floor(uv.min(0)).astype(int)
    x1, y1 = np.ceil(uv.max(0)).astype(int)
    x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0)
    x1, y1 = min(x1 + 1, TEX - 1), min(y1 + 1, TEX - 1)
    if x1 < x0 or y1 < y0:
        continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    a, b, c = uv
    den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(den) < 1e-9:
        continue
    l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
    l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den
    l3 = 1 - l1 - l2
    eps = -0.02
    m = (l1 >= eps) & (l2 >= eps) & (l3 >= eps)
    if not m.any():
        continue
    vi = tri.vertices
    pos = l1[..., None] * vco[vi[0]] + l2[..., None] * vco[vi[1]] + l3[..., None] * vco[vi[2]]
    chv = l1[..., None] * cw[vi[0]] + l2[..., None] * cw[vi[1]] + l3[..., None] * cw[vi[2]]
    ys, xs = np.nonzero(m)
    P[y0 + ys, x0 + xs] = pos[ys, xs]
    CH[y0 + ys, x0 + xs] = chv[ys, xs]
    COV[y0 + ys, x0 + xs] = True

ec = np.array([v.co[:] for v in eyes.data.vertices], np.float32)
eL = ec[ec[:, 0] > 0].mean(0)
eR = ec[ec[:, 0] < 0].mean(0)
eye_z, eye_y, eye_x = float(eL[2]), float(eL[1]), float(eL[0])
print('eye', eL, eR, 'H', H)
X, Y, Z = P[..., 0], P[..., 1], P[..., 2]
zn = (Z - ZMIN) / H
ax = np.abs(X)
S = H / 1.75  # đổi mét chuẩn → đơn vị raw


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def srgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


rng = np.random.default_rng(7)


def lowfreq(sc, amp):
    g = rng.standard_normal((TEX // sc + 2, TEX // sc + 2)).astype(np.float32)
    big = np.kron(g, np.ones((sc, sc), np.float32))[:TEX, :TEX]
    k = np.ones(sc, np.float32) / sc
    big = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, big)
    big = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 0, big)
    return big * amp


def mix(c, color, amt):
    return c * (1 - amt[..., None]) + color * amt[..., None]


SKIN = srgb('#DEB591') if MALE else srgb('#E6BF9C')
col = np.tile(SKIN, (TEX, TEX, 1))
col *= (1 + lowfreq(24, 0.05))[..., None]
face = ((Y < eye_y + 0.02 * S) & (zn > 0.88) & (ax < 0.09 * S)).astype(np.float32)
cheek = np.exp(-(((ax - 0.042 * S) / (0.022 * S)) ** 2 + ((Z - (eye_z - 0.045 * S)) / (0.03 * S)) ** 2)) * face
col = mix(col, srgb('#D98277'), 0.22 * cheek)
ears = np.clip(CH[..., keys.index('ears')], 0, 1)
col = mix(col, srgb('#D79A86'), 0.35 * ears)
nail = np.clip(CH[..., keys.index('fingernails')] + CH[..., keys.index('toenails')], 0, 1)
col = mix(col, srgb('#F0CDBD'), 0.6 * nail)
nip = np.clip(CH[..., keys.index('nipple')], 0, 1)
col = mix(col, srgb('#B6806A'), 0.8 * nip)
lips = smooth(0.35, 0.9, CH[..., keys.index('lips')])
col = mix(col, srgb('#B5625E') if not MALE else srgb('#B97467'), 0.6 * lips)

# lông mày
brow_z = eye_z + 0.030 * S
bx = (ax - 0.010 * S) / (0.058 * S)
arch = 0.0075 * S * np.sin(np.clip(bx, 0, 1) * math.pi * 0.85)
thick = (0.0095 if MALE else 0.0055) * S * (1 - 0.55 * np.clip(bx, 0, 1)) * 0.5
brow = smooth(0.0, 0.15, bx) * smooth(1.05, 0.85, bx)
brow = brow * (1 - smooth(0.6, 1.0, np.abs(Z - (brow_z + arch)) / (thick + 1e-6))) * face
col = mix(col, srgb('#2B2624'), 0.9 * brow)
for ex in (eye_x, -eye_x):
    dx = (X - ex) / (0.016 * S)
    dz = (Z - eye_z) / (0.0075 * S)
    r = np.sqrt(dx * dx + dz * dz)
    lid = smooth(1.15, 0.95, r) * smooth(0.55, 0.9, r) * (dz > -0.2) * face
    col = mix(col, srgb('#3A2B28'), 0.55 * lid)
    sock = smooth(2.6, 1.0, r) * face * 0.10
    col = mix(col, srgb('#B98A78'), sock)

# tóc vẽ thẳng lên da đầu (không thêm lưới mũ tóc): mặt nạ theo vị trí 3D, đường chân tóc mịn
hw_ = vgroup_weight('mixamorig:Head')
cx_head = float(np.mean([v.co.y for v in body.data.vertices if hw_[v.index] > 0.9]))
front_z = eye_z + (0.040 if not MALE else 0.066) * S
fr = (Y < cx_head - 0.02 * S) & (ax < 0.075 * S)
sd = (ax >= 0.075 * S) & (Y < cx_head)
hair_m = np.where(fr, Z > front_z + 0.0012 * S * np.sin(ax * 260 / S), np.where(sd, Z > eye_z + 0.035 * S, Z > eye_z - 0.06 * S))
hair_m = hair_m & (zn > 0.88) & (CH[..., keys.index('ears')] < 0.2)
hair_soft = smooth(0, 1, hair_m.astype(np.float32) * 1.0)
for _ in range(2):  # làm mềm mép vài điểm ảnh
    hair_soft = (hair_soft + np.roll(hair_soft, 1, 0) + np.roll(hair_soft, -1, 0) + np.roll(hair_soft, 1, 1) + np.roll(hair_soft, -1, 1)) / 5
streak = 0.5 + 0.5 * np.sin(X * 520 + np.sin(Z * 90) * 1.4 + Y * 60)
HAIRC = srgb('#1C1C21') * (0.8 + 0.5 * streak[..., None])
col = mix(col, HAIRC, np.clip(hair_soft * 1.4 - 0.2, 0, 1))

# đồ lót bó trung tính
CLOTH = srgb('#6C6A68')
TRIM = srgb('#4A4947')
top, hem = (0.567, 0.405) if MALE else (0.553, 0.455)
brief_m = smooth(top, top - 0.004, zn) * smooth(hem, hem + 0.004, zn) * (zn < 0.64)
cloth_m = brief_m
band = np.maximum(smooth(top - 0.014, top - 0.002, zn), smooth(hem + 0.012, hem + 0.002, zn)) * brief_m
if not MALE:
    bra = smooth(0.690, 0.694, zn) * smooth(0.742, 0.738, zn) * (ax < 0.145 * H)
    cloth_m = np.maximum(cloth_m, bra)
    band = np.maximum(band, np.maximum(smooth(0.730, 0.739, zn), smooth(0.700, 0.691, zn)) * bra)
weave = 1 + 0.03 * np.sin(Z * 1100) * np.sin(X * 1100)
cl = (CLOTH * (1 - band[..., None]) + TRIM * band[..., None]) * weave[..., None]
col = mix(col, cl, cloth_m)

# lấp ngoài đảo UV: kéo màu từ lân cận
img = np.where(COV[..., None], col, 0).astype(np.float32)
m = COV.copy()
for _ in range(6):
    acc = np.zeros_like(img)
    cnt = np.zeros(m.shape, np.float32)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        sm = np.roll(np.roll(m, dy, 0), dx, 1)
        si = np.roll(np.roll(img, dy, 0), dx, 1)
        add = sm & ~m
        acc += np.where(add[..., None], si, 0)
        cnt += add
    fill = cnt > 0
    img = np.where(fill[..., None], acc / np.maximum(cnt, 1)[..., None], img)
    m = m | fill
img = np.where(m[..., None], img, SKIN)
img = np.clip(img, 0, 1)

# Atlas một vật liệu (game dùng chung vật liệu của lưới đầu cho cả nhân vật): da ở 7/8 dưới (UV thân co v × 0,875), dải trên: mắt (trái) và màu tóc (phải).
BODY_V = 0.875
ROWS = int(TEX * BODY_V)
src_rows = np.linspace(0, TEX - 1, ROWS)
body_img = np.stack([np.stack([np.interp(src_rows, np.arange(TEX), img[:, x, c]) for x in range(TEX)], 1) for c in range(3)], 2)
atlas = np.zeros((TEX, TEX, 3), np.float32)
atlas[:ROWS] = body_img
strip = TEX - ROWS  # 128 hàng

EW, EH = 256, strip
yy, xx = np.mgrid[0:EH, 0:EW].astype(np.float32)
du = ((xx + 0.5) / EW - 0.5) * 2 * math.pi
dv = ((yy + 0.5) / EH - 0.5) * math.pi
dist = np.sqrt((du * np.cos(dv)) ** 2 + dv ** 2)
iris_r, pup_r = math.radians(31), math.radians(12)
t = np.clip(dist / iris_r, 0, 1)
ic = srgb('#7A5336') * (1 - t[..., None]) + srgb('#4A3022') * t[..., None]
eimg = np.where((dist < iris_r)[..., None], ic, srgb('#EDE7DF'))
eimg = np.where((dist < pup_r)[..., None], srgb('#0E0B0A'), eimg)
edge = smooth(iris_r * 0.82, iris_r, dist) * (dist < iris_r)
eimg = mix(eimg, srgb('#1D120C'), 0.5 * edge)
atlas[ROWS:, :EW] = np.clip(eimg, 0, 1)
atlas[ROWS:, EW:512] = srgb('#7A5336') * 0.0 + srgb('#26262B')  # chỗ trống: nền tối
atlas[ROWS:, 512:] = srgb('#1E1E22')  # màu tóc (tóc đen xanh)

rgba = np.concatenate([np.clip(atlas, 0, 1), np.ones((TEX, TEX, 1), np.float32)], 2)
im = bpy.data.images.new(f'chr_v2_{SEX}_color', TEX, TEX, alpha=False)
im.colorspace_settings.name = 'sRGB'
im.pixels.foreach_set(rgba.ravel())
im.pack()


def mat_with(name, image, rough):
    mt = bpy.data.materials.new(name)
    mt.use_nodes = True
    nt = mt.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = image
    nt.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    return mt


SKIN_MAT = mat_with(f'chr_v2_{SEX}_skin', im, 0.62)
body.data.materials.clear()
body.data.materials.append(SKIN_MAT)
# UV thân co vào 7/8 dưới
for lp in body.data.uv_layers.active.data:
    lp.uv = (lp.uv[0], lp.uv[1] * BODY_V)
# mắt: UV cầu quanh tâm mỗi mắt → ô mắt của atlas
emesh = eyes.data
while len(emesh.uv_layers):
    emesh.uv_layers.remove(emesh.uv_layers[0])
euv = emesh.uv_layers.new(name='UVMap')
for poly in emesh.polygons:
    for li in poly.loop_indices:
        v = emesh.vertices[emesh.loops[li].vertex_index].co
        c = eL if v.x > 0 else eR
        d = Vector((v.x - c[0], v.y - c[1], v.z - c[2]))
        d.normalize()
        u = math.atan2(d.x, -d.y) / (2 * math.pi) + 0.5
        vv_ = math.asin(max(-1, min(1, d.z))) / math.pi + 0.5
        euv.data[li].uv = (u * EW / TEX, BODY_V + vv_ * strip / TEX)
emesh.materials.clear()
emesh.materials.append(SKIN_MAT)

# ---------- 5b. tóc thủ tục tạm (thay bằng tóc Tripo của người dùng khi có) ----------
# Mũ tóc = bản sao các mặt đầu phía trên đường chân tóc, đẩy ra theo pháp tuyến; nam: búi cao + đuôi dài; nữ: buộc cao + mái.
back_y = max(v.co.y for v in body.data.vertices if ZMIN + 0.62 * H < v.co.z < ZMIN + 0.82 * H)
head_top = max(v.co.z for v in body.data.vertices)
hair_me = bpy.data.meshes.new(f'chr_v2_{SEX}_hair')
hair = bpy.data.objects.new(f'chr_v2_{SEX}_hair', hair_me)
bpy.context.collection.objects.link(hair)


def add_loft(bm, path_pts, radii, sides=8, squash=0.55):
    """Ống tiết diện elip đi theo đường cong, hai đầu bịt."""
    rings = []
    n = len(path_pts)
    for i, (p, r) in enumerate(zip(path_pts, radii)):
        t = (path_pts[min(i + 1, n - 1)] - path_pts[max(i - 1, 0)]).normalized()
        a = Vector((1, 0, 0))
        b = t.cross(a).normalized()
        a = b.cross(t).normalized()
        ring = []
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + a * math.cos(ang) * r + b * math.sin(ang) * r * squash))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])


bm2 = bmesh.new()
bm2.from_mesh(hair_me)
ztop = head_top + 0.0075 * S
if MALE:
    # búi cao ở đỉnh đầu + đuôi dài buông sau lưng
    ctr = Vector((0, cx_head + 0.012 * S, ztop + 0.018 * S))
    bmesh.ops.create_uvsphere(bm2, u_segments=10, v_segments=7, radius=0.030 * S, matrix=__import__('mathutils').Matrix.Translation(ctr))
    pts = []
    N = 12
    for i in range(N):
        t = i / (N - 1)
        y0 = cx_head + 0.06 * S
        y1 = back_y + 0.028 * S
        k = min(1.0, t / 0.45)
        pts.append(Vector((0.004 * S * math.sin(t * 6), y0 + (y1 - y0) * k * k * (3 - 2 * k) + 0.012 * S * math.sin(t * 3), ztop - 0.01 * S - 0.62 * H * t * 0.62)))
    add_loft(bm2, pts, [0.034 * S - 0.018 * S * (i / (N - 1)) ** 1.2 for i in range(N)], squash=0.5)
else:
    # buộc cao ở sau đỉnh đầu + đuôi dài
    base = Vector((0, cx_head + 0.045 * S, ztop - 0.012 * S))
    pts = []
    N = 12
    for i in range(N):
        t = i / (N - 1)
        y1 = back_y + 0.028 * S - base.y
        k = min(1.0, t / 0.5)
        pts.append(base + Vector((0.004 * S * math.sin(t * 5), 0.03 * S * math.sin(min(t * 2.2, 1.57)) + y1 * k * k * (3 - 2 * k), -(0.50 * H * 0.68) * t - 0.02 * S * math.sin(t * 3))))
    add_loft(bm2, pts, [0.038 * S - 0.020 * S * (i / (N - 1)) ** 1.2 for i in range(N)], squash=0.5)
    bmesh.ops.create_uvsphere(bm2, u_segments=8, v_segments=6, radius=0.022 * S, matrix=__import__('mathutils').Matrix.Translation(base))
bm2.normal_update()
bm2.to_mesh(hair_me)
bm2.free()
hair.parent = rig
hm = hair.modifiers.new('Armature', 'ARMATURE')
hm.object = rig
hg = hair.vertex_groups.new(name='mixamorig:Head')
hg.add(list(range(len(hair_me.vertices))), 1.0, 'REPLACE')
hair_me.materials.append(SKIN_MAT)
huv = hair_me.uv_layers[0] if len(hair_me.uv_layers) else hair_me.uv_layers.new(name='UVMap')  # mũ tóc sao từ thân nên đã có UV thân: ghi đè hết
for lp in huv.data:
    lp.uv = (0.75, BODY_V + 0.5 * strip / TEX)
for p in hair_me.polygons:
    p.use_smooth = True

# ---------- 6. gộp thân + mắt + tóc thành một lưới (một vật liệu, một draw call), dọn nhóm đỉnh, giới hạn 4 ảnh hưởng ----------
# Trọng số mắt từ MPFB không đáng tin (đỉnh rời thân): gán cứng 100% xương đầu.
for vg in list(eyes.vertex_groups):
    eyes.vertex_groups.remove(vg)
eg = eyes.vertex_groups.new(name='mixamorig:Head')
eg.add(list(range(len(eyes.data.vertices))), 1.0, 'REPLACE')
for obj in (body, eyes, hair):
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    for vg in list(obj.vertex_groups):
        if not vg.name.startswith('mixamorig:'):
            obj.vertex_groups.remove(vg)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
bpy.ops.object.select_all(action='DESELECT')
for o in (body, eyes, hair):
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
bpy.ops.object.shade_smooth()
am = body.modifiers.new('Armature', 'ARMATURE')
am.object = rig

# ---------- 7. xuất ----------
bpy.ops.object.select_all(action='DESELECT')
for o in (body, rig):
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
glb = os.path.join(OUT, 'rig_v01.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_yup=True, export_skins=True,
                          export_animations=False, export_apply=False, export_image_format='AUTO', export_materials='EXPORT')
info = {'sex': SEX, 'bodyTris': tri_count(body), 'height': H, 'bones': len(rig.data.bones), 'glb': glb}
json.dump(info, open(os.path.join(OUT, 'preview.json'), 'w'), indent=1)
if SAVE_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'chr_v2_{SEX}.blend'))
print('DONE', info)
