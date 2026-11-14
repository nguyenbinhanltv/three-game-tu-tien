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
# 2. Clip thủ tục: thêm `hit_light` (0,33 s) nếu chưa có: thân trên giật lùi, ngửa đầu, tay bật nhẹ, rồi về dáng đầu.
#    Góc quay quanh trục thế giới, đổi sang trục cục bộ của xương (q = M⁻¹·R·M), như anim_quadruped.py.
#    Dáng gốc của hit_light lấy từ khung đầu của clip `idle` nếu có (để chuyển clip không giật), không thì tư thế nghỉ.
#
# 3. Phụ kiện cứng (`import.rigid`): Tripo auto-rig skin cả phụ kiện như cơ thể, nên kiếm đeo sau lưng bị bẻ cong khi
#    tay hạ khỏi tư thế chữ T. Mỗi phần tử { kind, bone }: kind "back_sword" dò kiếm đeo chéo sau lưng (đỉnh màu nâu
#    sau lưng → trục bằng PCA → mọi đỉnh sau lưng trong bán kính quanh trục, lặp 3 lần), tách lưới kiếm khỏi thân rồi
#    gán cứng 100% vào `bone`; `tilt` (độ) xoay kiếm quanh mũi để chuôi vào gần gáy.
# 4. Chỉnh màu vải (`import.recolor`): mỗi quy tắc chọn điểm ảnh của texture màu theo hue/độ bão hòa/độ sáng (mép mềm),
#    rồi đổi sang màu đích trong bảng tâm trạng, giữ độ sáng tương đối nên vân vải và nếp gấp còn nguyên. Không vẽ lại.
#
#    Phần ghép clip dùng chung tools/blender/tripo_clips.py. Khi có `import.clips`, clip sẵn có trong GLB nguồn chính bị bỏ
#    (mọi clip phải khai báo trong `clips`), vì vậy nguồn chính có thể là một file anim_* có bộ xương đầy đủ hơn rig.
#    Tên xương dò theo bí danh: Mixamo (Hips, Spine1, LeftArm) hoặc bộ xương Tripo (Hip, Spine01, L_Upperarm).
#    `import.prune` (regex tên xương): bỏ xương phụ để vừa trần xương, dồn trọng số skin vào tổ tiên còn giữ.
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
    'hips': ('hips', 'hip'),
    'head': ('head',),
    'spine': ('spine', 'waist'),
    'spine1': ('spine1', 'spine01'),
    'spine2': ('spine2', 'spine02'),
    'neck': ('neck', 'necktwist01'),
    'leftarm': ('leftarm', 'l_upperarm'),
    'rightarm': ('rightarm', 'r_upperarm'),
    'leftforearm': ('leftforearm', 'l_forearm'),
    'rightforearm': ('rightforearm', 'r_forearm'),
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


for spec in IMPORT.get('rigid', []):
    if spec.get('kind') != 'back_sword':
        fail(f'rigid: kind "{spec.get("kind")}" chưa hỗ trợ')  # noqa: F821
    bone = bone_like(spec['bone']).name
    for mesh in MESHES:  # noqa: F821
        import bmesh
        face_ids, length, zone = back_sword_vertices(mesh)
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
        report.setdefault('rigid', []).append({'kind': 'back_sword', 'bone': bone, 'faces': len(face_ids), 'vertices': len(verts),
                                               'length': length, 'tilt': tilt, 'pinnedIslands': pinned, 'skippedIslands': skipped})


# ---------- 4. chỉnh màu vải ----------

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
        # Giữ JPEG như ảnh màu gốc của Tripo (PNG làm GLB nặng gần gấp đôi): dựng ảnh mới từ điểm ảnh đã chỉnh, lưu JPEG
        # tạm, nạp lại thành ảnh đóng gói rồi thay vào mọi node đang dùng ảnh cũ.
        import os
        import tempfile
        name, cs = img.name, img.colorspace_settings.name
        tmp = os.path.join(tempfile.mkdtemp(prefix='dtl_recolor_'), f'{ascii_name(name)}.jpg')  # noqa: F821
        work = bpy.data.images.new(name + '_work', W, H, alpha=False)
        work.colorspace_settings.name = cs
        work.pixels.foreach_set(px.ravel())
        work.filepath_raw = tmp
        work.file_format = 'JPEG'
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
        import shutil
        shutil.rmtree(os.path.dirname(tmp), ignore_errors=True)
    return out


if IMPORT.get('recolor'):
    report['recolor'] = recolor(IMPORT['recolor'])


# ---------- 2. hit_light thủ tục ----------

pb = arm.pose.bones
REST = {p.name: p.bone.matrix_local.to_3x3() for p in pb}


def pbone(suffix):
    b = bone_like(suffix)
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


if 'hit_light' not in bpy.data.actions:
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

for p in pb:
    p.rotation_quaternion = (1, 0, 0, 0)
    p.location = (0, 0, 0)
REPORT = report
print(f'[anim_biped_extra] {ASSET_ID}: {REPORT}')  # noqa: F821
