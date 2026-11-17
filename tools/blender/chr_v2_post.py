# Bước `import.post` của chr_v2_*: chạy anim_biped_extra.py (kiếm lưng...) rồi ghi extras `dtl.springs` của các xương lò xo tóc
# `dtl_o_hair_*` (tạo ở chr_v2_head.py, trọng số đã gán): tail lấy từ đuôi xương sau khi import_tripo chuẩn hóa mét/hướng (hệ glTF).
import os
import runpy

import bpy

_p = os.path.join(REPO, 'tools/blender/anim_biped_extra.py')  # noqa: F821
exec(compile(open(_p, encoding='utf-8').read(), _p, 'exec'), globals())

_parts = runpy.run_path(os.path.join(REPO, 'tools/blender/biped_parts.py'))  # noqa: F821
_springs = []
for _b in arm.data.bones:  # noqa: F821
    if _b.name.startswith('dtl_o_hair'):
        _springs.append({'bone': _b.name, 'tail': _parts['to_gltf'](arm.matrix_world @ _b.tail_local)})  # noqa: F821
if _springs:
    for _m in MESHES:  # noqa: F821
        _parts['set_extra'](_m, 'springs', _springs)
    print('[chr_v2_post] xương lò xo tóc', [s['bone'] for s in _springs])
