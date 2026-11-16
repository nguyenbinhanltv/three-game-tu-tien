# Dựng bộ xương người (tên kiểu Mixamo) cho boss Tripo chưa có xương, rồi gán trọng số theo khoảng cách tới đoạn xương.
# Do anim_biped_extra.py nạp bằng runpy khi meta có `import.autoRig`, chạy trước mọi thứ khác của script đó.
#
# autoRig = {
#   joints: { "Hips": [x, y, z], ... }   tọa độ hệ chuẩn (mét, gốc ở đáy, mặt trước -Y Blender, trái nhân vật +X), đo từ ảnh
#                                         chính diện/nghiêng của model đã chuẩn hóa (docs/boss-import/). Đủ các khớp trong JOINTS.
#   hold: { bone: "RightHand", region: {"xMax": -1.05, "yMax": -0.05} }   đỉnh trong vùng gắn cứng 100% vào một xương (vũ khí cầm tay)
#   spread: 0.35                          đỉnh chia trọng số cho xương nào cách đỉnh không quá (khoảng cách gần nhất × (1 + spread))
#                                         cộng thêm 0,12 m
# }
# Xương cha/con theo cây Mixamo; mỗi xương chạy từ khớp của nó tới khớp con (xương lá dùng khớp cuối `<tên>End`).
# Trọng số: mỗi đỉnh lấy tối đa 4 xương gần nhất theo khoảng cách tới đoạn xương, trọng số ∝ 1/(d² + ε).
# Cổ máy: không phụ thuộc Blender Automatic Weights (hay lỗi "heat solve" với lưới đá nhiều mảnh rời).

import numpy as np
import bpy
from mathutils import Vector

CFG = META.get('import', {}).get('autoRig')  # noqa: F821
J = {k: np.array(v, float) for k, v in CFG['joints'].items()}

# (xương, cha, khớp đầu mút)
TREE = [
    ('Hips', None, 'Spine'),
    ('Spine', 'Hips', 'Spine1'),
    ('Spine1', 'Spine', 'Spine2'),
    ('Spine2', 'Spine1', 'Neck'),
    ('Neck', 'Spine2', 'Head'),
    ('Head', 'Neck', 'HeadTop'),
]
for S in ('Left', 'Right'):
    TREE += [
        (f'{S}Shoulder', 'Spine2', f'{S}Arm'),
        (f'{S}Arm', f'{S}Shoulder', f'{S}ForeArm'),
        (f'{S}ForeArm', f'{S}Arm', f'{S}Hand'),
        (f'{S}Hand', f'{S}ForeArm', f'{S}HandEnd'),
        (f'{S}UpLeg', 'Hips', f'{S}Leg'),
        (f'{S}Leg', f'{S}UpLeg', f'{S}Foot'),
        (f'{S}Foot', f'{S}Leg', f'{S}ToeBase'),
        (f'{S}ToeBase', f'{S}Foot', f'{S}ToeEnd'),
    ]
for name, _, tip in TREE:
    if name not in J or tip not in J:
        fail(f'autoRig: thiếu khớp {name if name not in J else tip}')  # noqa: F821
# Xương vai: từ cột sống (Spine2) tới khớp vai, nên đầu xương là Spine2.
HEAD_OF = {name: (J['Spine2'] if name.endswith('Shoulder') else J[name]) for name, _, _ in TREE}
PREFIX = 'mixamorig_'

mesh = MESHES[0]  # noqa: F821
arm_data = bpy.data.armatures.new(f'{ASSET_ID}_rig')  # noqa: F821
arm = bpy.data.objects.new(f'{ASSET_ID}_rig', arm_data)  # noqa: F821
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for name, parent, tip in TREE:
    eb = arm_data.edit_bones.new(PREFIX + name)
    eb.head = Vector(HEAD_OF[name])
    eb.tail = Vector(J[tip])
    ebs[name] = eb
for name, parent, tip in TREE:
    if parent:
        ebs[name].parent = ebs[parent]
        ebs[name].use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

# ---- trọng số ----
wv = np.array([(mesh.matrix_world @ v.co)[:] for v in mesh.data.vertices], float)
A = np.array([HEAD_OF[n] for n, _, _ in TREE])
B = np.array([J[t] for _, _, t in TREE])
AB = B - A
L2 = (AB ** 2).sum(1)
d = np.empty((len(wv), len(TREE)))
for i in range(len(TREE)):
    t = np.clip(((wv - A[i]) @ AB[i]) / max(L2[i], 1e-9), 0, 1)
    d[:, i] = np.linalg.norm(wv - (A[i] + t[:, None] * AB[i]), axis=1)
# Xương gốc/hông và vai ít ảnh hưởng: phạt nhẹ để thân không bị kéo bởi xương vai
penalty = np.array([1.25 if n.endswith('Shoulder') else 1.0 for n, _, _ in TREE])
d = d * penalty
spread = float(CFG.get('spread', 0.35))
hold = CFG.get('hold')
hold_idx = [n for n, _, _ in TREE].index(hold['bone']) if hold else None
for n, _, _ in TREE:
    mesh.vertex_groups.new(name=PREFIX + n)
VG = [mesh.vertex_groups[PREFIX + n] for n, _, _ in TREE]
held = 0
for vi in range(len(wv)):
    p = wv[vi]
    if hold and p[0] < hold['region'].get('xMax', 9) and p[1] < hold['region'].get('yMax', 9):
        VG[hold_idx].add([vi], 1.0, 'REPLACE')
        held += 1
        continue
    row = d[vi]
    order = np.argsort(row)[:4]
    lim = row[order[0]] * (1 + spread) + 0.12
    w = np.array([1.0 / (row[k] ** 2 + 0.02) if row[k] <= lim else 0.0 for k in order])
    w /= w.sum()
    for k, wk in zip(order, w):
        if wk > 0.01:
            VG[k].add([vi], float(wk), 'REPLACE')
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
mesh.parent = arm
mesh.matrix_parent_inverse = arm.matrix_world.inverted()
ARMATURES.append(arm)  # noqa: F821
print(f'[biped_autorig] {ASSET_ID}: {len(TREE)} xương, {held} đỉnh gắn cứng')  # noqa: F821
