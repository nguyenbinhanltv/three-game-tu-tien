# Ảnh duyệt PROP-1 (không commit): mỗi món một ảnh 2×2 bốn góc quay 360° + một ảnh tổng nhóm.
#   blender --background --python tools/blender/prop_tc_preview.py -- <thư mục GLB> <thư mục ra> <nhóm> [kích thước]
# GLB lấy từ assets/build/raw/prop_tc_<tên>[_2].glb (cùng cách dựng của prop_tc.py). Cycles CPU ít mẫu, nền trời lam, mặt đất cỏ.
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import thien_cong_preview as tp  # noqa: E402


def shot(sc, co, ctr, radius, ang, size, tmp, ele=0.45):
    a = math.radians(ang)
    tp.look_at(co, ctr, (ctr.x + math.sin(a) * radius * 1.7, ctr.y - math.cos(a) * radius * 1.7, ctr.z + radius * ele))
    tp.render(sc, tmp)
    img = bpy.data.images.load(tmp)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    bpy.data.images.remove(img)
    return arr


def save(arr, path):
    h, w = arr.shape[:2]
    out = bpy.data.images.new('sheet', w, h, alpha=False)
    out.pixels.foreach_set(arr.ravel())
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)


def main():
    a = sys.argv[sys.argv.index('--') + 1:]
    glbdir, outdir, group = a[0], a[1], a[2]
    size = int(a[3]) if len(a) > 3 else 360
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prop_tc_items.json'), encoding='utf8') as f:
        items = json.load(f)['groups'][group]
    sc, co = tp.setup_scene(size)
    floor = tp.add_floor(10)
    tmp = os.path.join(outdir, '_t.png')
    overview = []
    for it in items:
        for pid in (f"prop_tc_{it['name']}", f"prop_tc_{it['name']}_2"):
            path = os.path.join(glbdir, pid + '.glb')
            if not os.path.exists(path):
                continue
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=path)
            objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
            lo, hi = tp.bounds(objs)
            ctr = (lo + hi) / 2
            radius = max((hi - lo).length * 0.55, 1.2)
            floor.scale = (max(radius, 2) * 0.4, max(radius, 2) * 0.4, 1)
            tiles = [shot(sc, co, ctr, radius, 30 + k * 90, size, tmp) for k in range(4)]
            sheet = np.concatenate([np.concatenate(tiles[2:], axis=1), np.concatenate(tiles[:2], axis=1)], axis=0)
            save(sheet, os.path.join(outdir, pid + '.png'))
            overview.append(tiles[0])
            for o in objs:
                bpy.data.objects.remove(o)
    if os.path.exists(tmp):
        os.remove(tmp)
    cols = 5
    rows = [overview[i:i + cols] for i in range(0, len(overview), cols)]
    blank = np.ones_like(overview[0])
    rows = [np.concatenate(r + [blank] * (cols - len(r)), axis=1) for r in rows]
    save(np.concatenate(rows[::-1], axis=0), os.path.join(outdir, f'_tong_{group}.png'))


main()
