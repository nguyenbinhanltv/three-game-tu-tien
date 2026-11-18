# Nướng vải vạt cho nhân vật v3 (thử nghiệm "cloth bake"): Blender Cloth sim → track xương chuỗi vạt.
#
# Đầu vào: GLB thô đã dựng bằng chr_v3.py (`--base`, lưới + armature Mannequin + lò xo) và hai thư viện clip UAL (--src, --src2).
# Làm gì:
#   1. Chọn vùng vạt (đỉnh dưới thắt lưng, xa trục hông) theo cấu hình --cfg; tách thành lưới mô phỏng riêng (chỉ để chạy sim).
#   2. Dựng `chains × joints` xương `dtl_o_cloth_<k>_<j>` quanh hông (con của pelvis), bỏ 16 xương lò xo vạt cũ, gán lại trọng số vạt hoàn toàn
#      cho chuỗi (tối đa 2 chuỗi × 2 khớp = 4 ảnh hưởng/đỉnh).
#   3. Thân va chạm = các viên nang (hông, ngực, đùi, cẳng, bàn chân) gắn xương, Collision modifier.
#   4. Với mỗi clip: chạy Cloth (đầu vào là chuyển động thật của clip, có chạy đà trước), lấy vị trí đỉnh vạt từng khung, khớp xoay từng xương
#      chuỗi bằng Kabsch có trọng số (chỉ xoay, giữ độ dài; từ gốc ra ngọn), ghi thành action `cloth_<clip>` chỉ có kênh xoay xương chuỗi.
#      Clip lặp được hòa đuôi về đầu để vòng khép kín.
#   5. Đo xuyên thân (cặp mặt chồng + đỉnh vải trong viên nang) trước/sau ở 12 tư thế, xuất GLB: lưới + armature + các action (chỉ xương chuỗi).
# Dùng: blender -b --python cloth_bake.py -- <out.glb> --base <chr_v3b_*.glb> --src <UAL1.glb> --src2 <UAL2.glb> --cfg <cloth.json> [--id ID]
#       [--clips a,b] [--report f.json] [--sheet dir] [--no-export]
import json
import math
import os
import re
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = argv[0]
BASE, SRC1, SRC2, CFG = opt('--base'), opt('--src'), opt('--src2'), opt('--cfg')
ID = opt('--id', 'chr_v3b_cloth')
REPORT, SHEET = opt('--report'), opt('--sheet')
NO_EXPORT = '--no-export' in argv
CF = json.load(open(CFG, encoding='utf-8'))
CLIPS = opt('--clips').split(',') if opt('--clips') else CF['clips']
REP = {'id': ID, 'clips': {}}
T0 = time.time()


def log(m):
    print(f'[cloth] {m}', flush=True)


# ---------- 1. nhập ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene
SC.render.fps = 30
bpy.ops.import_scene.gltf(filepath=BASE)
ARM = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
BODY = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
ARM.name = 'Armature'
log(f'lưới {len(BODY.data.vertices)} đỉnh, {len(ARM.data.bones)} xương; ARM world {tuple(round(x, 3) for x in ARM.matrix_world.to_euler())}')
ACTIONS = {}


def load_actions(path):
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o not in before_o:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in bpy.data.actions:
        if a not in before_a:
            a.use_fake_user = True
            ACTIONS[re.sub(r'\.\d+$', '', a.name.split('|')[-1])] = a


load_actions(SRC1)
load_actions(SRC2)
MARM = np.array(ARM.matrix_world)
MARM_INV = np.linalg.inv(MARM)


def arm_space(obj, co):
    """Tọa độ đối tượng (N×3) → không gian armature."""
    M = MARM_INV @ np.array(obj.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


NV = len(BODY.data.vertices)
buf = np.empty(NV * 3)
BODY.data.vertices.foreach_get('co', buf)
VR = arm_space(BODY, buf.reshape(-1, 3))  # đỉnh nghỉ, không gian armature
height = float(VR[:, 2].max())
PB = ARM.data.bones['pelvis']
cx, cy = float(PB.head_local[0]), float(PB.head_local[1])
KC = height / 1.8
log(f'cao {height:.3f} m, trục hông ({cx:.3f}, {cy:.3f})')

# nhóm trọng số hiện có
GN = [g.name for g in BODY.vertex_groups]
GIDX = {n: i for i, n in enumerate(GN)}
W0 = np.zeros((NV, len(GN)))
for v in BODY.data.vertices:
    for g in v.groups:
        W0[v.index, g.group] = g.weight

# ---------- 2. vùng vạt ----------
zlo, zhi = CF['zMin'] * height, CF['zMax'] * height
rad = np.hypot(VR[:, 0] - cx, VR[:, 1] - cy)
MASK = (VR[:, 2] >= zlo) & (VR[:, 2] <= zhi)  # tạm: thu hẹp sau khi có viên nang
log(f'vùng vạt: {int(MASK.sum())}/{NV} đỉnh, z {zlo:.2f}–{zhi:.2f} m')
REP['mask_verts'] = int(MASK.sum())


# ---------- 3. đo xuyên thân (dùng cho trước/sau) ----------
def region_col(n):
    m = re.search(r'(upperarm|lowerarm|clavicle|hand|thumb|index|middle|ring|pinky)(?:_\d+)?(?:_twist)?_([lr])(?:_|$)', n)
    if m:
        return 'arm_' + m[2]
    m = re.match(r'(thigh|calf|foot|ball)(?:_twist)?_([lr])$', n)
    if m:
        return 'leg_' + m[2]
    return 'torso'


def region_of_verts(W, names):
    dom = np.array([region_col(names[i]) for i in W.argmax(axis=1)], dtype=object)
    # Vạt phân vùng theo phía trái/phải của vị trí (không theo trọng số) để trước/sau so cùng một phép đo.
    sgn = 1.0 if ARM.data.bones['thigh_l'].head_local[0] > 0 else -1.0
    side = np.where((VR[:, 0] - cx) * sgn > 0, 'leg_l', 'leg_r')
    dom[MASK] = side[MASK]
    return dom


PAIRS = [('arm_l', 'torso'), ('arm_r', 'torso'), ('arm_l', 'arm_r'), ('leg_l', 'leg_r'), ('arm_l', 'leg_l'), ('arm_r', 'leg_r')]
CAPS = [('pelvis', 'spine_01', 0.11), ('spine_01', 'spine_03', 0.13), ('spine_03', 'neck_01', 0.10)]
for _sd in 'lr':
    CAPS += [(f'thigh_{_sd}', f'calf_{_sd}', 0.085), (f'calf_{_sd}', f'foot_{_sd}', 0.06), (f'upperarm_{_sd}', f'lowerarm_{_sd}', 0.05),
             (f'lowerarm_{_sd}', f'hand_{_sd}', 0.04)]


def eval_verts(obj):
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    try:
        n = len(m.vertices)
        b = np.empty(n * 3)
        m.vertices.foreach_get('co', b)
        polys = [tuple(p.vertices) for p in m.polygons]
        return arm_space(obj, b.reshape(-1, 3)), polys
    finally:
        ev.to_mesh_clear()


def pen_count(DOM):
    P, polys = eval_verts(BODY)
    co = [Vector(p) for p in P]
    trees = {}
    for r in set(DOM):
        ids = [i for i, p in enumerate(polys) if sum(1 for v in p if DOM[v] == r) >= 2]
        trees[r] = (BVHTree.FromPolygons(co, [polys[i] for i in ids]), ids) if ids else None
    total = 0
    for a, b in PAIRS:
        if not trees.get(a) or not trees.get(b):
            continue
        ta, ia = trees[a]
        tb, ib = trees[b]
        for x, y in ta.overlap(tb):
            if not (set(polys[ia[x]]) & set(polys[ib[y]])):
                total += 1
    return total


def cap_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def cap_inside():
    P, _ = eval_verts(BODY)
    ins = np.zeros(len(P), bool)
    for a_, b_, r in CAPS:
        pa = (MARM @ np.append(np.array(ARM.pose.bones[a_].head), 1))[:3]
        pb = (MARM @ np.append(np.array(ARM.pose.bones[b_].head), 1))[:3]
        ins |= cap_dist(P, pa, pb) < r * KC * 0.9
    return ins


def fcurves_of(act):
    try:
        return list(act.fcurves)
    except AttributeError:
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out += list(cb.fcurves)
        return out


def assign(act):
    ARM.animation_data_create()
    ARM.animation_data.action = act
    if act is not None and hasattr(ARM.animation_data, 'action_slot') and getattr(act, 'slots', None) and len(act.slots):
        ARM.animation_data.action_slot = act.slots[0]


def rest_pose():
    assign(None)
    for pb in ARM.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    bpy.context.view_layer.update()


def pose_at(clip, t):
    act = ACTIONS[clip]
    assign(act)
    f0, f1 = act.frame_range
    SC.frame_set(int(round(f0 + (f1 - f0) * t)))
    bpy.context.view_layer.update()


POSES = [('Idle_Loop', 0.0), ('Jog_Fwd_Loop', 0.25), ('Jog_Fwd_Loop', 0.75), ('Sword_Attack', 0.35), ('Sword_Attack', 0.6), ('Sitting_Idle_Loop', 0.0),
         ('Death01', 1.0), ('Roll', 0.4), ('Jump_Loop', 0.5), ('Spell_Simple_Idle_Loop', 0.5), ('Hit_Chest', 0.3), ('Crouch_Fwd_Loop', 0.5)]


def measure(DOM, chain_pose=None):
    """Đo ở 12 tư thế: cặp mặt chồng và đỉnh vải trong viên nang, đều ở dạng tăng so với tư thế nghỉ. chain_pose(clip, t) đặt xoay xương chuỗi."""
    rest_pose()
    base_pen, base_cap = pen_count(DOM), cap_inside()
    out = []
    for clip, t in POSES:
        if clip not in ACTIONS:
            out.append({'pose': f'{clip}@{t}', 'error': 'không có clip'})
            continue
        pose_at(clip, t)
        if chain_pose:
            chain_pose(clip, t)
            bpy.context.view_layer.update()
        out.append({'pose': f'{clip}@{t}', 'pen': max(0, pen_count(DOM) - base_pen), 'cap': int((cap_inside() & ~base_cap).sum())})
    rest_pose()
    return out


def render_sheet(tag, chain_pose=None):
    if not SHEET:
        return
    os.makedirs(SHEET, exist_ok=True)
    SC.render.engine = 'BLENDER_WORKBENCH'
    SC.display.shading.light = 'STUDIO'
    SC.display.shading.color_type = 'TEXTURE'
    SC.render.resolution_x, SC.render.resolution_y = 320, 440
    SC.render.film_transparent = False
    if not SC.world:
        SC.world = bpy.data.worlds.new('w')
    SC.world.color = (0.55, 0.57, 0.6)
    cam_d = bpy.data.cameras.get('cc') or bpy.data.cameras.new('cc')
    cam_d.type = 'ORTHO'
    cam = bpy.data.objects.get('cc') or bpy.data.objects.new('cc', cam_d)
    if cam.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(cam)
    SC.camera = cam
    sheet = [('Idle_Loop', 0.0), ('Jog_Fwd_Loop', 0.25), ('Sword_Regular_C', 0.5), ('Sitting_Idle_Loop', 0.0), ('Death01', 1.0), ('Roll', 0.4),
             ('Roll', 0.7), ('Hit_Chest', 0.3)]
    if os.environ.get('SHEET_POSES'):
        sheet = [(x.split(':')[0], float(x.split(':')[1])) for x in os.environ['SHEET_POSES'].split(',')]
    az = math.radians(float(os.environ.get('SHEET_AZ', 0)))
    tiles = []
    for i, (clip, t) in enumerate(sheet):
        pose_at(clip, t)
        if chain_pose:
            chain_pose(clip, t)
            bpy.context.view_layer.update()
        cam_d.ortho_scale = max(2.3, height * 1.28)
        cam.location = (6 * math.sin(az), -6 * math.cos(az), height * 0.5)
        cam.rotation_euler = (math.radians(90), 0, az)
        p = os.path.join(SHEET, f'_c{i}.png')
        SC.render.filepath = p
        bpy.ops.render.render(write_still=True)
        tiles.append(p)
    rest_pose()
    imgs = [bpy.data.images.load(p) for p in tiles]
    w, h = imgs[0].size
    px = np.zeros((h * 2, w * 4, 4), np.float32)
    for i, im in enumerate(imgs):
        a = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
        r, c = divmod(i, 4)
        px[(1 - r) * h:(2 - r) * h, c * w:(c + 1) * w] = a
    o = bpy.data.images.new('sheet_' + tag, w * 4, h * 2, alpha=True)
    o.pixels = px.ravel().tolist()
    o.filepath_raw = os.path.join(SHEET, f'{ID}-sheet-{tag}.png')
    o.file_format = 'PNG'
    o.save()
    for p in tiles:
        os.remove(p)
    log(f'tờ khung {tag} → {o.filepath_raw}')


# Vùng vạt thật = đỉnh trong dải z nằm NGOÀI viên nang thân (đùi, cẳng, hông, ngực; không tính tay); theo bán kính thì bỏ sót vạt sau.
_ins = np.zeros(NV, bool)
for a_, b_, r in CAPS:
    if a_.startswith(('upperarm', 'lowerarm', 'spine_03')):
        continue
    _ins |= cap_dist(VR, np.array(ARM.data.bones[a_].head_local), np.array(ARM.data.bones[b_].head_local)) < r * KC * CF['capFac']
SKIRT_W = W0[:, [GIDX[n] for n in GN if n.startswith('dtl_o_skirt')]].sum(axis=1)
MASK = ((VR[:, 2] >= zlo) & (VR[:, 2] <= zhi) & ~_ins) | ((SKIRT_W > 0.01) & (VR[:, 2] >= zlo))
log(f'vùng vạt = ngoài viên nang (hệ số {CF["capFac"]}) hoặc có trọng số lò xo vạt: {int(MASK.sum())} đỉnh, y-cy phân vị 10/50/90 '
    f'{np.percentile(VR[MASK, 1] - cy, 10):.3f}/{np.percentile(VR[MASK, 1] - cy, 50):.3f}/{np.percentile(VR[MASK, 1] - cy, 90):.3f}')
REP['mask_verts'] = int(MASK.sum())
Z_T = np.clip((zhi - VR[:, 2]) / (zhi - zlo), 0, 1)  # 0 ở thắt lưng, 1 ở gấu
# trước: trọng số gốc (lò xo vạt chưa mô phỏng = LBS thuần)
DOM = region_of_verts(W0, GN)
REP['before'] = measure(DOM)
log('TRƯỚC xuyên thân (cặp mặt): ' + ', '.join(f"{p['pose']}={p.get('pen', 'x')}" for p in REP['before']) + f" | tổng {sum(p.get('pen', 0) for p in REP['before'])}")
log('TRƯỚC đỉnh trong viên nang: ' + ', '.join(f"{p['pose']}={p.get('cap', 'x')}" for p in REP['before']) + f" | tổng {sum(p.get('cap', 0) for p in REP['before'])}")
render_sheet('before')

# ---------- 4. lưới mô phỏng (trọng số gốc) ----------


def weld_groups():
    """Đỉnh vạt trùng vị trí (đường nối UV, pháp tuyến tách) gộp thành một đỉnh mô phỏng; Cloth cần lưới liên thông."""
    idx = np.where(MASK)[0]
    key = np.round(VR[idx] / 1e-4).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    gid = -np.ones(NV, int)
    gid[idx] = inv.reshape(-1)
    return gid, idx[first]


GID, REPS = weld_groups()


def make_sim(name, pre_frames):
    faces = set()
    for p in BODY.data.polygons:
        g = [GID[v] for v in p.vertices]
        if min(g) < 0 or len(set(g)) < 3:
            continue
        faces.add(tuple(g))
    used = sorted({v for f in faces for v in f})
    remap = {v: i for i, v in enumerate(used)}
    orig = REPS[used]  # đỉnh gốc đại diện của từng đỉnh mô phỏng
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(VR[o]) for o in orig], [], [tuple(remap[v] for v in f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    vgs_ = {n: ob.vertex_groups.new(name=n) for n in GN}
    for i, o in enumerate(orig):
        for gi in np.nonzero(W0[o])[0]:
            vgs_[GN[gi]].add([i], float(W0[o, gi]), 'REPLACE')
    ob.parent = ARM
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_basis = Matrix.Identity(4)
    ob.modifiers.new('Armature', 'ARMATURE').object = ARM
    pin = ob.vertex_groups.new(name='pin')
    pw = np.clip(1.0 - Z_T[orig] / CF['pinBand'], 0, 1)
    # Thành phần liên thông không có đỉnh ghim thì rơi tự do: ghim nguyên cả mảnh (theo trọng số da gốc).
    adj = [[] for _ in orig]
    for e in me.edges:
        adj[e.vertices[0]].append(e.vertices[1])
        adj[e.vertices[1]].append(e.vertices[0])
    comp = -np.ones(len(orig), int)
    ncomp = 0
    for st in range(len(orig)):
        if comp[st] >= 0:
            continue
        stack = [st]
        comp[st] = ncomp
        while stack:
            u = stack.pop()
            for w_ in adj[u]:
                if comp[w_] < 0:
                    comp[w_] = ncomp
                    stack.append(w_)
        ncomp += 1
    free = 0
    for ci in range(ncomp):
        m_ = comp == ci
        if pw[m_].max() < 0.5:
            pw[m_] = 1.0
            free += int(m_.sum())
    log(f'lưới sim: {len(orig)} đỉnh, {ncomp} mảnh, {free} đỉnh thuộc mảnh không có chỗ ghim (ghim cả mảnh)')
    for i, w in enumerate(pw):
        if w > 0:
            pin.add([i], float(w), 'REPLACE')
    cm = ob.modifiers.new('Cloth', 'CLOTH')
    c = CF['cloth']
    s = cm.settings
    s.quality = c['quality']
    s.mass = c['mass']
    s.air_damping = c['air']
    s.tension_stiffness, s.compression_stiffness, s.shear_stiffness = c['tension'], c['compression'], c['shear']
    s.bending_stiffness = c['bending']
    s.bending_damping, s.tension_damping, s.compression_damping, s.shear_damping = c['bendingDamp'], c['tensionDamp'], c['tensionDamp'], c['tensionDamp']
    s.vertex_group_mass = 'pin'
    s.pin_stiffness = 1.0
    cs = cm.collision_settings
    cs.use_collision = True
    cs.distance_min = c['distance']
    cs.collision_quality = c['collQuality']
    cs.use_self_collision = bool(c['self'])
    cs.self_distance_min = c.get('selfDistance', 0.015)
    cs.impulse_clamp = c.get('impulse', 0.0)
    return ob, orig, cm


def make_colliders():
    objs = []
    kc = KC
    for a_, b_, r in CAPS:
        if a_.startswith(('upperarm', 'lowerarm')) and not CF['collider'].get('arms'):
            continue  # tay không va chạm với vạt (trừ khi bật `arms`)
        ha, hb = np.array(ARM.data.bones[a_].head_local), np.array(ARM.data.bones[b_].head_local)
        L = float(np.linalg.norm(hb - ha))
        bm = bmesh.new()
        rr = r * kc * CF['collider']['radius']
        bmesh.ops.create_cone(bm, cap_ends=False, segments=12, radius1=rr, radius2=rr, depth=L)
        for end in (-1, 1):
            bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=rr,
                                      matrix=Matrix.Translation((0, 0, end * L / 2)))
        z = Vector((0, 0, 1))
        d = Vector(hb - ha).normalized()
        q = z.rotation_difference(d)
        mid = Vector((ha + hb) / 2)
        bmesh.ops.transform(bm, matrix=Matrix.Translation(mid) @ q.to_matrix().to_4x4(), verts=bm.verts)
        me = bpy.data.meshes.new('col_' + a_)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new('col_' + a_, me)
        bpy.context.collection.objects.link(ob)
        vg = ob.vertex_groups.new(name=a_)
        vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
        ob.parent = ARM
        ob.modifiers.new('Armature', 'ARMATURE').object = ARM
        ob.modifiers.new('Collision', 'COLLISION')
        ob.collision.thickness_outer = CF['collider']['thickness']
        ob.collision.cloth_friction = CF['collider']['friction']
        objs.append(ob)
    # mặt đất: vạt rơi/trườn trên sàn khi lăn, ngã (không có thì vải rủ xuyên xuống dưới thân nằm)
    gz = float(VR[:, 2].min())
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=6.0, matrix=Matrix.Translation((0, 0, gz)))
    me = bpy.data.meshes.new('col_ground')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('col_ground', me)
    bpy.context.collection.objects.link(ob)
    ob.modifiers.new('Collision', 'COLLISION')
    ob.collision.thickness_outer = CF['collider']['thickness']
    ob.collision.cloth_friction = CF['collider']['friction']
    objs.append(ob)
    return objs


# ---------- 5. xương chuỗi ----------
NC, NJ = CF['chains'], CF['joints']
sgn_l = 1.0 if ARM.data.bones['thigh_l'].head_local[0] > 0 else -1.0
th_ang = np.arctan2(VR[:, 1] - cy, VR[:, 0] - cx)
CEN = [-math.pi + 2 * math.pi * (k + 0.5) / NC for k in range(NC)]
TJ = [j / (NJ - 1) for j in range(NJ)]  # t của từng khớp (0 = thắt lưng, 1 = gấu)
bpy.context.view_layer.objects.active = ARM
ARM.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = ARM.data.edit_bones
for n in [b.name for b in eb if b.name.startswith('dtl_o_skirt')]:
    eb.remove(eb[n])
NODE = np.zeros((NC, NJ + 1, 3))  # NJ+1: khớp cuối để làm đuôi xương ngọn
CNAME = [[f'dtl_o_cloth_{k}_{j}' for j in range(NJ)] for k in range(NC)]
for k in range(NC):
    dist = np.abs(th_ang - CEN[k])
    dist = np.minimum(dist, 2 * math.pi - dist)
    near = MASK & (dist < math.pi / NC)
    r_all = float(np.median(rad[MASK]))
    for j in range(NJ + 1):
        t = j / (NJ - 1)
        z = zhi - t * (zhi - zlo)
        m = near & (np.abs(VR[:, 2] - z) < (zhi - zlo) * 0.12)
        r = float(np.median(rad[m])) if m.sum() >= 5 else r_all
        NODE[k, j] = [cx + r * math.cos(CEN[k]), cy + r * math.sin(CEN[k]), z]
    for j in range(NJ):
        b = eb.new(CNAME[k][j])
        b.head, b.tail = Vector(NODE[k, j]), Vector(NODE[k, j + 1])
        b.parent = eb['pelvis'] if j == 0 else eb[CNAME[k][j - 1]]
        b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
ALLN = GN + [n for row in CNAME for n in row]  # tên nhóm sau khi thêm chuỗi
NB = len(ALLN)
CIDX = {n: i for i, n in enumerate(ALLN)}

# trọng số chuỗi cho đỉnh vạt: 2 chuỗi gần nhất theo góc × 2 khớp liền kề theo độ sâu
WC = np.zeros((NV, NC, NJ))
for v in np.where(MASK)[0]:
    dd = np.abs(th_ang[v] - np.array(CEN))
    dd = np.minimum(dd, 2 * math.pi - dd)
    o2 = list(np.argsort(dd)[:2])
    ws = [dd[o2[1]], dd[o2[0]]]
    sm = sum(ws) or 1.0
    u = Z_T[v] * (NJ - 1)
    j0 = min(NJ - 2, int(u))
    f = u - j0
    for kk, wk in zip(o2, ws):
        WC[v, kk, j0] += (wk / sm) * (1 - f)
        WC[v, kk, j0 + 1] += (wk / sm) * f

# ma trận nghỉ của xương chuỗi (không gian armature)
REST = {n: np.array(ARM.data.bones[n].matrix_local) for n in [n for row in CNAME for n in row] + ['pelvis']}

# ---------- 6. chạy sim + khớp xương ----------
COLS = make_colliders()
chain_bones = [n for row in CNAME for n in row]


def kabsch_fit(Xs, pelvis_M, pelvis_M0, prev=None):
    """Khớp xoay (thế giới) của mọi xương chuỗi cho một khung. Xs: vị trí đỉnh vạt mô phỏng (không gian armature). Trả {tên: ma trận thế giới 4×4}."""
    out = {}
    T_p = pelvis_M @ np.linalg.inv(pelvis_M0)
    for k in range(NC):
        c = (T_p @ np.append(NODE[k, 0], 1))[:3]
        Dp = T_p[:3, :3]
        for j in range(NJ):
            S, idx, A = FIT[k][j]
            if len(idx) < 3:
                D = Dp
            else:
                b = Xs[idx] - c
                Mm = (b * S[:, None]).T @ A
                Mm += CF['regularize'] * float((S * np.linalg.norm(A, axis=1) * np.linalg.norm(b, axis=1)).sum()) * Dp
                U, _, Vt = np.linalg.svd(Mm)
                d = np.sign(np.linalg.det(U @ Vt)) or 1.0
                D = U @ np.diag([1, 1, d]) @ Vt
            n = CNAME[k][j]
            M = np.eye(4)
            M[:3, :3] = D @ REST[n][:3, :3]
            M[:3, 3] = c + D @ (REST[n][:3, 3] - NODE[k, j])
            out[n] = M
            c = c + D @ (NODE[k, j + 1] - NODE[k, j])
            Dp = D
    return out


# danh sách đỉnh có trọng số theo cây con của từng xương chuỗi (đã đổi sang chỉ số trong lưới sim sau)
def fit_tables(orig):
    """Với mỗi xương chuỗi: đỉnh gốc có trọng số cây con (>0,03), chỉ số đỉnh mô phỏng tương ứng, độ lệch nghỉ so với khớp."""
    gmap = -np.ones(NV, int)  # đỉnh gốc → đỉnh mô phỏng
    sim_of_group = {int(GID[o]): i for i, o in enumerate(orig)}
    for v in np.where(GID >= 0)[0]:
        gmap[v] = sim_of_group.get(int(GID[v]), -1)
    tabs = []
    for k in range(NC):
        row = []
        for j in range(NJ):
            S = WC[:, k, j:].sum(axis=1)
            vs = np.array([v for v in np.where(S > 0.03)[0] if gmap[v] >= 0], int)
            row.append((S[vs], gmap[vs], VR[vs] - NODE[k, j]))
        tabs.append(row)
    return tabs, gmap


def local_quats(world, pelvis_M):
    """Ma trận thế giới (armature) của mọi xương chuỗi → quaternion xoay cục bộ (xương cha là xương chuỗi trước hoặc pelvis)."""
    res = {}
    for k in range(NC):
        for j in range(NJ):
            n = CNAME[k][j]
            pn = 'pelvis' if j == 0 else CNAME[k][j - 1]
            Mp = pelvis_M if j == 0 else world[pn]
            rel = np.linalg.inv(REST[pn]) @ REST[n]
            B = np.linalg.inv(rel) @ np.linalg.inv(Mp) @ world[n]
            res[n] = Matrix(B.tolist()).to_quaternion()
    return res


BAKED = {}  # clip -> {frame: {bone: quat}}  (frame = chỉ số mẫu 0..n-1)
FIT = None
GMAP = None
is_loop = lambda name: name.endswith('Loop') or name.endswith('Idle')


def bake_clip(name):
    global FIT, GMAP
    act = ACTIONS[name]
    f0, f1 = (int(round(x)) for x in act.frame_range)
    L = f1 - f0
    loop = is_loop(name)
    for fc in fcurves_of(act):
        for md in list(fc.modifiers):
            fc.modifiers.remove(md)
        if loop:
            fc.modifiers.new('CYCLES')
    pre = (L if loop else CF['preroll'])
    if loop:
        pre = L * 2  # 2 chu kỳ chạy đà để vải ổn định
    tail = 0 if loop else 18  # clip một lần: để vải lắng thêm sau khi dứt
    s, e = f0 - pre, f1 + tail
    sim, orig, cm = make_sim('sim_' + name, pre)
    FIT, GMAP = fit_tables(orig)
    cm.point_cache.frame_start, cm.point_cache.frame_end = s, e
    SC.frame_start, SC.frame_end = s, e
    assign(act)
    SC.frame_set(s)
    frames = {}
    pelv = {}
    t1 = time.time()
    for f in range(s, e + 1):
        SC.frame_set(f)
        if f >= f0 - L:  # giữ 1 chu kỳ trước để hòa đuôi (clip lặp)
            P, _ = eval_verts(sim)
            frames[f] = P
            if (f - f0) % 15 == 0:
                log(f'debug f{f} max|dX| {np.abs(P[:, :2] - VR[orig][:, :2]).max():.2f} zmin {P[:, 2].min():.2f}')
            bpy.context.view_layer.update()
            pelv[f] = np.array(ARM.pose.bones['pelvis'].matrix)
    sim_s = time.time() - t1
    if os.environ.get('CLOTH_DEBUG'):
        P = frames[f0]
        d_ = np.linalg.norm(P - VR[orig], axis=1)
        top = np.argsort(-d_)[:12]
        log(f'debug dịch chuyển đỉnh sim ở f0: trung vị {np.median(d_) * 1000:.0f} mm, p90 {np.percentile(d_, 90) * 1000:.0f} mm, max {d_.max() * 1000:.0f} mm')
        for i in top:
            log(f'  sim#{i} nghỉ z={VR[orig[i]][2]:.2f} y={VR[orig[i]][1]:.2f} x={VR[orig[i]][0]:.2f} → dịch {d_[i] * 1000:.0f} mm, dz={(P[i][2] - VR[orig[i]][2]) * 1000:.0f}')
        zs = VR[orig][:, 2]
        for lo_ in (0.3, 0.45, 0.6, 0.75, 0.9):
            m_ = (zs >= lo_) & (zs < lo_ + 0.15)
            if m_.any():
                log(f'  dải z {lo_:.2f}-{lo_ + 0.15:.2f}: {int(m_.sum())} đỉnh, dịch trung vị {np.median(d_[m_]) * 1000:.0f} mm, dz trung vị {np.median((P[:, 2] - VR[orig][:, 2])[m_]) * 1000:.0f} mm')
    # hòa đuôi về đầu cho clip lặp
    W_END = max(2, L // 5)

    def verts_at(f):
        if loop and f > f1 - W_END:
            a = (f - (f1 - W_END)) / W_END
            return frames[f] * (1 - a) + frames[f - L] * a
        return frames[f]

    last = f1 if loop else e
    n_keys = 0
    q_by_f = {}
    err = []
    err_rest = []
    P0 = REST['pelvis']
    for f in range(f0, last + 1):
        Xs = verts_at(f)
        world = kabsch_fit(Xs, pelv[f], P0)
        q_by_f[f] = local_quats(world, pelv[f])
        n_keys += 1
        # sai số khớp: lưới nghỉ biến dạng bằng chuỗi vs sim
        if f == f0:
            log(f'debug Xs {Xs.min(0).round(2)} {Xs.max(0).round(2)} orig {VR[orig].min(0).round(2)} {VR[orig].max(0).round(2)} pelvis {np.round(pelv[f][:3, 3], 2)} rest {np.round(P0[:3, 3], 2)}')
        if (f - f0) % 6 == 0:
            vm = np.where(GMAP >= 0)[0]
            Wf = np.zeros((len(vm), 3))
            for k in range(NC):
                for j in range(NJ):
                    n_ = CNAME[k][j]
                    M = world[n_] @ np.linalg.inv(REST[n_])
                    Wf += WC[vm, k, j][:, None] * (VR[vm] @ M[:3, :3].T + M[:3, 3])
            err.append(float(np.sqrt(((Wf - Xs[GMAP[vm]]) ** 2).sum(1)).mean()))
            # đối chứng: vạt cứng theo hông (chuỗi không xoay) và vạt ở tư thế nghỉ + dịch theo hông
            Tp = pelv[f] @ np.linalg.inv(P0)
            Wr = (VR[vm] @ Tp[:3, :3].T + Tp[:3, 3])
            err_rest.append(float(np.sqrt(((Wr - Xs[GMAP[vm]]) ** 2).sum(1)).mean()))
    BAKED[name] = {'f0': f0, 'f1': last, 'loop': loop, 'q': q_by_f}
    bpy.data.objects.remove(sim, do_unlink=True)
    REP['clips'][name] = {'frames': last - f0 + 1, 'loop': loop, 'sim_s': round(sim_s, 1), 'fit_err_mm': round(1000 * float(np.mean(err)), 1), 'rigid_pelvis_err_mm': round(1000 * float(np.mean(err_rest)), 1)}
    log(f"{name}: {last - f0 + 1} khung, sim {sim_s:.1f}s, sai số khớp {REP['clips'][name]['fit_err_mm']} mm (đối chứng vạt cứng theo hông {REP['clips'][name]['rigid_pelvis_err_mm']} mm)")


for name in CLIPS:
    if name not in ACTIONS:
        log(f'không có clip {name}, bỏ qua')
        continue
    bake_clip(name)
for o in COLS:
    bpy.data.objects.remove(o, do_unlink=True)

# ---------- 7. trọng số cuối ----------
W = np.zeros((NV, NB))
W[:, :len(GN)] = W0
skirt_cols = [GIDX[n] for n in GN if n.startswith('dtl_o_skirt')]
for ci in skirt_cols:  # bỏ lò xo vạt cũ: trọng số về pelvis
    W[:, GIDX['pelvis']] += W[:, ci]
    W[:, ci] = 0
for v in np.where(MASK)[0]:
    W[v, :len(GN)] = 0
for k in range(NC):
    for j in range(NJ):
        W[:, CIDX[CNAME[k][j]]] = WC[:, k, j]
W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-9)
keep = [i for i, n in enumerate(ALLN) if n not in {GN[c] for c in skirt_cols}]
BODY.vertex_groups.clear()
vgs = {ALLN[i]: BODY.vertex_groups.new(name=ALLN[i]) for i in keep}
for v in range(NV):
    for bi in np.nonzero(W[v])[0]:
        vgs[ALLN[bi]].add([v], float(W[v, bi]), 'REPLACE')
DOM2 = region_of_verts(W, ALLN)


def apply_chain_pose(clip, t):
    if clip not in BAKED:
        return
    b = BAKED[clip]
    f = int(round(b['f0'] + (b['f1'] - b['f0']) * t)) if not b['loop'] else int(round(b['f0'] + (b['f1'] - b['f0']) * t))
    f = min(max(f, b['f0']), b['f1'])
    for n, q in b['q'][f].items():
        pb = ARM.pose.bones[n]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = q


REP['after'] = measure(DOM2, apply_chain_pose)
log('SAU xuyên thân (cặp mặt): ' + ', '.join(f"{p['pose']}={p.get('pen', 'x')}" for p in REP['after']) + f" | tổng {sum(p.get('pen', 0) for p in REP['after'])}")
log('SAU đỉnh trong viên nang: ' + ', '.join(f"{p['pose']}={p.get('cap', 'x')}" for p in REP['after']) + f" | tổng {sum(p.get('cap', 0) for p in REP['after'])}")
render_sheet('after', apply_chain_pose)

# ---------- 8. action cho xuất ----------
STEP = CF['step']
for name, b in BAKED.items():
    a = bpy.data.actions.new(f'cloth_{name}')
    a.use_fake_user = True
    assign(a)
    fr = list(range(b['f0'], b['f1'] + 1, STEP))
    if fr[-1] != b['f1']:
        fr.append(b['f1'])
    for f in fr:
        for n, q in b['q'][f].items():
            pb = ARM.pose.bones[n]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f - b['f0'])
for n in list(ACTIONS):
    bpy.data.actions.remove(ACTIONS[n])
for a_ in list(bpy.data.actions):  # action thừa (vd. A_TPose của thư viện UAL): chỉ giữ cloth_*
    if not a_.name.startswith('cloth_'):
        bpy.data.actions.remove(a_)
for a_ in bpy.data.actions:
    for fc in fcurves_of(a_):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
        if not fc.data_path.startswith('pose.bones["dtl_o_cloth_'):
            log(f'CẢNH BÁO: action {a_.name} có kênh ngoài xương vạt: {fc.data_path}')
assign(None)
for pb in ARM.pose.bones:
    pb.location, pb.rotation_quaternion = (0, 0, 0), (1, 0, 0, 0)
REP['seconds'] = round(time.time() - T0)
if REPORT:
    json.dump(REP, open(REPORT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if not NO_EXPORT:
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o is not BODY:
            bpy.data.objects.remove(o, do_unlink=True)
    ARM.name = f'{ID}_rig'
    ARM.data.name = f'{ID}_rig'
    BODY.name = ID
    SC.frame_start, SC.frame_end = 0, 600
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
        export_optimize_animation_size=True, export_force_sampling=False, export_extras=True, use_selection=False,
    )
    log(f'xuất {OUT} {os.path.getsize(OUT) // 1024} KB, tổng {time.time() - T0:.0f}s')
