# Pilot C (lớp đồ RỜI trên thân nền): từ HAI GLB đã rig bằng chr_v3 (cùng bộ xương Mannequin) tạo một GLB gồm: bộ xương + lưới THÂN NỀN (A, mask da bị vải che) + lưới LỚP ĐỒ (B', đã cắt phần da trùng thân nền).
#   1. Nhập thân nền đã rig (`--base`, chr_v3 trên raw_base_nu.glb) và bộ đồ đã rig (`--cloth`, chr_v3 trên raw_layered_*.glb, nên dựng với `--base-weights <thân nền>` để phần bó sát lấy trọng số thân nền).
#   2. Trích lớp đồ: đỉnh B' có màu da (texel gần màu da của thân nền) VÀ cách mặt thân nền ≤ `--skin-r` (m, model 1,7 m) là da trùng thân nền (mặt, cổ, tay, chân trần): bỏ các mặt có cả ba đỉnh như vậy.
#      Tóc, mão, vải, ủng không thỏa nên giữ.
#   3. Mask da thân nền: đỉnh thân nền có tia theo pháp tuyến trúng lớp đồ trong `--cover` (m) là bị che: bỏ mặt có cả ba đỉnh bị che, TRỪ vùng bảo vệ (đầu/cổ, bàn tay, bàn chân) để mặt/tay/chân luôn còn.
#   4. Luật tay cứng cho thân trần: đỉnh quá cổ tay theo trục tay (và trong bán kính bàn tay) bám 100% `hand_<l|r>` (chr_v3 chỉ bắt luật này cho model có hộ uyển; thân trần thì 0 đỉnh).
#      Luật vạt (bỏ trọng số đùi, `dtl_o_*` cha pelvis) do chr_v3 áp khi dựng lớp đồ (cấu hình bộ `tinh_khuyet.json`: c2 + skirtThighK); script này KHÔNG đổi.
#   5. Xuất GLB (một bộ xương, hai lưới, cùng skin) + báo cáo (tam giác, mặt bỏ, độ lệch xương giữa hai bản rig).
# Chạy: blender -b --factory-startup --python tools/blender/chr_pilot_c.py -- --base <thân nền rig.glb> --cloth <đồ rig.glb> --out <ra.glb> [--report r.json] [--skin-r 0.02] [--cover 0.08]
import json
import math
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


BASE = opt('--base')
CLOTH = opt('--cloth')
OUT = opt('--out')
REPORT = opt('--report')
SKIN_R = float(opt('--skin-r', 0.02))  # m, model cao 1,7
COVER = float(opt('--cover', 0.08))
SKIN_COL = float(opt('--skin-col', 0.12))  # khoảng cách RGB (0-1) tới màu da thân nền
TEMPLATE = opt('--template')  # UAL1_Standard.glb: đặt lại góc nghỉ cục bộ của xương = template sau khi xuất (như chr_v3) để clip UAL phát trực tiếp trong game
BASE_TRIS = int(opt('--base-tris', 0))  # >0: giảm mặt thân nền về cỡ này trước khi mask (đầu giữ nguyên bằng nhóm đỉnh Head); LOD0 cả hai lưới còn ≤ 110k
HEAD_Z = float(opt('--head-z', 1.38))  # m: trên mức này (đầu/cổ) luôn giữ thân nền
if not (BASE and CLOTH and OUT):
    raise SystemExit('thiếu --base/--cloth/--out')
REP = {}


def log(m):
    print(f'[chr_pilot_c] {m}', flush=True)


def import_glb(path, tag):
    """Nhập một GLB; trả (armature, lưới chính). Đổi tên để hai bản không đụng nhau."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    mesh = max((o for o in new if o.type == 'MESH' and o.name != 'Icosphere'), key=lambda o: len(o.data.vertices))
    for o in new:
        if o.type == 'MESH' and o is not mesh:
            bpy.data.objects.remove(o, do_unlink=True)
    arm.name = f'arm_{tag}'
    mesh.name = f'mesh_{tag}'
    return arm, mesh


bpy.ops.wm.read_factory_settings(use_empty=True)
b_arm, b_mesh = import_glb(BASE, 'base')
c_arm, c_mesh = import_glb(CLOTH, 'cloth')


def decimate_body(o, target):
    """Giảm mặt (Collapse, đối xứng X); đỉnh nhóm `Head` được bảo vệ để mặt không méo."""
    n0 = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if target <= 0 or n0 <= target:
        return n0
    bpy.context.view_layer.objects.active = o
    dec = o.modifiers.new('dec', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = target / n0
    dec.use_collapse_triangulate = True
    dec.use_symmetry = True
    dec.symmetry_axis = 'X'
    if 'Head' in o.vertex_groups:
        dec.vertex_group = 'Head'
        dec.invert_vertex_group = True
        dec.vertex_group_factor = 1.0
    bpy.ops.object.modifier_apply(modifier=dec.name)
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


ARM_RE = re.compile(r'^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)_(?:.*_)?([lr])$')  # chuỗi tay Mannequin (cả xoắn, ngón), không gồm đòn gánh


def match_arms(arm, mesh, ref_mesh):
    """Khớp tư thế tay thân nền theo lớp đồ bằng SỐ HỌC (không qua pose/modifier: bộ nhập GLB của Blender "đoán bind pose" làm modifier nướng bị nhân đôi):
    mỗi bên, xoay quanh khớp vai (đầu `upperarm_<l|r>`) sao cho hướng vai→đầu bàn tay/tay áo xa nhất (theo x) của THÂN NỀN trùng với của LỚP ĐỒ.
    Đỉnh dịch theo tổng trọng số chuỗi tay (v' = v + w·(R(v−vai)+vai−v)); xương chuỗi tay xoay cùng (edit mode), nên bộ xương vẫn khớp lưới."""
    from mathutils import Matrix
    Mw, Mi = arm.matrix_world, arm.matrix_world.inverted()
    rep = {}
    P = np.array([mesh.matrix_world @ v.co for v in mesh.data.vertices], float).reshape(-1, 3)
    Pc = np.array([ref_mesh.matrix_world @ v.co for v in ref_mesh.data.vertices], float).reshape(-1, 3)
    gname = {g.index: g.name for g in mesh.vertex_groups}
    plans = []
    for sd in 'lr':
        ub = arm.data.bones.get(f'upperarm_{sd}')
        if ub is None:
            continue
        sh = np.array(Mw @ ub.head_local)
        sx = 1.0 if sh[0] > 0 else -1.0
        tb = P[sx * P[:, 0] > (sx * P[:, 0]).max() - 0.02 * 1.7].mean(axis=0)
        tc = Pc[sx * Pc[:, 0] > (sx * Pc[:, 0]).max() - 0.02 * 1.7].mean(axis=0)
        q = Vector(tb - sh).rotation_difference(Vector(tc - sh))
        R = np.array(q.to_matrix())
        rep[sd] = round(math.degrees(q.angle), 2)
        w = np.zeros(len(P))
        for vi, v in enumerate(mesh.data.vertices):
            for ge in v.groups:
                m = ARM_RE.match(gname.get(ge.group, ''))
                if m and m.group(2) == sd:
                    w[vi] += ge.weight
        plans.append((sd, sh, R, np.clip(w, 0, 1)))
    newP = P.copy()
    for sd, sh, R, w in plans:
        rot = (P - sh) @ R.T + sh
        newP += w[:, None] * (rot - P)
    Mi3 = np.array(mesh.matrix_world.inverted())
    for vi, v in enumerate(mesh.data.vertices):
        v.co = Vector(np.array(mesh.matrix_world.inverted() @ Vector(newP[vi])))
    mesh.data.update()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for sd, sh, R, w in plans:
        for eb in arm.data.edit_bones:
            m = ARM_RE.match(eb.name)
            if m and m.group(2) == sd:
                for attr in ('head', 'tail'):
                    pw = np.array(Mw @ getattr(eb, attr))
                    setattr(eb, attr, Mi @ Vector(R @ (pw - sh) + sh))
    bpy.ops.object.mode_set(mode='OBJECT')
    return rep


def world_verts(o):
    return np.array([o.matrix_world @ v.co for v in o.data.vertices], float).reshape(-1, 3)


def tris_of(o):
    o.data.calc_loop_triangles()
    return [tuple(t.vertices) for t in o.data.loop_triangles]


def texel_rgb(o):
    """Màu (0-1, tuyến tính theo ảnh) của texture màu tại mỗi đỉnh (trung bình UV các loop); None nếu thiếu."""
    img = None
    for mat in o.data.materials:
        if mat and mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED' and n.inputs['Base Color'].links:
                    src = n.inputs['Base Color'].links[0].from_node
                    if src.type == 'TEX_IMAGE' and src.image:
                        img = src.image
    uvl = o.data.uv_layers.active
    if img is None or uvl is None:
        return None
    small = img.copy()
    small.scale(256, 256)
    px = np.array(small.pixels[:], np.float32).reshape(256, 256, 4)[:, :, :3]
    bpy.data.images.remove(small)
    acc = np.zeros((len(o.data.vertices), 3))
    cnt = np.zeros(len(o.data.vertices))
    for loop in o.data.loops:
        u, v = uvl.data[loop.index].uv
        acc[loop.vertex_index] += px[int(np.clip(v, 0, 0.9999) * 256), int(np.clip(u % 1.0, 0, 0.9999) * 256)]
        cnt[loop.vertex_index] += 1
    return acc / np.maximum(cnt, 1)[:, None]


# ---------- độ lệch xương giữa hai bản rig (cùng tên xương Mannequin) ----------
common = [b.name for b in b_arm.data.bones if b.name in c_arm.data.bones]
dev = {}
for n in common:
    hb = np.array(b_arm.matrix_world @ b_arm.data.bones[n].head_local)
    hc = np.array(c_arm.matrix_world @ c_arm.data.bones[n].head_local)
    dev[n] = float(np.linalg.norm(hb - hc)) * 100.0
worst = sorted(dev.items(), key=lambda kv: -kv[1])[:6]
core = [v for k, v in dev.items() if not any(f in k for f in ('thumb', 'index', 'middle', 'ring', 'pinky'))]
REP['bone_dev_cm_core'] = {'n': len(core), 'max': round(max(core), 2), 'mean': round(sum(core) / len(core), 2)}
REP['bone_dev_cm'] = {'common': len(common), 'max': round(max(dev.values()), 2), 'mean': round(sum(dev.values()) / len(dev), 2), 'worst': [(k, round(v, 2)) for k, v in worst]}
log(f'xương chung {len(common)}, lệch đầu xương max {REP["bone_dev_cm"]["max"]} cm, trung bình {REP["bone_dev_cm"]["mean"]} cm')

if '--no-match-arms' not in argv:
    REP['match_arms_deg'] = match_arms(b_arm, b_mesh, c_mesh)
    log(f'khớp tư thế tay thân nền theo lớp đồ: xoay {REP["match_arms_deg"]} độ')
REP['base_decimate'] = {'before': sum(len(p.vertices) - 2 for p in b_mesh.data.polygons), 'after': decimate_body(b_mesh, BASE_TRIS)}
VB, VC = world_verts(b_mesh), world_verts(c_mesh)
TB, TC = tris_of(b_mesh), tris_of(c_mesh)
H = float(VB[:, 2].max() - VB[:, 2].min())
sk = H / 1.7
bvh_b = BVHTree.FromPolygons([tuple(v) for v in VB.tolist()], TB)

# ---------- 2. trích lớp đồ ----------
tx_b, tx_c = texel_rgb(b_mesh), texel_rgb(c_mesh)
if tx_b is None or tx_c is None:
    raise SystemExit('thiếu texture màu để nhận biết da')
head = VB[:, 2] > HEAD_Z * sk
skin_ref = np.median(tx_b[head & (np.abs(VB[:, 0]) < 0.1 * sk)], axis=0)  # màu da: mặt/cổ thân nền
log(f'màu da thân nền (rgb tuyến tính ảnh) {skin_ref.round(3).tolist()}')
near = np.zeros(len(VC))
for i in range(len(VC)):
    loc, nrm, fi, dd = bvh_b.find_nearest(Vector(VC[i]), 0.2)
    near[i] = dd if fi is not None else 9.0
# Đầu: mặt/cổ/tai của B' (khác hình với thân nền) bỏ theo màu da bất kể khoảng cách (thân nền giữ nguyên đầu); thân/tay/chân: phải trùng mặt thân nền.
skin_like = (np.linalg.norm(tx_c - skin_ref, axis=1) < SKIN_COL) & ((near <= SKIN_R * sk) | (VC[:, 2] > HEAD_Z * sk))
cut_faces = [i for i, t in enumerate(TC) if all(skin_like[v] for v in t)]
REP['cloth'] = {'verts': len(VC), 'tris': len(TC), 'skin_like_verts': int(skin_like.sum()), 'tris_removed': len(cut_faces)}
log(f'lớp đồ: {int(skin_like.sum())} đỉnh da trùng thân nền, bỏ {len(cut_faces)}/{len(TC)} tam giác')

# ---------- 3. mask da thân nền ----------
bm_c = bmesh.new()
bm_c.from_mesh(c_mesh.data)
bm_c.faces.ensure_lookup_table()
# loop_triangles tam giác hóa mặt đa giác: lưới từ chr_v3 đã là tam giác (giữ 1-1 chỉ số); nếu khác thì tách theo đa giác.
ok_tri = len(bm_c.faces) == len(TC)
cut_set = set(cut_faces)
if ok_tri:
    bmesh.ops.delete(bm_c, geom=[bm_c.faces[i] for i in cut_faces], context='FACES')
else:
    log('CẢNH BÁO: lưới đồ không phải toàn tam giác; bỏ qua cắt mặt (chỉ báo số liệu)')
cloth_keep_tris = [t for i, t in enumerate(TC) if i not in cut_set]
VCw = VC
bvh_c = BVHTree.FromPolygons([tuple(v) for v in VCw.tolist()], cloth_keep_tris)
normals = np.array([(b_mesh.matrix_world.to_3x3() @ v.normal)[:] for v in b_mesh.data.vertices], float).reshape(-1, 3)
covered = np.zeros(len(VB), bool)
protect = (VB[:, 2] > HEAD_Z * sk) | (np.abs(VB[:, 0]) > 0.34 * sk) | (VB[:, 2] < 0.12 * sk)  # đầu/cổ, bàn tay (x ra xa), bàn chân
for i in range(len(VB)):
    if protect[i]:
        continue
    d = Vector(normals[i])
    if d.length < 1e-6:
        continue
    hit = bvh_c.ray_cast(Vector(VB[i]) + d.normalized() * 0.002, d.normalized(), COVER * sk)
    covered[i] = hit[0] is not None
bm_b = bmesh.new()
bm_b.from_mesh(b_mesh.data)
bm_b.faces.ensure_lookup_table()
ok_tri_b = len(bm_b.faces) == len(TB)
rm_b = [i for i, t in enumerate(TB) if all(covered[v] for v in t)] if ok_tri_b else []
if ok_tri_b:
    bmesh.ops.delete(bm_b, geom=[bm_b.faces[i] for i in rm_b], context='FACES')
log(f'thân nền: {int(covered.sum())} đỉnh bị vải che, bỏ {len(rm_b)}/{len(TB)} tam giác')
REP['base'] = {'verts': len(VB), 'tris': len(TB), 'covered_verts': int(covered.sum()), 'tris_removed': len(rm_b)}
for bm, o in ((bm_c, c_mesh), (bm_b, b_mesh)):
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()

# ---------- 4. tay cứng cho thân trần (cả hai lưới), theo xương tay của bộ xương thân nền ----------
FOREARM_BAND = 0.02 * sk


def rigid_hands(o):
    """Đỉnh quá cổ tay theo trục tay (và trong bán kính bàn tay) bám 100% `hand_<l|r>`; dải ±FOREARM_BAND trộn tuyến tính từ trọng số cũ."""
    n_total = 0
    V = world_verts(o)
    vg = o.vertex_groups
    for sd in 'lr':
        hb = b_arm.data.bones.get(f'hand_{sd}')
        tip = b_arm.data.bones.get(f'middle_03_{sd}') or b_arm.data.bones.get(f'middle_02_{sd}')
        if hb is None or tip is None or f'hand_{sd}' not in vg:
            log(f'thiếu xương tay {sd}, bỏ qua')
            continue
        w0 = np.array(b_arm.matrix_world @ hb.head_local)
        w1 = np.array(b_arm.matrix_world @ tip.tail_local)
        log(f'DBG tay {sd}: cổ tay {w0.round(3).tolist()}, ngọn {w1.round(3).tolist()}, đỉnh trong 0,15 m quanh cổ tay {int((np.linalg.norm(V - w0, axis=1) < 0.15 * sk).sum())}')
        ax = w1 - w0
        axl = float(np.linalg.norm(ax))
        axu = ax / max(axl, 1e-9)
        rel = V - w0
        tp = rel @ axu
        perp = np.linalg.norm(rel - np.outer(tp, axu), axis=1)
        ids = np.where((tp > FOREARM_BAND) & (tp < axl + 0.04 * sk) & (perp < 0.075 * sk))[0]
        band = np.where((tp > -FOREARM_BAND) & (tp <= FOREARM_BAND) & (perp < 0.075 * sk))[0]
        hg = vg[f'hand_{sd}']
        for vi in ids:
            for g in list(o.data.vertices[vi].groups):
                if g.group != hg.index:
                    vg[g.group].remove([int(vi)])
            hg.add([int(vi)], 1.0, 'REPLACE')
        for vi in band:
            t = float((tp[vi] + FOREARM_BAND) / (2 * FOREARM_BAND))
            old = {g.group: g.weight for g in list(o.data.vertices[vi].groups)}
            for gi, w in old.items():
                vg[gi].add([int(vi)], w * (1 - t), 'REPLACE')
            hg.add([int(vi)], t + old.get(hg.index, 0.0) * (1 - t), 'REPLACE')
        n_total += len(ids)
    return n_total


REP['hands_rigid'] = {'base': rigid_hands(b_mesh), 'cloth': rigid_hands(c_mesh)}
log(f'tay cứng: thân nền {REP["hands_rigid"]["base"]} đỉnh, lớp đồ {REP["hands_rigid"]["cloth"]} đỉnh')

# ---------- 5. xuất: một bộ xương (của thân nền), hai lưới ----------
# Lớp đồ có trọng số theo xương của bản rig đồ (cùng tên Mannequin + chuỗi dtl_o_*): gắn vào bộ xương thân nền sẽ thiếu xương dtl_o_* → thêm các xương đó vào bộ xương thân nền.
missing = [b.name for b in c_arm.data.bones if b.name not in b_arm.data.bones]
bpy.context.view_layer.objects.active = b_arm
bpy.ops.object.mode_set(mode='EDIT')
for n in missing:
    cb = c_arm.data.bones[n]
    eb = b_arm.data.edit_bones.new(n)
    eb.head = b_arm.matrix_world.inverted() @ (c_arm.matrix_world @ cb.head_local)
    eb.tail = b_arm.matrix_world.inverted() @ (c_arm.matrix_world @ cb.tail_local)
    par = cb.parent.name if cb.parent else None
    if par and par in b_arm.data.edit_bones:
        eb.parent = b_arm.data.edit_bones[par]
bpy.ops.object.mode_set(mode='OBJECT')
REP['bones'] = {'base_armature': len(b_arm.data.bones), 'added_from_cloth': len(missing)}
c_mesh.parent = b_arm
for o in (b_mesh, c_mesh):
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    mod = o.modifiers.new('Armature', 'ARMATURE')
    mod.object = b_arm
bpy.data.objects.remove(c_arm, do_unlink=True)
REP['tris_total'] = sum(len(p.vertices) - 2 for o in (b_mesh, c_mesh) for p in o.data.polygons)
REP['meshes'] = 2
log(f'tổng tam giác {REP["tris_total"]}; xương {len(b_arm.data.bones)} (thêm {len(missing)} từ lớp đồ)')
if len(b_arm.data.bones) > 128:
    log(f'CẢNH BÁO: {len(b_arm.data.bones)} xương > 128')

bpy.ops.object.select_all(action='DESELECT')
for o in (b_arm, b_mesh, c_mesh):
    o.select_set(True)
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
_gx = dict(filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=False, export_extras=True, export_image_format='AUTO', use_selection=True)
if any('DtlAlpha' in o.data.color_attributes for o in (b_mesh, c_mesh)):  # alpha đỉnh của C2 (voan trong suốt) xuất làm COLOR_0
    _gx.update(export_vertex_color='NAME', export_vertex_color_name='DtlAlpha')
b_arm.name = os.path.splitext(os.path.basename(OUT))[0] + '_rig'
bpy.ops.export_scene.gltf(**_gx)
if TEMPLATE and os.path.isfile(TEMPLATE):
    import struct

    def read_glb(path):
        raw = open(path, 'rb').read()
        jl = struct.unpack('<I', raw[12:16])[0]
        return raw, json.loads(raw[20:20 + jl]), jl

    _, tj, _ = read_glb(TEMPLATE)
    trot = {n['name']: n.get('rotation', [0, 0, 0, 1]) for n in tj['nodes'] if 'name' in n}
    raw, gj, jl = read_glb(OUT)
    npatched = 0
    for nd in gj['nodes']:
        nm = nd.get('name')
        if nm in trot and nm not in ('root', 'Armature'):
            nd['rotation'] = [float(x) for x in trot[nm]]
            npatched += 1
    jb = json.dumps(gj, separators=(',', ':')).encode('utf8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    rest = raw[20 + jl:]
    open(OUT, 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + len(rest)) + struct.pack('<I', len(jb)) + b'JSON' + jb + rest)
    REP['rest_patched_nodes'] = npatched
    log(f'đặt lại góc nghỉ {npatched} nút xương = template UAL')
if REPORT:
    json.dump(REP, open(REPORT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
log(f'xong → {OUT}')
