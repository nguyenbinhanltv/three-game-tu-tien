# Chuyển áo của bộ trang bị (ma-nơ-canh Tripo mặc nguyên bộ) sang bộ xương và tỉ lệ của nhân vật chơi. Chạy như bước
# `import.post` của import_tripo.py (sau chuẩn hóa: 1,75 m, gốc ở đáy, mặt trước +Z glTF). Khối `import.retarget` trong meta.json:
#
#   { "player": "chr_kiem_tu_nam",          GLB thô của nhân vật (assets/build/raw/<id>.glb), dựng trước (run.mjs xếp chr_ trước set_)
#     "cut": ["head","neck","hand"],        nhóm xương bị bỏ khỏi áo (da đầu/cổ/tay của ma-nơ-canh; client giữ da của người chơi)
#     "clampLen": [0.75, 1.35],             giới hạn tỉ lệ dài xương khi kéo giãn áo theo tỉ lệ người chơi
#     "legBlend": 0.5 }                     phần vạt áo dưới hông trộn trọng số hai chân (chống xuyên khi chạy), 0 = giữ nguyên Tripo
#
# 1. Tư thế nghỉ khác nhau (ma-nơ-canh tay thả, người chơi chữ T): mỗi đỉnh áo đi theo từng xương của nó (khớp theo tên đã
#    chuẩn hóa) với phép "đặt lại": quay đường xương nguồn về đường xương đích quanh đầu xương, kéo giãn dọc xương theo tỉ lệ
#    dài xương hai bên, rồi đặt vào đầu xương đích; trộn theo trọng số skin cũ. Trọng số skin giữ nguyên (đổi tên nhóm sang
#    xương người chơi) nên áo chạy cùng clip của người chơi.
# 2. Bỏ mặt áo thuộc đầu/cổ/bàn tay (xương trội của cả ba đỉnh).
# 3. Vạt áo: đỉnh dưới hông mất dần ảnh hưởng của một chân (theo độ lệch ngang so với đường chân) để váy dài không bị một
#    chân kéo xuyên qua chân kia.
# 4. Xuất: chỉ bộ xương của người chơi + lưới áo (mesh người chơi bỏ), không clip.
#
# Biến nhận từ import_tripo: ASSET_ID, META, ARMATURES, MESHES, REPO, fail.

import math
import os
import re

import bpy
from mathutils import Matrix, Quaternion, Vector

REPORT = {}

CFG = (META.get('import') or {}).get('retarget') or {}  # noqa: F821
if not CFG.get('player'):
    fail('import.retarget.player: thiếu id nhân vật')  # noqa: F821
LO, HI = CFG.get('clampLen', [0.75, 1.35])
CUT = CFG.get('cut', ['head', 'neck', 'hand'])
LEG_BLEND = float(CFG.get('legBlend', 0.5))
STRAY_LEG = float(CFG.get('strayLeg', 0.18))
STRAY_HAND = float(CFG.get('strayHand', 0.16))  # m


def key(name):
    n = name.lower()
    n = re.sub(r'^mixamorig[:_]?', '', n)
    return re.sub(r'[^a-z0-9]', '', n)


def is_cut(k):
    for c in CUT:
        if c == 'hand' and ('hand' in k):
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


# ---- nạp nhân vật đích ----
before = set(bpy.data.objects)
player_glb = os.path.join(REPO, 'assets', 'build', 'raw', CFG['player'] + '.glb')  # noqa: F821
if not os.path.isfile(player_glb):
    fail(f'import.retarget: chưa có GLB thô {player_glb} (chạy run.mjs cho {CFG["player"]} trước)')  # noqa: F821
bpy.ops.import_scene.gltf(filepath=player_glb)
new = [o for o in bpy.data.objects if o not in before]
P = next((o for o in new if o.type == 'ARMATURE'), None)
if P is None:
    fail('GLB nhân vật không có armature')  # noqa: F821
player_meshes = [o for o in new if o.type == 'MESH']

S = ARMATURES[0]  # noqa: F821
G = MESHES[0]  # noqa: F821
if len(MESHES) != 1:  # noqa: F821
    fail('cần đúng một mesh áo')  # noqa: F821

bpy.context.view_layer.update()
S_info = bone_dirs(S)
P_info = bone_dirs(P)
P_by_key = {key(n): n for n in P_info}
S_parent = {b.name: (b.parent.name if b.parent else None) for b in S.data.bones}


def map_bone(sname):
    """Xương nguồn → tên xương đích (đi lên tổ tiên nếu người chơi không có xương này)."""
    n = sname
    while n:
        k = key(n)
        if k in P_by_key:
            return P_by_key[k]
        n = S_parent.get(n)
    return None


# ---- phép đặt lại theo xương ----
xf = {}
for sname, (sh, sd, sl) in S_info.items():
    pname = map_bone(sname)
    if not pname:
        continue
    ph, pd, pl = P_info[pname]
    q = sd.rotation_difference(pd)
    ratio = 1.0
    if sl > 0.02 and pl > 0.02:
        ratio = min(max(pl / sl, LO), HI)
    xf[sname] = (sh, sd, ph, q, ratio, pname)

mw = G.matrix_world
me = G.data
vg_name = {vg.index: vg.name for vg in G.vertex_groups}
n_unmapped = 0
newpos = []
dom = []  # tên xương trội (xương nguồn) mỗi đỉnh
infl = []  # [(tên xương đích, w)] mỗi đỉnh, đã gộp theo xương đích
for v in me.vertices:
    p = mw @ v.co
    acc = Vector()
    tot = 0.0
    merged = {}
    best = (0.0, None)
    for g in v.groups:
        sname = vg_name.get(g.group)
        if sname is None or g.weight <= 1e-4:
            continue
        t = xf.get(sname)
        if t is None:
            continue
        sh, sd, ph, q, ratio, pname = t
        # ảnh hưởng lạc: Tripo skin vải thả gần bàn tay vào xương ngón tay; xa xương quá ngưỡng thì bỏ (tay chữ T kéo vạt áo bay ra)
        kk = key(sname)
        if kk.endswith(('upleg', 'leg')) and 'hand' not in kk:
            sl_ = max(S_info[sname][2], 0.1)
            tt = min(max((p - sh).dot(sd) / sl_, 0.0), 1.0)
            if (p - (sh + sd * sl_ * tt)).length > STRAY_LEG and any(
                key(vg_name.get(o.group, '')).find('hand') >= 0 and o.weight > 0.1 for o in v.groups
            ):
                continue
        if 'hand' in key(sname) and (p - sh).length > STRAY_HAND and any(
            'hand' not in key(vg_name.get(o.group, '')) and o.weight > 0.3 for o in v.groups
        ):
            continue
        d = p - sh
        along = sd * d.dot(sd)
        d2 = (d - along) + along * ratio
        acc += g.weight * (ph + q @ d2)
        tot += g.weight
        merged[pname] = merged.get(pname, 0.0) + g.weight
        if g.weight > best[0]:
            best = (g.weight, sname)
    if tot <= 0:
        n_unmapped += 1
        newpos.append(p)
        dom.append(None)
        infl.append({})
        continue
    newpos.append(acc / tot)
    dom.append(best[1])
    infl.append({k: w / tot for k, w in merged.items()})

# ---- vạt áo: trộn một phần trọng số hai chân ----
hips_h = P_info[P_by_key['hips']][0].z if 'hips' in P_by_key else 0.95
legs = {}
for side in ('left', 'right'):
    up = P_by_key.get(side + 'upleg')
    if up:
        legs[side] = up
if LEG_BLEND > 0 and len(legs) == 2:
    lh = {s: P_info[n][0] for s, n in legs.items()}
    mid_x = (lh['left'].x + lh['right'].x) / 2
    half = abs(lh['left'].x - lh['right'].x) / 2 or 0.1
    hips_name = P_by_key['hips']
    for i, w in enumerate(infl):
        z = newpos[i].z
        if z > hips_h - 0.02 or not w:
            continue
        legsum = sum(w.get(n, 0.0) for n in legs.values())
        if legsum <= 0:
            continue
        # càng gần trục giữa (|x - mid| nhỏ so với nửa khoảng chân) càng dùng trung bình hai chân; càng ra ngoài càng giữ chân gần
        off = abs(newpos[i].x - mid_x) / half
        share = LEG_BLEND * max(0.0, 1.0 - off * 0.6) * min(1.0, (hips_h - z) / 0.25)
        if share <= 0:
            continue
        for n in legs.values():
            w[n] = w.get(n, 0.0) * (1 - share) + legsum * share * 0.5
        # chân đứng yên một phần: trả một lượng nhỏ về hông để vạt không rách khi hai chân dạng ra
        # (hông luôn là gốc chung nên không đổi tổng trọng số)

# ---- ghi lại lưới ----
for i, v in enumerate(me.vertices):
    v.co = G.matrix_world.inverted() @ newpos[i]

# ---- dựng lại nhóm đỉnh theo xương người chơi ----
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

# bỏ mặt thuộc đầu/cổ/tay (đỉnh trội theo xương nguồn; bmesh giữ nhóm đỉnh)
import bmesh  # noqa: E402

bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
kill = [f for f in bm.faces if all(dom[v.index] and is_cut(key(dom[v.index])) for v in f.verts)]
bmesh.ops.delete(bm, geom=kill, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(me)
bm.free()
# giới hạn 4 ảnh hưởng và chuẩn hóa
bpy.context.view_layer.objects.active = G
for o in bpy.data.objects:
    o.select_set(False)
G.select_set(True)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

# ---- dọn cảnh: bỏ ma-nơ-canh gốc, mesh người chơi, clip; gắn áo vào bộ xương người chơi ----
G.parent = None
G.matrix_world = Matrix.Identity(4)
for m in list(G.modifiers):
    G.modifiers.remove(m)
mod = G.modifiers.new('Armature', 'ARMATURE')
mod.object = P
G.parent = P
G.matrix_parent_inverse = P.matrix_world.inverted()

for o in player_meshes:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.data.objects.remove(S, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == 'EMPTY' or (o.type == 'MESH' and o is not G):
        bpy.data.objects.remove(o, do_unlink=True)
for arm in (o for o in bpy.data.objects if o.type == 'ARMATURE'):
    arm.animation_data_clear()
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
P.name = ASSET_ID + '_rig'  # noqa: F821
P.data.name = ASSET_ID + '_rig'  # noqa: F821

REPORT = {
    'player': CFG['player'],
    'bones': len(P.data.bones),
    'verts': len(me.vertices),
    'faces': len(me.polygons),
    'tris': sum(len(p.vertices) - 2 for p in me.polygons),
    'unmapped': n_unmapped,
    'groups': len(groups),
}
