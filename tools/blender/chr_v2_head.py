# CHR-PROTO giai đoạn 2: thay đầu + tóc tạm của thân nền v2 bằng đầu + tóc Tripo do người dùng dựng.
# Chạy (sau chr_base_v2.py --blend):
#   blender --background --factory-startup --python tools/blender/chr_v2_head.py -- <nam|nu> <chr_v2_<giới>.blend> <raw_head.glb> <raw_hair.glb> <thư mục ra> [--cfg '{"hs":1,"dx":0,"dy":0,"dz":0}'] [--cut 0.45]
# Việc làm:
#   1. Bỏ đầu tạm: mặt thuộc dải mắt/tóc của atlas cũ (v > 0,88), rồi cắt thân ở mặt phẳng ngang Zc giữa cổ (bisect, bỏ phần trên).
#   2. Khớp đầu Tripo (cao 1 m, gồm cổ + vai trên): tỉ lệ theo bề ngang sọ ở lát rộng nhất so với đầu MakeHuman cũ; cắt bỏ phần dưới Zc.
#   3. Hàn cổ: bridge hai viền cắt (đỉnh khác số lượng vẫn nối được), UV các mặt nối lấy theo da thân; trọng số cổ chuyển Neck → Head theo độ cao.
#   4. Màu da thân khớp da cổ của đầu Tripo (nhân màu lên pixel gần màu da cũ, không đụng đồ lót).
#   5. Tóc Tripo úp lên đầu (tỉ lệ theo bề ngang mũ tóc), gán 100% xương Head; xương lò xo cho đuôi/mái thêm ở bước import (chr_v2_post.py).
#   6. Atlas 2048²: thân (trái trên) | đầu (phải trên) | tóc (trái dưới) | trống (phải dưới); một vật liệu, một lưới → rig_v01.glb.
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SEX, BLEND, HEAD_GLB, HAIR_GLB, OUT = argv[:5]
CFG = json.loads(argv[argv.index('--cfg') + 1]) if '--cfg' in argv else {}
CUT = float(argv[argv.index('--cut') + 1]) if '--cut' in argv else 0.45
MALE = SEX == 'nam'
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
body = next(o for o in bpy.data.objects if o.type == 'MESH')
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for m in list(body.modifiers):
    body.modifiers.remove(m)
OLD_SKIN = np.array([0xDE, 0xB5, 0x91] if MALE else [0xE6, 0xBF, 0x9C], np.float32) / 255
ATL = 2048
Q = 1024


def srgb_img(img):
    """Pixel thô (mã sRGB, không đổi sang tuyến tính) của ảnh Blender: hàng 0 = đáy ảnh."""
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[..., :3].copy()


def load_tripo(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    ob = next(o for o in new if o.type == 'MESH')
    me = ob.data
    me.transform(ob.matrix_world)
    ob.parent = None
    ob.matrix_world.identity()
    for o in new:
        if o is not ob:
            bpy.data.objects.remove(o)
    bsdf = next(n for n in ob.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    img = bsdf.inputs['Base Color'].links[0].from_node.image
    px = srgb_img(img)
    n = px.shape[0] // Q
    px = px.reshape(Q, n, Q, n, 3).mean((1, 3))  # 2048 → 1024
    return ob, px


def soften_skin(px):
    """Giảm vệt bóng bake trong texture da (sáng chói) và độ cam: nén sáng phía trên trung vị, giảm bão hòa nhẹ."""
    lum = px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    med = float(np.median(lum[lum > 0.15]))
    l2 = np.where(lum > med, med + (lum - med) * 0.45, lum)
    out = px * (l2 / np.maximum(lum, 1e-4))[..., None]
    g = out.mean(-1, keepdims=True)
    return np.clip(g + (out - g) * 0.86, 0, 1)


def verts_np(ob):
    return np.array([v.co[:] for v in ob.data.vertices], np.float32)


def widest(vs, z0, z1, step, band):
    """Lát ngang rộng nhất (theo x) trong [z0, z1]: (z, bề ngang, tâm x, tâm y)."""
    best = (z0, 0, 0, 0)
    for z in np.arange(z0, z1, step):
        s = vs[np.abs(vs[:, 2] - z) < band]
        if len(s) < 8:
            continue
        w = float(s[:, 0].max() - s[:, 0].min())
        if w > best[1]:
            best = (float(z), w, float((s[:, 0].max() + s[:, 0].min()) / 2), float(s[:, 1].mean()))
    return best


def bone_head(name):
    return float(rig.data.bones[name].head_local.z)


zn, zh = bone_head('mixamorig:Neck'), bone_head('mixamorig:Head')

# ---------- đầu MakeHuman cũ: số đo trước khi bỏ ----------
bv = verts_np(body)
uv_l = body.data.uv_layers.active.data
sel = bv[bv[:, 2] > zh]
mh = widest(sel, zh + 0.02, float(bv[:, 2].max()) - 0.03, 0.003, 0.004)
print('MH skull', mh, 'zn', zn, 'zh', zh)

# ---------- 1. bỏ đầu tạm + cắt thân ở Zc ----------
bm = bmesh.new()
bm.from_mesh(body.data)
uvk = bm.loops.layers.uv.active
kill = [f for f in bm.faces if sum(l[uvk].uv.y for l in f.loops) / len(f.loops) > 0.88]
# nhãn cầu tạm (dải UV bên trái của atlas cũ): lấy tâm hai mắt để làm sáng mắt trên texture Tripo
eye_pts = [v.co.copy() for f in kill if sum(l[uvk].uv.x for l in f.loops) / len(f.loops) < 0.25 for v in f.verts]
EYES = None
if eye_pts:
    el = [p_ for p_ in eye_pts if p_.x > 0]
    er = [p_ for p_ in eye_pts if p_.x < 0]
    if el and er:
        EYES = (sum(el, Vector()) / len(el), sum(er, Vector()) / len(er))
bmesh.ops.delete(bm, geom=kill, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
Zc = zn + CUT * (zh - zn)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, Zc), plane_no=(0, 0, 1), clear_outer=True, clear_inner=False)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
for f in bm.faces:
    for l in f.loops:
        u, v = l[uvk].uv
        l[uvk].uv = (u * 0.5, 0.5 + (v / 0.875) * 0.5)  # thân → ô trái trên của atlas 2048
bm.to_mesh(body.data)
bm.free()
n_body = len(body.data.vertices)
print('body verts', n_body, 'Zc', Zc)

# ---------- 2. đầu Tripo ----------
head, head_px = load_tripo(HEAD_GLB)
head_px = soften_skin(head_px)
# Tinh chỉnh mặt (giảm gắt): da ấm hơn một chút, giảm tương phản quanh trung bình
head_px = np.clip(head_px * np.array([1.035, 1.0, 0.965], np.float32), 0, 1)
_m = head_px.reshape(-1, 3).mean(0)
head_px = np.clip(_m + (head_px - _m) * 0.92, 0, 1)
hv = verts_np(head)
tw = widest(hv, 0.42, 0.98, 0.01, 0.012)
s = mh[1] / tw[1]
hs_cfg = float(CFG.get('head_s', 1.0))
s *= hs_cfg
off = Vector((-s * tw[2], mh[3] - s * tw[3] + float(CFG.get('head_dy', 0)), mh[0] - s * tw[0] + float(CFG.get('head_dz', 0))))
for v in head.data.vertices:
    v.co = v.co * s + off
print('head scale', s, 'offset', off, 'bottom z', min(v.co.z for v in head.data.vertices), 'top', max(v.co.z for v in head.data.vertices))

uvh = head.data.uv_layers.active.data
vi_uv = {}
for p_ in head.data.polygons:
    for li in p_.loop_indices:
        vi_uv.setdefault(head.data.loops[li].vertex_index, uvh[li].uv[:])
# mặt (má, mũi): đỉnh phía trước ngang tầm mắt, lấy trung vị texture; da thân = trung bình cổ + mặt cho đỡ lệch tông khi thân sáng hơn cổ (cổ nằm trong bóng bake)
face_s = []
for vi, uv in vi_uv.items():
    c_ = head.data.vertices[vi].co
    if c_.y < mh[3] - 0.05 and abs(c_.x) < 0.05 and mh[0] - 0.09 < c_.z < mh[0] + 0.02:
        face_s.append(head_px[min(Q - 1, max(0, int(uv[1] * Q))), min(Q - 1, max(0, int(uv[0] * Q)))])
face_col = np.median(np.array(face_s), 0) if len(face_s) > 20 else None
# mắt sáng hơn: làm sáng vùng texel quanh hai mắt (đỉnh đầu Tripo gần vị trí nhãn cầu cũ ở mặt trước)
if EYES is not None:
    yy_, xx_ = np.mgrid[0:Q, 0:Q].astype(np.float32)
    boost = np.zeros((Q, Q), np.float32)
    for e in EYES:
        sel = [uv for vi, uv in vi_uv.items() if abs(head.data.vertices[vi].co.x - e.x) < 0.012 and abs(head.data.vertices[vi].co.z - e.z) < 0.012 and head.data.vertices[vi].co.y < mh[3] - 0.03]
        if len(sel) < 3:
            continue
        cu = float(np.mean([u[0] for u in sel])) * Q
        cv = float(np.mean([u[1] for u in sel])) * Q
        r = float(CFG.get('eye_r', 26))
        boost = np.maximum(boost, np.exp(-(((xx_ - cu) ** 2 + (yy_ - cv) ** 2) / (2 * (r * 0.55) ** 2))))
    lum_ = head_px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    head_px = np.clip(head_px * (1 + float(CFG.get('eye_gain', 0.22)) * boost[..., None] * np.clip((lum_ - 0.18) / 0.3, 0, 1)[..., None]), 0, 1)
# cắt phần dưới Zc (vai Tripo) và nối
bm = bmesh.new()
bm.from_mesh(head.data)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, Zc), plane_no=(0, 0, 1), clear_outer=False, clear_inner=True)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
uvk = bm.loops.layers.uv.active
ring = []
for f in bm.faces:
    for l in f.loops:
        u, v = l[uvk].uv
        if abs(l.vert.co.z - Zc) < 2e-5:
            ring.append(head_px[min(Q - 1, max(0, int(v * Q))), min(Q - 1, max(0, int(u * Q)))])
        l[uvk].uv = (0.5 + u * 0.5, 0.5 + v * 0.5)
neck_col = np.mean(np.array(ring), 0) if ring else OLD_SKIN
if face_col is not None:
    neck_col = 0.8 * neck_col + 0.2 * face_col
print('neck colour (vòng cắt)', neck_col, 'old skin', OLD_SKIN, 'samples', len(ring))
bm.to_mesh(head.data)
bm.free()

# ---------- 3. gộp + hàn cổ ----------
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
head.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
bm = bmesh.new()
bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
dl = bm.verts.layers.deform.verify()
uvk = bm.loops.layers.uv.active
gi = {g.name: g.index for g in body.vertex_groups}
GN, GH = gi['mixamorig:Neck'], gi['mixamorig:Head']
for v in bm.verts:
    if v.index >= n_body:
        t = min(1.0, max(0.0, (v.co.z - zn) / (zh - zn)))
        t = t * t * (3 - 2 * t)
        v[dl].clear()
        v[dl][GN] = 1 - t
        v[dl][GH] = t
loop_e = [e for e in bm.edges if e.is_boundary and abs(e.verts[0].co.z - Zc) < 2e-5 and abs(e.verts[1].co.z - Zc) < 2e-5]
print('seam edges', len(loop_e), 'body', sum(1 for e in loop_e if e.verts[0].index < n_body), 'head', sum(1 for e in loop_e if e.verts[0].index >= n_body))
res = bmesh.ops.bridge_loops(bm, edges=loop_e, use_pairs=False, use_cyclic=True, use_merge=False)
# UV mặt nối: đỉnh phía đầu mượn UV của đỉnh thân gần nhất trong cùng mặt (cả dải dùng da thân)
for f in res['faces']:
    body_l = [l for l in f.loops if l.vert.index < n_body]
    if not body_l:
        continue
    for l in f.loops:
        if l.vert.index >= n_body:
            near = min(body_l, key=lambda b: (b.vert.co - l.vert.co).length)
            l[uvk].uv = near[uvk].uv.copy()
        else:
            # đỉnh thân: UV theo một loop khác (không phải mặt nối) của chính đỉnh
            for o in l.vert.link_loops:
                if o.face not in res['faces']:
                    l[uvk].uv = o[uvk].uv.copy()
                    break
for f in bm.faces:
    f.smooth = True
bm.to_mesh(body.data)
bm.free()

# ---------- 4. atlas ----------
im_old = next(i for i in bpy.data.images if i.name.endswith('_color') and i.size[0] == 1024)
old = srgb_img(im_old)  # 1024², dải trên 128 hàng là mắt/tóc tạm
body_tex = old[: int(1024 * 0.875)]
body_tex = np.stack([np.stack([np.interp(np.linspace(0, body_tex.shape[0] - 1, 1024), np.arange(body_tex.shape[0]), body_tex[:, x, c]) for x in range(1024)], 1) for c in range(3)], 2)
ratio = neck_col / np.maximum(OLD_SKIN, 1e-3)
dist2 = ((body_tex - OLD_SKIN) ** 2).sum(-1)
mask = np.exp(-dist2 / (2 * 0.07 ** 2))
body_tex = np.clip(body_tex * (1 + (ratio - 1) * mask[..., None]), 0, 1)
hair, hair_px = load_tripo(HAIR_GLB)
atlas = np.empty((ATL, ATL, 3), np.float32)
atlas[:] = neck_col
atlas[Q:, :Q] = body_tex
atlas[Q:, Q:] = head_px
# Nhuộm áo của game (dye.ts) coi vùng sáng/bão hòa xanh là vải: nén sáng + gần trung tính cho tóc để tóc không đổi màu theo bộ.
lum = hair_px @ np.array([0.2126, 0.7152, 0.0722], np.float32)
l2 = np.clip(lum * 0.55, 0.0, 0.19)
hair_px = l2[..., None] * np.array([1.06, 1.0, 0.94], np.float32)
atlas[:Q, :Q] = hair_px
rgba = np.concatenate([atlas, np.ones((ATL, ATL, 1), np.float32)], 2)
im = bpy.data.images.new(f'chr_v2_{SEX}_color', ATL, ATL, alpha=False)
im.colorspace_settings.name = 'sRGB'
im.pixels.foreach_set(rgba.ravel())
im.pack()
mt = bpy.data.materials.new(f'chr_v2_{SEX}_skin')
mt.use_nodes = True
bsdf = next(n for n in mt.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
tx = mt.node_tree.nodes.new('ShaderNodeTexImage')
tx.image = im
mt.node_tree.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.82
bsdf.inputs['Metallic'].default_value = 0.0
body.data.materials.clear()
body.data.materials.append(mt)

# ---------- 5. tóc ----------
hvs = verts_np(hair)
cap = widest(hvs, float(CFG.get('cap_z0', 0.74)), float(CFG.get('cap_z1', 0.92)), 0.01, 0.012)
hair_top_target = max(v.co.z for v in head.data.vertices) if False else mh[0] + float(CFG.get('cap_up', 0.02))
hsc = (mh[1] * float(CFG.get('hair_w', 1.08))) / cap[1]
hoff = Vector((-hsc * cap[2] + float(CFG.get('dx', 0)), mh[3] - hsc * cap[3] + float(CFG.get('dy', 0)), hair_top_target - hsc * cap[0] + float(CFG.get('dz', 0))))
for v in hair.data.vertices:
    v.co = v.co * hsc + hoff
# Phần tóc buông thấp hơn đầu không được xuyên thân: đẩy ra mặt trước/sau thân (đỉnh nằm giữa hai mặt thì sang phía gần hơn) + khe hở.
# Tóc buông thấp hơn đầu không được xuyên thân/vai: đỉnh nằm trong thân bị đẩy ra mặt sau (đuôi, tóc xõa sau lưng) hoặc mặt trước (mái, tóc mai)
# theo vị trí so với tâm đầu; độ đẩy lan sang đỉnh kề để cả dải tóc dịch cùng nhau.
bvs = verts_np(body)
CLEAR = float(CFG.get('clear', 0.018))
nv = len(hair.data.vertices)
push = np.zeros(nv, np.float32)
for v in hair.data.vertices:
    c = v.co
    if c.z > zh - 0.01:
        continue
    near = bvs[(np.abs(bvs[:, 2] - c.z) < 0.025) & (np.abs(bvs[:, 0] - c.x) < 0.05)]
    if len(near) < 3:
        continue
    yf, yb = float(near[:, 1].min()), float(near[:, 1].max())
    if yf - CLEAR < c.y < yb + CLEAR:
        push[v.index] = (yb + CLEAR - c.y) if c.y > mh[3] - float(CFG.get('split', 0.01)) else (yf - CLEAR - c.y)
nb = [[] for _ in range(nv)]
for e in hair.data.edges:
    nb[e.vertices[0]].append(e.vertices[1])
    nb[e.vertices[1]].append(e.vertices[0])
for _ in range(int(CFG.get('spread', 6))):
    new_push = push.copy()
    for i in range(nv):
        for j in nb[i]:
            q = push[j] * 0.92
            if abs(q) > abs(new_push[i]) and (new_push[i] == 0 or (q > 0) == (new_push[i] > 0)):
                new_push[i] = q
    push = new_push
for v in hair.data.vertices:
    v.co.y += float(push[v.index])
print('tóc đẩy khỏi thân', int((np.abs(push) > 1e-6).sum()), 'đỉnh')
print('hair cap', cap, 'scale', hsc, 'offset', hoff)
bm = bmesh.new()
bm.from_mesh(hair.data)
uvk = bm.loops.layers.uv.active
for f in bm.faces:
    f.smooth = True
    for l in f.loops:
        u, v = l[uvk].uv
        l[uvk].uv = (u * 0.5, v * 0.5)
bm.to_mesh(hair.data)
bm.free()
hair.data.materials.clear()
hair.data.materials.append(mt)
hg = hair.vertex_groups.new(name='mixamorig:Head')
hg.add(list(range(len(hair.data.vertices))), 1.0, 'REPLACE')
hn = hair.vertex_groups.new(name='mixamorig:Neck')  # nhóm cho khớp bảng nhóm thân
N_PRE = len(body.data.vertices)
bpy.context.view_layer.objects.active = body
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
hair.select_set(True)
bpy.ops.object.join()
for vg in list(body.vertex_groups):
    if not vg.name.startswith('mixamorig:'):
        body.vertex_groups.remove(vg)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
bpy.ops.object.shade_smooth()

# ---------- 5b. xương lò xo cho tóc buông (đuôi, tóc xõa, mái): con của xương Head, một hạt mỗi cụm ----------
# Cụm theo x (trái/giữa/phải) với đỉnh tóc thấp hơn gốc đầu; mái = đỉnh phía trước trên đầu. Trọng số tăng dần xuống dưới (Head giảm tương ứng).
# chr_v2_post.py ghi extras `dtl.springs` từ đuôi các xương `dtl_o_hair_*` sau khi import_tripo chuẩn hóa kích thước.
def sm(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


me_b = body.data
P_all = [v.co.copy() for v in me_b.vertices]
zcap = zh - 0.01
hv = range(N_PRE, len(P_all))
clusters = {}
for i in hv:
    p_ = P_all[i]
    if p_.z < zcap:
        k = 'l' if p_.x > 0.05 else ('r' if p_.x < -0.05 else 'c')
        clusters.setdefault(k, []).append(i)
front = [i for i in hv if P_all[i].z >= zcap and P_all[i].y < mh[3] - 0.045 and P_all[i].z < mh[0] + 0.1 and P_all[i].z > mh[0] - 0.04]
if len(front) >= 25:
    clusters['bang'] = front
SPR = {}
W_BY = {'l': 0.9, 'r': 0.9, 'c': 0.9, 'bang': 0.45}
for k, idx in list(clusters.items()):
    if len(idx) < 25:
        continue
    zs_ = [P_all[i].z for i in idx]
    ztop = zcap if k != 'bang' else max(zs_)
    zbot = min(zs_)
    if ztop - zbot < 0.03:
        continue
    cx = sum(P_all[i].x for i in idx) / len(idx)
    cy = sum(P_all[i].y for i in idx) / len(idx)
    SPR[k] = (Vector((cx, cy, ztop)), Vector((cx, cy, zbot - 0.01)), idx, ztop, zbot)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
for k, (hd, tl, idx, zt, zb) in SPR.items():
    b = eb.new(f'dtl_o_hair_{k}')
    b.head, b.tail = hd, tl
    b.parent = eb['mixamorig:Head']
    b.use_deform = True
bpy.ops.object.mode_set(mode='OBJECT')
bm = bmesh.new()
bm.from_mesh(me_b)
dl = bm.verts.layers.deform.verify()
bm.verts.ensure_lookup_table()
gi = {n: (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).index for n in [f'dtl_o_hair_{k}' for k in SPR]}
for k, (hd, tl, idx, zt, zb) in SPR.items():
    g_ = gi[f'dtl_o_hair_{k}']
    for i in idx:
        h = W_BY[k] * sm((zt - P_all[i].z) / (zt - zb))
        if h < 0.02:
            continue
        v = bm.verts[i]
        for g, w in list(v[dl].items()):
            v[dl][g] = w * (1 - h)
        v[dl][g_] = h
bm.to_mesh(me_b)
bm.free()
print('xương lò xo tóc', {k: len(v[2]) for k, v in SPR.items()})

am = body.modifiers.new('Armature', 'ARMATURE')
am.object = rig
body.name = f'chr_v2_{SEX}'

# ---------- 6. xuất ----------
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
glb = os.path.join(OUT, 'rig_v01.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_yup=True, export_skins=True, export_animations=False,
                          export_apply=False, export_image_format='JPEG', export_jpeg_quality=90, export_materials='EXPORT')
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
json.dump({'sex': SEX, 'tris': tris, 'Zc': Zc, 'headScale': s, 'hairScale': hsc}, open(os.path.join(OUT, 'preview.json'), 'w'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'chr_v2_{SEX}_head.blend'))
print('DONE', tris)
