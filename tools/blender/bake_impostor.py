"""Bake impostor (billboard) cho cây xa: render GLB thô (assets/build/raw/<id>.glb, gốc ở đáy, mặt trước +Z glTF) ở
hai góc nhìn trực giao vuông góc nhau (từ +Z và từ +X), nền trong suốt, màu thuần (không đèn: engine tự chiếu sáng),
ghép ngang thành một ảnh PNG `2S x S`. Chạy qua tools/asset-pipeline/src/impostor.ts (pnpm assets:impostor).

blender --background --python bake_impostor.py -- <in.glb> <out.png> [--size 256]
In ra một dòng `IMPOSTOR {json}` gồm cạnh khung vuông V (m) mà mỗi góc nhìn phủ, để client dựng tấm V x V.
"""
import json
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv[0], argv[1]
size = int(argv[argv.index('--size') + 1]) if '--size' in argv else 256

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
# Blender Z-up: glTF +Y -> +Z, glTF +Z -> -Y.
ext_x, ext_y, height = hi.x - lo.x, hi.y - lo.y, hi.z - lo.z
cx, cy = (hi.x + lo.x) / 2, (hi.y + lo.y) / 2
frame = max(max(ext_x, ext_y) * 1.04, height * 1.02)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.film_transparent = True
scene.render.resolution_x = size
scene.render.resolution_y = size
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
sh = scene.display.shading
sh.light = 'FLAT'
sh.color_type = 'TEXTURE'
scene.view_settings.view_transform = 'Standard'
scene.display.render_aa = '8'

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = frame
cam_data.clip_start = 0.1
cam_data.clip_end = 1000
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

import os
import tempfile
tmp = tempfile.mkdtemp()
paths = []
# view 0: từ glTF +Z (Blender -Y) nhìn vào; view 1: từ glTF +X (Blender +X).
views = [
    ((cx, cy - 200, height / 2), (math.radians(90), 0, 0)),
    ((cx + 200, cy, height / 2), (math.radians(90), 0, math.radians(90))),
]
for i, (loc, rot) in enumerate(views):
    cam.location = loc
    cam.rotation_euler = rot
    p = os.path.join(tmp, f'v{i}.png')
    scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    paths.append(p)

# Ghép ngang bằng pixel của Blender.
imgs = [bpy.data.images.load(p) for p in paths]
out = bpy.data.images.new('atlas', width=size * 2, height=size, alpha=True)
px = [list(i.pixels) for i in imgs]
row = size * 4
atlas = [0.0] * (size * 2 * size * 4)
for y in range(size):
    for k in range(2):
        atlas[y * size * 2 * 4 + k * row:y * size * 2 * 4 + k * row + row] = px[k][y * row:(y + 1) * row]
out.pixels = atlas
out.filepath_raw = dst
out.file_format = 'PNG'
out.save()
print('IMPOSTOR ' + json.dumps({'frame': round(frame, 3), 'height': round(height, 3), 'size': size}))
