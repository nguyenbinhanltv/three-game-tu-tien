# Chuẩn hóa GLB tải từ Tripo thành GLB thô của pipeline (assets/build/raw/<id>.glb). Việc M2-2.
#
# Chạy (không mở giao diện; run.mjs gọi tự động cho mọi meta.json có khối "import"):
#   blender --background --factory-startup --python tools/blender/import_tripo.py -- \
#       <vào.glb> <ra.glb> --meta assets/source/<loại>/<id>/meta.json --budgets assets/budgets.json
#
# Tripo trả model cao 1 m, gốc ở tâm khối, texture 4096², hướng tùy ảnh concept. Script này:
#   1. Hướng: mặt trước nhìn về +Z của glTF (quy ước client: yaw = atan2(vx, vz)).
#      Có armature và tìm thấy cặp xương đùi trái/phải → xoay quanh trục đứng để vector đùi phải → đùi trái
#      trùng +X (bên trái nhân vật). Sau đó cộng thêm `import.yaw` (độ, quanh +Y, ngược chiều kim đồng hồ nhìn từ trên).
#   2. Tỉ lệ: scale đều để một cạnh hộp bao (tư thế nghỉ) bằng `import.size` (mét): height | width | depth | longest.
#   3. Gốc ở đáy: tâm hộp bao theo X/Z về 0, đáy về Y = 0.
#   4. Áp transform cho mọi object (mesh, armature, empty); khóa location của xương trong clip được scale theo.
#   5. Đặt tên theo asset id: object/mesh `<id>` hoặc `<id>_<k>`, material `<id>_mat[_k]`, ảnh `<id>_<vai trò>`, armature `<id>_rig`
#      (giữ nguyên nếu đã là rig_human_base).
#   6. Socket: Empty `socket_*` theo `import.sockets` (tọa độ glTF sau chuẩn hóa, mét; gắn vào xương nếu có `bone`),
#      custom property socket=1 ra extras.
#   7. Hạ texture về ngân sách lớp (assets/budgets.json): map màu theo `texture.color`, map dữ liệu theo `texture.data`.
#   8. Tùy chọn `import.post`: chạy một script bpy (đường dẫn tính từ gốc repo) sau khi chuẩn hóa, trước khi xuất, ví dụ
#      đổi tên xương và thêm clip thủ tục (tools/blender/anim_quadruped.py). Script nhận biến toàn cục ASSET_ID, META,
#      ARMATURES, MESHES, REPO, SOURCE_ROOT (thư mục nguồn asset), hàm fail, ascii_name, fcurves_of; mọi tọa độ lúc này đã là hệ chuẩn (mét, gốc ở đáy, mặt trước +Z glTF).
#
# Không giảm tam giác ở đây: optimize.ts hạ LOD0 về trần (budget.faceLimit trong meta, không quá ngân sách lớp) bằng
# meshoptimizer, giữ JOINTS/WEIGHTS. Cùng đầu vào cho ra cùng file (không có ngẫu nhiên, thứ tự theo tên).

import json
import math
import os
import runpy
import re
import sys
import unicodedata
from contextlib import contextmanager

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(flag):
    if flag not in argv:
        raise SystemExit(f'[import_tripo] thiếu {flag}')
    return argv[argv.index(flag) + 1]


if len(argv) < 2:
    raise SystemExit('[import_tripo] cách dùng: <vào.glb> <ra.glb> --meta <meta.json> --budgets <budgets.json>')
SRC, OUT = argv[0], argv[1]
META = json.load(open(arg('--meta'), encoding='utf-8'))
BUDGETS = json.load(open(arg('--budgets'), encoding='utf-8'))

ASSET_ID = META['id']
IMPORT = META.get('import') or {}
SOCKET_NAME = re.compile(r'^socket_[a-z0-9]+(_[a-z0-9]+)*$')
COLOR_INPUTS = {'Base Color', 'Emission Color'}


def fail(msg):
    raise SystemExit(f'[import_tripo] LỖI {ASSET_ID}: {msg}')


def budget_class():
    cls = META.get('budgetClass')
    if cls in BUDGETS['classes']:
        return BUDGETS['classes'][cls]
    for prefix, name in BUDGETS['prefixes'].items():
        if ASSET_ID.startswith(prefix):
            return BUDGETS['classes'][name]
    fail('không xác định được lớp ngân sách')


def ascii_name(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii').lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_') or 'x'


# ---------- nhập ----------

def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions):
        for block in list(coll):
            if block.users == 0 or block.name in ('Render Result', 'Viewer Node'):
                try:
                    coll.remove(block)
                except Exception:
                    pass


def cleanup_import():
    """Importer glTF tạo hình hiển thị xương (Icosphere trong collection glTF_not_exported): bỏ đi để không lẫn vào phép đo."""
    for arm in (o for o in bpy.data.objects if o.type == 'ARMATURE'):
        for pb in arm.pose.bones:
            pb.custom_shape = None
    coll = bpy.data.collections.get('glTF_not_exported')
    if coll:
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(coll)


def by_name(items):
    return sorted(items, key=lambda o: o.name)


def mesh_objects():
    return by_name(o for o in bpy.data.objects if o.type == 'MESH')


def armatures():
    return by_name(o for o in bpy.data.objects if o.type == 'ARMATURE')


def roots():
    return by_name(o for o in bpy.data.objects if o.parent is None)


# ---------- đo ----------

@contextmanager
def rest_pose():
    """Tạm đưa mọi armature về tư thế nghỉ. Importer glTF gán clip đầu tiên nên khung hiện tại thường khác tư thế nghỉ,
    trong khi exporter ghi xương và con-của-xương theo tư thế nghỉ."""
    saved = [(a, a.data.pose_position) for a in armatures()]
    for a, _ in saved:
        a.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    try:
        yield
    finally:
        for a, pp in saved:
            a.data.pose_position = pp
        bpy.context.view_layer.update()


def bbox_world():
    """Hộp bao mọi đỉnh mesh (đã qua modifier) ở tư thế nghỉ, tọa độ thế giới Blender (Z lên)."""
    with rest_pose():
        return _bbox_world()


def _bbox_world():
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for obj in mesh_objects():
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
        ev.to_mesh_clear()
    if not math.isfinite(lo.x):
        fail('GLB không có đỉnh nào')
    return lo, hi


def triangles():
    return sum(len(p.vertices) - 2 for o in mesh_objects() for p in o.data.polygons)


# ---------- hướng ----------

THIGH = re.compile(r'thigh|upleg|up_leg|upperleg|upper_leg|leg_upper|femur', re.I)


def side(name):
    n = name.lower()
    if 'left' in n or re.search(r'(^|[_.\s-])l($|[_.\s-]|\d)', n):
        return 'L'
    if 'right' in n or re.search(r'(^|[_.\s-])r($|[_.\s-]|\d)', n):
        return 'R'
    return None


def thigh_heads():
    for arm in armatures():
        found = {}
        for bone in sorted(arm.data.bones, key=lambda b: b.name):
            if THIGH.search(bone.name) and side(bone.name) and side(bone.name) not in found:
                found[side(bone.name)] = (bone.name, arm.matrix_world @ bone.head_local)
        if 'L' in found and 'R' in found:
            return found
    return None


def orientation():
    """Góc xoay quanh Z (Blender) đưa bên trái nhân vật về +X, nghĩa là mặt trước về -Y Blender = +Z glTF."""
    mode = IMPORT.get('orient', 'auto')
    if mode == 'none':
        return 0.0, 'none'
    heads = thigh_heads()
    if not heads:
        if mode == 'thigh':
            fail('orient = "thigh" nhưng không tìm thấy cặp xương đùi trái/phải')
        return 0.0, 'none'
    lat = heads['L'][1] - heads['R'][1]
    if math.hypot(lat.x, lat.y) < 1e-6:
        fail('hai xương đùi trùng nhau theo phương ngang, không suy được hướng')
    return -math.atan2(lat.y, lat.x), f'thigh({heads["L"][0]}, {heads["R"][0]})'


# ---------- áp transform ----------

def fcurves_of(action):
    if hasattr(action, 'layers') and len(action.layers):
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    yield from bag.fcurves
    elif hasattr(action, 'fcurves'):
        yield from action.fcurves


def actions_of(obj):
    ad = obj.animation_data
    if not ad:
        return []
    acts = [ad.action] if ad.action else []
    for track in ad.nla_tracks:
        acts += [st.action for st in track.strips if st.action]
    return acts


def scale_bone_location_keys():
    """Location của pose bone tính theo đơn vị armature. Khi áp scale thế giới của armature (gồm scale sẵn có của node
    Tripo lẫn bước chuẩn hóa) vào xương, khóa location phải nhân cùng hệ số để clip giữ đúng quãng dịch chuyển."""
    arms = armatures()
    owner = {}
    for arm in arms:
        for act in actions_of(arm):
            owner.setdefault(act.name, arm)
    n = 0
    for action in by_name(bpy.data.actions):
        arm = owner.get(action.name) or (arms[0] if len(arms) == 1 else None)
        for fc in fcurves_of(action):
            if fc.data_path.startswith('pose.bones[') and fc.data_path.endswith('.location'):
                if arm is None:
                    fail(f'clip {action.name}: không biết thuộc armature nào')
                sc = arm.matrix_world.to_scale()
                if max(sc) - min(sc) > 1e-4 * max(sc):
                    print(f'[import_tripo] CẢNH BÁO {ASSET_ID}: armature {arm.name} scale không đều {tuple(sc)}, lấy trung bình')
                f = sum(sc) / 3
                for k in fc.keyframe_points:
                    k.co.y *= f
                    k.handle_left.y *= f
                    k.handle_right.y *= f
                n += 1
            elif fc.data_path in ('location', 'rotation_euler', 'rotation_quaternion', 'scale'):
                print(f'[import_tripo] CẢNH BÁO {ASSET_ID}: clip {action.name} có khóa transform object ({fc.data_path}), không được chuẩn hóa')
    return n


def apply_all(matrix):
    for obj in roots():
        obj.matrix_world = matrix @ obj.matrix_world
    bpy.context.view_layer.update()


def apply_transforms():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = roots()[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT')


# ---------- tên ----------

def image_roles():
    """Ảnh → tập input của Principled BSDF mà nó đi tới (lần theo link xuôi dòng)."""
    roles = {}
    for mat in by_name(m for m in bpy.data.materials if m.users and m.node_tree):
        links = mat.node_tree.links
        for node in mat.node_tree.nodes:
            if node.type != 'TEX_IMAGE' or not node.image:
                continue
            seen, stack, hit = set(), [node], set()
            while stack:
                n = stack.pop()
                if n.name in seen:
                    continue
                seen.add(n.name)
                for l in links:
                    if l.from_node != n:
                        continue
                    if l.to_node.type == 'BSDF_PRINCIPLED':
                        hit.add(l.to_socket.identifier)
                    else:
                        stack.append(l.to_node)
            roles.setdefault(node.image.name, set()).update(hit)
    return roles


def role_label(inputs):
    if 'Base Color' in inputs:
        return 'color'
    if 'Emission Color' in inputs:
        return 'emissive'
    if 'Normal' in inputs:
        return 'normal'
    if inputs & {'Metallic', 'Roughness'}:
        return 'orm'
    return 'tex'


def rename_all():
    meshes = mesh_objects()
    for i, obj in enumerate(meshes):
        name = ASSET_ID if len(meshes) == 1 else f'{ASSET_ID}_{i:02d}'
        obj.name = name
        obj.data.name = name
    for i, arm in enumerate(armatures()):
        if arm.name != 'rig_human_base':
            arm.name = f'{ASSET_ID}_rig' if i == 0 else f'{ASSET_ID}_rig_{i:02d}'
            arm.data.name = arm.name
    for obj in by_name(o for o in bpy.data.objects if o.type not in ('MESH', 'ARMATURE')):
        if not obj.name.startswith('socket_'):
            obj.name = f'{ASSET_ID}_{ascii_name(obj.name)}'
    mats = by_name(m for m in bpy.data.materials if m.users)
    for i, mat in enumerate(mats):
        mat.name = f'{ASSET_ID}_mat' if len(mats) == 1 else f'{ASSET_ID}_mat_{i:02d}'
    roles = image_roles()
    used = {}
    for img in by_name(i for i in bpy.data.images if i.users and i.name in roles):
        label = role_label(roles[img.name])
        used[label] = used.get(label, 0) + 1
        img.name = f'{ASSET_ID}_{label}' if used[label] == 1 else f'{ASSET_ID}_{label}_{used[label]:02d}'
    for bone_owner in armatures():
        for bone in bone_owner.data.bones:
            clean = ascii_name(bone.name) if not re.fullmatch(r'[A-Za-z0-9_.]+', bone.name) else bone.name
            if clean != bone.name:
                bone.name = clean


# ---------- texture ----------

def downscale_textures(spec):
    out = []
    roles = image_roles()
    for img in by_name(i for i in bpy.data.images if i.name in roles):
        inputs = roles[img.name]
        color = bool(inputs & COLOR_INPUTS)
        data = bool(inputs - COLOR_INPUTS) or not inputs
        limit = max(spec['texture']['color'] if color else 0, spec['texture']['data'] if data else 0)
        if limit <= 0:
            fail(f'lớp ngân sách không cho phép texture nhưng có ảnh {img.name}')
        w, h = img.size
        if max(w, h) > limit:
            f = limit / max(w, h)
            nw, nh = max(1, round(w * f)), max(1, round(h * f))
            img.scale(nw, nh)
            out.append(f'{img.name} {w}x{h}→{nw}x{nh}')
        else:
            out.append(f'{img.name} {w}x{h}')
    return out


# ---------- socket ----------

def gltf_to_blender(p):
    x, y, z = p
    return Vector((x, -z, y))


def add_sockets():
    """Đặt socket theo tọa độ thế giới ở tư thế nghỉ (khớp cách exporter ghi transform của con-của-xương)."""
    with rest_pose():
        return _add_sockets()


def _add_sockets():
    names = []
    for s in IMPORT.get('sockets', []):
        name = s['name']
        if not SOCKET_NAME.match(name):
            fail(f'tên socket "{name}" phải dạng socket_<snake_case>')
        if bpy.data.objects.get(name):
            fail(f'socket "{name}" trùng tên')
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = 'PLAIN_AXES'
        empty.empty_display_size = 0.05
        empty['socket'] = 1
        bpy.context.scene.collection.objects.link(empty)
        world = Matrix.Translation(gltf_to_blender(s.get('position', [0, 0, 0])))
        bone = s.get('bone')
        if bone:
            arm = next((a for a in armatures() if bone in a.data.bones), None)
            if not arm:
                fail(f'socket "{name}": không có xương "{bone}"')
            empty.parent = arm
            empty.parent_type = 'BONE'
            empty.parent_bone = bone
        bpy.context.view_layer.update()
        empty.matrix_world = world
        names.append(name if not bone else f'{name}@{bone}')
    return names


# ---------- bước sau chuẩn hóa ----------

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def source_root():
    """Thư mục DTL_ASSET_SOURCE suy từ đường dẫn GLB nguồn và import.source."""
    rel = os.path.normpath(IMPORT.get('source', ''))
    src = os.path.normpath(os.path.abspath(SRC))
    if rel and src.endswith(rel):
        return src[: -len(rel)].rstrip('\/')
    return os.path.dirname(src)


def run_post():
    rel = IMPORT.get('post')
    if not rel:
        return None
    if not re.fullmatch(r'tools/blender/[a-z0-9_]+\.py', rel):
        fail(f'import.post "{rel}" phải dạng tools/blender/<tên>.py')
    path = os.path.join(REPO, rel)
    if not os.path.isfile(path):
        fail(f'import.post: không có script {rel}')
    result = runpy.run_path(path, init_globals={
        'ASSET_ID': ASSET_ID, 'META': META, 'ARMATURES': armatures(), 'MESHES': mesh_objects(), 'REPO': REPO, 'fail': fail,
        'SOURCE_ROOT': source_root(), 'ascii_name': ascii_name, 'fcurves_of': fcurves_of,
    }, run_name='__import_tripo_post__')
    return result.get('REPORT', rel)


# ---------- chính ----------

def main():
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=SRC)
    cleanup_import()
    if not mesh_objects():
        fail('GLB không có mesh')
    tris = triangles()  # thư viện clip (import.animLib): mesh chỉ để đo/chuẩn hóa, post bỏ mesh trước khi xuất
    spec = budget_class()

    angle, how = orientation()
    yaw = math.radians(float(IMPORT.get('yaw', 0)))
    apply_all(Matrix.Rotation(angle + yaw, 4, 'Z'))

    lo, hi = bbox_world()
    ext = hi - lo
    size = IMPORT.get('size') or {}
    if len(size) != 1:
        fail('import.size cần đúng một khóa: height | width | depth | longest (mét)')
    (axis, meters), = size.items()
    measured = {'height': ext.z, 'width': ext.x, 'depth': ext.y, 'longest': max(ext)}.get(axis)
    if measured is None or meters <= 0 or measured <= 0:
        fail(f'import.size.{axis} không hợp lệ')
    s = meters / measured
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    apply_all(Matrix.Translation(-center * s) @ Matrix.Scale(s, 4))
    keys = scale_bone_location_keys()
    apply_transforms()

    rename_all()
    sockets = add_sockets()
    textures = [] if IMPORT.get('animLib') else downscale_textures(spec)  # thư viện clip bỏ ảnh ở post
    post = run_post()

    lo, hi = bbox_world() if mesh_objects() else (Vector((0, 0, 0)), Vector((0, 0, 0)))
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_extras=True,
        export_image_format='AUTO',
        export_jpeg_quality=90,
        use_selection=False,
    )
    r = lambda v: [round(x, 4) for x in v]
    # Tọa độ in ra theo glTF (Y lên).
    report = {
        'id': ASSET_ID,
        'triangles': tris,
        'orient': how,
        'rotateDeg': round(math.degrees(angle + yaw), 3),
        'scale': round(s, 6),
        'size': {'width': round(hi.x - lo.x, 4), 'height': round(hi.z - lo.z, 4), 'depth': round(hi.y - lo.y, 4)},
        'min': r((lo.x, lo.z, -hi.y)),
        'sockets': sockets,
        'boneLocationCurves': keys,
        'textures': textures,
        'post': post,
    }
    print('[import_tripo] ' + json.dumps(report, ensure_ascii=False))


main()
