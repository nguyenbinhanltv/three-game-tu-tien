# Mốc "trúng đòn" (hitAt) của các clip đòn UAL dự phòng (NV3-A3): thời điểm (giây trong clip) tay cầm kiếm (hand_r) nhanh nhất trong
# không gian armature, tức nhát vung qua điểm chém. Ghi JSON `{clip: {hit, dur}}` cho client (`ualHit.json`), kèm độ dài clip để test.
# Dùng: blender -b --factory-startup --python ual_hit_times.py -- <ual1.glb> <ual2.glb> <out.json>
import json
import re
import sys

import bpy

sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import ual_loco  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
SRC1, SRC2, OUT = argv[:3]
CLIPS = [(2, 'Sword_Regular_A'), (2, 'Sword_Regular_B'), (2, 'Sword_Regular_C'), (1, 'Sword_Attack')]
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS
arms = {}
for lib, src in ((1, SRC1), (2, SRC2)):
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=src)
    arm = next(o for o in bpy.data.objects if o not in before_o and o.type == 'ARMATURE')
    arms[lib] = (arm, {re.sub(r'^.*\|', '', a.name): a for a in bpy.data.actions if a not in before_a})
out = {}
for lib, name in CLIPS:
    arm, acts = arms[lib]
    rig = ual_loco.Rig(arm)
    arm.animation_data_create()
    act = acts[name]
    arm.animation_data.action = act
    f0, f1 = act.frame_range
    n = int(round(f1 - f0))
    pos = []
    for k in range(n + 1):
        bpy.context.scene.frame_set(int(f0) + k)
        basis = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
        pos.append(rig.chain(basis)['hand_r'].translation.copy())
    sp = [(pos[i + 1] - pos[i]).length for i in range(n)]
    sm = [(sp[max(0, i - 1)] + sp[i] + sp[min(n - 1, i + 1)]) / 3 for i in range(n)]
    i = max(range(n), key=lambda j: sm[j])
    out[name] = {'hit': round((i + 0.5) / FPS, 3), 'dur': round(n / FPS, 3)}
json.dump(out, open(OUT, 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print('[ual_hit_times]', json.dumps(out))
