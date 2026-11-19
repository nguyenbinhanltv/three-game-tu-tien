# Ảnh xem trước các asset Blender của Thiên Công Khai Vật (không commit; ảnh duyệt PR để ở artifact phiên).
#
#   blender --background --python tools/blender/thien_cong_preview.py -- kit  <kit.glb> <thư mục ra> [kích thước]
#       mỗi mảnh `kit_*` một ảnh 4 góc quay 360° (0°, 90°, 180°, 270°) ghép 2×2: <thư mục ra>/<id>.png
#   blender --background --python tools/blender/thien_cong_preview.py -- sect <arch_sect.glb> <thư mục ra> [kích thước]
#       tông môn nhìn từ 5 góc: <thư mục ra>/sect_<n>.png
#
# Render bằng Cycles (CPU, ít mẫu): chạy được không cần GPU. Nền sáng trung tính, nắng thấp ấm, trời lam nhạt.

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector


def setup_scene(size):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.image_settings.file_format = 'PNG'
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.62, 0.78, 0.92, 1)
    bg.inputs['Strength'].default_value = 1.0
    sc.world = world
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 4.0
    sun.color = (1.0, 0.92, 0.8)
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(52), 0, math.radians(35))
    sc.collection.objects.link(so)
    cam = bpy.data.cameras.new('cam')
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    return sc, co


def look_at(co, target, eye):
    co.location = eye
    d = Vector(target) - Vector(eye)
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def add_floor(radius):
    bpy.ops.mesh.primitive_plane_add(size=radius * 2, location=(0, 0, -0.01))
    f = bpy.context.active_object
    m = bpy.data.materials.new('floor')
    m.use_nodes = True
    next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.5, 0.62, 0.42, 1)
    f.data.materials.append(m)
    return f


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def run_kit(glb, outdir, size):
    os.makedirs(outdir, exist_ok=True)
    sc, co = setup_scene(size)
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('kit_')]
    # glTF nhập: y-up -> Blender z-up đã được xử lý; mỗi mảnh nằm quanh gốc, chồng lên nhau: ẩn hết rồi hiện từng mảnh.
    floor = add_floor(80)
    for o in objs:
        o.hide_render = True
    for o in sorted(objs, key=lambda o: o.name):
        o.hide_render = False
        lo, hi = bounds([o])
        ctr = (lo + hi) / 2
        radius = max((hi - lo).length * 0.62, 2.0)
        floor.scale = (max(radius, 4) / 80 * 3, max(radius, 4) / 80 * 3, 1)
        tiles = []
        for k in range(4):
            a = math.radians(35 + k * 90)
            eye = (ctr.x + math.sin(a) * radius * 1.55, ctr.y - math.cos(a) * radius * 1.55, ctr.z + radius * 0.55)
            look_at(co, ctr, eye)
            tmp = os.path.join(outdir, '_t.png')
            render(sc, tmp)
            img = bpy.data.images.load(tmp)
            arr = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
            bpy.data.images.remove(img)
            tiles.append(arr)
        top = np.concatenate(tiles[:2], axis=1)
        bot = np.concatenate(tiles[2:], axis=1)
        sheet = np.concatenate([bot, top], axis=0)  # Blender đảo trục dọc: hàng dưới của mảng là hàng trên của ảnh
        out = bpy.data.images.new('sheet', size * 2, size * 2, alpha=False)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(outdir, o.name.replace('kit_', '') + '.png')
        out.file_format = 'PNG'
        out.save()
        bpy.data.images.remove(out)
        o.hide_render = True
    tmp = os.path.join(outdir, '_t.png')
    if os.path.exists(tmp):
        os.remove(tmp)


def run_sect(glb, outdir, size):
    os.makedirs(outdir, exist_ok=True)
    sc, co = setup_scene(size)
    sc.cycles.samples = 48
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lo, hi = bounds(objs)
    floor = add_floor(300)
    # Blender: x = đông, y = bắc (game z = nam => y = -z). Tông môn: chính điện ở y ≈ +44, cổng ở y ≈ -80.
    views = [
        ('cong', (0, -150, 26), (0, 0, 9)),
        ('cheo_tay', (-110, -70, 40), (0, 0, 8)),
        ('cheo_dong', (110, -60, 34), (0, 10, 8)),
        ('chinh_dien', (0, -40, 7), (0, 44, 8)),
        ('tren_cao', (0, -120, 120), (0, 10, 0)),
        ('sau', (60, 140, 40), (0, 0, 10)),
    ]
    for name, eye, tgt in views:
        look_at(co, tgt, eye)
        co.data.lens = 28
        render(sc, os.path.join(outdir, f'sect_{name}.png'))


if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:]
    mode, glb, out = a[0], a[1], a[2]
    size = int(a[3]) if len(a) > 3 else 360
    (run_kit if mode == 'kit' else run_sect)(glb, out, size)
