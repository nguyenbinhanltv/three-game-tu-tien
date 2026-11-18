# Thư viện clip UAL1+UAL2 (Quaternius, CC0) cho nhân vật v3: GIỮ NGUYÊN tên xương UE5 Mannequin và tên clip gốc.
# Khác `anim_human_ual.py` (đổi tên sang Mixamo, client chuyển clip lúc chạy): ở đây KHÔNG chuyển gì, client phát trực tiếp
# lên bộ xương của `chr_v3_*` (cùng tên xương, cùng tư thế nghỉ, xem `chr_v3.py`).
# Dùng: blender -b --factory-startup --python anim_ual_native.py -- <out.glb> --src <UAL1_Standard.glb> --src2 <UAL2_Standard.glb>
import json
import re
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
SRC1 = argv[argv.index('--src') + 1]
SRC2 = argv[argv.index('--src2') + 1]

# (thư viện, tên clip gốc): đủ cho đứng/chạy/chém/ngồi/ngã/nhảy/lướt/niệm/trúng đòn; còn lại lười thêm sau.
CLIPS = [
    (1, 'Idle_Loop'), (1, 'Sword_Idle'), (1, 'Walk_Loop'), (1, 'Jog_Fwd_Loop'), (1, 'Sprint_Loop'),
    (1, 'Jump_Start'), (1, 'Jump_Loop'), (1, 'Jump_Land'), (1, 'Roll'), (1, 'Sword_Attack'),
    (1, 'Spell_Simple_Enter'), (1, 'Spell_Simple_Idle_Loop'), (1, 'Spell_Simple_Shoot'), (1, 'Spell_Simple_Exit'),
    (1, 'Hit_Chest'), (1, 'Hit_Head'), (1, 'Death01'),
    (1, 'Sitting_Enter'), (1, 'Sitting_Idle_Loop'), (1, 'Sitting_Exit'), (1, 'Crouch_Idle_Loop'), (1, 'Crouch_Fwd_Loop'),
    (1, 'Idle_Talking_Loop'), (1, 'Interact'),
    (2, 'Sword_Regular_A'), (2, 'Sword_Regular_B'), (2, 'Sword_Regular_C'), (2, 'Sword_Regular_Combo'),
    (2, 'Sword_Heavy_Combo'), (2, 'Sword_Dash'), (2, 'Sword_Block'), (2, 'Hit_Knockback'), (2, 'LayToIdle'),
    (2, 'NinjaJump_Start'), (2, 'NinjaJump_Idle_Loop'), (2, 'NinjaJump_Land'), (2, 'Idle_FoldArms_Loop'),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30


def load(path):
    before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    arm = next(o for o in bpy.data.objects if o not in before_o and o.type == 'ARMATURE')
    return arm, {a.name: a for a in bpy.data.actions if a not in before_a}


def find(acts, name):
    for k, a in acts.items():
        if k == name or re.sub(r'\.\d+$', '', k) == name or k.endswith('|' + name):
            return a
    raise SystemExit(f'[anim_ual_native] không thấy clip {name}')


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
for lib, name in CLIPS:
    act = find(acts1 if lib == 1 else acts2, name)
    act.name = name
    act.use_fake_user = True
    tr = A1.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, int(act.frame_range[0]), act)
    info[name] = {'lib': lib, 'sec': round((act.frame_range[1] - act.frame_range[0]) / 30, 3)}
for a in list(bpy.data.actions):
    if a.name not in info:
        bpy.data.actions.remove(a)
bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = 300
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=True,
    export_animation_mode='NLA_TRACKS', export_extras=True, use_selection=False,
)
print('[anim_ual_native]', len(info), 'clip', json.dumps(info, ensure_ascii=False))
