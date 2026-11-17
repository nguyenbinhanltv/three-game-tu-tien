# CHR-ROLLOUT: bộ đồ đệ tử tân thủ cho nhân vật nền v2 (thân MakeHuman không có áo). Chạy như `import.post` của import_tripo.py, đọc
# `assets/build/raw/<player>.glb` (cùng khung, cùng xương) và dựng ĐẠO BÀO THẬT, không bó theo thân:
#   - áo khoác ngoài: chồng các vòng elip quanh thân từ chân cổ tới giữa bắp chân; bán kính đo từ mặt cắt thân (bỏ tay, đầu) cộng độ rộng:
#     ngực/eo/hông rộng, tà xòe dần xuống gấu; cổ giao lĩnh, viền gấu, tay áo vẽ trên texture (UV trụ);
#   - tay áo rộng: ống loe dọc đường xương vai → khuỷu → cổ tay, miệng tay loe có bo ngà;
#   - đai lưng: dải ở eo; quần và ủng tối màu: sao chép lưới thân (vùng đùi/cẳng chân/bàn chân) đẩy nhẹ theo pháp tuyến.
# Trọng số: vòng thân theo đỉnh thân gần nhất (không lấy đỉnh tay); tà dưới hông trộn hông + hai chân (0,65) cho vạt đi cùng cả người,
# không xé thành mảnh khi chạy; tay áo theo vị trí dọc cánh tay (vai → cánh tay → cẳng tay, trộn quanh khuỷu).
# Vải áo là màu tham chiếu `#3B6584` để hệ nhuộm (`dye.ts`) đổi theo màu đạo bào / bộ trang bị / NPC. Khối `import.starter` trong meta.json:
#   player   id nhân vật đích (GLB thô assets/build/raw/<id>.glb; dựng chr_v2_* trước)
#   robe, trim, edge, belt, pants, boots   màu hex (mặc định như dưới)
# Biến nhận từ import_tripo: ASSET_ID, META, REPO, fail.
import math
import os
import re
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Vector, kdtree

CFG = (META.get('import') or {}).get('starter') or {}  # noqa: F821
if not CFG.get('player'):
    fail('import.starter.player: thiếu id nhân vật')  # noqa: F821
COL = {'robe': CFG.get('robe', '#3B6584'), 'trim': CFG.get('trim', '#E6DDCB'), 'edge': CFG.get('edge', '#22364E'), 'belt': CFG.get('belt', '#6B4B2F'),
       'pants': CFG.get('pants', '#2A2C33'), 'boots': CFG.get('boots', '#2B211B')}
N_SEG = 32  # đỉnh mỗi vòng
FLARE = 0.12  # tà xòe thêm ở gấu (m)
SHELL = {'pants': 0.010, 'boots': 0.013}

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


def bone(k):
    return next(b for b in P.data.bones if key(b.name) == k)


def bpos(k):
    return P.matrix_world @ bone(k).head_local


neck_z = bpos('neck').z
hips_z = bpos('hips').z
knee_z = bpos('leftleg').z
ankle_z = bpos('leftfoot').z
waist_z = (bpos('spine').z + hips_z) / 2
hem_z = ankle_z + 0.42 * (knee_z - ankle_z)  # giữa bắp chân
collar_z = neck_z + 0.02

me = body.data
gname = {g.index: g.name for g in body.vertex_groups}
nv = len(me.vertices)
reg = [None] * nv
domk = [''] * nv
vw = [None] * nv
for v in me.vertices:
    ws = sorted(((gname[g.group], g.weight) for g in v.groups), key=lambda a: -a[1])
    vw[v.index] = ws[:4]
    if ws:
        domk[v.index] = key(ws[0][0])
        reg[v.index] = region_of(domk[v.index])
is_arm = [r in ('upperArm', 'forearm') or 'hand' in k for r, k in zip(reg, domk)]
is_head = [k.startswith('head') or k.startswith('dtl') for k in domk]
torso_ok = [not a and not h for a, h in zip(is_arm, is_head)]
co = [v.co.copy() for v in me.vertices]

# KD-tree các đỉnh thân (không tay, không đầu) để chuyển trọng số
kd = kdtree.KDTree(sum(1 for t in torso_ok if t))
idx_map = []
for i in range(nv):
    if torso_ok[i]:
        kd.insert(co[i], len(idx_map))
        idx_map.append(i)
kd.balance()


def weights_near(p, k=4):
    acc = {}
    tot = 0.0
    for c, ii, d in kd.find_n(p, k):
        w = 1.0 / (d + 0.01)
        for n, x in vw[idx_map[ii]]:
            acc[n] = acc.get(n, 0.0) + w * x
        tot += w
    return {n: x / tot for n, x in acc.items()}


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


# ---------- mặt cắt thân theo độ cao ----------
zs = []
z = collar_z + 0.02
while z > hem_z + 1e-4:
    zs.append(z)
    z -= 0.02
zs.append(hem_z)
prof = []
for zl in zs:
    pts = [co[i] for i in range(nv) if torso_ok[i] and abs(co[i].z - zl) < 0.025]
    if len(pts) < 6:
        prof.append(prof[-1] if prof else (0.0, -0.02, 0.08, 0.06))
        continue
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    prof.append(((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2))
P_ = np.array(prof, np.float32)
for _ in range(3):  # làm mượt theo độ cao
    P_[1:-1] = (P_[:-2] + 2 * P_[1:-1] + P_[2:]) / 4


def ease(zl):
    chest_z = (neck_z + waist_z) / 2
    e = 0.03 + 0.02 * smooth(1 - abs(zl - chest_z) / 0.2) + 0.025 * smooth(1 - abs(zl - waist_z) / 0.15) + 0.03 * smooth((waist_z - zl) / 0.2)
    flare = FLARE * smooth((hips_z - zl) / (hips_z - hem_z))
    return e + flare


# ---------- hình học ----------
out_v, out_f, out_w, out_uv = [], [], [], []


def add_vert(p, w, uv):
    out_v.append(p)
    out_w.append(w)
    out_uv.append(uv)
    return len(out_v) - 1


def leg_blend_weights(p, zl):
    """Tà dưới hông: hông + hai chân, để vạt đi cùng cả người."""
    t = smooth((hips_z - zl) / (hips_z - knee_z))
    leg = 0.65 * t
    sx = min(1.0, max(-1.0, p.x / 0.08)) * 0.5 + 0.5  # 1 = chân trái (+X)
    low = zl < knee_z
    wl = bone('leftleg' if low else 'leftupleg').name
    wr = bone('rightleg' if low else 'rightupleg').name
    base = weights_near(p)
    w = {n: x * (1 - leg) for n, x in base.items()}
    w[wl] = w.get(wl, 0.0) + leg * sx
    w[wr] = w.get(wr, 0.0) + leg * (1 - sx)
    return w


ring_ids = []
for k, zl in enumerate(zs):
    cx, cy, rx, ry = (float(a) for a in P_[k])
    e = ease(zl)
    top = k == 0
    row = []
    for s in range(N_SEG + 1):  # đỉnh thứ N_SEG lặp lại đỉnh 0 để UV liên tục qua đường nối
        th = 2 * math.pi * s / N_SEG  # 0 = chính diện (-Y), tăng về phía +X (trái nhân vật)
        sx_, cy_ = math.sin(th), -math.cos(th)
        rrx = rx + e + (0.012 if top else 0.0)
        rry = ry + e * 0.9 + (0.012 if top else 0.0)
        p = Vector((cx + sx_ * rrx, cy + cy_ * rry, zl))
        w = leg_blend_weights(p, zl) if zl < hips_z - 0.02 else weights_near(p)
        v = (zl - hem_z) / (zs[0] - hem_z)
        row.append(add_vert(p, w, (0.5 * s / N_SEG, v)))
    ring_ids.append(row)
for k in range(len(zs) - 1):
    a, b = ring_ids[k], ring_ids[k + 1]
    for s in range(N_SEG):
        out_f.append(([a[s], b[s], b[s + 1], a[s + 1]], None))

# đai lưng: dải ở eo, bám theo hai vòng quanh eo, dày hơn thân áo một chút
ib = min(range(len(zs)), key=lambda i: abs(zs[i] - (waist_z + 0.03)))
ia = min(range(len(zs)), key=lambda i: abs(zs[i] - (waist_z - 0.035)))
belt_rows = []
for kk, vb in ((min(ib, ia), 0.52), (max(ib, ia), 0.72)):
    row = []
    cx, cy = float(P_[kk][0]), float(P_[kk][1])
    for s in range(N_SEG + 1):
        p0 = out_v[ring_ids[kk][s]]
        d = Vector((p0.x - cx, p0.y - cy, 0)).normalized()
        row.append(add_vert(p0 + d * 0.014, dict(out_w[ring_ids[kk][s]]), (0.52 + 0.22 * s / N_SEG, vb)))
    belt_rows.append(row)
for s in range(N_SEG):
    out_f.append(([belt_rows[0][s], belt_rows[1][s], belt_rows[1][s + 1], belt_rows[0][s + 1]], None))

# tay áo: ống loe dọc xương vai → khuỷu → cổ tay → quá cổ tay một đoạn
M = 10  # vòng mỗi tay áo
K = N_SEG // 2
for side in ('left', 'right'):
    sh = bpos(side + 'arm')
    el = bpos(side + 'forearm')
    wr = bpos(side + 'hand')
    pts = [sh - (el - sh).normalized() * 0.03, sh, el, wr, wr + (wr - el).normalized() * 0.05]
    L = [(pts[i + 1] - pts[i]).length for i in range(4)]
    total = sum(L)
    t_elbow = (L[0] + L[1]) / total
    seg = []
    for m in range(M):
        t = m / (M - 1)
        dist = t * total
        i = 0
        while i < 3 and dist > L[i]:
            dist -= L[i]
            i += 1
        seg.append((t, pts[i] + (pts[i + 1] - pts[i]).normalized() * min(dist, L[i]), (pts[i + 1] - pts[i]).normalized()))
    rows = []
    for m, (t, q, d) in enumerate(seg):
        loe = smooth((t - t_elbow) / (1 - t_elbow))
        rad = 0.082 - 0.008 * smooth(t / t_elbow) + 0.075 * loe ** 1.4  # loe dần về miệng tay
        up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, 1, 0))
        a_ = d.cross(up).normalized()
        b_ = d.cross(a_).normalized()
        if t < t_elbow - 0.08:
            f = smooth(1 - t / 0.2)
            w = {bone(side + 'arm').name: 1 - 0.5 * f, bone(side + 'shoulder').name: 0.5 * f}
        elif t < t_elbow + 0.08:
            f = smooth((t - (t_elbow - 0.08)) / 0.16)
            w = {bone(side + 'arm').name: 1 - f, bone(side + 'forearm').name: f}
        else:
            w = {bone(side + 'forearm').name: 1.0}
        row = []
        for s in range(K + 1):
            th = 2 * math.pi * s / K
            p = q + a_ * math.cos(th) * rad + b_ * math.sin(th) * rad * 0.92 - Vector((0, 0, 0.012 * loe))
            u = (0.52 if side == 'left' else 0.76) + 0.22 * s / K
            row.append(add_vert(p, dict(w), (u, 0.5 * t)))
        rows.append(row)
    for m in range(M - 1):
        for s in range(K):
            out_f.append(([rows[m][s], rows[m + 1][s], rows[m + 1][s + 1], rows[m][s + 1]], None))

# quần + ủng: sao chép lưới thân (đùi, cẳng chân, bàn chân), đẩy nhẹ theo pháp tuyến
bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
bm.normal_update()
shell = {}
CELL = {'pants': (0.80, 0.20), 'boots': (0.92, 0.20)}
for f in bm.faces:
    rs = [reg[v.index] for v in f.verts]
    if sum(1 for r in rs if r in ('thigh', 'calf', 'foot')) < 2:
        continue
    if f.calc_center_median().z > hips_z + 0.01:
        continue
    boots = any(r == 'foot' or (r == 'calf' and v.co.z < ankle_z + 0.13) for v, r in zip(f.verts, rs))
    piece = 'boots' if boots else 'pants'
    ids = []
    for v in f.verts:
        kk = (v.index, piece)
        if kk not in shell:
            shell[kk] = add_vert(v.co + v.normal * SHELL[piece], dict(vw[v.index]), CELL[piece])
        ids.append(shell[kk])
    out_f.append((ids, piece))
bm.free()
if len(out_f) < 800:
    fail(f'chr_v2_starter: chỉ {len(out_f)} mặt, kiểm lại')  # noqa: F821

# ---------- texture 512² vẽ theo UV (áo trụ, tay áo, đai, quần, ủng) ----------
TEX = 512


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)


uu, vv = np.meshgrid((np.arange(TEX) + 0.5) / TEX, (np.arange(TEX) + 0.5) / TEX)
ROBE, TRIM, EDGE = hexrgb(COL['robe']), hexrgb(COL['trim']), hexrgb(COL['edge'])
img = np.ones((TEX, TEX, 3), np.float32) * ROBE
ar = uu < 0.5
th = (uu / 0.5) * 2 * math.pi
thw = np.where(th > math.pi, th - 2 * math.pi, th)  # -π..π, 0 = chính diện
zl = hem_z + vv * (zs[0] - hem_z)
img[ar & (vv < 0.045)] = TRIM  # viền gấu ngà
img[ar & (vv >= 0.045) & (vv < 0.058)] = EDGE
zc0 = zs[0] - 0.01
drop = 0.24
tt = np.clip((zc0 - zl) / drop, 0, 1)
left = 0.52 * (1 - tt) - 0.05 * tt  # ve trái: từ +0,52 rad xuống -0,05
right = -0.52 * (1 - tt) + 0.08 * tt  # ve phải: từ -0,52 xuống +0,08
band = ar & (zl < zc0) & (zl > zc0 - drop)
img[band & (thw < left) & (thw > right)] = TRIM  # lớp áo trong (chữ V)
w_ = 0.045 * (1 - 0.4 * tt)
img[band & ((np.abs(thw - left) < w_) | (np.abs(thw - right) < w_))] = EDGE
img[ar & (zl >= zc0) & (np.abs(thw) < 0.75)] = EDGE  # mép cổ đứng
sl = (uu >= 0.52) & (vv <= 0.5)
tv = vv / 0.5
img[sl & (tv > 0.78) & (tv <= 0.80)] = EDGE
img[sl & (tv > 0.80) & (tv < 0.93)] = TRIM  # bo miệng tay
img[sl & (tv >= 0.93)] = EDGE
BELT = hexrgb(COL['belt'])
bl = (uu >= 0.52) & (uu < 0.74) & (vv > 0.5) & (vv <= 0.75)
img[bl] = BELT
img[bl & (np.abs(((uu - 0.52) / 0.22) - 0.5) < 0.03)] = np.clip(BELT * 1.35, 0, 1)
img[(np.abs(uu - 0.80) < 0.06) & (np.abs(vv - 0.20) < 0.06)] = hexrgb(COL['pants'])
img[(np.abs(uu - 0.92) < 0.06) & (np.abs(vv - 0.20) < 0.06)] = hexrgb(COL['boots'])
img *= (1 + 0.025 * np.sin(uu * 900) * np.sin(vv * 900))[..., None]
rgba = np.concatenate([np.clip(img, 0, 1), np.ones((TEX, TEX, 1), np.float32)], 2)
tmp = bpy.data.images.new(ASSET_ID + '_gen', TEX, TEX, alpha=False)  # noqa: F821
tmp.pixels.foreach_set(rgba.reshape(-1))
tmp.update()
path = os.path.join(tempfile.gettempdir(), ASSET_ID + '_color.png')  # noqa: F821
tmp.filepath_raw = path
tmp.file_format = 'PNG'
tmp.save()
bpy.data.images.remove(tmp)
im = bpy.data.images.load(path)
im.name = ASSET_ID + '_color'  # noqa: F821
im.colorspace_settings.name = 'sRGB'
im.pack()

# ---------- dựng lưới ----------
saved_basis = body.matrix_basis.copy()
saved_parent_inv = body.matrix_parent_inverse.copy()
for o in list(bpy.data.objects):
    if o is P:
        continue
    bpy.data.objects.remove(o, do_unlink=True)
gme = bpy.data.meshes.new(ASSET_ID)  # noqa: F821
b2 = bmesh.new()
bv = [b2.verts.new(c) for c in out_v]
uvl = b2.loops.layers.uv.new('UVMap')
for ids, piece in out_f:
    try:
        f = b2.faces.new([bv[i] for i in ids])
    except ValueError:
        continue
    for lp, vi in zip(f.loops, ids):
        lp[uvl].uv = out_uv[vi]
    f.smooth = True
b2.normal_update()
b2.to_mesh(gme)
b2.free()
G = bpy.data.objects.new(ASSET_ID, gme)  # noqa: F821
bpy.context.scene.collection.objects.link(G)
for i, w in enumerate(out_w):
    for n, x in sorted(w.items(), key=lambda a: -a[1])[:4]:
        vg = G.vertex_groups.get(n) or G.vertex_groups.new(name=n)
        vg.add([i], x, 'REPLACE')
mat = bpy.data.materials.new(ASSET_ID + '_mat')  # noqa: F821
mat.use_nodes = True
bs = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
tx = mat.node_tree.nodes.new('ShaderNodeTexImage')
tx.image = im
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
REPORT = {'player': CFG['player'], 'tris': sum(len(p.vertices) - 2 for p in gme.polygons), 'verts': len(gme.vertices), 'rings': len(zs)}
