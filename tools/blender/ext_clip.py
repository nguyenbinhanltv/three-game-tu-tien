# Chuẩn hóa clip animation NGOÀI (Cascadeur, thư viện miễn phí, tự quay...) thành GLB chỉ-clip dùng chung bộ xương người của game
# (rig Mixamo, tên xương `mixamorig_*`, client retarget theo tên xương: apps/client/src/game/character/animLib.ts).
#
#   blender -b -P tools/blender/ext_clip.py -- --in <file.fbx|glb|gltf> --out <ra.glb> [--name ext_skl_phi_kiem] [--fps 30]
#                                               [--keep-root-motion] [--trim 0:1.2]
#   blender -b -P tools/blender/ext_clip.py -- --selftest --out <ra.glb>      (tự dựng một clip thử, kiểm đường xuất)
#
# Việc làm: nhập file; lấy armature đầu tiên; đổi tên xương về `mixamorig_<Tên>` (bỏ tiền tố `mixamorig:`, `Armature|`, `Bip01_`...;
# dấu ':' thành '_' như import_tripo.py); gom mọi action thành MỘT clip tên `--name`; xóa chuyển động gốc (xương Hips đứng yên theo X/Z,
# giữ cao độ) trừ khi `--keep-root-motion`; cắt đoạn `--trim a:b` (giây); xóa mesh/material; xuất GLB chỉ có armature + animation.
# Hướng dẫn đầy đủ cho người làm clip: docs/vfx-v1/huong-dan-clip-ngoai.md
import math
import re
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default


SRC = opt('--in')
OUT = opt('--out')
NAME = opt('--name', 'ext_clip')
FPS = int(opt('--fps', '30'))
KEEP_ROOT = '--keep-root-motion' in argv
TRIM = opt('--trim')
SELFTEST = '--selftest' in argv

if not OUT:
    sys.exit('thiếu --out')

PREFIX = re.compile(r'^(mixamorig[:_]?|armature\|?|bip01[ _]?)', re.I)


def clean_name(n):
    n = PREFIX.sub('', n).replace(':', '_').replace('.', '_').replace(' ', '_')
    return 'mixamorig_' + n


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_selftest():
    """Armature tối giản có đủ vài xương Mixamo và một clip 1 s (Hips lên xuống, Spine vặn)."""
    arm_data = bpy.data.armatures.new('rig')
    arm = bpy.data.objects.new('rig', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    names = [('mixamorig:Hips', None, (0, 0, 1)), ('mixamorig:Spine', 'mixamorig:Hips', (0, 0, 1.2)), ('mixamorig:Head', 'mixamorig:Spine', (0, 0, 1.6))]
    for n, parent, head in names:
        b = arm_data.edit_bones.new(n)
        b.head = head
        b.tail = (head[0], head[1], head[2] + 0.2)
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='POSE')
    for f, ang, dz in ((1, 0, 0), (15, 0.5, -0.1), (30, 0, 0)):
        bpy.context.scene.frame_set(f)
        arm.pose.bones['mixamorig:Spine'].rotation_mode = 'XYZ'
        arm.pose.bones['mixamorig:Spine'].rotation_euler = (0, 0, ang)
        arm.pose.bones['mixamorig:Spine'].keyframe_insert('rotation_euler')
        arm.pose.bones['mixamorig:Hips'].location = (0.2 * f / 30, 0, dz)
        arm.pose.bones['mixamorig:Hips'].keyframe_insert('location')
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def load():
    if SELFTEST:
        return build_selftest()
    if not SRC:
        sys.exit('thiếu --in')
    low = SRC.lower()
    if low.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=SRC)
    else:
        bpy.ops.import_scene.gltf(filepath=SRC)
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if not arms:
        sys.exit('file không có armature')
    return arms[0]


reset()
arm = load()
sc = bpy.context.scene
sc.render.fps = FPS

# Đổi tên xương (cả kênh animation trỏ tới `pose.bones["tên"]`).
old_to_new = {}
for b in arm.data.bones:
    old_to_new[b.name] = clean_name(b.name)
for old, new in old_to_new.items():
    if old != new:
        arm.data.bones[old].name = new  # Blender tự đổi đường dẫn fcurve đi theo

# Gom action thành một clip.
acts = [a for a in bpy.data.actions]
if not acts:
    sys.exit('file không có action (clip)')
main = max(acts, key=lambda a: a.frame_range[1] - a.frame_range[0])
main.name = NAME
if arm.animation_data is None:
    arm.animation_data_create()
arm.animation_data.action = main
for a in acts:
    if a is not main:
        bpy.data.actions.remove(a)

# Xóa chuyển động gốc: Hips giữ cao độ (Z) và bỏ trượt X/Y.
if not KEEP_ROOT:
    hips = 'pose.bones["mixamorig_Hips"].location'
    curves = [fc for fc in main.fcurves if fc.data_path == hips] if hasattr(main, 'fcurves') else []
    for fc in curves:
        if fc.array_index in (0, 1):
            base = fc.keyframe_points[0].co[1] if fc.keyframe_points else 0
            for kp in fc.keyframe_points:
                kp.co[1] = base
                kp.handle_left[1] = base
                kp.handle_right[1] = base

# Cắt đoạn.
if TRIM:
    a, b = [float(x) for x in TRIM.split(':')]
    f0, f1 = int(round(a * FPS)), int(round(b * FPS))
    sc.frame_start, sc.frame_end = f0, f1
else:
    fr = main.frame_range
    sc.frame_start, sc.frame_end = int(fr[0]), int(math.ceil(fr[1]))

# Bỏ mesh, material, ảnh.
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for blk in list(coll):
        if blk.users == 0:
            coll.remove(blk)

arm.name = 'rig_human_ext'
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_animation_mode='ACTIONS' if hasattr(bpy.types, 'Action') else 'ACTIVE_ACTIONS',
    export_force_sampling=True,
    export_frame_range=True,
)
print(f'[ext_clip] {NAME}: {sc.frame_end - sc.frame_start + 1} khung @ {FPS} fps, {len(old_to_new)} xương → {OUT}')
