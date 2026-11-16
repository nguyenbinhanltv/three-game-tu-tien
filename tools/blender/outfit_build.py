# Dựng một BỘ trang phục mô-đun (T-5): nhiều mảnh Tripo rời (áo ngoài, lớp dưới, vai giáp, đai + tua, ủng, trang sức đầu), không xương,
# mỗi mảnh chuẩn hóa dài 1 m, tay áo ở tư thế thả, mặt trước -Y Blender (= +Z glTF), lên lên +Z. Chạy như `import.post` của import_tripo.py
# (mảnh nguồn chính chỉ để import_tripo có việc làm, script này tự nạp lại cả 6 mảnh gốc từ DTL_ASSET_SOURCE). Khối `import.outfit` trong meta.json:
#
#   player    id nhân vật đích (GLB thô assets/build/raw/<id>.glb)
#   dir       thư mục mảnh: chr/<bộ>/tripo (tương đối DTL_ASSET_SOURCE), tên tệp raw_<mảnh>_v01.glb
#   palette   { main, sec, trim, accent } hex: bảng màu 3 kênh + màu vân sáng; mặt nạ nhuộm sinh từ texture màu theo bảng này
#   fitPose   { armDown: độ } tư thế tay thả của thân nền khi căn (khớp tay áo thả của mảnh; mặc định 70)
#   atlas     cạnh atlas (mặc định 1024); ô theo `cells` (mặc định xếp sẵn cho 6 mảnh)
#   pieces    { <mảnh>: { fit:{...}, weights, spring:{count,minDist,weight}, hide:bool } } ghi đè mặc định PIECE_DEFAULTS
#
# Từng bước (đều trong tư thế fitPose của thân nền, rồi đưa về tư thế nghỉ chữ T bằng nghịch đảo skin):
#   1. Mốc thân nền (cổ, hông, gối, cổ chân, vai, bề ngang/sâu eo, khoảng chân, đỉnh đầu) từ bộ xương người chơi.
#   2. Căn mảnh: tỉ lệ theo kích thước đích (mốc), đặt tâm/đáy/đỉnh theo mốc. Tham số `fit`: top, bottom (z), x, y, z (kích thước), cx, cy (tâm),
#      alignZ (top|bottom|center); giá trị là số hoặc biểu thức theo mốc (vd "neck_z+0.05").
#   3. Trọng số: chuyển từ lưới thân nền (mặt gần nhất, nội suy tọa độ trọng tâm), xương bàn tay → cẳng tay (áo không theo ngón tay), bỏ xương kiếm;
#      `islands`: mỗi đảo lưới lấy trọng số trung bình (mảnh cứng: vai giáp, đai); `head`: 100% xương đầu (trang sức đầu); làm mượt `smooth` vòng.
#   4. Xương lò xo tự động (`spring`): chọn đỉnh treo xa thân (> minDist), gom cụm k-means (count), mỗi cụm một xương dtl_o_* con của xương thân gần nhất,
#      đầu ở đỉnh cụm, trọng số tăng dần xuống dưới. Extras `dtl.springs` cho client.
#   5. Gộp một lưới, một vật liệu: atlas màu + pháp tuyến + mặt nạ (R chính, G phụ, B viền; đi qua kênh ORM) + vân sáng (emissive) theo bảng màu.
#
# Biến nhận từ import_tripo: ASSET_ID, META, ARMATURES, MESHES, REPO, SOURCE_ROOT, fail.

import ast
import json
import math
import os
import re
import runpy

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

REPORT = {}
CFG = (META.get('import') or {}).get('outfit') or {}  # noqa: F821
if not CFG.get('player') or not CFG.get('dir'):
    fail('import.outfit: cần player và dir')  # noqa: F821
PARTS = runpy.run_path(os.path.join(REPO, 'tools/blender/biped_parts.py'))  # noqa: F821
ORDER = ['ao_ngoai', 'lop_duoi', 'vai_giap', 'dai_tua', 'ung', 'trang_suc_dau']
ATLAS = int(CFG.get('atlas', 1024))
CELLS = CFG.get('cells') or {
    'ao_ngoai': [0, 0, .5, .5], 'lop_duoi': [.5, 0, .5, .5], 'vai_giap': [0, .5, .5, .25],
    'dai_tua': [.5, .5, .5, .25], 'ung': [0, .75, .5, .25], 'trang_suc_dau': [.5, .75, .5, .25],
}
# Mặc định theo mảnh. fit: biểu thức theo mốc; weights: transfer | head; islands: trọng số trung bình theo đảo; spring: xương lò xo tự động.
PIECE_DEFAULTS = {
    'ao_ngoai': {'fit': {'top': 'neck_z+0.05', 'bottom': 'ankle_z+0.5*(knee_z-ankle_z)', 'cy': 'y_spine1', 'alignZ': 'top'},
                 'weights': 'transfer', 'legBlend': 0.4, 'spring': {'count': 8, 'minDist': 0.05, 'weight': 0.8}},
    'lop_duoi': {'fit': {'top': 'hip_z+0.12', 'bottom': 'ankle_z+0.05', 'cy': 'y_hips', 'alignZ': 'top'},
                 'weights': 'transfer', 'legBlend': 0.5, 'spring': {'count': 4, 'minDist': 0.04, 'weight': 0.6}},
    'vai_giap': {'fit': {'x': 'shoulder_span+0.24', 'cy': 'y_spine2', 'cz': 'shoulder_z+0.03'}, 'weights': 'transfer', 'islands': True},
    'dai_tua': {'fit': {'x': 'waist_w+0.07', 'y': 'waist_d+0.06', 'top': 'hip_z+0.13', 'cy': 'y_hips', 'alignZ': 'top'},
                'weights': 'transfer', 'smooth': 1, 'spring': {'count': 4, 'minDist': 0.03, 'weight': 0.8}},
    'ung': {'fit': {'x': 'leg_span+0.15', 'bottom': '0.0', 'top': 'knee_z-0.04', 'cy': 'y_foot', 'alignZ': 'bottom'},
            'weights': 'transfer', 'smooth': 0},
    'trang_suc_dau': {'fit': {'x': '0.30', 'top': 'head_z+0.19', 'cy': 'y_head', 'alignZ': 'top'},
                      'weights': 'head', 'spring': {'count': 3, 'minDist': 0.03, 'weight': 0.9}},
}


def key(name):
    return re.sub(r'[^a-z0-9]', '', re.sub(r'^mixamorig[:_]?', '', name.lower()))


# ---------- nhân vật đích ----------
before = set(bpy.data.objects)
pg = os.path.join(REPO, 'assets', 'build', 'raw', CFG['player'] + '.glb')  # noqa: F821
if not os.path.isfile(pg):
    fail(f'chưa có GLB thô {pg}')  # noqa: F821
bpy.ops.import_scene.gltf(filepath=pg)
new = [o for o in bpy.data.objects if o not in before]
P = next((o for o in new if o.type == 'ARMATURE'), None)
bodies = [o for o in new if o.type == 'MESH' and len(o.data.vertices) > 100]
if not P or not bodies:
    fail('GLB nhân vật thiếu armature/mesh')  # noqa: F821
body = max(bodies, key=lambda o: len(o.data.vertices))
bpy.context.view_layer.update()
by_key = {key(b.name): b.name for b in P.data.bones}


def bone(k):
    if k not in by_key:
        fail(f'thân nền thiếu xương {k}')  # noqa: F821
    return P.data.bones[by_key[k]]


def H(k):
    return P.matrix_world @ bone(k).head_local


# ---------- mốc ----------
rest_v = [body.matrix_world @ v.co for v in body.data.vertices]
LM = {
    'neck_z': H('neck').z, 'head_z': H('head').z, 'head_top_z': max(v.z for v in rest_v),
    'hip_z': H('hips').z, 'knee_z': H('leftleg').z, 'ankle_z': H('leftfoot').z,
    'shoulder_z': H('leftarm').z, 'shoulder_span': abs(H('leftarm').x - H('rightarm').x),
    'leg_span': abs(H('leftleg').x - H('rightleg').x),
    'y_spine1': H('spine1').y, 'y_spine2': H('spine2').y, 'y_hips': H('hips').y, 'y_head': H('head').y,
}
LM['y_foot'] = (H('leftfoot').y + H('lefttoebase').y) / 2 if 'lefttoebase' in by_key else H('leftfoot').y
band = [v for v in rest_v if LM['hip_z'] + 0.05 < v.z < LM['hip_z'] + 0.22 and abs(v.x) < 0.25]
LM['waist_w'] = (max(v.x for v in band) - min(v.x for v in band)) if band else 0.36
# Bề sâu: đối xứng quanh trục hông từ mặt trước (lưng có vỏ kiếm nhô ra nên không đo hai phía)
LM['waist_d'] = 2 * (LM['y_hips'] - min(v.y for v in band)) if band else 0.24
LM['zero'] = 0.0

# ---------- tư thế căn (tay thả) ----------
ARM = float((CFG.get('fitPose') or {}).get('armDown', 70))
AXY = Vector((0, 1, 0))


def pose(deg):
    for pb in P.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    for side, sg in (('left', 1), ('right', -1)):
        pb = P.pose.bones[by_key[side + 'arm']]
        m = pb.bone.matrix_local.to_3x3()
        r = Matrix.Rotation(math.radians(deg * sg), 3, AXY)
        pb.rotation_quaternion = (m.inverted() @ r @ m).to_quaternion()
    bpy.context.view_layer.update()


pose(ARM)
hand = P.matrix_world @ P.pose.bones[by_key['lefthand']].head
if hand.z > H('lefthand').z - 0.05:  # chiều quay sai: đảo dấu
    ARM = -ARM
    pose(ARM)
dg = bpy.context.evaluated_depsgraph_get()
bo = body.evaluated_get(dg)
bme = bo.to_mesh()
pv = [bo.matrix_world @ v.co for v in bme.vertices]
vg_name = {g.index: g.name for g in body.vertex_groups}
bw = [{vg_name[g.group]: g.weight for g in v.groups if g.weight > 1e-4 and g.group in vg_name} for v in bme.vertices]
faces = [tuple(p.vertices) for p in bme.polygons for _ in [0]] if False else []
for p in bme.polygons:
    t = list(p.vertices)
    for i in range(1, len(t) - 1):
        faces.append((t[0], t[i], t[i + 1]))
bo.to_mesh_clear()
TREE = BVHTree.FromPolygons(pv, faces)
SKIN = {}
for b in P.data.bones:
    pbn = P.pose.bones[b.name]
    SKIN[b.name] = (P.matrix_world @ pbn.matrix) @ (P.matrix_world @ b.matrix_local).inverted()
SKIN_INV = {n: m.inverted() for n, m in SKIN.items()}


def unpose(p, w):
    acc, tot = Vector(), 0.0
    for n, x in w.items():
        m = SKIN_INV.get(n)
        if m:
            acc += x * (m @ p)
            tot += x
    return acc / tot if tot else p


def parent_bone_of(name):
    """Xương thân (không dtl_*) gần nhất theo cha."""
    b = P.data.bones.get(name)
    while b and b.name.startswith('dtl_'):
        b = b.parent
    return b.name if b else by_key['hips']


# ---------- nạp mảnh ----------
SRC = os.path.join(SOURCE_ROOT, CFG['dir'])  # noqa: F821


def find_image(socket):
    seen, stack = set(), [socket]
    while stack:
        s = stack.pop()
        for lk in s.links:
            n = lk.from_node
            if n.type == 'TEX_IMAGE' and n.image:
                return n.image
            if n not in seen:
                seen.add(n)
                stack += [i for i in n.inputs]
    return None


def load_piece(name):
    path = os.path.join(SRC, f'raw_{name}_v01.glb')
    if not os.path.isfile(path):
        fail(f'thiếu mảnh {path}')  # noqa: F821
    b0 = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    ob = [o for o in bpy.data.objects if o not in b0]
    meshes = [o for o in ob if o.type == 'MESH']
    if len(meshes) != 1:
        fail(f'{name}: cần đúng một mesh, có {len(meshes)}')  # noqa: F821
    m = meshes[0]
    verts = [m.matrix_world @ v.co for v in m.data.vertices]
    polys = [tuple(p.vertices) for p in m.data.polygons]
    uvl = m.data.uv_layers.active
    loops = [tuple(uvl.data[li].uv) for p in m.data.polygons for li in p.loop_indices]
    mat = m.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    color = find_image(bsdf.inputs['Base Color'])
    normal = find_image(bsdf.inputs['Normal'])
    return {'name': name, 'verts': verts, 'polys': polys, 'uv': loops, 'color': color, 'normal': normal, 'objs': ob}


def ev(expr):
    """Biểu thức số học theo mốc (chỉ + - * / ngoặc, số và tên trong LM), tính bằng ast, không eval."""
    if not isinstance(expr, str):
        return float(expr)

    def node(n):
        if isinstance(n, ast.Expression):
            return node(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return float(n.value)
        if isinstance(n, ast.Name) and n.id in LM:
            return LM[n.id]
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.UAdd, ast.USub)):
            v = node(n.operand)
            return -v if isinstance(n.op, ast.USub) else v
        if isinstance(n, ast.BinOp) and isinstance(n.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
            a, b = node(n.left), node(n.right)
            return a + b if isinstance(n.op, ast.Add) else a - b if isinstance(n.op, ast.Sub) else a * b if isinstance(n.op, ast.Mult) else a / b
        fail(f'biểu thức fit không hợp lệ: {expr}')  # noqa: F821

    return node(ast.parse(expr, mode='eval'))


def fit(verts, spec):
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    ext = hi - lo
    sx = sy = sz = None
    if 'x' in spec:
        sx = ev(spec['x']) / ext.x
    if 'y' in spec:
        sy = ev(spec['y']) / ext.y
    if 'top' in spec and 'bottom' in spec:
        sz = (ev(spec['top']) - ev(spec['bottom'])) / ext.z
    elif 'z' in spec:
        sz = ev(spec['z']) / ext.z
    s0 = next(s for s in (sz, sx, sy, 1.0) if s is not None)
    sx, sy, sz = (sx or s0), (sy or s0), (sz or s0)
    az = spec.get('alignZ', 'center')
    cx = ev(spec.get('cx', 0.0))
    cy = ev(spec['cy']) if 'cy' in spec else None
    ctr = (lo + hi) / 2
    if az == 'top':
        z_ref, z_at = hi.z, ev(spec['top'])
    elif az == 'bottom':
        z_ref, z_at = lo.z, ev(spec['bottom'])
    else:
        z_ref, z_at = ctr.z, ev(spec['cz']) if 'cz' in spec else (ev(spec['top']) + ev(spec['bottom'])) / 2
    out = []
    for v in verts:
        out.append(Vector((cx + (v.x - ctr.x) * sx, (cy if cy is not None else 0.0) + (v.y - ctr.y) * sy, z_at + (v.z - z_ref) * sz)))
    return out, (sx, sy, sz)


def transfer(points, hand_to_forearm=True):
    infl = []
    for p in points:
        loc, nor, fi, dist = TREE.find_nearest(p)
        tri = faces[fi]
        a, b, c = (pv[i] for i in tri)
        v0, v1, v2 = b - a, c - a, loc - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01 or 1e-12
        wv, ww = (d11 * d20 - d01 * d21) / den, (d00 * d21 - d01 * d20) / den
        acc = {}
        for k, i in zip((1 - wv - ww, wv, ww), tri):
            for n, w in bw[i].items():
                kk = key(n)
                if kk == 'dtl_sword':
                    n = by_key['spine2']
                elif hand_to_forearm and 'hand' in kk:
                    side = 'left' if kk.startswith('left') else 'right'
                    n = by_key[side + 'forearm']
                acc[n] = acc.get(n, 0.0) + max(k, 0.0) * w
        tot = sum(acc.values()) or 1.0
        infl.append({n: w / tot for n, w in acc.items() if w / tot > 0.005})
    return infl


def islands(npoly, polys):
    parent = list(range(len(polys)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    owner = {}
    for i, p in enumerate(polys):
        for v in p:
            if v in owner:
                parent[find(i)] = find(owner[v])
            else:
                owner[v] = i
    comp = {}
    for v, i in owner.items():
        comp.setdefault(find(i), []).append(v)
    return list(comp.values())


def smooth_w(infl, polys, iters):
    nbr = [set() for _ in infl]
    for p in polys:
        for i, a in enumerate(p):
            for b in (p[(i + 1) % len(p)], p[i - 1]):
                nbr[a].add(b)
    for _ in range(iters):
        out = []
        for i, w in enumerate(infl):
            if not nbr[i]:
                out.append(w)
                continue
            acc = {n: x * 0.5 for n, x in w.items()}
            sh = 0.5 / len(nbr[i])
            for j in nbr[i]:
                for n, x in infl[j].items():
                    acc[n] = acc.get(n, 0.0) + x * sh
            tot = sum(acc.values()) or 1.0
            out.append({n: x / tot for n, x in acc.items()})
        infl[:] = out


def leg_blend(points, infl, amount):
    legs = {s: by_key[s + 'upleg'] for s in ('left', 'right')}
    hz = LM['hip_z']
    half = abs(H('leftupleg').x - H('rightupleg').x) / 2 or 0.1
    for i, w in enumerate(infl):
        z = points[i].z
        if z > hz - 0.02:
            continue
        ls = sum(w.get(n, 0.0) for n in legs.values())
        if ls <= 0:
            continue
        sh = amount * max(0.0, 1.0 - abs(points[i].x) / half * 0.6) * min(1.0, (hz - z) / 0.25)
        for n in legs.values():
            w[n] = w.get(n, 0.0) * (1 - sh) + ls * sh * 0.5


def kmeans(idx, pts, k):
    cs = [pts[idx[0]]]
    while len(cs) < k:
        far = max(idx, key=lambda i: min((pts[i] - c).length_squared for c in cs))
        cs.append(pts[far])
    lab = {}
    for _ in range(8):
        groups = [[] for _ in cs]
        for i in idx:
            j = min(range(len(cs)), key=lambda j: (pts[i] - cs[j]).length_squared)
            groups[j].append(i)
            lab[i] = j
        cs = [sum((pts[i] for i in g), Vector()) / len(g) if g else cs[j] for j, g in enumerate(groups)]
    return [g for g in (groups) if len(g) >= 8]


# ---------- xử lý từng mảnh ----------
MERGED = {'verts': [], 'polys': [], 'uv': [], 'w': [], 'ids': []}
SPRING = []  # (tên, xương cha, đầu rest, đuôi rest)
report_pieces = {}
imgs_color, imgs_normal = {}, {}
for name in ORDER:
    pc = load_piece(name)
    d = json.loads(json.dumps(PIECE_DEFAULTS[name]))
    over = (CFG.get('pieces') or {}).get(name) or {}
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(d.get(k), dict):
            d[k].update(v)
        else:
            d[k] = v
    if d.get('hide'):
        continue
    pts, sc = fit(pc['verts'], d['fit'])
    if d['weights'] == 'head':
        hb = by_key['head']
        infl = [{hb: 1.0} for _ in pts]
    else:
        infl = transfer(pts)
        if d.get('legBlend'):
            leg_blend(pts, infl, float(d['legBlend']))
        smooth_w(infl, pc['polys'], int(d.get('smooth', 2)))
        if d.get('islands'):
            for comp in islands(len(pts), pc['polys']):
                avg = {}
                for v in comp:
                    for n, x in infl[v].items():
                        avg[n] = avg.get(n, 0.0) + x / len(comp)
                for v in comp:
                    infl[v] = dict(avg)
    # xương lò xo tự động (trong tư thế căn)
    sp = d.get('spring')
    nb = 0
    if sp:
        cand = [i for i, p in enumerate(pts) if TREE.find_nearest(p)[3] > float(sp.get('minDist', 0.05))]
        if len(cand) > 12:
            for g in kmeans(cand, pts, int(sp.get('count', 4))):
                zs = [pts[i].z for i in g]
                ztop, zbot = max(zs), min(zs)
                if ztop - zbot < 0.05:
                    continue
                cen = sum((pts[i] for i in g), Vector()) / len(g)
                top = [i for i in g if pts[i].z > ztop - 0.04]
                par_w = {}
                for i in top:
                    for n, x in infl[i].items():
                        par_w[n] = par_w.get(n, 0.0) + x
                parent = parent_bone_of(max(par_w, key=par_w.get)) if par_w else by_key['hips']
                bname = f'dtl_o_{name}_{nb}'
                nb += 1
                W = float(sp.get('weight', 0.8))
                for i in g:
                    t = (ztop - pts[i].z) / (ztop - zbot)
                    h = W * t * t * (3 - 2 * t)
                    if h < 0.02:
                        continue
                    infl[i] = {n: x * (1 - h) for n, x in infl[i].items()}
                    infl[i][bname] = h
                head_p = Vector((cen.x, cen.y, ztop))
                tail_p = Vector((cen.x, cen.y, zbot - 0.02))
                SPRING.append((bname, parent, unpose(head_p, {parent: 1.0}), unpose(tail_p, {parent: 1.0})))
    # đưa về tư thế nghỉ
    rest = []
    for p, w in zip(pts, infl):
        wb = {n: x for n, x in w.items() if not n.startswith('dtl_o_')}
        # trọng số của xương lò xo mới tính theo xương cha ở tư thế căn
        for n, x in w.items():
            if n.startswith('dtl_o_'):
                par = next(s[1] for s in SPRING if s[0] == n)
                wb[par] = wb.get(par, 0.0) + x
        rest.append(unpose(p, wb))
    off = len(MERGED['verts'])
    cell = CELLS[name]
    for (u, v) in pc['uv']:
        pad = 1.5 / ATLAS
        uu = cell[0] + cell[2] * (pad + min(max(u, 0), 1) * (1 - 2 * pad) / 1.0 / 1.0) if False else cell[0] + cell[2] * min(max(u, 0.0), 1.0) * (1 - 2 * pad / cell[2]) + pad
        vv = (1 - cell[1] - cell[3]) + cell[3] * min(max(v, 0.0), 1.0) * (1 - 2 * pad / cell[3]) + pad
        MERGED['uv'].append((uu, vv))
    MERGED['verts'] += rest
    MERGED['polys'] += [tuple(off + i for i in p) for p in pc['polys']]
    MERGED['w'] += infl
    imgs_color[name], imgs_normal[name] = pc['color'], pc['normal']
    report_pieces[name] = {'tris': sum(len(p) - 2 for p in pc['polys']), 'scale': [round(x, 3) for x in sc], 'spring': nb,
                           'z': [round(min(v.z for v in rest), 3), round(max(v.z for v in rest), 3)]}

# ---------- atlas ----------
def pixels(img, w, h):
    c = img.copy()
    c.scale(w, h)
    a = np.empty(w * h * 4, dtype=np.float32)
    c.pixels.foreach_get(a)
    bpy.data.images.remove(c)
    return a.reshape(h, w, 4)


atlas_c = np.zeros((ATLAS, ATLAS, 4), np.float32)
atlas_n = np.zeros((ATLAS, ATLAS, 4), np.float32)
atlas_n[..., 0] = atlas_n[..., 1] = 0.5
atlas_n[..., 2] = 1.0
atlas_n[..., 3] = 1.0
atlas_c[..., 3] = 1.0
for name in ORDER:
    if name not in imgs_color:
        continue
    cx, cy, cw, ch = CELLS[name]
    x0, w = int(round(cx * ATLAS)), int(round(cw * ATLAS))
    y1 = int(round((1 - cy) * ATLAS))
    h = int(round(ch * ATLAS))
    y0 = y1 - h  # hàng 0 = đáy (Blender)
    if imgs_color[name]:
        atlas_c[y0:y1, x0:x0 + w] = pixels(imgs_color[name], w, h)
    if imgs_normal[name]:
        atlas_n[y0:y1, x0:x0 + w] = pixels(imgs_normal[name], w, h)


def lin_hex(hx):
    c = [int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return np.array([x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], np.float32)


pal = CFG.get('palette') or {}
cols = [lin_hex(pal.get(k, '#808080')) for k in ('main', 'sec', 'trim')]
acc = lin_hex(pal.get('accent', '#E8A33D'))
rgb = atlas_c[..., :3]
# So sánh theo sRGB gần đúng (căn bậc ~2,2) cho khoảng cách mang tính thị giác
def sr(a):
    return np.clip(a, 0, 1) ** (1 / 2.2)


d2 = [((sr(rgb) - sr(c)) ** 2).sum(-1) for c in cols]
tau = 0.05
wts = [np.exp(-d / tau) for d in d2]
tot = sum(wts) + 1e-6
mask = np.stack([w / tot for w in wts], -1)
mx = rgb.max(-1)
mn = rgb.min(-1)
sat = (mx - mn) / (mx + 1e-4)
dacc = ((sr(rgb) - sr(acc)) ** 2).sum(-1)
glow = np.clip((0.06 - dacc) / 0.05, 0, 1) * np.clip((sat - 0.35) / 0.25, 0, 1)
ma = np.zeros_like(atlas_c)
ma[..., 0:3] = mask
ma[..., 3] = 1.0
em = np.zeros_like(atlas_c)
em[..., 0:3] = (glow[..., None] * acc[None, None, :])
em[..., 3] = 1.0


def make_img(nm, arr, srgb):
    """Ảnh từ mảng numpy: ghi PNG tạm rồi nạp lại (foreach_set + pack trên ảnh sinh ra cho ảnh đen ở Blender 5)."""
    import tempfile
    im = bpy.data.images.new(nm + '_gen', ATLAS, ATLAS, alpha=False)
    im.pixels.foreach_set(arr.reshape(-1))
    im.update()
    path = os.path.join(tempfile.gettempdir(), f'{nm}.png')
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)
    im2 = bpy.data.images.load(path)
    im2.name = nm
    im2.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    im2.pack()
    return im2


im_c = make_img(ASSET_ID + '_color', atlas_c, True)  # noqa: F821
im_n = make_img(ASSET_ID + '_normal', atlas_n, False)  # noqa: F821
im_m = make_img(ASSET_ID + '_orm', ma, False)  # noqa: F821
im_e = make_img(ASSET_ID + '_emissive', em, True)  # noqa: F821

# ---------- dựng lưới gộp ----------
for o in list(bpy.data.objects):
    if o is P:
        continue
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes,):
    for m_ in list(coll):
        if m_.users == 0:
            coll.remove(m_)
me = bpy.data.meshes.new(ASSET_ID)  # noqa: F821
bm = bmesh.new()
bv = [bm.verts.new(v) for v in MERGED['verts']]
uvl = bm.loops.layers.uv.new('UVMap')
k = 0
for p in MERGED['polys']:
    try:
        f = bm.faces.new([bv[i] for i in p])
    except ValueError:
        k += sum(1 for _ in p)
        continue
    for lp in f.loops:
        lp[uvl].uv = MERGED['uv'][k]
        k += 1
bm.normal_update()
bm.to_mesh(me)
bm.free()
G = bpy.data.objects.new(ASSET_ID, me)  # noqa: F821
bpy.context.scene.collection.objects.link(G)
for i, w in enumerate(MERGED['w']):
    for n, x in w.items():
        if n.startswith('dtl_o_') or P.data.bones.get(n):
            vg = G.vertex_groups.get(n) or G.vertex_groups.new(name=n)
            vg.add([i], x, 'REPLACE')

# ---------- xương lò xo mới ----------
if SPRING:
    bpy.context.view_layer.objects.active = P
    pose(0)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = P.data.edit_bones
    ainv = P.matrix_world.inverted()
    for n, par, h, t in SPRING:
        e = eb.new(n)
        e.head, e.tail = ainv @ h, ainv @ t
        e.parent = eb[par]
        e.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    for n, par, h, t in SPRING:
        if n not in G.vertex_groups:
            G.vertex_groups.new(name=n)
    PARTS['set_extra'](G, 'springs', [{'bone': n, 'tail': PARTS['to_gltf'](t)} for n, _p, _h, t in SPRING])
else:
    pose(0)

# ---------- vật liệu: màu, pháp tuyến, ORM (mặt nạ), emissive ----------
mat = bpy.data.materials.new(ASSET_ID + '_mat')  # noqa: F821
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial')
bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
nt.links.new(bs.outputs['BSDF'], out.inputs['Surface'])


def tex(im, nc):
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = im
    return t


tc = tex(im_c, False)
nt.links.new(tc.outputs['Color'], bs.inputs['Base Color'])
tn = tex(im_n, True)
nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
tm = tex(im_m, True)
sep = nt.nodes.new('ShaderNodeSeparateColor')
nt.links.new(tm.outputs['Color'], sep.inputs['Color'])
nt.links.new(sep.outputs['Green'], bs.inputs['Roughness'])
nt.links.new(sep.outputs['Blue'], bs.inputs['Metallic'])
te = tex(im_e, False)
nt.links.new(te.outputs['Color'], bs.inputs['Emission Color'])
bs.inputs['Emission Strength'].default_value = 1.0
me.materials.append(mat)
mat.use_backface_culling = False

# ---------- gắn bộ xương ----------
G.parent = P
G.matrix_parent_inverse = P.matrix_world.inverted()
mod = G.modifiers.new('Armature', 'ARMATURE')
mod.object = P
bpy.context.view_layer.objects.active = G
for o in bpy.data.objects:
    o.select_set(False)
G.select_set(True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
for arm in (o for o in bpy.data.objects if o.type == 'ARMATURE'):
    arm.animation_data_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
P.name = ASSET_ID + '_rig'  # noqa: F821
P.data.name = ASSET_ID + '_rig'  # noqa: F821

REPORT = {
    'player': CFG['player'], 'armDown': ARM, 'bones': len(P.data.bones), 'verts': len(me.vertices),
    'tris': sum(len(p.vertices) - 2 for p in me.polygons), 'pieces': report_pieces, 'springBones': len(SPRING),
    'landmarks': {k: round(v, 3) for k, v in LM.items()},
}
