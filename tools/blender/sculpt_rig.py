# Biến một bản điêu khắc dày lưới, không xương (GLB tải về, ví dụ model CC BY trên Sketchfab: 0,1–2 triệu tam giác, nhiều
# mảnh, một vật liệu) thành GLB "như Tripo đã rig": lưới thấp trong ngân sách + texture nướng + bộ xương + trọng số.
# Kết quả ghi vào thư mục nguồn asset (DTL_ASSET_SOURCE/<loại>/<id>/rig/rig_v01.glb); từ đó đi tiếp đường nhập thường
# (meta.json `import.kind: "tripo"` → import_tripo.py → import.post anim_*.py → optimize.ts).
#
# Chạy (tools/blender/run-sculpt.mjs gọi; không mở giao diện, không dùng dịch vụ ngoài):
#   blender --background --factory-startup --python tools/blender/sculpt_rig.py -- \
#       <nguồn.glb> <ra.glb> --meta assets/source/<loại>/<id>/meta.json --work <thư mục tạm> [--stage mesh|rig|all]
#
# Cấu hình ở meta.json, khối `sculpt`:
#   faces      số tam giác đích của lưới thấp (mặc định 36000)
#   texture    cạnh texture nướng (mặc định 2048); ORM nướng ở nửa cạnh
#   emissive   { "min": 0.16, "gain": 3.0, "strength": 1.4 } | bỏ trống: tách phần đỏ rực của base color (khe nứt, mắt,
#              lửa) thành map phát sáng; model nguồn không có map phát sáng riêng
#   yaw        độ, xoay lưới quanh trục đứng trước khi dựng xương (bản điêu khắc đứng chéo → nắn thân dọc theo trục Y)
#   bones      [[tên, cha | null, [x, y, z] đầu, [x, y, z] đuôi], ...] tọa độ Blender của model nguồn sau khi gộp, áp
#              transform và xoay `yaw` (Z lên, đầu con vật ở -Y; đọc từ ảnh chiếu có lưới tọa độ)
#   rigid      { xương: bán kính } tùy chọn: đỉnh trong bán kính quanh đầu mút xương gắn cứng 100% (đầu, bàn chân)
#   limit      { tiền tố xương: [tiền tố được phép hàng xóm...] } xem gán trọng số bên dưới
#
# Giai đoạn `mesh` (chậm, vài phút; kết quả giữ ở <work>/<id>_low.blend để chỉnh xương không phải nướng lại):
#   1. Nhập, gộp mọi mesh, hàn đỉnh trùng, áp transform.
#   2. Bản thấp: Decimate (collapse) về `faces`, bỏ mảnh rời dưới 12 mặt, Smart UV Project.
#   3. Nướng từ bản gốc sang bản thấp (Cycles, selected-to-active): base color và ORM bằng pass EMIT (pass DIFFUSE cho
#      màu đen ở vật liệu kim loại), normal bằng pass NORMAL (gồm cả normal map gốc).
#   4. In bảng lát cắt (cụm điểm theo từng độ cao) để đặt khớp.
# Giai đoạn `rig`:
#   5. Dựng armature theo `bones`.
#   6. Trọng số: khoảng cách tới đoạn xương, tối đa 4 xương, ∝ 1/(d² + ε), rồi làm mượt theo cạnh lưới 3 vòng. Bản điêu
#      khắc có nhiều mảnh xuyên nhau nên không dùng Automatic Weights của Blender (heat solve hay thất bại).
#      Chống "dính chéo" (đỉnh chân trước ăn xương chân sau, đầu trái ăn cổ giữa): mỗi đỉnh chỉ nhận xương thuộc chuỗi
#      của xương gần nhất và các chuỗi khai là hàng xóm trong `limit`.
#   7. Xuất GLB (một mesh, một vật liệu, texture nhúng).
# Cùng đầu vào cho cùng đầu ra (không ngẫu nhiên).

import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


SRC, OUT = argv[0], argv[1]
META = json.load(open(arg('--meta'), encoding='utf-8'))
WORK = arg('--work')
STAGE = arg('--stage', 'all')
ID = META['id']
CFG = META.get('sculpt') or {}
FACES = int(CFG.get('faces', 36000))
TEX = int(CFG.get('texture', 2048))
LOW_BLEND = os.path.join(WORK, f'{ID}_low.blend')


def fail(msg):
    print(f'[sculpt_rig] LỖI {ID}: {msg}')
    sys.exit(1)


def only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def source_of(sock):
    """Node ảnh nối (qua Separate Color / Normal Map) vào một ổ của Principled, None nếu không có."""
    seen = set()
    stack = [l.from_node for l in sock.links]
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        if n.type == 'TEX_IMAGE' and n.image:
            return n
        for i in n.inputs:
            stack.extend(l.from_node for l in i.links)
    return None


# ---------- giai đoạn mesh ----------

def stage_mesh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC, merge_vertices=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        fail('GLB nguồn không có mesh')
    if any(o.type == 'ARMATURE' for o in bpy.context.scene.objects):
        fail('GLB nguồn đã có xương: dùng đường nhập Tripo thường')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    hi = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o is not hi:
            bpy.data.objects.remove(o, do_unlink=True)
    hi.name = f'{ID}_high'
    src_tris = sum(len(p.vertices) - 2 for p in hi.data.polygons)
    if len(hi.data.materials) != 1:
        print(f'[sculpt_rig] cảnh báo: nguồn có {len(hi.data.materials)} vật liệu, nướng gộp về một')

    # bản thấp
    only(hi)
    bpy.ops.object.duplicate()
    lo = bpy.context.view_layer.objects.active
    lo.name = ID
    lo.data.name = ID
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode='OBJECT')
    mod = lo.modifiers.new('dec', 'DECIMATE')
    mod.ratio = min(1.0, FACES / max(1, sum(len(p.vertices) - 2 for p in lo.data.polygons)))
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    drop_small_islands(lo, 12)
    for _ in range(2):  # Decimate làm tròn tỉ lệ; ép thêm nếu còn vượt 2%
        n = len(lo.data.polygons)
        if n <= FACES * 1.02:
            break
        mod = lo.modifiers.new('dec', 'DECIMATE')
        mod.ratio = FACES / n
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in lo.data.polygons:
        p.use_smooth = True

    # UV mới
    while lo.data.uv_layers:
        lo.data.uv_layers.remove(lo.data.uv_layers[0])
    lo.data.uv_layers.new(name='UVMap')
    only(lo)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')

    bake(hi, lo)
    lo_tris = len(lo.data.polygons)
    print(f'[sculpt_rig] {ID}: nguồn {src_tris} tam giác → thấp {lo_tris} tam giác, texture {TEX}²')
    slices(lo)
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    os.makedirs(WORK, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=LOW_BLEND)


def drop_small_islands(obj, min_faces):
    me = obj.data
    n = len(me.vertices)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    count = {}
    for p in me.polygons:
        r = find(p.vertices[0])
        count[r] = count.get(r, 0) + 1
    kill = [v.index for v in me.vertices if count.get(find(v.index), 0) < min_faces]
    if not kill:
        return
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in kill], context='VERTS')
    bm.to_mesh(me)
    bm.free()
    print(f'[sculpt_rig] bỏ {len(kill)} đỉnh của mảnh rời nhỏ')


def bake(hi, lo):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 6
    hmat = hi.data.materials[0]
    hp = principled(hmat)
    color_src = source_of(hp.inputs['Base Color'])
    orm_src = source_of(hp.inputs['Roughness']) or source_of(hp.inputs['Metallic'])
    nodes, links = hmat.node_tree.nodes, hmat.node_tree.links
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    surface_from = out.inputs['Surface'].links[0].from_socket
    emit = nodes.new('ShaderNodeEmission')

    lmat = bpy.data.materials.new(f'{ID}_mat')
    lmat.use_nodes = True
    lo.data.materials.clear()
    lo.data.materials.append(lmat)
    ln, ll = lmat.node_tree.nodes, lmat.node_tree.links
    lp = principled(lmat)

    def target(name, size, colorspace):
        img = bpy.data.images.new(f'{ID}_{name}', size, size, alpha=False)
        img.colorspace_settings.name = colorspace
        node = ln.new('ShaderNodeTexImage')
        node.image = img
        return img, node

    ext = max(hi.dimensions)

    def run(kind, node):
        for n in ln:
            n.select = False
        node.select = True
        ln.active = node
        bpy.ops.object.select_all(action='DESELECT')
        hi.select_set(True)
        lo.select_set(True)
        bpy.context.view_layer.objects.active = lo
        bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=0.012 * ext,
                            max_ray_distance=0.03 * ext, margin=6)

    # base color (EMIT)
    img_c, node_c = target('basecolor', TEX, 'sRGB')
    if color_src:
        links.new(color_src.outputs['Color'], emit.inputs['Color'])
    else:
        emit.inputs['Color'].default_value = hp.inputs['Base Color'].default_value
    links.new(emit.outputs[0], out.inputs['Surface'])
    run('EMIT', node_c)
    # ORM (EMIT, không quản lý màu): G = độ nhám, B = kim loại như glTF
    img_o, node_o = target('orm', TEX // 2, 'Non-Color')
    if orm_src:
        links.new(orm_src.outputs['Color'], emit.inputs['Color'])
    else:
        emit.inputs['Color'].default_value = (1.0, hp.inputs['Roughness'].default_value, hp.inputs['Metallic'].default_value, 1.0)
    run('EMIT', node_o)
    # normal
    links.new(surface_from, out.inputs['Surface'])
    img_n, node_n = target('normal', TEX, 'Non-Color')
    run('NORMAL', node_n)

    # map phát sáng tách từ phần đỏ rực của base color
    em = CFG.get('emissive')
    node_e = None
    if em:
        px = np.array(img_c.pixels[:], dtype=np.float32).reshape(-1, 4)
        r, g, b = px[:, 0], px[:, 1], px[:, 2]
        mask = np.clip((r - np.maximum(g, b) * 1.5 - float(em.get('min', 0.16))) * float(em.get('gain', 3.0)), 0, 1)
        e = np.zeros_like(px)
        e[:, :3] = px[:, :3] * mask[:, None]
        e[:, 3] = 1
        s = TEX // 2
        img_e = bpy.data.images.new(f'{ID}_emissive', TEX, TEX, alpha=False)
        img_e.pixels.foreach_set(e.ravel())
        img_e.scale(s, s)
        node_e = ln.new('ShaderNodeTexImage')
        node_e.image = img_e
        print(f'[sculpt_rig] phát sáng: {float((mask > 0.05).mean()) * 100:.1f}% điểm ảnh')

    ll.new(node_c.outputs['Color'], lp.inputs['Base Color'])
    sep = ln.new('ShaderNodeSeparateColor')
    ll.new(node_o.outputs['Color'], sep.inputs['Color'])
    ll.new(sep.outputs['Green'], lp.inputs['Roughness'])
    ll.new(sep.outputs['Blue'], lp.inputs['Metallic'])
    nm = ln.new('ShaderNodeNormalMap')
    ll.new(node_n.outputs['Color'], nm.inputs['Color'])
    ll.new(nm.outputs['Normal'], lp.inputs['Normal'])
    if node_e:
        ll.new(node_e.outputs['Color'], lp.inputs['Emission Color'])
        lp.inputs['Emission Strength'].default_value = float(em.get('strength', 1.4))
    for img in bpy.data.images:
        if img.name.startswith(f'{ID}_'):
            img.pack()


def slices(obj):
    """Bảng lát cắt: ở mỗi độ cao, gom điểm thành cụm (ô 4% chiều dài) rồi in tâm và hộp bao từng cụm. Dùng để đặt khớp."""
    co = np.array([v.co[:] for v in obj.data.vertices])
    lo, hi = co.min(0), co.max(0)
    cell = 0.04 * max(hi - lo)
    print(f'[sculpt_rig] hộp bao min {np.round(lo, 3).tolist()} max {np.round(hi, 3).tolist()}')
    steps = 16
    for k in range(steps):
        z0 = lo[2] + (hi[2] - lo[2]) * k / steps
        z1 = lo[2] + (hi[2] - lo[2]) * (k + 1) / steps
        pts = co[(co[:, 2] >= z0) & (co[:, 2] < z1)]
        if len(pts) == 0:
            continue
        cells = {}
        for p in pts:
            cells.setdefault((int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell))), []).append(p)
        seen, out = set(), []
        for c in sorted(cells):
            if c in seen:
                continue
            stack, group = [c], []
            seen.add(c)
            while stack:
                q = stack.pop()
                group.extend(cells[q])
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nb = (q[0] + dx, q[1] + dy)
                        if nb in cells and nb not in seen:
                            seen.add(nb)
                            stack.append(nb)
            g = np.array(group)
            if len(g) >= 8:
                out.append((np.round(g.mean(0)[:2], 2).tolist(), np.round(g.min(0)[:2], 2).tolist(), np.round(g.max(0)[:2], 2).tolist(), len(g)))
        print(f'[sculpt_rig] z {z0:+.2f}..{z1:+.2f}: ' + ' | '.join(f'tâm {c} [{a}..{b}] n={n}' for c, a, b, n in out))


# ---------- giai đoạn rig ----------

def stage_rig():
    if not os.path.isfile(LOW_BLEND):
        fail(f'chưa có {LOW_BLEND}: chạy --stage mesh trước')
    bpy.ops.wm.open_mainfile(filepath=LOW_BLEND)
    mesh = bpy.data.objects[ID]
    yaw = float(CFG.get('yaw', 0))
    if yaw:
        mesh.data.transform(Matrix.Rotation(math.radians(yaw), 4, 'Z'))
        mesh.data.update()
    spec = CFG.get('bones')
    if not spec:
        fail('meta.sculpt.bones trống')
    names = [b[0] for b in spec]
    arm_data = bpy.data.armatures.new(f'{ID}_rig')
    arm = bpy.data.objects.new(f'{ID}_rig', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    only(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = {}
    for name, parent, head, tail in spec:
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = Vector(head), Vector(tail)
        ebs[name] = eb
    for name, parent, head, tail in spec:
        if parent:
            if parent not in ebs:
                fail(f'xương {name}: không có cha {parent}')
            ebs[name].parent = ebs[parent]
            ebs[name].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')

    wv = np.array([v.co[:] for v in mesh.data.vertices], float)
    A = np.array([b[2] for b in spec], float)
    B = np.array([b[3] for b in spec], float)
    AB = B - A
    L2 = np.maximum((AB ** 2).sum(1), 1e-9)
    nb = len(spec)
    d = np.empty((len(wv), nb))
    for i in range(nb):
        t = np.clip(((wv - A[i]) @ AB[i]) / L2[i], 0, 1)
        d[:, i] = np.linalg.norm(wv - (A[i] + t[:, None] * AB[i]), axis=1)

    # chuỗi của xương = tên bỏ hậu tố số ("leg_fl_1" → "leg_fl", "neck" → "neck")
    def chain(n):
        head, _, tail = n.rpartition('_')
        return head if tail.isdigit() else n

    chains = [chain(n) for n in names]
    limit = CFG.get('limit') or {}
    allow = np.ones((nb, nb), bool)  # allow[xương gần nhất, xương ứng viên]
    for i in range(nb):
        rule = limit.get(chains[i])
        if rule is None:
            continue
        ok = set(rule) | {chains[i]}
        allow[i] = [c in ok for c in chains]
    nearest = d.argmin(1)
    size = float(max(wv.max(0) - wv.min(0)))
    eps = (0.012 * size) ** 2
    spread = float(CFG.get('spread', 0.6))
    W = np.zeros((len(wv), nb))
    for vi in range(len(wv)):
        row = np.where(allow[nearest[vi]], d[vi], 1e9)
        order = np.argsort(row)[:4]
        lim = row[order[0]] * (1 + spread) + 0.02 * size
        for k in order:
            if row[k] <= lim:
                W[vi, k] = 1.0 / (row[k] ** 2 + eps)
    W /= W.sum(1, keepdims=True)

    # làm mượt theo cạnh (giữ mặt nạ allow của từng đỉnh)
    ed = np.array([e.vertices[:] for e in mesh.data.edges])
    deg = np.bincount(ed.ravel(), minlength=len(wv)).astype(float)[:, None]
    mask = allow[nearest]
    for _ in range(int(CFG.get('smooth', 3))):
        acc = np.zeros_like(W)
        np.add.at(acc, ed[:, 0], W[ed[:, 1]])
        np.add.at(acc, ed[:, 1], W[ed[:, 0]])
        W = 0.5 * W + 0.5 * acc / np.maximum(deg, 1)
        W = np.where(mask, W, 0)
        W /= np.maximum(W.sum(1, keepdims=True), 1e-9)

    # gắn cứng quanh đầu mút
    rigid = CFG.get('rigid') or {}
    held = 0
    for bone, radius in rigid.items():
        i = names.index(bone)
        sel = np.linalg.norm(wv - B[i], axis=1) < radius
        sel &= nearest == i
        W[sel] = 0
        W[sel, i] = 1
        held += int(sel.sum())

    # tối đa 4 xương mỗi đỉnh
    idx = np.argsort(-W, axis=1)[:, :4]
    groups = [mesh.vertex_groups.new(name=n) for n in names]
    for vi in range(len(wv)):
        ws = W[vi, idx[vi]]
        ws = np.where(ws > 0.01, ws, 0)
        s = ws.sum()
        if s <= 0:
            groups[nearest[vi]].add([vi], 1.0, 'REPLACE')
            continue
        for k, w in zip(idx[vi], ws / s):
            if w > 0:
                groups[k].add([vi], float(w), 'REPLACE')
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mesh.parent = arm
    mesh.matrix_parent_inverse = arm.matrix_world.inverted()

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=False,
                              export_extras=True, export_image_format='AUTO', export_jpeg_quality=92, use_selection=False)
    used = (W > 0.01).sum(0)
    print(f'[sculpt_rig] {ID}: {nb} xương, {len(wv)} đỉnh, {held} đỉnh gắn cứng → {OUT}')
    print('[sculpt_rig] đỉnh theo xương: ' + ', '.join(f'{n}={int(u)}' for n, u in zip(names, used)))
    if (used == 0).any():
        print('[sculpt_rig] cảnh báo: xương không có đỉnh nào: ' + ', '.join(n for n, u in zip(names, used) if u == 0))


if STAGE in ('mesh', 'all'):
    stage_mesh()
if STAGE in ('rig', 'all'):
    stage_rig()
