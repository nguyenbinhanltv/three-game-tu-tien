# Clip cho nhân vật mặc áo bào rộng (C4 → C2, NV3-B): lấy clip UAL (đi/chạy, chém, lướt, trúng đòn…), GIỮ tên clip và tên xương UE5 Mannequin, nhưng
# thu biên độ dao động của các xương chi quanh tư thế trung bình của clip và đưa tay về gần góc bind A (xem hệ số bên dưới).
# Áo bào rộng (Tripo) không chịu được biên độ clip viết cho áo bó.
# Dùng: blender -b --factory-startup --python anim_robe.py -- <out.glb> --src <UAL1_Standard.glb> --src2 <UAL2_Standard.glb>
import json
import re
import sys

import bpy
from mathutils import Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
SRC1 = argv[argv.index('--src') + 1]
SRC2 = argv[argv.index('--src2') + 1]

# Mỗi nhóm xương có hai hệ số (C2): `base` = giữ bao nhiêu phần TƯ THẾ TRUNG BÌNH của clip so với tư thế T của mẫu (1,0 = giữ nguyên: Idle UAL gốc đã buông tay ~23° ra ngoài, sát góc bind A 26° của model; kéo về T như C4 làm tay giang ~36–75° → "cánh"), `amp` = biên độ dao động quanh tư thế trung bình (0,55 → tay vung bằng 55%).
# Công thức: q' = slerp(1, q̄, base) · slerp(1, q̄⁻¹·q, amp), q̄ = trung bình (đã căn nửa cầu) của các khóa của xương trong clip.
ARM = ['clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r']
HAND = ['hand_l', 'hand_r']
LEG = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r']
TORSO = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head']
LOCO = {'arm': (1.0, 0.55), 'hand': (1.0, 0.7), 'leg': (1.0, 0.7), 'torso': (1.0, 0.75)}
SWORD = {'arm': (1.0, 0.65), 'hand': (1.0, 0.8), 'leg': (1.0, 0.8), 'torso': (1.0, 0.85)}
ROLL = {'arm': (1.0, 0.5), 'hand': (1.0, 0.6), 'leg': (1.0, 0.55), 'torso': (1.0, 0.5)}
HURT = {'arm': (1.0, 0.6), 'hand': (1.0, 0.7), 'leg': (1.0, 0.65), 'torso': (1.0, 0.7)}
IDLE = {'arm': (1.0, 0.9), 'hand': (1.0, 0.9), 'leg': (1.0, 0.9), 'torso': (1.0, 0.9)}
# tên clip → (hồ sơ); thư viện tự dò (UAL1 trước, rồi UAL2)
CLIPS = [(n, IDLE) for n in ('Idle_Loop', 'Spell_Simple_Idle_Loop', 'Sitting_Idle_Loop', 'Sword_Idle')]
CLIPS += [(n, LOCO) for n in ('Walk_Loop', 'Walk_Bwd_Loop', 'Walk_StrafeL_Loop', 'Walk_StrafeR_Loop', 'Jog_Fwd_Loop', 'Jog_Bwd_Loop', 'Jog_StrafeL_Loop', 'Jog_StrafeR_Loop', 'Sprint_Loop', 'Jump_Loop')]
CLIPS += [(n, SWORD) for n in ('Sword_Attack', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C')]
CLIPS += [('Roll', ROLL), ('Hit_Chest', HURT), ('Hit_Knockback', HURT)]
GROUP = {**{b: 'arm' for b in ARM}, **{b: 'hand' for b in HAND}, **{b: 'leg' for b in LEG}, **{b: 'torso' for b in TORSO}}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30


def load(path):
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    arm = next(o for o in bpy.data.objects if o not in before_o and o.type == 'ARMATURE')
    return arm, {a.name: a for a in bpy.data.actions if a not in before_a}


def fcurves_of(act):
    """Blender < 4.4: action.fcurves; từ 4.4 (action phân lớp): layers[].strips[].channelbags[].fcurves."""
    if hasattr(act, 'fcurves'):
        return list(act.fcurves)
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def find(acts, name):
    for k, a in acts.items():
        if k == name or re.sub(r'\.\d+$', '', k) == name or k.endswith('|' + name):
            return a
    raise SystemExit(f'[anim_robe] không thấy clip {name}')


A1, acts1 = load(SRC1)
A2, acts2 = load(SRC2)
for o in list(bpy.data.objects):
    if o is not A1:
        bpy.data.objects.remove(o, do_unlink=True)
A1.animation_data_create()
A1.animation_data.action = None
for t in list(A1.animation_data.nla_tracks):
    A1.animation_data.nla_tracks.remove(t)

info = {}
ident = Quaternion()


def mean_quat(qs):
    ref = qs[0]
    acc = Quaternion((0, 0, 0, 0))
    for q in qs:
        qq = q.copy()
        if qq.dot(ref) < 0:
            qq.negate()
        acc = Quaternion((acc.w + qq.w, acc.x + qq.x, acc.y + qq.y, acc.z + qq.z))
    acc.normalize()
    return acc


def pick(name):
    for acts in (acts1, acts2):
        try:
            return find(acts, name)
        except SystemExit:
            pass
    return None


for name, prof in CLIPS:
    act = pick(name)
    if act is None:
        print(f'[anim_robe] bỏ qua {name} (không có trong UAL1/UAL2)')
        continue
    act.name = name
    act.use_fake_user = True
    chans = {}
    for fc in fcurves_of(act):
        m = re.match(r'pose\.bones\["([^"]+)"\]\.rotation_quaternion', fc.data_path)
        if m:
            chans.setdefault(m.group(1), {})[fc.array_index] = fc
    n_edit = 0
    for bone, fcs in chans.items():
        grp = GROUP.get(bone)
        if grp is None or len(fcs) < 4:
            continue
        base_k, amp_k = prof[grp]
        npts = min(len(fcs[i].keyframe_points) for i in range(4))
        qs = [Quaternion([fcs[i].keyframe_points[p].co[1] for i in range(4)]).normalized() for p in range(npts)]
        qm = mean_quat(qs)
        qbase = ident.slerp(qm, base_k)
        for p in range(npts):
            q = qs[p].copy()
            if q.dot(qm) < 0:
                q.negate()
            osc = qm.inverted() @ q
            if osc.dot(ident) < 0:
                osc.negate()
            nq = qbase @ ident.slerp(osc, amp_k)
            nq.normalize()
            for i in range(4):
                kp = fcs[i].keyframe_points[p]
                kp.co[1] = nq[i]
                kp.handle_left[1] = nq[i]
                kp.handle_right[1] = nq[i]
        n_edit += 1
    for fc in fcurves_of(act):
        fc.update()
    tr = A1.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, int(act.frame_range[0]), act)
    info[name] = {'bones_edited': n_edit, 'sec': round((act.frame_range[1] - act.frame_range[0]) / 30, 3)}
for a in list(bpy.data.actions):
    if a.name not in info:
        bpy.data.actions.remove(a)
bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = 300
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=True,
    export_animation_mode='NLA_TRACKS', export_extras=True, use_selection=False,
)
print('[anim_robe]', json.dumps(info, ensure_ascii=False))
