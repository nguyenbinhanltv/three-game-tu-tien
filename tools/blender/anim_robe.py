# Clip cho nhân vật mặc áo bào rộng (C4, NV3-B): lấy Idle_Loop, Jog_Fwd_Loop (UAL1) và Sword_Regular_A (UAL2), GIỮ tên clip và tên xương
# UE5 Mannequin, nhưng kẹp biên độ xoay các xương chi về phía tư thế nghỉ (slerp từ quaternion đơn vị): tay giơ không quá ngang vai, bước chân
# ngắn ~30%, gập hông/ngực nhẹ hơn. Áo bào rộng dính liền thân (Tripo) không chịu được biên độ clip viết cho áo bó.
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

# (thư viện, clip, {nhóm xương: hệ số giữ biên độ})
ARM = ['clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r']
HAND = ['hand_l', 'hand_r']
LEG = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r']
TORSO = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head']
CLIPS = [
    (1, 'Idle_Loop', {'arm': 0.55, 'hand': 0.7, 'leg': 0.9, 'torso': 0.9}),
    (1, 'Jog_Fwd_Loop', {'arm': 0.55, 'hand': 0.7, 'leg': 0.7, 'torso': 0.75}),
    (2, 'Sword_Regular_A', {'arm': 0.6, 'hand': 0.8, 'leg': 0.8, 'torso': 0.85}),
]
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
for lib, name, factors in CLIPS:
    act = find(acts1 if lib == 1 else acts2, name)
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
        k = factors[grp]
        npts = min(len(fcs[i].keyframe_points) for i in range(4))
        for p in range(npts):
            q = Quaternion([fcs[i].keyframe_points[p].co[1] for i in range(4)])
            q.normalize()
            if q.dot(ident) < 0:
                q.negate()
            nq = ident.slerp(q, k)
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
    info[name] = {'bones_edited': n_edit, 'factors': factors, 'sec': round((act.frame_range[1] - act.frame_range[0]) / 30, 3)}
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
