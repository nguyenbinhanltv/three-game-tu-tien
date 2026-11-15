# Ghép clip từ GLB khác cùng bộ xương (Tripo web xuất mỗi clip một file) vào armature chính. Dùng chung cho các script
# `import.post` (anim_biped_extra.py, anim_quadruped.py), nạp bằng runpy.run_path rồi gọi merge_clips(...).
#
# Mỗi phần tử `import.clips` = { source, name, start?, end?, recenter?, loop? }:
#   - nạp GLB, lấy action đầu tiên, đổi tên kênh theo xương của rig chính (`bone_map`), bỏ kênh xương không có;
#   - scale khóa location theo tỉ lệ khung xương (rig chính đã đổi sang mét): k = main_span / span_of(armature clip);
#   - cắt đoạn [start, end] (giây) nếu có, dời về khung 0, đặt tên clip;
#   - recenter: đưa hông (`hips`) về vị trí ngang của idle khung 0 (clip Tripo có sẵn độ lệch gốc, như run);
#   - loop: dồn đều chênh lệch cuối-đầu dọc clip để khung cuối trùng khung đầu.
# Điều kiện: tư thế nghỉ của xương trong file clip trùng rig chính (lệch < 2°), nếu không thì dừng.
# Mọi thứ GLB clip mang vào (mesh, material, ảnh, armature) bị dọn, chỉ giữ action, thêm vào NLA của armature chính.

import math
import os
import re

import bpy
from mathutils import Vector


def channelbags(action):
    if hasattr(action, 'layers') and len(action.layers):
        for layer in action.layers:
            for strip in layer.strips:
                yield from strip.channelbags
    else:
        yield action


def add_to_nla(arm, act):
    arm.animation_data_create()
    track = arm.animation_data.nla_tracks.new()
    track.name = act.name
    track.strips.new(act.name, int(act.frame_range[0]), act)


def drop_existing_actions(arm):
    """Bỏ clip có sẵn trong GLB nguồn chính (đã khai báo lại trong import.clips): tránh trùng tên, và importer đặt khung
    của chúng theo fps cảnh lúc nạp (24) trong khi script xuất ở 30 fps."""
    names = []
    if arm.animation_data:
        arm.animation_data.action = None
        for t in list(arm.animation_data.nla_tracks):
            arm.animation_data.nla_tracks.remove(t)
    for act in list(bpy.data.actions):
        names.append(act.name)
        bpy.data.actions.remove(act)
    return names


def merge_clips(arm, specs, *, source_root, fail, bone_map, main_span, span_of, hips=None):
    """arm: armature chính. bone_map(tên xương trong file clip) → tên xương rig chính hoặc None.
    span_of(armature clip) → độ dài đặc trưng cùng nghĩa với main_span (để scale location). hips: tên xương hông của
    rig chính (cho recenter), None nếu không dùng. Trả về báo cáo {tên clip: {...}}."""
    report = {}
    idle_hips = {}
    hips_up = None
    if hips:
        up = arm.data.bones[hips].matrix_local.to_3x3().inverted() @ Vector((0, 0, 1))
        hips_up = max(range(3), key=lambda i: abs(up[i]))  # thành phần location hông ứng với trục đứng
    for spec in specs:
        path = os.path.join(source_root, spec['source'])
        if not os.path.isfile(path):
            fail(f'clip {spec["name"]}: không có {path}')
        before_obj, before_act = set(bpy.data.objects), set(bpy.data.actions)
        before_data = {c: set(getattr(bpy.data, c)) for c in ('meshes', 'materials', 'images', 'armatures')}
        bpy.ops.import_scene.gltf(filepath=path)
        new_objs = set(bpy.data.objects) - before_obj
        src = next((o for o in new_objs if o.type == 'ARMATURE'), None)
        acts = sorted(set(bpy.data.actions) - before_act, key=lambda a: a.name)
        if not src or not acts:
            fail(f'clip {spec["name"]}: {spec["source"]} không có armature hoặc animation (file trùng rig?)')
        act = acts[0]

        # Tư thế nghỉ phải trùng (theo hướng xương trong không gian thế giới, bỏ qua scale).
        worst = 0.0
        for b in src.data.bones:
            name = bone_map(b.name)
            mb = arm.data.bones.get(name) if name else None
            if not mb:
                continue
            qa = (arm.matrix_world @ mb.matrix_local).to_quaternion()
            qb = (src.matrix_world @ b.matrix_local).to_quaternion()
            ang = qa.rotation_difference(qb).angle  # q và −q cùng một phép quay: góc 2π − ε nghĩa là ε
            worst = max(worst, math.degrees(min(ang, 2 * math.pi - ang)))
        if worst > 2.0:
            fail(f'clip {spec["name"]}: tư thế nghỉ lệch rig chính {worst:.1f}° (cần retarget, chưa hỗ trợ)')

        k = main_span / max(span_of(src), 1e-6)
        fps_src = bpy.context.scene.render.fps  # importer đặt khung theo fps cảnh hiện tại
        start = spec.get('start')
        end = spec.get('end')
        f0 = act.frame_range[0] + (start * fps_src if start is not None else 0)
        f1 = act.frame_range[0] + end * fps_src if end is not None else act.frame_range[1]
        dropped = 0
        for bag in channelbags(act):
            for fc in list(bag.fcurves):
                m = re.match(r'pose\.bones\["(.+?)"\]\.(\w+)', fc.data_path)
                name = bone_map(m.group(1)) if m else None
                if not name or not arm.data.bones.get(name):
                    bag.fcurves.remove(fc)
                    dropped += 1
                    continue
                fc.data_path = f'pose.bones["{name}"].{m.group(2)}'
                pts = fc.keyframe_points
                for i in range(len(pts) - 1, -1, -1):
                    if pts[i].co.x < f0 - 1e-3 or pts[i].co.x > f1 + 1e-3:
                        pts.remove(pts[i])
                for p in pts:
                    p.co.x -= f0
                    p.handle_left.x -= f0
                    p.handle_right.x -= f0
                    if m.group(2) == 'location':
                        p.co.y *= k
                        p.handle_left.y *= k
                        p.handle_right.y *= k
        act.name = spec['name']
        act.use_fake_user = True
        act.frame_range = (0, f1 - f0)
        hips_fc = {}
        if hips:
            hips_path = f'pose.bones["{hips}"].location'
            hips_fc = {fc.array_index: fc for bag in channelbags(act) for fc in bag.fcurves if fc.data_path == hips_path}
        if spec['name'] == 'idle':
            idle_hips.update({i: fc.evaluate(0) for i, fc in hips_fc.items()})
        if spec.get('recenter'):
            if not hips:
                fail(f'clip {spec["name"]}: recenter cần xương hông')
            # Đưa hông về cùng vị trí ngang với idle khung 0 (hoặc tư thế nghỉ), giữ trục đứng: clip tại chỗ không bị nhảy.
            for i, fc in hips_fc.items():
                if i == hips_up:
                    continue
                pts = fc.keyframe_points
                shift = idle_hips.get(i, 0.0) - sum(p.co.y for p in pts) / max(len(pts), 1)
                for p in pts:
                    p.co.y += shift
                    p.handle_left.y += shift
                    p.handle_right.y += shift
        if spec.get('loop'):
            # Khép vòng: dồn chênh lệch cuối-đầu đều dọc clip để khung cuối trùng khung đầu, không giật ở chỗ nối.
            span = max(f1 - f0, 1e-6)
            for bag in channelbags(act):
                for fc in bag.fcurves:
                    pts = fc.keyframe_points
                    if len(pts) < 2:
                        continue
                    gap = pts[-1].co.y - pts[0].co.y
                    for p in pts:
                        d = gap * (p.co.x / span)
                        p.co.y -= d
                        p.handle_left.y -= d
                        p.handle_right.y -= d
                    fc.update()
        add_to_nla(arm, act)

        for o in new_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        for c, old in before_data.items():
            coll = getattr(bpy.data, c)
            for block in set(coll) - old:
                if block.users == 0:
                    coll.remove(block)
        report[spec['name']] = {'seconds': round((f1 - f0) / fps_src, 3), 'dropped': dropped, 'locScale': round(k, 5)}
    return report
