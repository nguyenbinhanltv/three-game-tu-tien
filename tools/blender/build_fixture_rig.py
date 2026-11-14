# Sinh một GLB có xương để test pipeline asset (tools/asset-pipeline), không cần Tripo.
#
# Chạy (không mở giao diện):
#   blender --background --factory-startup --python tools/blender/build_fixture_rig.py -- <out.glb> [--rings 90] [--segments 96] [--texture 1024] [--flat]
#
# Hình: thân tròn xoay cao 1,7m (bụng, cổ, đầu), khoảng 17 nghìn tam giác mặc định, UV trụ, một texture màu.
# Xương: armature "rig_human_base" gồm root → hips → spine → neck → head; trọng số gán theo chiều cao, trộn tuyến tính.
# Animation: clip "breathe" có track SCALE trên xương root (1 → 1,15 → 1) và xoay spine.
# Track scale là thứ làm lộ lỗi quantize mesh có xương (nhân vật co lại), validate.ts phải bắt được.

import math
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    raise SystemExit('Thiếu đường dẫn GLB đầu ra')
OUT = argv[0]


def opt(name, default):
    return int(argv[argv.index(name) + 1]) if name in argv else default


RINGS = opt('--rings', 90)
SEGMENTS = opt('--segments', 96)
TEX = opt('--texture', 1024)
FLAT = '--flat' in argv  # shading phẳng: đỉnh tách theo mặt, thử nấc Permissive của simplify
HEIGHT = 1.7

# Bán kính theo chiều cao (0..1): chân, hông, bụng, ngực, cổ, đầu.
PROFILE = [(0.0, 0.10), (0.45, 0.17), (0.6, 0.2), (0.75, 0.22), (0.82, 0.08), (0.88, 0.11), (0.95, 0.1), (1.0, 0.0)]


def radius(t):
    for (t0, r0), (t1, r1) in zip(PROFILE, PROFILE[1:]):
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            return r0 + (r1 - r0) * (0.5 - 0.5 * math.cos(math.pi * f))
    return 0.0


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def build_mesh():
    verts, faces, uvs = [], [], []
    for i in range(RINGS + 1):
        t = i / RINGS
        r = max(radius(t), 0.002)
        for j in range(SEGMENTS):
            a = 2 * math.pi * j / SEGMENTS
            # Blender: Z lên
            verts.append((r * math.cos(a), r * math.sin(a), t * HEIGHT))
    for i in range(RINGS):
        for j in range(SEGMENTS):
            a = i * SEGMENTS + j
            b = i * SEGMENTS + (j + 1) % SEGMENTS
            c = b + SEGMENTS
            d = a + SEGMENTS
            faces.append((a, b, c, d))
    bottom = len(verts)
    verts.append((0.0, 0.0, 0.0))
    for j in range(SEGMENTS):
        faces.append((bottom, (j + 1) % SEGMENTS, j))
    mesh = bpy.data.meshes.new('chr_fixture_rig')
    mesh.from_pydata(verts, [], faces)
    mesh.polygons.foreach_set('use_smooth', [not FLAT] * len(mesh.polygons))
    mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            u = (math.atan2(v.y, v.x) / (2 * math.pi)) % 1.0
            uv.data[li].uv = (u, v.z / HEIGHT)
    obj = bpy.data.objects.new('chr_fixture_rig', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_material(obj):
    img = bpy.data.images.new('chr_fixture_rig_albedo', TEX, TEX, alpha=False)
    px = [0.0] * (TEX * TEX * 4)
    for y in range(TEX):
        band = (y * 8 // TEX) % 2
        for x in range(TEX):
            k = (y * TEX + x) * 4
            px[k] = 0.55 if band else 0.25
            px[k + 1] = 0.6 if band else 0.35
            px[k + 2] = 0.7 if band else 0.45
            px[k + 3] = 1.0
    img.pixels.foreach_set(px)
    img.pack()
    mat = bpy.data.materials.new('chr_fixture_rig_mat')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs[0], bsdf.inputs[0])
    obj.data.materials.append(mat)


BONES = [('root', 0.0, 0.05), ('hips', 0.05, 0.5), ('spine', 0.5, 0.8), ('neck', 0.8, 0.86), ('head', 0.86, 1.0)]


def build_armature(obj):
    arm = bpy.data.armatures.new('rig_human_base')
    rig = bpy.data.objects.new('rig_human_base', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    prev = None
    for name, t0, t1 in BONES:
        b = arm.edit_bones.new(name)
        b.head = (0, 0, t0 * HEIGHT)
        b.tail = (0, 0, t1 * HEIGHT)
        if prev:
            b.parent = prev
            b.use_connect = True
        prev = b
    bpy.ops.object.mode_set(mode='OBJECT')

    groups = {name: obj.vertex_groups.new(name=name) for name, _, _ in BONES}
    centers = [(name, (t0 + t1) / 2 * HEIGHT) for name, t0, t1 in BONES]
    for v in obj.data.vertices:
        z = v.co.z
        if z <= centers[0][1]:
            groups[centers[0][0]].add([v.index], 1.0, 'REPLACE')
            continue
        if z >= centers[-1][1]:
            groups[centers[-1][0]].add([v.index], 1.0, 'REPLACE')
            continue
        for (n0, z0), (n1, z1) in zip(centers, centers[1:]):
            if z0 <= z <= z1:
                f = (z - z0) / (z1 - z0)
                groups[n0].add([v.index], 1.0 - f, 'REPLACE')
                groups[n1].add([v.index], f, 'REPLACE')
                break
    obj.parent = rig
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    return rig


def build_animation(rig):
    rig.animation_data_create()
    action = bpy.data.actions.new('breathe')
    rig.animation_data.action = action
    pb = rig.pose.bones
    pb['spine'].rotation_mode = 'XYZ'
    for frame, s, rot in [(1, 1.0, 0.0), (13, 1.15, 0.35), (25, 1.0, 0.0)]:
        pb['root'].scale = (s, s, s)
        pb['root'].keyframe_insert('scale', frame=frame)
        pb['spine'].rotation_euler = (rot, 0.0, 0.0)
        pb['spine'].keyframe_insert('rotation_euler', frame=frame)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 25
    for b in pb:
        b.scale = (1, 1, 1)
        b.rotation_euler = (0, 0, 0)


def main():
    reset_scene()
    obj = build_mesh()
    build_material(obj)
    rig = build_armature(obj)
    build_animation(rig)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        export_yup=True,
        export_skins=True,
        export_animations=True,
        export_image_format='AUTO',
    )
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    print(f'[build_fixture_rig] {OUT}: {tris} tam giác, {len(BONES)} xương, texture {TEX}²')


main()
