# Pipeline trang phục mô-đun (T-2): đưa một mảnh áo/giáp/đai/ủng/choàng (GLB Tripo) lên thân nền nam hoặc nữ. Chạy như bước
# `import.post` của import_tripo.py (sau chuẩn hóa: mét, gốc ở đáy, mặt trước +Z glTF = -Y Blender, trái = +X). Một mảnh = một asset
# `set_<mẫu>[_<mảnh>]_<nam|nu>`; một bộ gồm nhiều mảnh (client nạp hết, mỗi mảnh một draw call; gộp ở LOD xa là việc của client).
# Tài liệu đầy đủ, ví dụ meta, bảng chế độ: docs/sets-retarget/README.md. Khối `import.retarget` trong meta.json:
#
#   player      id nhân vật đích (GLB thô assets/build/raw/<id>.glb, run.mjs dựng chr_ trước set_)       [bắt buộc]
#   mode        "rig"      nguồn đã có skin Mixamo (ma-nơ-canh Tripo rig_v01): giữ trọng số, đặt lại tư thế nghỉ theo xương (mặc định)
#               "transfer" nguồn không xương (raw_v01, mảnh rời): chuyển trọng số từ lưới thân nền (mặt gần nhất, nội suy)
#               "rigid"    gán cứng 100% vào một xương (vai giáp, hộ uyển, ủng, ngọc bội): cần `bone`
#   bone        xương cho mode rigid (tên chuẩn hóa: spine2, leftforearm...)
#   anchor      { bone, offset:[x,y,z] mét (hệ glTF: x trái, y lên, z trước), align:"center"|"bottom"|"top" }: dời mảnh sao cho điểm
#               căn (tâm / đáy / đỉnh hộp bao) trùng đầu xương + offset. Mode transfer/rigid dùng khi mảnh không đứng sẵn đúng chỗ.
#   scale, yaw  nhân tỉ lệ và xoay quanh trục đứng (độ) trước khi căn
#   pad         mét: đỉnh nằm trong thân nền thì đẩy ra ngoài mặt thân ≥ pad (lồng đệm chống xuyên). 0 = tắt
#   padRange    mét: chỉ xét đỉnh cách thân nền gần hơn (mặc định 0,12), xa hơn bỏ qua
#   padBody     "kept" (mặc định: chỉ phần thân còn hiện = đầu/cổ/tay, ngoài `cut`) | "all" (thân nền còn nguyên, mảnh mặc lên áo lót)
#   cut         nhóm xương bị bỏ khỏi mảnh (da đầu/cổ/tay của ma-nơ-canh): head, neck, hand. Rỗng cho mảnh rời không có da
#   smooth      số vòng làm mượt trọng số (mode transfer; mặc định 2)
#   clampLen    giới hạn tỉ lệ dài xương khi kéo giãn mảnh (mode rig), mặc định [0.75, 1.35]
#   rigidRoot   true: xương gốc (hông) không xoay theo thân nền, chỉ dời (mode rig; cho skin toàn thân có đuôi/vạt gắn hông)
#   legBlend    0..1: vạt dưới hông trộn trọng số hai chân (chống xuyên chân kia khi chạy); mặc định 0.5, 0 = tắt
#   strayHand, strayLeg  mét: bỏ ảnh hưởng lạc (vạt áo bị Tripo skin vào ngón tay; chân ở quá xa)
#   spring      xương phụ: [{kind:"skirt", top, full, bottom, weight, radius, legClear}]  4 xương vạt (như áo gốc)
#                          [{kind:"sleeve", side:"both"|"left"|"right", from:0.4, weight:0.7}]  xương tay áo con của cẳng tay
#               Xương tên dtl_o_*/dtl_hem_*; extras `dtl.springs` (đuôi xương) để client mô phỏng (character/spring.ts) và nối vào
#               bộ xương người chơi lúc mặc.
#
# Đầu ra: bộ xương người chơi (đủ xương + xương phụ) + lưới mảnh có skin, không clip. LOD do optimize.ts (lớp ngân sách `outfit`).
# Biến nhận từ import_tripo: ASSET_ID, META, ARMATURES, MESHES, REPO, fail.

import json
import math
import os
import re
import runpy

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

REPORT = {}

CFG = (META.get('import') or {}).get('retarget') or {}  # noqa: F821
if not CFG.get('player'):
    fail('import.retarget.player: thiếu id nhân vật')  # noqa: F821
MODE = CFG.get('mode', 'rig')
if MODE not in ('rig', 'transfer', 'rigid'):
    fail(f'import.retarget.mode "{MODE}" không hợp lệ')  # noqa: F821
LO, HI = CFG.get('clampLen', [0.75, 1.35])
CUT = CFG.get('cut', ['head', 'neck', 'hand'])
LEG_BLEND = float(CFG.get('legBlend', 0.5))
STRAY_LEG = float(CFG.get('strayLeg', 0.18))
STRAY_HAND = float(CFG.get('strayHand', 0.16))
PAD = float(CFG.get('pad', 0.0))
PAD_BODY = CFG.get('padBody', 'kept')
PAD_RANGE = float(CFG.get('padRange', 0.12))  # chỉ xét đỉnh cách thân nền gần hơn thế này (m)
SMOOTH = int(CFG.get('smooth', 2))
RIGID_ROOT = bool(CFG.get('rigidRoot', False))
PARTS = runpy.run_path(os.path.join(REPO, 'tools/blender/biped_parts.py'))  # noqa: F821


def key(name):
    n = name.lower()
    n = re.sub(r'^mixamorig[:_]?', '', n)
    return re.sub(r'[^a-z0-9]', '', n)


def is_cut(k):
    for c in CUT:
        if c == 'hand' and 'hand' in k:
            return True
        if c == 'head' and (k.startswith('head') or k == 'headtopend'):
            return True
        if c == 'neck' and k.startswith('neck'):
            return True
    return False


def bone_dirs(arm):
    """Đầu xương, hướng xương (đầu → trung bình đầu các xương con, kế thừa của cha nếu là xương cụt) và độ dài, hệ thế giới."""
    mw = arm.matrix_world
    heads = {b.name: mw @ b.head_local for b in arm.data.bones}
    out = {}

    def rec(b, pdir):
        kids = [c for c in b.children if not c.name.startswith('dtl_')]
        if kids:
            mean = sum((heads[c.name] for c in kids), Vector()) / len(kids)
            d = mean - heads[b.name]
            ln = d.length
            d = d / ln if ln > 1e-6 else pdir
        else:
            d, ln = pdir, 0.0
        out[b.name] = (heads[b.name], d if d is not None else Vector((0, 0, 1)), ln)
        for c in b.children:
            rec(c, d)

    for r in (b for b in arm.data.bones if b.parent is None):
        rec(r, Vector((0, 0, 1)))
    return out


# ---------- nạp nhân vật đích ----------
before = set(bpy.data.objects)
player_glb = os.path.join(REPO, 'assets', 'build', 'raw', CFG['player'] + '.glb')  # noqa: F821
if not os.path.isfile(player_glb):
    fail(f'import.retarget: chưa có GLB thô {player_glb} (chạy run.mjs cho {CFG["player"]} trước)')  # noqa: F821
bpy.ops.import_scene.gltf(filepath=player_glb)
new = [o for o in bpy.data.objects if o not in before]
P = next((o for o in new if o.type == 'ARMATURE'), None)
if P is None:
    fail('GLB nhân vật không có armature')  # noqa: F821
player_meshes = [o for o in new if o.type == 'MESH' and len(o.data.vertices) > 100]

if len(MESHES) != 1:  # noqa: F821
    fail('cần đúng một mesh mảnh')  # noqa: F821
G = MESHES[0]  # noqa: F821
S = ARMATURES[0] if ARMATURES else None  # noqa: F821
if MODE == 'rig' and S is None:
    fail('mode rig cần nguồn có armature (rig_v01.glb); mảnh không xương dùng mode transfer/rigid')  # noqa: F821

bpy.context.view_layer.update()
P_info = bone_dirs(P)
P_by_key = {key(n): n for n in P_info}
me = G.data
mw = G.matrix_world.copy()
world = [mw @ v.co for v in me.vertices]  # đỉnh mảnh, thế giới, tư thế nghỉ


def pbone(k):
    n = P_by_key.get(k)
    if not n:
        fail(f'thân nền không có xương "{k}"')  # noqa: F821
    return n


def body_geometry():
    """Mọi mặt thân nền (đỉnh thế giới, nhóm xương), tách theo xương trội: còn hiện (kept) và mọi mặt (all)."""
    verts, faces_kept, faces_all, weights = [], [], [], []
    off = 0
    for pm in player_meshes:
        names = {g.index: g.name for g in pm.vertex_groups}
        m = pm.matrix_world
        for v in pm.data.vertices:
            verts.append(m @ v.co)
            weights.append({names[g.group]: g.weight for g in v.groups if g.weight > 1e-4 and g.group in names})
        for p in pm.data.polygons:
            tri = [off + i for i in p.vertices]
            for k in range(1, len(tri) - 1):
                t = (tri[0], tri[k], tri[k + 1])
                faces_all.append(t)
                dom = [max(weights[i].items(), key=lambda x: x[1])[0] if weights[i] else '' for i in t]
                if all(d and is_cut(key(d)) for d in dom):
                    faces_kept.append(t)
        off += len(pm.data.vertices)
    return verts, faces_kept, faces_all, weights


# ---------- căn (transfer / rigid) ----------
def place(points):
    sc, yaw = float(CFG.get('scale', 1.0)), math.radians(float(CFG.get('yaw', 0.0)))
    out = points
    if sc != 1.0 or yaw:
        c = sum(out, Vector()) / len(out)
        R = Matrix.Rotation(yaw, 3, 'Z')
        out = [c + R @ ((p - c) * sc) for p in out]
    a = CFG.get('anchor')
    if a:
        head = P_info[pbone(key(a['bone']))][0]
        ox, oy, oz = a.get('offset', [0, 0, 0])
        off = Vector((ox, -oz, oy))  # glTF (x trái, y lên, z trước) → Blender (x, -z trước, y lên)
        lo = Vector((min(p.x for p in out), min(p.y for p in out), min(p.z for p in out)))
        hi = Vector((max(p.x for p in out), max(p.y for p in out), max(p.z for p in out)))
        zref = {'center': (lo.z + hi.z) / 2, 'bottom': lo.z, 'top': hi.z}[a.get('align', 'center')]
        ref = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, zref))
        out = [p + (head + off - ref) for p in out]
    return out


# ---------- chế độ rig: đặt lại tư thế nghỉ theo xương ----------
def solve_rig():
    S_info = bone_dirs(S)
    S_parent = {b.name: (b.parent.name if b.parent else None) for b in S.data.bones}

    def map_bone(sname):
        n = sname
        while n:
            if key(n) in P_by_key:
                return P_by_key[key(n)]
            n = S_parent.get(n)
        return None

    xf = {}
    for sname, (sh, sd, sl) in S_info.items():
        pname = map_bone(sname)
        if not pname:
            continue
        ph, pd, pl = P_info[pname]
        q = sd.rotation_difference(pd)
        # Xương gốc (hông): hướng = trung bình đầu các xương con (cột sống lên, hai đùi xuống) gần như triệt tiêu nên rất nhiễu;
        # với mảnh có phần lớn gắn vào hông (đuôi, vạt dài của skin toàn thân) thì giữ nguyên hướng, chỉ dời theo đầu xương.
        if RIGID_ROOT and S_parent.get(sname) is None:
            q = Quaternion()
        ratio = min(max(pl / sl, LO), HI) if sl > 0.02 and pl > 0.02 else 1.0
        xf[sname] = (sh, sd, ph, q, ratio, pname)
    vg_name = {vg.index: vg.name for vg in G.vertex_groups}
    pos, dom, infl, unmapped = [], [], [], 0
    for v, p in zip(me.vertices, world):
        acc, tot, merged, best = Vector(), 0.0, {}, (0.0, None)
        for g in v.groups:
            sname = vg_name.get(g.group)
            if sname is None or g.weight <= 1e-4:
                continue
            t = xf.get(sname)
            if t is None:
                continue
            sh, sd, ph, q, ratio, pname = t
            kk = key(sname)
            # ảnh hưởng lạc: Tripo skin vạt áo gần bàn tay vào xương ngón; chân quá xa → bỏ khi còn ảnh hưởng khác
            if kk.endswith(('upleg', 'leg')) and 'hand' not in kk:
                sl_ = max(S_info[sname][2], 0.1)
                tt = min(max((p - sh).dot(sd) / sl_, 0.0), 1.0)
                if (p - (sh + sd * sl_ * tt)).length > STRAY_LEG and any('hand' in key(vg_name.get(o.group, '')) and o.weight > 0.1 for o in v.groups):
                    continue
            if 'hand' in kk and (p - sh).length > STRAY_HAND and any('hand' not in key(vg_name.get(o.group, '')) and o.weight > 0.3 for o in v.groups):
                continue
            d = p - sh
            along = sd * d.dot(sd)
            acc += g.weight * (ph + q @ ((d - along) + along * ratio))
            tot += g.weight
            merged[pname] = merged.get(pname, 0.0) + g.weight
            if g.weight > best[0]:
                best = (g.weight, sname)
        if tot <= 0:
            unmapped += 1
            pos.append(p)
            dom.append(None)
            infl.append({})
            continue
        pos.append(acc / tot)
        dom.append(best[1])
        infl.append({k: w / tot for k, w in merged.items()})
    return pos, dom, infl, unmapped


# ---------- chế độ transfer: trọng số từ thân nền ----------
def solve_transfer(points):
    verts, _kept, faces_all, bw = body_geometry()
    tree = BVHTree.FromPolygons(verts, faces_all)
    infl, dom = [], []
    for p in points:
        loc, _nor, fi, _dist = tree.find_nearest(p)
        if loc is None:
            infl.append({})
            dom.append(None)
            continue
        tri = faces_all[fi]
        a, b, c = (verts[i] for i in tri)
        v0, v1, v2 = b - a, c - a, loc - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01 or 1e-12
        wv = (d11 * d20 - d01 * d21) / den
        ww = (d00 * d21 - d01 * d20) / den
        acc = {}
        for k, i in zip((1 - wv - ww, wv, ww), tri):
            for n, w in bw[i].items():
                acc[n] = acc.get(n, 0.0) + k * w
        acc = {n: w for n, w in acc.items() if w > 0}
        tot = sum(acc.values()) or 1.0
        acc = {n: w / tot for n, w in acc.items()}
        infl.append(acc)
        dom.append(max(acc.items(), key=lambda x: x[1])[0] if acc else None)
    return infl, dom


def smooth_weights(infl, iters):
    """Làm mượt trọng số theo cạnh lưới mảnh (trung bình, giữ 50% giá trị gốc)."""
    nbr = [set() for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].add(b)
        nbr[b].add(a)
    for _ in range(iters):
        out = []
        for i, w in enumerate(infl):
            if not nbr[i] or not w:
                out.append(w)
                continue
            acc = {n: x * 0.5 for n, x in w.items()}
            share = 0.5 / len(nbr[i])
            for j in nbr[i]:
                for n, x in infl[j].items():
                    acc[n] = acc.get(n, 0.0) + x * share
            tot = sum(acc.values()) or 1.0
            out.append({n: x / tot for n, x in acc.items()})
        infl[:] = out


def apply_pad(points):
    """Lồng đệm: đỉnh nằm trong thân nền (hoặc sát hơn `pad`) đẩy ra ngoài mặt thân. Trả (số đỉnh đẩy, độ sâu lớn nhất, m)."""
    if PAD <= 0:
        return 0, 0.0
    verts, kept, allf, _ = body_geometry()
    faces = allf if PAD_BODY == 'all' else kept
    if not faces:
        return 0, 0.0
    tree = BVHTree.FromPolygons(verts, faces)
    moved, deepest = 0, 0.0
    for i, p in enumerate(points):
        loc, nor, _fi, dist = tree.find_nearest(p)
        if loc is None:
            continue
        if dist > PAD_RANGE:
            continue  # xa thân nền: không phải chuyện xuyên lưới
        inside = (p - loc).dot(nor) < 0
        if inside or dist < PAD:
            if inside:
                deepest = max(deepest, dist)
            points[i] = loc + nor * PAD
            moved += 1
    return moved, deepest


# ---------- chạy ----------
if MODE == 'rig':
    newpos, dom, infl, n_unmapped = solve_rig()
else:
    newpos = place(world)
    n_unmapped = 0
    if MODE == 'rigid':
        bn = pbone(key(CFG.get('bone', '')))
        infl = [{bn: 1.0} for _ in newpos]
        dom = [bn for _ in newpos]
    else:
        infl, dom = solve_transfer(newpos)
        smooth_weights(infl, SMOOTH)

# vạt dưới hông: trộn một phần trọng số hai chân
if LEG_BLEND > 0 and MODE != 'rigid':
    legs = {s: P_by_key.get(s + 'upleg') for s in ('left', 'right')}
    if all(legs.values()) and 'hips' in P_by_key:
        hips_h = P_info[P_by_key['hips']][0].z
        lh = {s: P_info[n][0] for s, n in legs.items()}
        mid_x = (lh['left'].x + lh['right'].x) / 2
        half = abs(lh['left'].x - lh['right'].x) / 2 or 0.1
        for i, w in enumerate(infl):
            z = newpos[i].z
            if z > hips_h - 0.02 or not w:
                continue
            legsum = sum(w.get(n, 0.0) for n in legs.values())
            if legsum <= 0:
                continue
            off = abs(newpos[i].x - mid_x) / half
            share = LEG_BLEND * max(0.0, 1.0 - off * 0.6) * min(1.0, (hips_h - z) / 0.25)
            if share <= 0:
                continue
            for n in legs.values():
                w[n] = w.get(n, 0.0) * (1 - share) + legsum * share * 0.5

pad_moved, pad_depth = apply_pad(newpos)

# ---------- ghi lưới, nhóm đỉnh ----------
inv = G.matrix_world.inverted()
for i, v in enumerate(me.vertices):
    v.co = inv @ newpos[i]
for vg in list(G.vertex_groups):
    G.vertex_groups.remove(vg)
groups = {}
for vi, w_by in enumerate(infl):
    for pname, w in w_by.items():
        if w < 0.01:
            continue
        g = groups.get(pname) or G.vertex_groups.new(name=pname)
        groups[pname] = g
        g.add([vi], w, 'REPLACE')

# bỏ mặt thuộc đầu/cổ/tay (xương trội)
if CUT:
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    kill = [f for f in bm.faces if all(dom[v.index] and is_cut(key(dom[v.index])) for v in f.verts)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me)
    bm.free()

bpy.context.view_layer.objects.active = G
for o in bpy.data.objects:
    o.select_set(False)
G.select_set(True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

# ---------- gắn vào bộ xương người chơi ----------
G.parent = None
G.matrix_world = Matrix.Identity(4)
for m in list(G.modifiers):
    G.modifiers.remove(m)
mod = G.modifiers.new('Armature', 'ARMATURE')
mod.object = P
G.parent = P
G.matrix_parent_inverse = P.matrix_world.inverted()

# ---------- xương phụ ----------
HEM = ('dtl_hem_fl', 'dtl_hem_fr', 'dtl_hem_bl', 'dtl_hem_br')


def weight_hem(spec, legs):
    """Chia trọng số vạt áo cho 4 xương dtl_hem_* có sẵn của người chơi (cùng công thức biped_parts.skirt_springs, không tạo xương)."""
    top, full, bottom = float(spec.get('top', 0.84)), float(spec.get('full', 0.35)), float(spec.get('bottom', 0.08))
    W = float(spec.get('weight', 0.6))
    r_in, r_out = spec.get('legClear', [0.05, 0.1])
    hip = P_info[pbone('hips')][0]
    ang = {'dtl_hem_fl': (1, -1), 'dtl_hem_fr': (-1, -1), 'dtl_hem_bl': (1, 1), 'dtl_hem_br': (-1, 1)}
    ang = {n: math.atan2(y, x) for n, (x, y) in ang.items()}

    def sm(e0, e1, x):
        k = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
        return k * k * (3 - 2 * k)

    def leg_dist(p):
        best = 9.0
        for a, b in legs:
            ab = b - a
            k = min(1.0, max(0.0, (p - a).dot(ab) / ab.length_squared))
            best = min(best, (p - (a + ab * k)).length)
        return best

    gi = {n: (G.vertex_groups.get(n) or G.vertex_groups.new(name=n)).index for n in HEM}
    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    moved = 0
    for v in bm.verts:
        p = G.matrix_world @ v.co
        if not (bottom < p.z < top):
            continue
        h = sm(top, full, p.z) * sm(r_in, r_out, leg_dist(p)) * W
        if h < 0.01:
            continue
        th = math.atan2(p.y - hip.y, p.x - hip.x)
        ws = {n: max(0.0, math.cos(th - a)) ** 2 for n, a in ang.items()}
        tot = sum(ws.values()) or 1.0
        old = sorted(v[dl].items(), key=lambda x: -x[1])[:2]
        so = sum(x[1] for x in old) or 1.0
        v[dl].clear()
        for g, wt in old:
            v[dl][g] = wt / so * (1 - h)
        for n, wt in sorted(ws.items(), key=lambda x: -x[1])[:2]:
            if wt > 0:
                v[dl][gi[n]] = v[dl].get(gi[n], 0.0) + h * wt / tot
        moved += 1
    bm.to_mesh(me)
    bm.free()
    if moved < 100:
        fail(f'spring skirt: chỉ {moved} đỉnh vạt áo, kiểm lại top/full/bottom')  # noqa: F821
    return {'bones': list(HEM), 'vertices': moved, 'reuse': True}


spring_report = []
extra_springs = []
for spec in CFG.get('spring', []):
    kind = spec.get('kind')
    if kind == 'skirt':
        legs = []
        for side in ('left', 'right'):
            up, low, foot = (P.data.bones[pbone(side + n)] for n in ('upleg', 'leg', 'foot'))
            legs += [(P.matrix_world @ up.head_local, P.matrix_world @ low.head_local), (P.matrix_world @ low.head_local, P.matrix_world @ foot.head_local)]
        if all(n in P.data.bones for n in HEM):
            # Người chơi đã có 4 xương vạt dtl_hem_* (lò xo chạy sẵn ở client): chỉ chia trọng số cho áo, không tạo xương trùng tên.
            spring_report.append(weight_hem(spec, legs))
        else:
            spring_report.append(PARTS['skirt_springs'](G, P, spec, pbone('hips'), legs, fail))  # noqa: F821
            extra_springs += json.loads(G.get('dtl', '{}')).get('springs', [])
    elif kind == 'sleeve':
        sides = ['left', 'right'] if spec.get('side', 'both') == 'both' else [spec['side']]
        t0, W = float(spec.get('from', 0.4)), float(spec.get('weight', 0.7))
        bpy.context.view_layer.objects.active = P
        bpy.ops.object.mode_set(mode='EDIT')
        eb, ainv = P.data.edit_bones, P.matrix_world.inverted()
        plan = []
        for side in sides:
            fa, hand = P.data.bones[pbone(side + 'forearm')], P.data.bones[pbone(side + 'hand')]
            a, b = P.matrix_world @ fa.head_local, P.matrix_world @ hand.head_local
            ax = (b - a).normalized()
            name = f'dtl_o_sleeve_{side[0]}'
            e = eb.new(name)
            e.head, e.tail = ainv @ (a + (b - a) * t0), ainv @ (b + ax * 0.12)
            e.parent = eb[fa.name]
            e.use_deform = True
            plan.append((name, a, b, ax, b + ax * 0.12))
        bpy.ops.object.mode_set(mode='OBJECT')
        bm = bmesh.new()
        bm.from_mesh(me)
        dl = bm.verts.layers.deform.verify()
        gi = {n: (G.vertex_groups.get(n) or G.vertex_groups.new(name=n)).index for n, *_ in plan}
        moved = 0
        for v in bm.verts:
            p = G.matrix_world @ v.co
            for name, a, b, ax, _tail in plan:
                t = (p - a).dot(ax) / (b - a).length
                if t < t0 or (p - (a + ax * (p - a).dot(ax))).length < 0.03:
                    continue
                k = min(1.0, (t - t0) / max(1e-3, 1.0 - t0))
                h = k * k * (3 - 2 * k) * W
                if h < 0.02:
                    continue
                old = {g: w for g, w in v[dl].items() if g != gi[name]}
                s = sum(old.values()) or 1.0
                v[dl].clear()
                for g, w in old.items():
                    v[dl][g] = w / s * (1 - h)
                v[dl][gi[name]] = h
                moved += 1
        bm.to_mesh(me)
        bm.free()
        extra_springs += [{'bone': n, 'tail': PARTS['to_gltf'](tail)} for n, _a, _b, _ax, tail in plan]
        spring_report.append({'bones': [p[0] for p in plan], 'vertices': moved})
    else:
        fail(f'spring: kind "{kind}" chưa hỗ trợ')  # noqa: F821
if extra_springs:
    PARTS['set_extra'](G, 'springs', extra_springs)

# ---------- dọn cảnh ----------
for o in player_meshes:
    bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o is G or o is P:
        continue
    if o.type in ('EMPTY', 'MESH') or (o.type == 'ARMATURE' and o is S):
        bpy.data.objects.remove(o, do_unlink=True)
for arm in (o for o in bpy.data.objects if o.type == 'ARMATURE'):
    arm.animation_data_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
P.name = ASSET_ID + '_rig'  # noqa: F821
P.data.name = ASSET_ID + '_rig'  # noqa: F821

REPORT = {
    'player': CFG['player'],
    'mode': MODE,
    'bones': len(P.data.bones),
    'verts': len(me.vertices),
    'tris': sum(len(p.vertices) - 2 for p in me.polygons),
    'unmapped': n_unmapped,
    'groups': len(groups),
    'pad': {'moved': pad_moved, 'deepest': round(pad_depth, 4)},
    'spring': spring_report,
}
