# Chuẩn bị skin toàn thân từ một "bức tượng" nguồn ngoài (lưới hàng triệu tam giác, không xương, vũ khí dính liền tay):
# ra một GLB thấp tam giác, texture nướng lại, có bộ xương tên Mixamo dựng theo DÁNG CỦA CHÍNH MODEL và trọng số tự động.
# GLB đó là "ma-nơ-canh có xương" để `retarget_set.py` (mode rig) đặt lại tư thế nghỉ theo thân nền nam/nữ như mọi áo bộ.
#
# Chạy tay một lần cho mỗi skin (nặng: vài phút, nướng bằng Cycles), kết quả để ở kho nguồn ngoài repo:
#   blender --background --factory-startup --python tools/blender/skin_prep.py -- \
#       tools/blender/skins/<tên>.json <thư mục dtl-asset-source> [--preview <thư mục ảnh>] [--stage cut|low|bake|rig]
# Đọc `source` (tương đối kho nguồn), ghi `out` (tương đối kho nguồn). Mọi tọa độ trong file cấu hình là hệ Blender của model
# nguồn sau khi nhập (Z lên, mặt trước -Y, bên trái nhân vật +X), đơn vị của chính model (chưa đổi ra mét).
#
# Các bước:
#   1. Nhập, gộp mọi mảnh, hàn đỉnh trùng (model thường bị cắt thành nhiều mảnh theo thứ tự lưới, không theo bộ phận).
#   2. `cut`: bỏ vũ khí dính liền. `bands` = các hộp mỏng cắt đứt chỗ nối (trên/dưới nắm tay); `boxes` = vùng chắc chắn chỉ có
#      vũ khí (xóa thẳng); sau đó mảnh liên thông nào có tâm nằm trong `islands` cũng bị xóa. Lỗ hở được vá.
#   3. Bản thấp: Decimate (collapse) về `triangles`, UV mới (Smart UV Project).
#   4. Nướng từ bản cao sang bản thấp: màu (EMIT của texture gốc, không dính ánh sáng) và normal tiếp tuyến.
#   5. Xương: khớp trong `joints` (đo từ ảnh chiếu thẳng), cây xương như Mixamo, tên `mixamorig:<Tên>`.
#   6. Trọng số: Automatic Weights của Blender (bone heat); lỗi thì lùi về trọng số theo khoảng cách tới đoạn xương.
#      Sau đó `zones` ép vùng không có xương riêng (đuôi, tóc, sừng) theo xương chỉ định, có dải chuyển mềm.
#   7. Xuất GLB (lưới + xương + 2 texture) và, nếu có --preview, ảnh chiếu thẳng trước/cạnh của bản cao đã cắt và bản thấp.

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
CFG_PATH, SRC_ROOT = argv[0], argv[1]
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
STAGE = argv[argv.index('--stage') + 1] if '--stage' in argv else 'rig'
CFG = json.load(open(CFG_PATH, encoding='utf-8'))
SRC = os.path.join(SRC_ROOT, CFG['source'])
OUT = os.path.join(SRC_ROOT, CFG['out'])
REPORT = {}


def log(msg):
    print(f'[skin_prep] {msg}', flush=True)


def inbox(p, b):
    lo, hi = b.get('min', [-1e9] * 3), b.get('max', [1e9] * 3)
    return lo[0] <= p[0] <= hi[0] and lo[1] <= p[1] <= hi[1] and lo[2] <= p[2] <= hi[2]


def only(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------- 1. nhập ----------
# --cache <thư mục>: lưu/đọc lại bản cao đã cắt (.blend) để thử các bước sau không phải nhập + cắt lại (2–3 phút).
CACHE = os.path.join(argv[argv.index('--cache') + 1], CFG['id'] + '_cut.blend') if '--cache' in argv else None
CACHED = bool(CACHE and os.path.isfile(CACHE) and os.path.getmtime(CACHE) > os.path.getmtime(CFG_PATH))
bpy.ops.wm.read_factory_settings(use_empty=True)
if CACHED:
    bpy.ops.wm.open_mainfile(filepath=CACHE)
    high = bpy.data.objects['high']
    log(f'dùng bản cắt đã lưu {CACHE}')
def import_high():
    """Nhập GLB nguồn, gộp mọi mảnh thành một lưới `high`, hàn đỉnh trùng."""
    bpy.ops.import_scene.gltf(filepath=SRC)
    parts = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    high = bpy.context.view_layer.objects.active
    high.name = 'high'
    # Bỏ quan hệ cha (nút gốc Sketchfab có xoay/scale) rồi áp transform để tọa độ đỉnh = tọa độ thế giới.
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.data.objects if o.type != 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode='OBJECT')
    REPORT['sourceTriangles'] = tri_count(high)
    bb = [high.matrix_world @ Vector(c) for c in high.bound_box]
    REPORT['bbox'] = [[round(min(v[i] for v in bb), 4) for i in range(3)], [round(max(v[i] for v in bb), 4) for i in range(3)]]
    log(f'nguồn: {REPORT["sourceTriangles"]} tam giác, {len(high.data.vertices)} đỉnh sau khi hàn')
    return high


# ---------- 2. cắt vũ khí ----------
cut = CFG.get('cut') or {}


def cut_weapon(high):
    """Bỏ vũ khí dính liền theo `cut` của cấu hình, vá lỗ."""
    if not cut:
        return
    bm = bmesh.new()
    bm.from_mesh(high.data)
    doomed = []
    for f in bm.faces:
        c = f.calc_center_median()
        if any(inbox(c, b) for b in cut.get('bands', [])) or any(inbox(c, b) for b in cut.get('boxes', [])):
            doomed.append(f)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.verts.ensure_lookup_table()
    seen = set()
    comps = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            a = stack.pop()
            comp.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen:
                    seen.add(b.index)
                    stack.append(b)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    kill, removed = [], []
    for comp in comps[1:]:
        ctr = sum((v.co for v in comp), Vector()) / len(comp)
        # Mảnh vụn nhỏ sinh ra do cắt cũng bỏ.
        if any(inbox(ctr, b) for b in cut.get('islands', [])) or len(comp) < cut.get('minIsland', 400):
            kill.extend(comp)
            removed.append(len(comp))
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    # `cut.fill: false` khi vũ khí là mảnh rời (không cần vá) và model có mép hở thật (áo choàng rách) không được vá.
    holes = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0) if cut.get('fill', True) else {'faces': []}
    bmesh.ops.triangulate(bm, faces=holes['faces'])
    bm.to_mesh(high.data)
    bm.free()
    REPORT['cut'] = {'facesDeleted': len(doomed), 'islandsDeleted': len(removed), 'islandVerts': sum(removed), 'holeFaces': len(holes['faces']), 'islandsKept': len(comps) - len(removed)}
    log(f'cắt vũ khí: {REPORT["cut"]}')


if not CACHED:
    high = import_high()
    cut_weapon(high)
    if CACHE:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=CACHE)


def render_views(tag, obj, textured=True):
    """Ảnh chiếu thẳng trước/cạnh phải/sau, 600 px = 1 đơn vị, tâm ở gốc: dùng để đo khớp và duyệt bằng mắt."""
    if not PREVIEW:
        return
    os.makedirs(PREVIEW, exist_ok=True)
    scene = bpy.context.scene
    hidden = [o for o in bpy.data.objects if o.type == 'MESH' and o is not obj]
    for o in hidden:
        o.hide_render = True
    obj.hide_render = False
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    view = CFG.get('view') or {}
    cam_data.ortho_scale = float(view.get('scale', 2.0))  # `view.scale`/`view.center`: model có đơn vị khác Varkessa
    ctr = view.get('center', [0, 0, 0])
    cam_data.clip_end = 50
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE' if textured else 'MATERIAL'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = scene.render.resolution_y = 1200
    if not scene.world:
        scene.world = bpy.data.worlds.new('w')
    scene.world.color = (0.3, 0.32, 0.35)
    for view, loc, rot in (('truoc', (0, -10, 0), (90, 0, 0)), ('canh', (-10, 0, 0), (90, 0, -90)), ('sau', (0, 10, 0), (90, 0, 180))):
        cam.location = (loc[0] if loc[0] else ctr[0], loc[1] if loc[1] else ctr[1], ctr[2]) if view else loc
        cam.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.render.filepath = os.path.join(PREVIEW, f'{tag}_{view}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    for o in hidden:
        o.hide_render = False


render_views('cao', high)
if STAGE == 'cut':
    log(json.dumps(REPORT, ensure_ascii=False))
    sys.exit(0)

# ---------- 3. bản thấp ----------
only(high)
bpy.ops.object.duplicate()
low = bpy.context.view_layer.objects.active
low.name = 'low'
mod = low.modifiers.new('dec', 'DECIMATE')
mod.ratio = CFG['triangles'] / tri_count(low)
bpy.ops.object.modifier_apply(modifier='dec')
# UV mới: UV gốc là atlas của lưới triệu tam giác, giảm lưới xong đảo UV rách nát. Đổi lớp UV ở object mode (ở edit mode dữ liệu lưới chưa đồng bộ).
while low.data.uv_layers:
    low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name='UVMap')
# Dọn: bỏ đỉnh rời, mặt suy biến; không hàn thêm (giữ chi tiết mảnh như sừng, gai).
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.dissolve_degenerate(threshold=1e-6)
bpy.ops.mesh.delete_loose()
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.shade_smooth()
REPORT['triangles'] = tri_count(low)
log(f'bản thấp: {REPORT["triangles"]} tam giác')
if STAGE == 'low':
    render_views('thap_chua_nuong', low, textured=False)
    log(json.dumps(REPORT, ensure_ascii=False))
    sys.exit(0)

# ---------- 4. nướng texture ----------
SIZE = int(CFG.get('bake', {}).get('size', 2048))
src_mat = high.data.materials[0]
src_tree = src_mat.node_tree
src_bsdf = next(n for n in src_tree.nodes if n.type == 'BSDF_PRINCIPLED')
src_out = next(n for n in src_tree.nodes if n.type == 'OUTPUT_MATERIAL')
color_link = src_bsdf.inputs['Base Color'].links
if not color_link:
    raise SystemExit('[skin_prep] LỖI: vật liệu nguồn không có texture màu')
color_socket = color_link[0].from_socket

mat = bpy.data.materials.new(CFG['id'] + '_mat')
mat.use_nodes = True
tree = mat.node_tree
bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
img_color = bpy.data.images.new(CFG['id'] + '_color', SIZE, SIZE, alpha=False)
img_normal = bpy.data.images.new(CFG['id'] + '_normal', SIZE, SIZE, alpha=False)
img_normal.colorspace_settings.name = 'Non-Color'
tex_color = tree.nodes.new('ShaderNodeTexImage')
tex_color.image = img_color
tex_normal = tree.nodes.new('ShaderNodeTexImage')
tex_normal.image = img_normal
low.data.materials.clear()
low.data.materials.append(mat)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = float(CFG.get('bake', {}).get('cage', 0.012))
scene.render.bake.max_ray_distance = float(CFG.get('bake', {}).get('ray', 0.03))
scene.render.bake.margin = 8
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low

# Màu: nối thẳng texture gốc vào Emission để nướng EMIT (không ánh sáng, không bóng, 1 mẫu là đủ).
emit = src_tree.nodes.new('ShaderNodeEmission')
src_tree.links.new(color_socket, emit.inputs['Color'])
src_tree.links.new(emit.outputs['Emission'], src_out.inputs['Surface'])
tree.nodes.active = tex_color
log('nướng màu…')
bpy.ops.object.bake(type='EMIT')
# Normal: trả vật liệu gốc (có normal map của nguồn nếu có) rồi nướng normal tiếp tuyến của bản cao lên bản thấp.
src_tree.links.new(src_bsdf.outputs['BSDF'], src_out.inputs['Surface'])
tree.nodes.active = tex_normal
log('nướng normal…')
bpy.ops.object.bake(type='NORMAL')

tree.links.new(tex_color.outputs['Color'], bsdf.inputs['Base Color'])
nm = tree.nodes.new('ShaderNodeNormalMap')
tree.links.new(tex_normal.outputs['Color'], nm.inputs['Color'])
tree.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
# Game không có envMap: kim loại ra đen. Vật liệu không kim loại, nhám vừa (cùng lý do với kiếm, ext_sword.py).
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = float(CFG.get('roughness', 0.65))
img_color.pack()
img_normal.pack()
tree.nodes.active = tex_color  # Workbench hiển thị ảnh của nút đang chọn
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    for img, name in ((img_color, 'texture_mau.png'), (img_normal, 'texture_normal.png')):
        img.save_render(os.path.join(PREVIEW, name))
render_views('thap', low)
if STAGE == 'bake':
    log(json.dumps(REPORT, ensure_ascii=False))
    sys.exit(0)

# ---------- 5. xương ----------
J = {k: Vector(v) for k, v in CFG['joints'].items()}
TREE = [('Hips', None, 'Spine'), ('Spine', 'Hips', 'Spine1'), ('Spine1', 'Spine', 'Spine2'), ('Spine2', 'Spine1', 'Neck'), ('Neck', 'Spine2', 'Head'), ('Head', 'Neck', 'HeadTop')]
for S in ('Left', 'Right'):
    TREE += [
        (f'{S}Shoulder', 'Spine2', f'{S}Arm'), (f'{S}Arm', f'{S}Shoulder', f'{S}ForeArm'), (f'{S}ForeArm', f'{S}Arm', f'{S}Hand'), (f'{S}Hand', f'{S}ForeArm', f'{S}HandEnd'),
        (f'{S}UpLeg', 'Hips', f'{S}Leg'), (f'{S}Leg', f'{S}UpLeg', f'{S}Foot'), (f'{S}Foot', f'{S}Leg', f'{S}ToeBase'), (f'{S}ToeBase', f'{S}Foot', f'{S}ToeEnd'),
    ]
missing = [n for name, _, tip in TREE for n in (name, tip) if n not in J and not n.endswith('Shoulder')]
if missing:
    raise SystemExit(f'[skin_prep] LỖI: thiếu khớp {sorted(set(missing))}')
# Xương vai chạy từ cạnh cột sống (1/4 đường Spine2 → khớp vai) tới khớp vai.
HEAD = {name: (J['Spine2'].lerp(J[f'{name[:-8]}Arm'], 0.25) if name.endswith('Shoulder') else J[name]) for name, _, _ in TREE}
PREFIX = 'mixamorig:'
arm_data = bpy.data.armatures.new(CFG['id'] + '_rig')
arm = bpy.data.objects.new(CFG['id'] + '_rig', arm_data)
scene.collection.objects.link(arm)
only(arm)
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for name, parent, tip in TREE:
    eb = arm_data.edit_bones.new(PREFIX + name)
    eb.head, eb.tail = HEAD[name], J[tip]
    ebs[name] = eb
for name, parent, _ in TREE:
    if parent:
        ebs[name].parent = ebs[parent]
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 6. trọng số ----------
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
names = [PREFIX + n for n, _, _ in TREE]
unweighted = sum(1 for v in low.data.vertices if not any(g.weight > 1e-4 for g in v.groups))
REPORT['weights'] = 'bone heat'
if unweighted > len(low.data.vertices) * 0.02:
    # Bone heat không giải được (lưới nhiều mảnh rời/không kín): trọng số ∝ 1/d² tới 4 đoạn xương gần nhất.
    REPORT['weights'] = f'khoảng cách (bone heat bỏ {unweighted} đỉnh)'
    P = np.array([v.co[:] for v in low.data.vertices])
    A = np.array([HEAD[n][:] for n, _, _ in TREE])
    B = np.array([J[t][:] for _, _, t in TREE])
    AB = B - A
    t = np.clip(np.einsum('vbk,bk->vb', P[:, None, :] - A[None], AB) / np.maximum((AB * AB).sum(1), 1e-9), 0, 1)
    D = np.linalg.norm(P[:, None, :] - (A[None] + t[..., None] * AB[None]), axis=2)
    W = 1.0 / (D * D + 1e-5)
    W[W < np.sort(W, axis=1)[:, -4][:, None]] = 0
    W /= W.sum(1, keepdims=True)
    for g in list(low.vertex_groups):
        low.vertex_groups.remove(g)
    groups = [low.vertex_groups.new(name=n) for n in names]
    for vi in range(len(P)):
        for bi in np.nonzero(W[vi])[0]:
            groups[bi].add([vi], float(W[vi, bi]), 'REPLACE')
log(f'trọng số: {REPORT["weights"]}')

# Trọng số lạc: tượng đứng buông tay nên bàn tay chạm (dính liền) hông/đuôi, bone heat lan theo bề mặt sang cả phần đó.
# Khi dang tay ra tư thế chữ T phần "lạc" bị kéo theo thành màng. Hai bước:
#   a. đỉnh cách đoạn xương tay xa hơn `stray[<loại xương>]` thì bỏ ảnh hưởng của xương đó; mất hết thì gán xương không-phải-tay gần nhất;
#   b. xóa mặt bắc cầu: có đỉnh trội theo cẳng tay/bàn tay và đỉnh trội theo hông/chân.
STRAY = {k: v for k, v in (CFG.get('stray') or {}).items() if not k.startswith('$')}
if STRAY:
    me = low.data
    P = np.array([v.co[:] for v in me.vertices])
    A = np.array([HEAD[n][:] for n, _, _ in TREE])
    B = np.array([J[t][:] for _, _, t in TREE])
    AB = B - A
    tt = np.clip(np.einsum('vbk,bk->vb', P[:, None, :] - A[None], AB) / np.maximum((AB * AB).sum(1), 1e-9), 0, 1)
    D = np.linalg.norm(P[:, None, :] - (A[None] + tt[..., None] * AB[None]), axis=2)  # đỉnh × xương
    kind = [n.replace('Left', '').replace('Right', '') for n, _, _ in TREE]
    limit = np.array([STRAY.get(k, 1e9) for k in kind])
    is_arm = np.array([k in ('Shoulder', 'Arm', 'ForeArm', 'Hand') for k in kind])
    gidx = {low.vertex_groups[PREFIX + n].index: i for i, (n, _, _) in enumerate(TREE)}
    groups = [low.vertex_groups[PREFIX + n] for n, _, _ in TREE]
    fixed = 0
    for v in me.vertices:
        drop = [g.group for g in v.groups if g.group in gidx and D[v.index, gidx[g.group]] > limit[gidx[g.group]]]
        if not drop:
            continue
        kept = sum(g.weight for g in v.groups if g.group not in drop)
        for gi in drop:
            groups[gidx[gi]].remove([v.index])
        if kept < 0.05:
            d = np.where(is_arm, 1e9, D[v.index])
            groups[int(np.argmin(d))].add([v.index], 1.0, 'REPLACE')
        fixed += 1
    dom = np.full(len(me.vertices), -1)
    for v in me.vertices:
        best = max(((g.weight, gidx[g.group]) for g in v.groups if g.group in gidx), default=(0, -1))
        dom[v.index] = best[1]
    fore = np.array([k in ('ForeArm', 'Hand') for k in kind])
    lower = np.array([k in ('Hips', 'UpLeg', 'Leg', 'Foot', 'ToeBase') for k in kind])
    bm = bmesh.new()
    bm.from_mesh(me)
    bridge = [f for f in bm.faces if any(dom[v.index] >= 0 and fore[dom[v.index]] for v in f.verts) and any(dom[v.index] >= 0 and lower[dom[v.index]] for v in f.verts)]
    bmesh.ops.delete(bm, geom=bridge, context='FACES')
    bm.to_mesh(me)
    bm.free()
    REPORT['stray'] = {'vertsFixed': fixed, 'bridgeFaces': len(bridge)}
    log(f'trọng số lạc: {REPORT["stray"]}')

# Vùng ép theo xương: đuôi/tóc/sừng không có xương riêng. `w` chạy 0→1 trong dải `blend` tính từ mép hộp theo trục `axis`.
vg = {g.name: g for g in low.vertex_groups}
zone_stats = {}
for z in CFG.get('zones', []):
    bones = z['bones']  # [{bone, at:[z0,z1]}]: tỉ lệ theo chiều cao, hoặc một xương duy nhất
    n = 0
    for v in low.data.vertices:
        p = v.co
        if not inbox(p, z['box']) or any(inbox(p, ex) for ex in z.get('except', [])):
            continue
        k = 1.0
        if z.get('blend'):
            ax, edge, width = z['blend']['axis'], z['blend']['from'], z['blend']['width']
            k = min(1.0, max(0.0, (p[ax] - edge) / width))
        if k <= 0:
            continue
        target = {}
        if len(bones) == 1:
            target[bones[0]['bone']] = 1.0
        else:
            lo_b, hi_b = bones
            t = min(1.0, max(0.0, (p[2] - lo_b['z']) / (hi_b['z'] - lo_b['z'])))
            t = t * t * (3 - 2 * t)
            target[lo_b['bone']] = 1 - t
            target[hi_b['bone']] = t
        old = {low.vertex_groups[g.group].name: g.weight for g in v.groups}
        for name in set(old) | {PREFIX + b for b in target}:
            w = old.get(name, 0.0) * (1 - k) + target.get(name[len(PREFIX):], 0.0) * k
            if w > 1e-4:
                vg[name].add([v.index], w, 'REPLACE')
            elif name in old:
                vg[name].remove([v.index])
        n += 1
    zone_stats[z['name']] = n
REPORT['zones'] = zone_stats
only(low)
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)

# ---------- 7. xuất ----------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
for o in list(bpy.data.objects):
    if o not in (low, arm):
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=False, export_image_format='AUTO', use_selection=False)
REPORT['out'] = OUT
REPORT['bytes'] = os.path.getsize(OUT)
log(json.dumps(REPORT, ensure_ascii=False))
