# Ghép clip cho nhân vật người (rig Mixamo từ Tripo) và thêm clip thủ tục còn thiếu. Chạy như bước `import.post`
# của import_tripo.py (sau chuẩn hóa: mét, gốc ở đáy, mặt trước +Z glTF = -Y Blender, trái = +X).
#
# 1. Ghép clip: mỗi phần tử `import.clips` = { source, name, start?, end? }. Tripo web xuất mỗi clip thành một GLB
#    riêng chứa cùng bộ xương (có thể thêm xương đầu mút *4, HeadTop_End). Script nạp GLB, lấy action, đổi tên kênh
#    theo tên xương đã chuẩn hóa (ascii_name của import_tripo), bỏ kênh của xương không có trong rig chính, scale khóa
#    location theo tỉ lệ khung xương (rig chính đã đổi sang mét), cắt đoạn [start, end] nếu có, đặt tên clip.
#    Điều kiện: tư thế nghỉ của xương trong file clip trùng rig chính (lệch < 2°), nếu không thì dừng.
#    Tùy chọn mỗi clip: `recenter` (đưa hông về vị trí ngang của idle, cho clip Tripo có sẵn độ lệch gốc như run),
#    `loop` (dồn đều chênh lệch cuối-đầu để clip lặp khít).
# 1c. `import.sharedAnims` (tên thư viện, M2-3): nhân vật không mang clip riêng (bỏ clip có sẵn trong nguồn, không ghép, không
#    sinh hit_light), dùng thư viện anim_human_base (tools/blender/export_anim_lib.py).
# 2. Clip thủ tục: thêm `hit_light` (0,33 s) nếu chưa có: thân trên giật lùi, ngửa đầu, tay bật nhẹ, rồi về dáng đầu.
#    Góc quay quanh trục thế giới, đổi sang trục cục bộ của xương (q = M⁻¹·R·M), như anim_quadruped.py.
#    Dáng gốc của hit_light lấy từ khung đầu của clip `idle` nếu có (để chuyển clip không giật), không thì tư thế nghỉ.
#
# 3. Phụ kiện cứng (`import.rigid`): Tripo auto-rig skin cả phụ kiện như cơ thể, nên kiếm đeo sau lưng bị bẻ cong khi
#    tay hạ khỏi tư thế chữ T. Mỗi phần tử { kind, bone }: kind "back_sword" dò kiếm đeo chéo sau lưng (đỉnh màu nâu
#    sau lưng → trục bằng PCA → mọi đỉnh sau lưng trong bán kính quanh trục, lặp 3 lần), tách lưới kiếm khỏi thân rồi
#    gán cứng 100% vào `bone`; `tilt` (độ) xoay kiếm quanh mũi để chuôi vào gần gáy.
#    kind "add_sword" (thân không kiếm): dựng kiếm + bao thủ tục (biped_parts.add_back_sword), `grip` [x, dy, dz] lệch so với
#    đầu xương `bone`, `tip` hướng mũi, `length`.
#    `patch: true` vá lỗ lưng áo dưới kiếm; `socket: true` tách chuôi (`hilt`: phần đầu trên theo chiều dài, mặc định
#    0,28) + lưỡi thủ tục sang xương `dtl_sword` để client rút/tra kiếm (M3-2, xem tools/blender/biped_parts.py).
# 3b. `import.flatSkinNormals` { zMin }: làm phẳng normal map trên da đầu/cổ (biped_parts.flatten_skin_normals), bỏ vệt tối
#    trông như ria mép khi hạ texture về 1024.
# 4. Chỉnh màu vải (`import.recolor`): mỗi quy tắc chọn điểm ảnh của texture màu theo hue/độ bão hòa/độ sáng (mép mềm),
#    rồi đổi sang màu đích trong bảng tâm trạng, giữ độ sáng tương đối nên vân vải và nếp gấp còn nguyên. Không vẽ lại.
#
#    Phần ghép clip dùng chung tools/blender/tripo_clips.py. Khi có `import.clips`, clip sẵn có trong GLB nguồn chính bị bỏ
#    (mọi clip phải khai báo trong `clips`), vì vậy nguồn chính có thể là một file anim_* có bộ xương đầy đủ hơn rig.
#    Tên xương dò theo bí danh: Mixamo (Hips, Spine1, LeftArm) hoặc bộ xương Tripo (Hip, Spine01, L_Upperarm).
#    `import.prune` (regex tên xương): bỏ xương phụ để vừa trần xương, dồn trọng số skin vào tổ tiên còn giữ.
# 5. Clip boss thủ tục (`import.extra`, M3-8): slam, sweep, chant, stun (xem mục 5 bên dưới).
# 6. Xương lò xo (`import.spring`, M3-10): { kind: "skirt", top, full, bottom, weight, radius, legClear } thêm 4 xương
#    vạt áo con của hông, client mô phỏng lò xo ở LOD0 (biped_parts.skirt_springs, client character/spring.ts).
#
# Biến nhận từ import_tripo: ASSET_ID, META, ARMATURES, MESHES, REPO, SOURCE_ROOT, fail, ascii_name, fcurves_of.

import math
import os
import re
import runpy

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
X = Vector((1, 0, 0))

# `import.autoRig`: boss Tripo chưa có xương → dựng xương người và trọng số (tools/blender/biped_autorig.py).
if META.get('import', {}).get('autoRig') and not ARMATURES:  # noqa: F821
    runpy.run_path(os.path.join(REPO, 'tools/blender/biped_autorig.py'), init_globals=dict(globals()))  # noqa: F821

if len(ARMATURES) != 1:  # noqa: F821
    fail(f'anim_biped_extra cần đúng 1 armature, có {len(ARMATURES)}')  # noqa: F821
arm = ARMATURES[0]  # noqa: F821
IMPORT = META.get('import') or {}  # noqa: F821
bpy.context.scene.render.fps = FPS


def clean(name):
    return name if re.fullmatch(r'[A-Za-z0-9_.]+', name) else ascii_name(name)  # noqa: F821


# Bí danh theo hậu tố tên (không phân biệt hoa thường), thử lần lượt: Mixamo (mixamorig:Hips, Spine1, LeftArm...) rồi
# bộ xương người Tripo xuất kèm clip (Hip, Waist, Spine01, NeckTwist01, L_Upperarm...).
ALIASES = {
    'hips': ('hips', 'hip', 'pelvis'),
    'head': ('head',),
    'spine': ('spine', 'waist'),
    'spine1': ('spine1', 'spine01'),
    'spine2': ('spine2', 'spine02'),
    'neck': ('neck', 'necktwist01'),
    'leftarm': ('leftarm', 'l_upperarm'),
    'rightarm': ('rightarm', 'r_upperarm'),
    'leftforearm': ('leftforearm', 'l_forearm'),
    'rightforearm': ('rightforearm', 'r_forearm'),
    # Chỉ clip boss thủ tục (import.extra) tra các tên dưới đây.
    'lefthand': ('lefthand', 'l_hand'),
    'righthand': ('righthand', 'r_hand'),
    'leftupleg': ('leftupleg', 'l_thigh'),
    'rightupleg': ('rightupleg', 'r_thigh'),
    'leftleg': ('leftleg', 'l_calf'),
    'rightleg': ('rightleg', 'r_calf'),
    'leftfoot': ('leftfoot', 'l_foot'),
    'rightfoot': ('rightfoot', 'r_foot'),
}


def suffix_bone(bones, name):
    """Xương đầu tiên (theo tên) có hậu tố khớp một bí danh của `name`; None nếu không có."""
    for alias in ALIASES.get(name.lower(), (name.lower(),)):
        for b in sorted(bones, key=lambda b: b.name):
            n = b.name.lower()
            if n.endswith(alias) and not (alias == 'head' and n.endswith('_end')):
                return b
    return None


def bone_like(name):
    """Tìm xương rig chính theo hậu tố tên (Hips, Head...), không phân biệt hoa thường."""
    b = suffix_bone(arm.data.bones, name)
    if b is None:
        fail(f'anim_biped_extra: rig không có xương *{name}')  # noqa: F821
    return b


HIPS, HEAD = bone_like('hips'), bone_like('head')


def fix_rig():
    """`import.rigFix` (boss Tripo auto-rig bị cắt xương không trọng số): thêm xương bàn chân còn thiếu, đặt ở cuối cẳng chân
    chỉ về phía trước (-Y), không trọng số, để IK chân của clip thủ tục có điểm bám. Tên theo kiểu rig (mixamorig_* hoặc L_Foot)."""
    added = []
    mixamo = HIPS.name.lower().startswith('mixamorig')
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for side, sd in (('Left', 'L'), ('Right', 'R')):
        calf = suffix_bone(arm.data.bones, side.lower() + 'leg')
        if calf is None or suffix_bone(arm.data.bones, side.lower() + 'foot') is not None:
            continue
        name = (HIPS.name[:-4] + side + 'Foot') if mixamo else f'{sd}_Foot'
        c = eb[calf.name]
        b = eb.new(name)
        b.head = c.tail.copy()
        b.tail = c.tail + Vector((0, -0.35 * (c.tail - c.head).length, 0))
        b.parent = c
        b.use_connect = False
        added.append(name)
    bpy.ops.object.mode_set(mode='OBJECT')
    return added


if IMPORT.get('rigFix'):
    report_fix = fix_rig()
    HIPS, HEAD = bone_like('hips'), bone_like('head')

MAIN_SPAN = (HEAD.head_local - HIPS.head_local).length


def add_to_nla(act):
    TC['add_to_nla'](arm, act)


def src_span(src):
    sh, sd = suffix_bone(src.data.bones, 'hips'), suffix_bone(src.data.bones, 'head')
    if not sh or not sd:
        fail('anim_biped_extra: GLB clip thiếu xương hông/đầu')  # noqa: F821
    return (sd.head_local - sh.head_local).length


# ---------- 1. ghép clip ----------

TC = runpy.run_path(os.path.join(REPO, 'tools/blender/tripo_clips.py'))  # noqa: F821
report = {'clips': {}}
if IMPORT.get('rigFix'):
    report['rigFixAdded'] = report_fix
if IMPORT.get('sharedAnims') and not IMPORT.get('clips'):
    # Clip dùng chung (anim_human_base, M2-3): GLB nhân vật không mang clip, client retarget theo tên xương.
    report['droppedSourceClips'] = TC['drop_existing_actions'](arm)
if IMPORT.get('clips'):
    dropped_src = TC['drop_existing_actions'](arm)
    if dropped_src:
        report['droppedSourceClips'] = dropped_src
    report['clips'] = TC['merge_clips'](
        arm, IMPORT['clips'], source_root=SOURCE_ROOT, fail=fail,  # noqa: F821
        bone_map=lambda n: clean(n) if arm.data.bones.get(clean(n)) else None,
        main_span=MAIN_SPAN, span_of=src_span, hips=HIPS.name,
    )

# ---------- 1b. bỏ xương phụ ----------

def prune_bones(patterns):
    """Bỏ xương khớp một regex trong `import.prune` (xương xoắn, xương phụ khuỷu/gối, mắt...) để vừa trần xương của lớp
    ngân sách: trọng số skin dồn vào tổ tiên gần nhất còn giữ, con của xương bị bỏ nối lên tổ tiên đó, kênh clip của
    xương bị bỏ bị xóa. Xương xoắn chỉ thêm độ vặn quanh trục chi nên tay/chân vẫn gập đúng."""
    rx = [re.compile(p) for p in patterns]
    gone = {b.name for b in arm.data.bones if any(r.search(b.name) for r in rx)}
    if not gone:
        return []
    keep = {}
    for b in arm.data.bones:
        p = b
        while p is not None and p.name in gone:
            p = p.parent
        keep[b.name] = p.name if p is not None else None
    for name in gone:
        if keep[name] is None:
            fail(f'prune: xương {name} không có tổ tiên nào được giữ')  # noqa: F821
    for mesh in MESHES:  # noqa: F821
        groups = mesh.vertex_groups
        idx = {g.index: g.name for g in groups}
        acc = {}
        for v in mesh.data.vertices:
            for ge in v.groups:
                n = idx[ge.group]
                if n in gone and ge.weight > 0:
                    acc.setdefault(keep[n], []).append((v.index, ge.weight))
        for target, items in sorted(acc.items()):
            g = groups.get(target) or groups.new(name=target)
            for vi, w in items:
                g.add([vi], w, 'ADD')
        for n in sorted(gone):
            if groups.get(n):
                groups.remove(groups[n])
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for b in list(eb):
        if b.name not in gone and b.parent is not None and b.parent.name in gone:
            b.parent = eb[keep[b.parent.name]]
    for n in sorted(gone):
        eb.remove(eb[n])
    bpy.ops.object.mode_set(mode='OBJECT')
    for act in bpy.data.actions:
        for bag in TC['channelbags'](act):
            for fc in list(bag.fcurves):
                m = re.match(r'pose\.bones\["(.+?)"\]', fc.data_path)
                if m and m.group(1) in gone:
                    bag.fcurves.remove(fc)
    return sorted(gone)


if IMPORT.get('prune'):
    report['pruned'] = prune_bones(IMPORT['prune'])
    report['bones'] = len(arm.data.bones)
    HIPS, HEAD = bone_like('hips'), bone_like('head')  # edit mode làm mất hiệu lực tham chiếu Bone cũ

# ---------- 3. phụ kiện cứng ----------

def back_sword_vertices(mesh):
    import numpy as np
    me = mesh.data
    mw = mesh.matrix_world
    img = None
    for n in me.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and n.outputs[0].links and any(
                l.to_socket.name == 'Base Color' for l in n.outputs[0].links):
            img = n.image
    if img is None:
        fail('rigid back_sword: không tìm thấy texture màu')  # noqa: F821
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(H, W, 4)
    uv = me.uv_layers.active.data
    col = {}
    for loop in me.loops:
        u, v = uv[loop.index].uv
        col[loop.vertex_index] = px[min(H - 1, max(0, int(v * H))), min(W - 1, max(0, int(u * W))), :3]
    ALL = np.array([tuple(mw @ v.co) for v in me.vertices])
    top = ALL[:, 2].max()
    seed = []
    for i, p in enumerate(ALL):
        c = col.get(i)
        if c is None:
            continue
        r, g, b = c
        # sau lưng = +Y Blender (mặt trước -Y); thân từ hông tới đỉnh vai; không lấy tay (tư thế chữ T)
        if r > b + 0.03 and 0.06 < c.mean() < 0.5 and r >= g - 0.02 and p[1] > 0.06 * top / 1.75                 and 0.31 * top < p[2] < 0.93 * top and abs(p[0]) < 0.2 * top:
            seed.append(i)
    if len(seed) < 30:
        fail(f'rigid back_sword: chỉ thấy {len(seed)} đỉnh nâu sau lưng')  # noqa: F821
    idx = np.array(seed)
    k = top / 1.75
    for R, Y in ((0.07, 0.05), (0.06, 0.03), (0.05, 0.02)):
        P = ALL[idx]
        c0 = P.mean(0)
        ax = np.linalg.svd(P - c0)[2][0]
        pr = (P - c0) @ ax
        lo, hi = pr.min() - 0.02 * k, pr.max() + 0.02 * k
        d = ALL - c0
        t = d @ ax
        perp = np.linalg.norm(d - np.outer(t, ax), axis=1)
        idx = np.where((t >= lo) & (t <= hi) & (perp < R * k) & (ALL[:, 1] > Y * k))[0]
    # Chọn theo mặt: mặt thuộc kiếm khi đa số đỉnh nằm trong vùng và màu không phải vải áo (lam đậm hoặc trắng),
    # để không cắt vào vai áo nơi chuôi kiếm chạm.
    inside = set(int(i) for i in idx)
    faces = []
    for poly in me.polygons:
        vs = list(poly.vertices)
        if sum(1 for v in vs if v in inside) * 2 < len(vs):
            continue
        cs = [col[v] for v in vs if v in col]
        if cs:
            r, g, b = np.mean(cs, axis=0)
            # bỏ vải: ngả lam (áo, quai đeo) hoặc trắng
            if (b > r + 0.05 and b >= g) or (min(r, g, b) > 0.6):
                continue
        faces.append(poly.index)
    # Chỉ giữ các cụm lớn (thân kiếm, chuôi, bao): nối mặt theo vị trí đỉnh vì lưới Tripo bị tách theo đường nối UV.
    # Mảnh lẻ nhỏ là phần vai/áo dính vào vùng chọn, trả lại skin cũ.
    key = {}
    for i, p in enumerate(ALL):
        key.setdefault(tuple(np.round(p, 4)), []).append(i)
    alias = {}
    for group in key.values():
        for i in group:
            alias[i] = group[0]
    owner = {}
    parent = list(range(len(faces)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for fi, f in enumerate(faces):
        for v in me.polygons[f].vertices:
            a = alias[v]
            if a in owner:
                ra, rb = find(owner[a]), find(fi)
                if ra != rb:
                    parent[ra] = rb
            else:
                owner[a] = fi
    comps = {}
    for fi in range(len(faces)):
        comps.setdefault(find(fi), []).append(faces[fi])
    big = max(len(c) for c in comps.values())
    faces = sorted(f for c in comps.values() if len(c) >= 0.08 * big for f in c)
    # Hình trụ quanh trục kiếm (đơn vị thế giới), để lọc các đảo lưới rời được phép gắn theo kiếm.
    zone = {'c0': c0, 'ax': ax, 'lo': float(lo), 'hi': float(hi), 'radius': float(0.05 * k), 'back': float(0.02 * k), 'k': float(k)}
    return faces, round(float(hi - lo), 3), zone


def detached_vertices(mesh, sword, zone):
    """Đỉnh của các đảo lưới rời khỏi thân (trừ đảo lớn nhất) NẰM QUANH KIẾM: tâm đảo trong hình trụ quanh trục kiếm
    (bán kính + 6 cm, hai đầu nới 5 cm) và ở sau lưng (Y Blender > 0). Đảo rời ở chỗ khác (mắt, răng, trâm, vòng tay,
    ngón tay rời...) giữ skin cũ. Đỉnh trùng vị trí được coi là nối nhau, trừ khi một bên thuộc kiếm vừa tách (`sword`):
    bmesh.ops.split để lại cặp đỉnh trùng vị trí ở đường biên kiếm–thân. Trả (đỉnh được gắn, danh sách đảo gắn, đảo bỏ qua)."""
    import numpy as np
    me = mesh.data
    alias = {}
    first = {}
    for v in me.vertices:
        k = tuple(round(c, 4) for c in (mesh.matrix_world @ v.co)) + (v.index in sword,)
        alias[v.index] = first.setdefault(k, v.index)
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for e in me.edges:
        a, b = find(alias[e.vertices[0]]), find(alias[e.vertices[1]])
        if a != b:
            parent[a] = b
    comps = {}
    for v in me.vertices:
        comps.setdefault(find(alias[v.index]), []).append(v.index)
    body = max(comps.values(), key=len)
    k = zone['k']
    pinned, kept, out = [], [], []
    for c in sorted(comps.values(), key=lambda c: min(c)):
        if c is body:
            continue
        cen = np.mean([tuple(mesh.matrix_world @ me.vertices[i].co) for i in c], axis=0)
        d = cen - zone['c0']
        t = float(d @ zone['ax'])
        perp = float(np.linalg.norm(d - t * zone['ax']))
        inside = (zone['lo'] - 0.05 * k <= t <= zone['hi'] + 0.05 * k) and perp <= zone['radius'] + 0.06 * k and cen[1] > 0.0
        info = {'vertices': len(c), 'centroid': [round(float(x), 3) for x in cen], 'axisDist': round(perp, 3)}
        if inside:
            out.extend(c)
            pinned.append(info)
        else:
            kept.append(info)
    return out, pinned, kept


PARTS = runpy.run_path(os.path.join(REPO, 'tools/blender/biped_parts.py'))  # noqa: F821
STEEL = []  # (mesh, ô UV) chờ tô thép cho lưỡi kiếm, sau bước chỉnh màu vải

SHRINK = []  # (mesh, k) thu ảnh theo UV đã thu để chừa ô màu
FLAT = []  # (mesh, ô UV, loại) ô màu phẳng của kiếm dựng thủ tục
for spec in IMPORT.get('rigid', []):
    if spec.get('kind') == 'add_sword':
        # Thân không kiếm (Lam Chi): dựng bao + chuôi + lưỡi thủ tục, cùng quy ước xương dtl_sword và extras như back_sword.
        bone = bone_like(spec['bone']).name
        for mesh in MESHES:  # noqa: F821
            rep, cells = PARTS['add_back_sword'](mesh, arm, spec, bone, fail)  # noqa: F821
            SHRINK.append((mesh, cells['shrink']))
            STEEL.append((mesh, cells['steel']))
            for k in ('sheath', 'wrap', 'bronze'):
                FLAT.append((mesh, cells[k], k))
            report.setdefault('rigid', []).append({'kind': 'add_sword', 'bone': bone, **rep})
        continue
    if spec.get('kind') != 'back_sword':
        fail(f'rigid: kind "{spec.get("kind")}" chưa hỗ trợ')  # noqa: F821
    bone = bone_like(spec['bone']).name
    for mesh in MESHES:  # noqa: F821
        import bmesh
        face_ids, length, zone = back_sword_vertices(mesh)
        seam = PARTS['seam_keys'](mesh, face_ids) if spec.get('patch') else None
        # Tách lưới kiếm khỏi thân (nhân đôi đỉnh dọc đường biên) để phần gán cứng không kéo giãn mặt nối với vai/tay.
        bm = bmesh.new()
        bm.from_mesh(mesh.data)
        bm.faces.ensure_lookup_table()
        sword_faces = [bm.faces[i] for i in face_ids]
        out = bmesh.ops.split(bm, geom=sword_faces)
        sword_faces = [g for g in out['geom'] if isinstance(g, bmesh.types.BMFace)]
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()
        verts = sorted({v.index for f in sword_faces for v in f.verts})
        bm.to_mesh(mesh.data)
        bm.free()
        mesh.data.update()
        # Mọi đảo lưới không nối với thân chính (nối theo vị trí đỉnh, vì Tripo tách lưới theo đường nối UV) là phần
        # của kiếm/quai đeo đã rời khỏi thân: gán cứng và nghiêng cùng kiếm, để không còn mảnh skin theo tay hay đùi
        # (mảnh lơ lửng cạnh vai, mũi kiếm tách đôi khi bước).
        extra, pinned, skipped = detached_vertices(mesh, set(verts), zone)
        verts = sorted(set(verts) | set(extra))
        groups = mesh.vertex_groups
        target = groups.get(bone) or groups.new(name=bone)
        for g in groups:
            if g != target:
                g.remove(verts)
        target.add(verts, 1.0, 'REPLACE')
        tilt = float(spec.get('tilt', 0))
        if tilt:
            # Xoay kiếm quanh mũi kiếm (đầu thấp nhất) trong mặt phẳng lưng để chuôi dịch vào gần gáy: ở tư thế
            # chữ T chuôi tựa lên vai, khi tay hạ xuống thì chuôi chìa ra ngoài vai.
            vco = [mesh.matrix_world @ mesh.data.vertices[i].co for i in verts]
            tip = min(vco, key=lambda c: c.z)
            top = max(vco, key=lambda c: c.z)
            sign = -1.0 if top.x > tip.x else 1.0  # quay để chuôi tiến về x = 0
            R = Matrix.Rotation(math.radians(tilt) * sign, 4, 'Y')
            T = Matrix.Translation(tip) @ R @ Matrix.Translation(-tip)
            inv = mesh.matrix_world.inverted()
            for i, c in zip(verts, vco):
                mesh.data.vertices[i].co = inv @ (T @ c)
            mesh.data.update()
        # Ghi rõ các đảo rời đã gắn theo kiếm (và đảo rời bị bỏ qua) để log build cho thấy những gì bị dán vào xương.
        entry = {'kind': 'back_sword', 'bone': bone, 'faces': len(face_ids), 'vertices': len(verts),
                 'length': length, 'tilt': tilt, 'pinnedIslands': pinned, 'skippedIslands': skipped}
        # M3-2: vá lỗ lưng áo dưới kiếm, rồi tách chuôi + lưỡi sang xương riêng để client rút/tra kiếm.
        if seam is not None:
            entry['patch'] = PARTS['patch_hole'](mesh, seam, set(verts), fail)  # noqa: F821
        if spec.get('socket'):
            entry['socket'], cell = PARTS['sword_socket'](mesh, arm, verts, spec, bone, fail)  # noqa: F821
            STEEL.append((mesh, cell))
        report.setdefault('rigid', []).append(entry)


# ---------- 4. chỉnh màu vải ----------

def replace_pixels(img, px, fmt=None):
    """Thay điểm ảnh của ảnh đóng gói. Giữ định dạng gốc (JPEG như ảnh màu của Tripo; PNG làm GLB nặng gần gấp đôi):
    dựng ảnh mới từ điểm ảnh đã chỉnh, lưu tạm, nạp lại thành ảnh đóng gói rồi thay vào mọi node đang dùng ảnh cũ."""
    import shutil
    import tempfile
    W, H = img.size
    fmt = fmt or ('PNG' if img.file_format == 'PNG' else 'JPEG')
    name, cs = img.name, img.colorspace_settings.name
    tmp = os.path.join(tempfile.mkdtemp(prefix='dtl_px_'), f'{ascii_name(name)}.{"png" if fmt == "PNG" else "jpg"}')  # noqa: F821
    work = bpy.data.images.new(name + '_work', W, H, alpha=False)
    work.colorspace_settings.name = cs
    work.pixels.foreach_set(px.ravel())
    work.filepath_raw = tmp
    work.file_format = fmt
    bpy.context.scene.render.image_settings.quality = 90
    work.save()
    loaded = bpy.data.images.load(tmp)
    loaded.colorspace_settings.name = cs
    loaded.pack()
    for mesh in MESHES:  # noqa: F821
        for mat in mesh.data.materials:
            for n in mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image == img:
                    n.image = loaded
    bpy.data.images.remove(work)
    bpy.data.images.remove(img)
    loaded.name = name
    shutil.rmtree(os.path.dirname(tmp), ignore_errors=True)


def recolor(rules):
    import colorsys
    import numpy as np
    out = []
    imgs = set()
    for mesh in MESHES:  # noqa: F821
        for mat in mesh.data.materials:
            for n in mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links):
                    imgs.add(n.image)
    for img in sorted(imgs, key=lambda i: i.name):
        W, H = img.size
        px = np.empty(W * H * 4, np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        rgb = px[:, :3].copy()
        mx, mn = rgb.max(1), rgb.min(1)
        v = mx
        sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
        r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
        d = np.maximum(mx - mn, 1e-6)
        hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
        hue = np.where(mx - mn < 1e-6, 0.0, hue)

        def ramp(x, lo, hi):
            t = np.clip((x - lo) / max(hi - lo, 1e-6), 0, 1)
            return t * t * (3 - 2 * t)

        for rule in rules:
            w = np.ones(len(rgb), np.float32)
            if 'hue' in rule:
                h0, h1 = rule['hue']
                w *= ramp(hue, h0 - 12, h0) * (1 - ramp(hue, h1, h1 + 12))
            if 'satMin' in rule:
                w *= ramp(sat, rule['satMin'] - 0.08, rule['satMin'])
            if 'satMax' in rule:
                w *= 1 - ramp(sat, rule['satMax'], rule['satMax'] + 0.08)
            if 'valMin' in rule:
                w *= ramp(v, rule['valMin'] - 0.08, rule['valMin'])
            if 'valMax' in rule:
                w *= 1 - ramp(v, rule['valMax'], rule['valMax'] + 0.08)
            m = w > 0.01
            if not m.any():
                out.append({'image': img.name, 'to': rule['to'], 'pixels': 0})
                continue
            # Ảnh 8-bit: Image.pixels là giá trị sRGB thô (byte/255), so thẳng với hex đích.
            tr, tg, tb = (int(rule['to'][k:k + 2], 16) / 255 for k in (1, 3, 5))
            th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)
            # Hệ số chỉnh thêm quanh màu đích (ví dụ trầm hơn: value < 1, saturation > 1).
            tv = min(1.0, tv * float(rule.get('value', 1.0)))
            ts = min(1.0, ts * float(rule.get('saturation', 1.0)))
            core = w > 0.5
            # Độ sáng tham chiếu: phân vị 75 của vùng (vải sáng chính), không lấy trung bình để đai tối không kéo lệch.
            mean_v = float(np.percentile(v[core], 75)) if core.any() else float(np.average(v[m], weights=w[m]))
            mean_s = float(np.average(sat[m], weights=w[m]))
            # Độ sáng tương đối: vải sáng chính ra đúng độ sáng màu đích, phần tối hơn (đai, nếp) giữ tỉ lệ.
            nv = np.clip(v * (tv / max(mean_v, 1e-6)), 0, 1)
            ns = np.clip(ts * np.clip(0.6 + 0.4 * sat / max(mean_s, 1e-6), 0.6, 1.4), 0, 1)
            hh = th * 6.0
            i = np.floor(hh) % 6
            f = hh - np.floor(hh)
            p_ = nv * (1 - ns)
            q_ = nv * (1 - ns * f)
            t_ = nv * (1 - ns * (1 - f))
            sector = int(i)
            table = [(nv, t_, p_), (q_, nv, p_), (p_, nv, t_), (p_, q_, nv), (t_, p_, nv), (nv, p_, q_)][sector]
            new = np.stack(table, 1)
            rgb = rgb * (1 - w[:, None]) + new * w[:, None]
            out.append({'image': img.name, 'to': rule['to'], 'pixels': int((w > 0.5).sum())})
        px[:, :3] = rgb
        replace_pixels(img, px, 'JPEG')
    return out


if IMPORT.get('recolor'):
    report['recolor'] = recolor(IMPORT['recolor'])

for mesh, k in SHRINK:
    PARTS['shrink_images'](mesh, k, replace_pixels)

# Sau khi ảnh đã thu theo UV (cùng hệ toạ độ): làm phẳng normal da bằng mặt nạ rasterize từ UV hiện tại.
for mesh in MESHES:  # noqa: F821
    if IMPORT.get('flatSkinNormals'):
        report['flatSkinNormals'] = PARTS['flatten_skin_normals'](mesh, float(IMPORT['flatSkinNormals'].get('zMin', 1.45)), replace_pixels)

# Tô thép cho lưỡi sau recolor (không thì quy tắc "vải trắng" biến ô thép xám thành vải ngà).
for mesh, cell in STEEL:
    report.setdefault('steel', []).append(PARTS['paint_cells'](mesh, cell, replace_pixels))
for mesh, cell, kind in FLAT:
    PARTS['paint_flat'](mesh, cell, kind, replace_pixels)

# ---------- 6. xương lò xo vạt áo (M3-10) ----------

for spec in IMPORT.get('spring', []):
    if spec.get('kind') != 'skirt':
        fail(f'spring: kind "{spec.get("kind")}" chưa hỗ trợ')  # noqa: F821
    legs = []
    for side in ('left', 'right'):
        up, low, foot = (bone_like(side + n) for n in ('upleg', 'leg', 'foot'))
        legs += [(arm.matrix_world @ up.head_local, arm.matrix_world @ low.head_local),
                 (arm.matrix_world @ low.head_local, arm.matrix_world @ foot.head_local)]
    for mesh in MESHES:  # noqa: F821
        report.setdefault('spring', []).append(PARTS['skirt_springs'](mesh, arm, spec, bone_like('hips').name, legs, fail))  # noqa: F821
report['bones'] = len(arm.data.bones)
HIPS, HEAD = bone_like('hips'), bone_like('head')  # edit mode làm mất hiệu lực tham chiếu Bone cũ


# ---------- 2. hit_light thủ tục ----------

pb = arm.pose.bones
REST = {p.name: p.bone.matrix_local.to_3x3() for p in pb}


def pbone(suffix):
    b = suffix_bone(arm.data.bones, suffix) if suffix != 'neck' else (suffix_bone(arm.data.bones, 'neck') or suffix_bone(arm.data.bones, 'spine2'))
    if b is None:
        fail(f'anim_biped_extra: rig không có xương *{suffix}')  # noqa: F821
    return b.name


SPINE, SPINE1, SPINE2 = pbone('spine'), pbone('spine1'), pbone('spine2')
NECK, HEADB = pbone('neck'), HEAD.name
L_ARM, R_ARM = pbone('leftarm'), pbone('rightarm')
L_FORE, R_FORE = pbone('leftforearm'), pbone('rightforearm')


def base_pose():
    """Dáng gốc: khung đầu clip idle (nếu có) để nối liền; không thì tư thế nghỉ."""
    idle = bpy.data.actions.get('idle')
    for p in pb:
        p.rotation_mode = 'QUATERNION'
        p.rotation_quaternion = (1, 0, 0, 0)
        p.location = (0, 0, 0)
    if idle:
        arm.animation_data_create()
        arm.animation_data.action = idle
        if hasattr(arm.animation_data, 'action_slot') and getattr(idle, 'slots', None):
            arm.animation_data.action_slot = idle.slots[0]
        bpy.context.scene.frame_set(int(idle.frame_range[0]))
    base = {p.name: (p.rotation_quaternion.copy(), p.location.copy()) for p in pb}
    if idle:
        arm.animation_data.action = None
    return base


def rot_local(name, deg):
    M = REST[name]
    return (M.inverted() @ Matrix.Rotation(math.radians(deg), 3, X) @ M).to_quaternion()


def pose_hit(w, base):
    """w ∈ [0, 1]: độ mạnh cú giật. Ngửa ra sau = xoay âm quanh trục ngang X (mặt trước là -Y)."""
    extra = {SPINE: -6, SPINE1: -8, SPINE2: -8, NECK: -10, HEADB: -14, L_ARM: 10, R_ARM: 10, L_FORE: -12, R_FORE: -12}
    for p in pb:
        q, loc = base[p.name]
        p.rotation_quaternion = q
        p.location = loc
        if p.name in extra:
            p.rotation_quaternion = rot_local(p.name, extra[p.name] * w) @ q
    hips = pb[HIPS.name]
    M = REST[HIPS.name]
    hips.location = base[HIPS.name][1] + M.inverted() @ Vector((0, 0.05 * w, -0.005 * w))


PROC = IMPORT.get('proc')
if 'hit_light' not in bpy.data.actions and not IMPORT.get('sharedAnims') and not PROC:
    base = base_pose()
    act = bpy.data.actions.new('hit_light')
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    n = round(0.35 * FPS)
    for f in range(n + 1):
        t = f / n
        w = math.sin(math.pi * min(1.0, t / 0.3) / 2) if t < 0.3 else 0.5 + 0.5 * math.cos(math.pi * (t - 0.3) / 0.7)
        pose_hit(w, base)
        for p in pb:
            p.keyframe_insert('rotation_quaternion', frame=f)
            p.keyframe_insert('location', frame=f)
    act.frame_range = (0, n)
    arm.animation_data.action = None
    add_to_nla(act)
    report['clips']['hit_light'] = {'seconds': round(n / FPS, 3), 'procedural': True}


# ---------- 5. clip boss thủ tục (tùy chọn, import.extra) ----------
# Đòn lớn đọc được từ xa, khớp pha boss M5-5/M5-3. Client (monsterSkins.ts, BOSS_MOVES) phát clip sao cho khung chạm
# (IMPACT) rơi đúng lúc vùng báo trước của server nổ; đổi thời điểm ở đây thì sửa cùng phía client.
#   slam   1,9 s  giơ hai tay quá đầu, ngả lưng lấy đà → nện hai nắm tay xuống đất (chạm 1,0 s) → giữ → về dáng idle
#   sweep  1,6 s  vung tay phải ra sau đầu, vặn thân → chém dọc tới trước theo vùng chữ nhật (chạm 0,85 s) → về
#   chant  2,4 s lặp  đứng thẳng, ngửa đầu, hai tay giơ cao chữ V, thở chậm (niệm chú, M5-3)
#   stun   1,6 s lặp  khuỵu gối, gục đầu, tay buông thõng, lắc lư (bị ngắt chú hoặc mất thế)
# Cách đặt dáng: bắt đầu từ khung đầu clip idle, rồi (1) dịch hông, (2) gập/vặn ba đốt sống quanh trục thế giới,
# (3) ngắm cánh tay trên/cẳng tay theo hướng thế giới (khóa giữa các khóa nội suy theo hướng), (4) IK hai đốt cho
# chân để bàn chân giữ nguyên chỗ và hướng như dáng idle (không trượt, không lún đất). Không có ngẫu nhiên.

EXTRA = list(IMPORT.get('extra', []))
for name in EXTRA:
    if name not in ('slam', 'sweep', 'chant', 'stun', 'combat_idle', 'guard', 'hit_back', 'roar'):
        fail(f'anim_biped_extra: import.extra "{name}" chưa hỗ trợ (slam | sweep | chant | stun | combat_idle | guard | hit_back | roar)')  # noqa: F821

if EXTRA or PROC:
    Y_AX, Z_AX = Vector((0, 1, 0)), Vector((0, 0, 1))
    SPINES = [SPINE, SPINE1, SPINE2]
    SIDES = {'L': 1.0, 'R': -1.0}
    LIMB = {
        s: {k: pbone(('left' if s == 'L' else 'right') + k) for k in ('arm', 'forearm', 'hand', 'upleg', 'leg', 'foot')}
        for s in SIDES
    }

    def upd():
        bpy.context.view_layer.update()

    def head_of(n):
        return pb[n].matrix.translation.copy()

    def rotate_world(n, R3):
        """Xoay xương n (cả nhánh con) quanh đầu xương theo phép xoay R3 ở hệ armature (đã chuẩn hóa = thế giới)."""
        m = pb[n].matrix.copy()
        h = m.translation.copy()
        pb[n].matrix = Matrix.Translation(h) @ R3.to_4x4() @ Matrix.Translation(-h) @ m
        upd()

    def aim(n, child, target):
        """Xoay xương n để vector đầu xương n → đầu xương con `child` trùng hướng `target`."""
        cur = head_of(child) - head_of(n)
        if cur.length < 1e-6 or target.length < 1e-6:
            return
        rotate_world(n, cur.rotation_difference(target.normalized()).to_matrix())

    def set_base(base):
        for p in pb:
            q, loc = base[p.name]
            p.rotation_quaternion = q
            p.location = loc
        upd()

    BASE = base_pose()
    set_base(BASE)
    H = max(head_of(HEADB).z, 1e-3)
    BASE_DIR = {s: {'arm': head_of(L['forearm']) - head_of(L['arm']), 'fore': head_of(L['hand']) - head_of(L['forearm'])}
                for s, L in LIMB.items()}
    FOOT = {s: pb[L['foot']].matrix.copy() for s, L in LIMB.items()}
    KNEE = {s: head_of(L['leg']) for s, L in LIMB.items()}
    THIGH = {s: head_of(L['upleg']) for s, L in LIMB.items()}
    SEG = {s: ((KNEE[s] - THIGH[s]).length, (FOOT[s].translation - KNEE[s]).length) for s in SIDES}

    def leg_ik(s, off=(0, 0, 0)):
        """IK hai đốt: đưa bàn chân về chỗ cũ (FOOT) cộng độ lệch `off` (phần chiều cao, K-3: thủ thế bước chân), đầu gối theo
        hướng gối của dáng gốc, rồi trả hướng bàn chân."""
        L = LIMB[s]
        a = head_of(L['upleg'])
        goal = FOOT[s].translation + Vector(off) * H
        l1, l2 = SEG[s]
        d = goal - a
        dist = min(max(d.length, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
        dn = d.normalized()
        pole = (KNEE[s] - THIGH[s]) + Vector((0, -0.25 * l1, 0))  # gối hướng ra trước
        perp = pole - dn * pole.dot(dn)
        perp = perp.normalized() if perp.length > 1e-6 else Vector((0, -1, 0))
        along = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist)
        knee = a + dn * along + perp * math.sqrt(max(l1 * l1 - along * along, 0.0))
        aim(L['upleg'], L['leg'], knee - a)
        aim(L['leg'], L['foot'], goal - head_of(L['leg']))
        m = FOOT[s].copy()
        m.translation = head_of(L['foot'])  # (bàn chân giữ hướng dáng gốc)
        pb[L['foot']].matrix = m
        upd()

    def nlerp(a, b, w):
        v = a * (1 - w) + b * w
        return v.normalized() if v.length > 1e-6 else b.normalized()

    def pose_of(k, s, part):
        v = k.get('arms', {}).get(s)
        if v is None:
            return BASE_DIR[s][part].normalized()
        return Vector(v[0] if part == 'arm' else v[1]).normalized()

    def apply_key(k):
        """k: spine [độ ×3, + là gập tới trước], twist (độ quanh Z, + đưa vai phải ra trước), head (độ, + là cúi),
        hips (dx, dy, dz theo phần chiều cao, -dy là tới trước), arms {L|R: (hướng cánh tay trên, hướng cẳng tay)}."""
        set_base(BASE)
        hips = pb[HIPS.name]
        m = hips.matrix.copy()
        m.translation += Vector(k.get('hips', (0, 0, 0))) * H
        hips.matrix = m
        upd()
        if k.get('tilt'):  # ngã cả thân quanh đầu xương hông (+ là ngã úp tới trước)
            rotate_world(HIPS.name, Matrix.Rotation(math.radians(k['tilt']), 3, X))
        for b, deg in zip(SPINES, k.get('spine', (0, 0, 0))):
            if deg:
                rotate_world(b, Matrix.Rotation(math.radians(deg), 3, X))
        if k.get('twist'):
            rotate_world(SPINE1, Matrix.Rotation(math.radians(k['twist']), 3, Z_AX))
        if k.get('head'):
            rotate_world(NECK, Matrix.Rotation(math.radians(k['head'] * 0.4), 3, X))
            rotate_world(HEADB, Matrix.Rotation(math.radians(k['head'] * 0.6), 3, X))
        for s, L in LIMB.items():
            aim(L['arm'], L['forearm'], k['dir'][s]['arm'])
            aim(L['forearm'], L['hand'], k['dir'][s]['fore'])
        if not k.get('noik'):
            for s in SIDES:
                leg_ik(s, k.get('feet', {}).get(s, (0, 0, 0)))

    def resolved(k):
        k = dict(k)
        k['dir'] = {s: {'arm': pose_of(k, s, 'arm'), 'fore': pose_of(k, s, 'fore')} for s in SIDES}
        return k

    def mix(a, b, w):
        out = {}
        for key in ('spine', 'hips'):
            va, vb = a.get(key, (0, 0, 0)), b.get(key, (0, 0, 0))
            out[key] = tuple(x * (1 - w) + y * w for x, y in zip(va, vb))
        for key in ('twist', 'head'):
            out[key] = a.get(key, 0) * (1 - w) + b.get(key, 0) * w
        out['tilt'] = a.get('tilt', 0) * (1 - w) + b.get('tilt', 0) * w
        out['noik'] = b.get('noik', False) if w > 0.5 else a.get('noik', False)
        out['dir'] = {s: {p: nlerp(a['dir'][s][p], b['dir'][s][p], w) for p in ('arm', 'fore')} for s in SIDES}
        out['feet'] = {s: tuple(x * (1 - w) + y * w for x, y in zip(a.get('feet', {}).get(s, (0, 0, 0)), b.get('feet', {}).get(s, (0, 0, 0))))
                       for s in SIDES}
        return out

    def key_frame(f):
        for p in pb:
            p.keyframe_insert('rotation_quaternion', frame=f)
            p.keyframe_insert('location', frame=f)

    def begin(name):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = act
        # Đổi action làm Blender dựng lại tư thế: khung 0 đầu tiên đọc ma trận cũ nên sai (cột sống gập). Dựng một dáng nghỉ trước.
        apply_key(resolved({}))
        upd()
        return act

    def end(act, n):
        act.frame_range = (0, n)
        arm.animation_data.action = None
        add_to_nla(act)

    def lowest_z():
        dg = bpy.context.evaluated_depsgraph_get()
        low = 1e9
        for m in MESHES:  # noqa: F821
            ev = m.evaluated_get(dg)
            me = ev.to_mesh()
            mw = ev.matrix_world
            low = min(low, min((mw @ v.co).z for v in me.vertices))
            ev.to_mesh_clear()
        return low

    def keyed_clip(name, seconds, keys, settle=False):
        """keys = [(giây, khóa)], nội suy smoothstep, đặt khóa mọi khung. settle: khi thân đang ngã (tilt > 5°) hạ/nâng hông cho
        điểm thấp nhất của lưới chạm đất (Z = 0), để cái xác không lơ lửng hay lún."""
        keys = [(t, resolved(k)) for t, k in keys]
        act = begin(name)
        n = round(seconds * FPS)
        for f in range(n + 1):
            t = f / FPS
            i = max(j for j in range(len(keys)) if keys[j][0] <= t + 1e-9)
            j = min(i + 1, len(keys) - 1)
            span = keys[j][0] - keys[i][0]
            u = 0.0 if span <= 0 else min(1.0, (t - keys[i][0]) / span)
            k = mix(keys[i][1], keys[j][1], u * u * (3 - 2 * u))
            apply_key(k)
            if settle and k.get('tilt', 0) > 5:
                upd()
                low = lowest_z()
                if abs(low) > 1e-3:
                    hm = pb[HIPS.name].matrix.copy()
                    hm.translation.z -= low
                    pb[HIPS.name].matrix = hm
                    upd()
            key_frame(f)
        end(act, n)
        report['clips'][name] = {'seconds': round(n / FPS, 3), 'procedural': True}

    def looped_clip(name, seconds, at, step=2):
        act = begin(name)
        n = round(seconds * FPS)
        for f in list(range(0, n, step)) + [n]:
            apply_key(resolved(at((f % n) / n)))
            key_frame(f)
        end(act, n)
        report['clips'][name] = {'seconds': round(n / FPS, 3), 'procedural': True, 'loop': True}

    def both(fn):
        return {s: fn(sx) for s, sx in SIDES.items()}

    REST_K = {}
    if 'slam' in EXTRA:
        up = {'spine': (-6, -6, -5), 'head': -8, 'hips': (0, 0.02, 0.015),
              'arms': both(lambda sx: ((sx * 0.35, 0.18, 0.92), (sx * 0.1, 0.38, 0.92)))}
        up2 = {'spine': (-8, -8, -6), 'head': -10, 'hips': (0, 0.03, 0.02),
               'arms': both(lambda sx: ((sx * 0.3, 0.32, 0.9), (sx * 0.08, 0.5, 0.86)))}
        # Khóa giữa: tay vòng qua phía trước đầu (nội suy thẳng giữa "giơ cao" và "chúi xuống" sẽ đi qua chữ T).
        over = {'spine': (4, 4, 3), 'head': 0, 'hips': (0, -0.01, -0.03),
                'arms': both(lambda sx: ((sx * 0.2, -0.75, 0.62), (sx * 0.12, -0.9, 0.4)))}
        smash = {'spine': (20, 20, 14), 'head': 6, 'hips': (0, -0.04, -0.15),
                 'arms': both(lambda sx: ((sx * 0.16, -0.62, -0.77), (sx * 0.1, -0.45, -0.89)))}
        keyed_clip('slam', 1.9, [(0.0, REST_K), (0.5, up), (0.82, up2), (0.92, over), (1.0, smash), (1.35, smash),
                                 (1.9, REST_K)])

    if 'sweep' in EXTRA:
        wind = {'spine': (-4, -4, -2), 'twist': -18, 'head': -4, 'hips': (0, 0.02, 0.0),
                'arms': {'R': ((-0.3, 0.35, 0.88), (-0.1, 0.45, 0.88))}}
        chop = {'spine': (10, 12, 8), 'twist': 14, 'head': 6, 'hips': (0, -0.06, -0.08),
                'arms': {'R': ((-0.08, -0.92, -0.38), (-0.02, -0.75, -0.66))}}
        mid = {'spine': (2, 3, 2), 'twist': 0, 'head': 0, 'hips': (0, -0.02, -0.03),
               'arms': {'R': ((-0.12, -0.55, 0.83), (-0.05, -0.85, 0.52))}}
        keyed_clip('sweep', 1.6, [(0.0, REST_K), (0.55, wind), (0.74, mid), (0.85, chop), (1.15, chop), (1.6, REST_K)])

    if 'chant' in EXTRA:
        def chant(t):
            a = 2 * math.pi * t
            return {'spine': (-4 + math.sin(a), -4 + math.sin(a), -2), 'head': -14, 'hips': (0, 0, 0.004 * math.sin(2 * a)),
                    'arms': both(lambda sx: ((sx * (0.5 + 0.04 * math.sin(a)), -0.15, 0.85), (sx * 0.3, -0.25, 0.92)))}
        looped_clip('chant', 2.4, chant)

    if 'stun' in EXTRA:
        def stun(t):
            a = 2 * math.pi * t
            return {'spine': (12 + 2 * math.sin(a), 12, 8), 'twist': 6 * math.sin(a), 'head': 22,
                    'hips': (0.012 * math.sin(a), 0, -0.1),
                    'arms': both(lambda sx: ((sx * 0.15, -0.25 + 0.05 * math.sin(a), -0.95), (sx * 0.05, -0.35, -0.93)))}
        looped_clip('stun', 1.6, stun)

    # ---- K-3: thủ thế cầm kiếm, đỡ đòn, trúng đòn từ sau, gầm khiêu khích ----
    # Hướng cánh tay/cẳng tay là vector thế giới (x + là bên trái nhân vật, -y là phía trước, z lên); `feet` là độ lệch bàn
    # chân so với dáng nghỉ theo phần chiều cao (x trái, y trước-sau với -y là tới trước).
    if 'combat_idle' in EXTRA:
        def combat(t):
            a = 2 * math.pi * t
            br = math.sin(a)
            return {'spine': (6 + 1.2 * br, 5 + 1.2 * br, 3), 'twist': 20, 'head': -3, 'hips': (0, -0.008, -0.05 + 0.004 * math.sin(2 * a)),
                    'feet': {'R': (-0.03, -0.075, 0), 'L': (0.05, 0.07, 0)},
                    'arms': {'R': ((-0.30, -0.45, -0.84), (0.20, -0.85 + 0.03 * br, 0.15)),
                             'L': ((0.35, -0.35, -0.87), (-0.55, -0.70, 0.45 + 0.03 * br))}}
        looped_clip('combat_idle', 2.4, combat)

    if 'guard' in EXTRA:
        def guard(t):
            a = 2 * math.pi * t
            br = math.sin(a)
            return {'spine': (10 + br, 10 + br, 6), 'head': 8, 'hips': (0, 0.01, -0.06 + 0.003 * math.sin(2 * a)),
                    'feet': {'R': (-0.035, -0.03, 0), 'L': (0.035, 0.03, 0)},
                    'arms': {'L': ((0.15, -0.35, -0.92), (-0.80, -0.55, 0.30 + 0.02 * br)),
                             'R': ((-0.15, -0.35, -0.92), (0.80, -0.55, 0.30 + 0.02 * br))}}
        looped_clip('guard', 1.2, guard)

    if 'hit_back' in EXTRA:
        # Bị đánh từ sau: chân vọt tới, lưng ưỡn, đầu ngửa, hai tay văng ra sau rồi lấy lại thăng bằng.
        hb = {'spine': (-12, -14, -10), 'head': -16, 'hips': (0, -0.05, -0.02), 'feet': {'R': (0, -0.12, 0), 'L': (0, 0.03, 0)},
              'arms': both(lambda sx: ((sx * 0.55, 0.5, -0.65), (sx * 0.25, 0.3, -0.92)))}
        hb2 = {'spine': (-5, -6, -4), 'head': -6, 'hips': (0, -0.07, -0.05), 'feet': {'R': (0, -0.14, 0), 'L': (0, -0.02, 0)},
               'arms': both(lambda sx: ((sx * 0.45, 0.2, -0.87), (sx * 0.2, -0.2, -0.95)))}
        keyed_clip('hit_back', 0.8, [(0.0, REST_K), (0.1, hb), (0.28, hb), (0.5, hb2), (0.8, REST_K)])

    if 'roar' in EXTRA:
        # Khiêu khích / Sư Tử Hống: hạ thấp, kéo hai tay vào hông, rồi ưỡn ngực ngửa đầu dang tay, giậm chân (0,92 s).
        r1 = {'spine': (14, 14, 10), 'head': 10, 'hips': (0, 0.02, -0.07), 'feet': both(lambda sx: ((sx * -0.05), 0, 0)),
              'arms': both(lambda sx: ((sx * 0.3, 0.1, -0.95), (sx * -0.25, -0.5, 0.2)))}
        r2 = {'spine': (-12, -14, -10), 'head': -22, 'hips': (0, 0.0, 0.0), 'feet': both(lambda sx: ((sx * -0.07), 0, 0)),
              'arms': both(lambda sx: ((sx * 0.85, 0.0, 0.35), (sx * 0.9, -0.15, 0.25)))}
        keyed_clip('roar', 1.8, [(0.0, REST_K), (0.5, r1), (0.62, r1), (0.95, r2), (1.4, r2), (1.8, REST_K)])


    # ---- Clip nền thủ tục cho boss người/khôi (import.proc): idle, run, attack, hit_light, death ----
    # Dùng chung bộ đặt dáng trên (hướng tay theo vector thế giới, IK chân), không cần clip Tripo hay thư viện. Rig chữ T
    # (`proc.tpose`) hạ tay xuống thân ở mọi dáng nghỉ; rig tay sẵn buông (khôi đá) giữ hướng tay nghỉ.
    if PROC:
        TP = bool(PROC.get('tpose'))
        STRIDE = float(PROC.get('stride', 0.11))  # sải chân (phần chiều cao)
        LIFT = float(PROC.get('lift', 0.05))
        RUN_S = float(PROC.get('runSeconds', 0.9))
        IDLE_S = float(PROC.get('idleSeconds', 3.2))
        BOB = float(PROC.get('bob', 0.012))

        def down(sx, swing=0.0, out=0.14, bend=0.0):
            """Tay buông dọc thân; swing > 0 đưa tay tới trước (-y)."""
            return ((sx * out, -swing, -0.97), (sx * (out * 0.6), -swing - 0.2 - bend, -0.9))

        def arms_rest(sx, **kw):
            return down(sx, **kw) if TP else None

        def with_arms(k, fn):
            if TP:
                k['arms'] = both(fn)
            return k

        def idle(t):
            a = 2 * math.pi * t
            br = math.sin(a)
            k = {'spine': (1.2 * br, 1.6 * br, 1.0 * br), 'twist': 1.5 * math.sin(a * 0.5), 'head': 1.5 * math.sin(a - 0.7),
                 'hips': (0.004 * math.sin(a * 0.5), 0, 0.004 * math.sin(2 * a))}
            return with_arms(k, lambda sx: down(sx, swing=0.04 * br, out=0.15 + 0.02 * br))

        looped_clip('idle', IDLE_S, idle)

        def run(t):
            a = 2 * math.pi * t
            f = lambda ph: (0.0, -STRIDE * math.sin(a + ph), LIFT * max(0.0, math.cos(a + ph)))
            sw = math.sin(a)
            k = {'spine': (7, 8, 5), 'twist': 7 * sw, 'head': -4,
                 'hips': (0.012 * math.sin(a), -0.02, -BOB * 4 + BOB * math.cos(2 * a)),
                 'feet': {'L': f(0.0), 'R': f(math.pi)}}
            return with_arms(k, lambda sx: down(sx, swing=0.55 * sw * -sx, out=0.12, bend=0.35))

        looped_clip('run', RUN_S, run)

        # attack: vung tay phải chém xéo (chạm ~0,45 s), gọn hơn sweep để dùng làm đòn thường
        atk_wind = {'spine': (-6, -6, -4), 'twist': -22, 'head': -4, 'hips': (0, 0.02, -0.01),
                    'arms': {'R': ((-0.25, 0.4, 0.88), (-0.1, 0.5, 0.86)), 'L': ((0.3, 0.0, -0.95), (0.2, -0.3, -0.9))}}
        atk_hit = {'spine': (12, 14, 9), 'twist': 16, 'head': 6, 'hips': (0, -0.07, -0.09),
                   'feet': {'L': (0.0, -0.05, 0.0), 'R': (0.0, 0.07, 0.0)},
                   'arms': {'R': ((-0.1, -0.88, -0.45), (-0.02, -0.8, -0.6)), 'L': ((0.35, 0.05, -0.93), (0.3, -0.35, -0.88))}}
        keyed_clip('attack', 1.1, [(0.0, REST_K if not TP else {'arms': both(lambda sx: down(sx))}), (0.32, atk_wind),
                                   (0.45, atk_hit), (0.65, atk_hit), (1.1, REST_K if not TP else {'arms': both(lambda sx: down(sx))})])

        hl = {'spine': (-8, -9, -6), 'head': -13, 'hips': (0, 0.035, -0.012), 'feet': {'L': (0, 0.03, 0), 'R': (0, 0.0, 0)}}
        hl0 = {'arms': both(lambda sx: down(sx))} if TP else REST_K
        hl1 = dict(hl)
        if TP:
            hl1['arms'] = both(lambda sx: down(sx, swing=-0.35, out=0.3))
        keyed_clip('hit_light', 0.36, [(0.0, hl0), (0.1, hl1), (0.36, hl0)])

        # death: loạng choạng → quỵ gối → ngã úp (tilt, bỏ IK chân), nằm yên ở khung cuối
        d0 = {'arms': both(lambda sx: down(sx))} if TP else REST_K
        d1 = with_arms({'spine': (-8, -10, -6), 'head': -14, 'hips': (0, 0.04, -0.03)}, lambda sx: down(sx, swing=-0.3, out=0.35))
        d2 = with_arms({'spine': (16, 18, 12), 'head': 18, 'hips': (0, -0.03, -0.24),
                        'feet': {'L': (0.0, -0.02, 0.0), 'R': (0.0, 0.05, 0.0)}}, lambda sx: down(sx, swing=0.05, out=0.12))
        d3 = with_arms({'tilt': 82, 'noik': True, 'spine': (6, 6, 4), 'head': 8, 'hips': (0, -0.34, -0.42)}, lambda sx: down(sx, swing=0.2, out=0.5))
        d4 = dict(d3)
        keyed_clip('death', 2.4, [(0.0, d0), (0.22, d1), (0.8, d2), (1.15, d2), (1.75, d3), (2.4, d4)], settle=True)


for p in pb:
    p.rotation_quaternion = (1, 0, 0, 0)
    p.location = (0, 0, 0)
REPORT = report
print(f'[anim_biped_extra] {ASSET_ID}: {REPORT}')  # noqa: F821
