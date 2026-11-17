# Thư viện clip `anim_human_ual` (không mesh, nạp lười) từ Quaternius Universal Animation Library 1+2 (CC0, bản Standard: root đứng yên).
#
#   blender --background --factory-startup --python tools/blender/anim_human_ual.py -- <ra.glb> --src <UAL1_Standard.glb> --src2 <UAL2_Standard.glb>
#
# (run.mjs gọi tự động: job `ual` ở danh sách `procedural`). Việc làm:
#   1. Nạp UAL1 (armature chính), UAL2 (chỉ lấy action: cùng bộ 65 xương UE5 Mannequin nên cùng tên kênh).
#   2. Đổi tên xương sang quy ước Mixamo (`mixamorig_*`, cùng bộ với chr_v2 / chr_kiem_tu) để client retarget theo tên
#      (apps/client/src/game/character/animLib.ts). Bỏ mesh/skin, xương lá (`*_04_leaf`, `ball_leaf`), kênh scale.
#   3. Xoay Z-up: UAL đặt xương `root` xoay -90° quanh X và độ cao hông nằm ở trục Z của root. Blender nhập và xuất lại theo
#      quy ước glTF Y-up nên cây xương xuất ra đã đứng đúng; `retargetClips` còn đo độ cao hông trong không gian thế giới.
#   4. Chọn CLIPS (bảng dưới): lấy mẫu từng khung (30 khung/giây), ghim thành phần NGANG của hông về khung đầu (clip chuyển
#      động tại chỗ; lao tới/lướt do client lo bằng `lungeOffset`/`dashFrom`), giữ nhấp nhô theo chiều đứng, rồi ghi action mới
#      đặt tên `ual_*` (khỏi trùng clip `anim_human_base|k3`). Chỉ quay cho mọi xương, vị trí chỉ hông.
#   5. Xương không đổi cả clip chỉ giữ 2 khóa (asset-pipeline resample tiếp).
# Giấy phép: CC0 1.0, xem assets/LICENSES.md và ../dtl-asset-source/anim/ual/SOURCE.md.

import json
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(flag):
    if flag not in argv:
        raise SystemExit(f'[anim_human_ual] thiếu {flag}')
    return argv[argv.index(flag) + 1]


OUT = argv[0]
SRC1, SRC2 = arg('--src'), arg('--src2')
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FPS = 30
# Độ cao tối thiểu của khớp hông khi nằm (m, theo tỉ lệ mannequin): đủ để lưng không lún vào đất.
HIP_FLOOR = 0.15
# Cổ chân không thấp hơn mức này (m): bàn chân không lún khi ngã/dậy/lộn.
FOOT_MIN = 0.07

# (lib, tên clip nguồn, tên xuất, pin hông ngang?, ghi chú). Chỉ bản Standard, không root motion.
CLIPS = [
    (1, 'Death01', 'ual_death', True, 'chết ngã ngửa'),
    (1, 'Hit_Chest', 'ual_hit_chest', True, 'trúng ngực'),
    (1, 'Hit_Head', 'ual_hit_head', True, 'trúng đầu'),
    (2, 'Hit_Knockback', 'ual_knockback', True, 'bị hất ngã'),
    (2, 'LayToIdle', 'ual_getup', True, 'đứng dậy từ nằm'),
    (2, 'Sword_Dash', 'ual_dash', True, 'lướt kiếm'),
    (1, 'Roll', 'ual_roll', True, 'lộn né'),
    (2, 'Sword_Block', 'ual_block', True, 'đỡ kiếm'),
    (2, 'NinjaJump_Start', 'ual_jump_start', True, 'nhảy: lấy đà'),
    (2, 'NinjaJump_Idle_Loop', 'ual_jump_loop', True, 'nhảy: lơ lửng'),
    (2, 'NinjaJump_Land', 'ual_jump_land', True, 'nhảy: tiếp đất'),
    (1, 'Sword_Idle', 'ual_combat_idle', False, 'thủ thế cầm kiếm'),
    (2, 'Idle_FoldArms_Loop', 'ual_idle_fold', False, 'NPC khoanh tay'),
    (1, 'Idle_Talking_Loop', 'ual_idle_talk', False, 'NPC nói chuyện'),
    (1, 'Interact', 'ual_interact', True, 'NPC/nhặt đồ'),
    (2, 'Yes', 'ual_yes', False, 'gật đầu'),
    (2, 'Idle_No_Loop', 'ual_no', False, 'lắc đầu'),
]

_M = {'pelvis': 'hips', 'spine_01': 'spine', 'spine_02': 'spine1', 'spine_03': 'spine2', 'neck_01': 'neck', 'Head': 'head'}
_LIMB = {'clavicle': 'shoulder', 'upperarm': 'arm', 'lowerarm': 'forearm', 'hand': 'hand', 'thigh': 'upleg', 'calf': 'leg', 'foot': 'foot', 'ball': 'toebase'}


def mixamo(n):
    if n in _M:
        return 'mixamorig_' + _M[n]
    m = re.match(r'(clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball)_([lr])$', n)
    if m:
        return 'mixamorig_' + ('left' if m[2] == 'l' else 'right') + _LIMB[m[1]]
    m = re.match(r'(thumb|index|middle|ring|pinky)_0([123])_([lr])$', n)
    if m:
        return 'mixamorig_' + ('left' if m[3] == 'l' else 'right') + 'hand' + m[1] + m[2]
    return None  # root, xương lá, xương lạ: bỏ


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    return arm, new


def actions_of(prefix_before):
    return {a.name: a for a in bpy.data.actions if a not in prefix_before}


clear_scene()
bpy.context.scene.render.fps = FPS
A1, new1 = import_glb(SRC1)
acts1 = {a.name: a for a in bpy.data.actions}
n_before = set(bpy.data.actions)
A2, new2 = import_glb(SRC2)
acts2 = {a.name: a for a in bpy.data.actions if a not in n_before}
print(f'[anim_human_ual] UAL1 {len(acts1)} clip, UAL2 {len(acts2)} clip, xương {len(A1.data.bones)}/{len(A2.data.bones)}')


def assign(arm, act):
    arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and getattr(act, 'slots', None) and len(act.slots):
        arm.animation_data.action_slot = act.slots[0]


def find_action(acts, name):
    for k, a in acts.items():
        if k == name or re.sub(r'\.\d+$', '', k) == name or k.endswith('|' + name):
            return a
    raise SystemExit(f'[anim_human_ual] không thấy clip {name} (có: {sorted(acts)[:8]}...)')


# Tên xương Mixamo (khóa theo tên UAL gốc, vì clip nguồn dùng tên gốc).
SRC_BONES = [b.name for b in A1.data.bones]
KEEP = [n for n in SRC_BONES if mixamo(n)]
ROOT_NAME = next(n for n in SRC_BONES if A1.data.bones[n].parent is None)

# Độ cao hông ở khung nghỉ để dò trục đứng thế giới.
def world_head(arm, name):
    return arm.matrix_world @ arm.pose.bones[name].matrix @ Vector((0, 0, 0))


results = {}
samples = {}  # xuất → [ {bone: (loc, rot)} ] theo khung
for lib, src_name, out_name, pin, _note in CLIPS:
    arm, acts = (A1, acts1) if lib == 1 else (A2, acts2)
    act = find_action(acts, src_name)
    assign(arm, act)
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    # Nhập GLB 30 fps vào cảnh 30 fps: số khung = (f1 - f0).
    frames, hip_w, foot_z = [], [], []
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        fr = {}
        for n in KEEP:
            pbn = arm.pose.bones[n]
            fr[n] = (pbn.location.copy(), pbn.rotation_quaternion.copy() if pbn.rotation_mode == 'QUATERNION' else pbn.rotation_euler.to_quaternion())
        frames.append(fr)
        hip_w.append(world_head(arm, 'pelvis'))
        foot_z.append(min(world_head(arm, 'foot_l').z, world_head(arm, 'foot_r').z))
    if pin:
        # Dịch hông thế giới sao cho thành phần ngang bằng khung đầu; chiều đứng giữ nguyên.
        up_axis = 2  # thế giới Blender Z-up (không dò theo khung đầu: clip nằm có hông cao ~0 m)
        pel = arm.pose.bones['pelvis']
        par = pel.parent
        M_par = par.matrix if par else None
        base = arm.matrix_world.to_3x3()
        for i, fr in enumerate(frames):
            d = hip_w[i] - hip_w[0]
            d[up_axis] = 0.0
            # Tư thế nằm: khớp hông của mannequin ở ~4 cm trên đất nên lưng/ngực lún vào đất; nâng lên tối thiểu HIP_FLOOR.
            d[up_axis] = -max(0.0, HIP_FLOOR - hip_w[i][up_axis], FOOT_MIN - foot_z[i])  # d là phần bị TRỪ khỏi hông
            if d.length < 1e-6:
                continue
            # delta thế giới → không gian cha của hông (không gian armature rồi cha): basis += rest_rel⁻¹ · ...
            # Hông có con là mọi xương khác nên chỉ cần đổi location hông: loc' = loc - R_local⁻¹ d.
            # R_local = phần quay chuyển vector từ không gian local của hông (basis) sang thế giới = world(pelvis) · rest_local⁻¹.
            # Dùng ma trận hông ở khung i: loc cục bộ (basis) nằm trong không gian xương hông lúc nghỉ, nên đổi bằng
            # ma trận nghỉ của hông trong armature kèm quay của cha ở khung i.
            rest = pel.bone.matrix_local.to_3x3()
            parent_rest_inv = (par.bone.matrix_local.to_3x3().inverted() if par else None)
            # Mô tả: M_pelvis = M_par · (rel_rest · basis); vị trí hông = M_par.t + M_par.R · rel_rest.R · loc + ...
            # ⇒ d_world = base · M_par.R · rel_rest.R · Δloc  ⇒ Δloc = (base · M_par.R · rel_rest.R)⁻¹ · d.
            rel_R = (parent_rest_inv @ rest) if par else rest
            Rpar = M_par.to_3x3() if par else Matrix.Identity(3)
            delta_loc = (base @ Rpar @ rel_R).inverted() @ d
            fr['pelvis'] = (fr['pelvis'][0] - delta_loc, fr['pelvis'][1])
    samples[out_name] = (frames, f1 - f0)
    results[out_name] = {'from': f'UAL{lib}:{src_name}', 'frames': f1 - f0 + 1, 'sec': round((f1 - f0) / FPS, 3), 'pin': pin}
    arm.animation_data.action = None

# ----- Dựng armature xuất: dùng A1, đổi tên xương, bỏ mesh/xương thừa -----
for o in list(bpy.data.objects):
    if o is not A1:
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(A1.children):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for block in list(coll):
        if block.users == 0:
            coll.remove(block)
A1.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
A1.animation_data_create()

# Xương không dùng (root, lá): xóa; con của xương bị xóa cũng bị xóa (lá thì không có con). Root: con trực tiếp pelvis nên
# bỏ root sẽ đưa pelvis lên gốc; Blender áp quay của root vào rest của pelvis.
bpy.context.view_layer.objects.active = A1
A1.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = A1.data.edit_bones
for n in [b.name for b in eb if b.name not in KEEP]:
    if n == ROOT_NAME:
        continue
    eb.remove(eb[n])
bpy.ops.object.mode_set(mode='OBJECT')

# Đổi tên theo Mixamo; tên mới viết thường như tên hai rig đích.
for n in KEEP:
    A1.data.bones[n].name = mixamo(n)
if ROOT_NAME in A1.data.bones:
    A1.data.bones[ROOT_NAME].name = 'rig_root'
A1.name = 'rig_human_ual'
A1.data.name = 'rig_human_ual'

pb = A1.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'
    p.location = (0, 0, 0)
    p.rotation_quaternion = (1, 0, 0, 0)
    p.scale = (1, 1, 1)


def add_to_nla(arm, act):
    track = arm.animation_data.nla_tracks.new()
    track.name = act.name
    track.strips.new(act.name, int(act.frame_range[0]), act)


EPS = 1e-5
for out_name, (frames, nfr) in samples.items():
    act = bpy.data.actions.new(out_name)
    act.use_fake_user = True
    A1.animation_data.action = act
    prev = {}
    still = {}
    for n in KEEP:
        q0 = frames[0][n][1]
        still[n] = all(abs(fr[n][1].dot(q0)) > 1 - EPS for fr in frames) and (n != 'pelvis')
    for i, fr in enumerate(frames):
        for n in KEEP:
            if still[n] and i not in (0, len(frames) - 1):
                continue
            p = pb[mixamo(n)]
            loc, rot = fr[n]
            rot = rot.copy()
            q = prev.get(n)
            if q is not None and q.dot(rot) < 0:
                rot.negate()
            prev[n] = rot
            p.rotation_quaternion = rot
            p.keyframe_insert('rotation_quaternion', frame=i)
            if n == 'pelvis':
                p.location = loc
                p.keyframe_insert('location', frame=i)
    act.frame_range = (0, nfr)
    A1.animation_data.action = None
    add_to_nla(A1, act)

bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, max(n for _, n in samples.values())
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_yup=True,
    export_apply=False,
    export_skins=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_extras=True,
    use_selection=False,
)
print('[anim_human_ual]', json.dumps(results, ensure_ascii=False))
