# Thư viện clip dùng chung cho nhân vật người rig Mixamo (M2-3): anim_human_base.glb, KHÔNG mesh.
# Chạy như bước `import.post` của import_tripo.py (meta `import.animLib: true`), nguồn là rig + clip Tripo của Thanh Phong:
#   1. anim_biped_extra.py ghép clip `import.clips` (idle/run/attack/death, đã in-place nhờ recenter) và thêm hit_light thủ tục.
#   2. Bỏ mọi mesh, material, ảnh; bỏ xương không thuộc bộ Mixamo (đầu mút Tripo, xương phụ kiện dtl_*) cùng kênh của chúng.
#   3. Đặt tên armature `rig_human_base`. Tư thế nghỉ = chữ T của Mixamo (client retarget theo tên xương, xem
#      apps/client/src/game/character/animLib.ts): kênh quay áp thẳng, kênh vị trí scale theo độ dài xương của nhân vật đích.
# Tên xương chuẩn: mixamorig_<tên> (đã qua ascii_name của import_tripo; dấu ':' thành '_').

import os
import re
import runpy

import bpy

BASE = os.path.join(REPO, 'tools/blender/anim_biped_extra.py')  # noqa: F821
result = runpy.run_path(BASE, init_globals=dict(globals()), run_name='__import_tripo_post__')

arm = ARMATURES[0]  # noqa: F821
KEEP = re.compile(r'^mixamorig_[a-z0-9_]+$')

for mesh in list(MESHES):  # noqa: F821
    bpy.data.objects.remove(mesh, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for block in list(coll):
        if block.users == 0:
            coll.remove(block)

gone = [b.name for b in arm.data.bones if not KEEP.match(b.name)]
# Xương bị bỏ phải là lá hoặc cả nhánh bị bỏ (đầu mút, phụ kiện); xương Mixamo không được con của xương bị bỏ.
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for name in gone:
    if name in eb:
        eb.remove(eb[name])
bpy.ops.object.mode_set(mode='OBJECT')
for act in bpy.data.actions:
    for bag in runpy.run_path(os.path.join(REPO, 'tools/blender/tripo_clips.py'))['channelbags'](act):  # noqa: F821
        for fc in list(bag.fcurves):
            m = re.match(r'pose\.bones\["(.+?)"\]', fc.data_path)
            if m and m.group(1) in gone:
                bag.fcurves.remove(fc)
arm.name = 'rig_human_base'
arm.data.name = 'rig_human_base'

# K-3: sửa trôi gốc/hướng, sinh clip dẫn xuất (đi ngang, lùi, lật trái/phải...) và đo; xem anim_human_k3.py.
if (META.get('import') or {}).get('k3'):  # noqa: F821
    runpy.run_path(os.path.join(REPO, 'tools/blender/anim_human_k3.py'), init_globals={**result, **globals()}, run_name='__import_tripo_post__')  # noqa: F821

REPORT = {'clips': sorted(a.name for a in bpy.data.actions), 'bones': len(arm.data.bones), 'droppedBones': sorted(gone)}
print(f'[export_anim_lib] {REPORT}')
