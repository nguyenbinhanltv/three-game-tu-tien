# Dựng thủ tục clip đi lùi / đi ngang / xoay chân tại chỗ cho Mannequin từ clip Walk/Jog/Sprint UAL (CC0). Không dùng Mixamo,
# mocap hay AI. Được `anim_ual_native.py` gọi (nhập từ cùng thư mục); chạy trong Blender với armature UAL đã nạp.
#
#   *_Bwd_Loop   đảo chiều thời gian chu kỳ đi tới (chân trụ chạy ngược), dịch pha để chân trụ trùng pha với clip tới/ngang
#                (trộn chéo giữa các hướng chung một pha), bỏ độ ngả người về trước.
#   *_StrafeL/R  xoay hông quanh trục đứng ±90° (chân sải sang bên), thân trên giữ nguyên hướng (xoay ngược cột sống), bàn chân
#                bù một phần để mũi chân không chĩa ngang hẳn.
#   (Xoay chân tại chỗ KHÔNG bake: đi tại chỗ trượt chân gấp nhiều lần tín hiệu; làm bằng IK khóa chân trong game, xem A2.)
#
# Đo trượt chân (`measure`): vị trí bàn chân trụ (xương ball_*) theo chân xương, tốc độ chân trụ phải bằng −S·u (S = độ dài sải
# mỗi chu kỳ, u = hướng đi). S khớp bình phương tối thiểu; trượt = RMS(|v + S·u|) / S. Kết quả ghi vào báo cáo JSON.
import math

import bpy
from mathutils import Matrix, Vector

FOOT = ('ball_l', 'ball_r')
# Hướng đi (không gian armature Blender): tiến = −Y, trái nhân vật = +X.
DIRS = {'Fwd': Vector((0, -1, 0)), 'Bwd': Vector((0, 1, 0)), 'StrafeL': Vector((1, 0, 0)), 'StrafeR': Vector((-1, 0, 0))}
# Bàn chân bù bao nhiêu phần góc xoay hông khi đi ngang (0 = mũi chân theo hông, 1 = mũi chân luôn hướng tới).
FOOT_COUNTER = 0.4
STRAFE_YAW = math.radians(90)


class Rig:
    """Tính ma trận tư thế (không gian armature) từ cây xương + ma trận cơ sở, không cần depsgraph."""

    def __init__(self, arm):
        self.arm = arm
        self.names = [b.name for b in arm.data.bones]  # cha đứng trước con
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
        self.rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
        self.rel = {n: (self.rest[self.parent[n]].inverted() @ self.rest[n] if self.parent[n] else self.rest[n].copy()) for n in self.names}

    def chain(self, basis):
        m = {}
        for n in self.names:
            p = self.parent[n]
            m[n] = (m[p] if p else Matrix.Identity(4)) @ self.rel[n] @ basis[n]
        return m

    def basis_for(self, name, parent_pose, target):
        """Ma trận cơ sở để xương `name` có tư thế armature `target` khi cha ở `parent_pose`."""
        return self.rel[name].inverted() @ parent_pose.inverted() @ target


def sample(arm, rig, action, phase_fn, n):
    """n+1 mẫu (mẫu cuối = mẫu đầu) của `action`; mỗi mẫu là {xương: ma trận cơ sở}. phase_fn(p∈[0,1)) → pha nguồn ∈ [0,1)."""
    arm.animation_data.action = action
    f0, f1 = action.frame_range
    out = []
    for k in range(n):
        q = phase_fn(k / n) % 1.0
        f = f0 + q * (f1 - f0)
        bpy.context.scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
        out.append({pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones})
    out.append({k: v.copy() for k, v in out[0].items()})
    return out


def yaw_sample(rig, basis, theta, foot_counter):
    """Xoay hông (pelvis + chân) quanh trục đứng qua hông `theta`, trả lại hướng gốc cho cột sống; bàn chân bù một phần."""
    if abs(theta) < 1e-9:
        return basis
    b = {k: v.copy() for k, v in basis.items()}
    m = rig.chain(basis)
    p = m['pelvis'].translation.copy()
    piv = Matrix.Translation(p) @ Matrix.Rotation(theta, 4, 'Z') @ Matrix.Translation(-p)
    m_root = m['root']
    b['pelvis'] = rig.basis_for('pelvis', m_root, piv @ m['pelvis'])
    new = {'root': m_root, 'pelvis': piv @ m['pelvis']}
    # Cột sống: trả hướng armature gốc (xoay ngược), giữ vị trí cục bộ.
    mt = new['pelvis'] @ rig.rel['spine_01']
    want = m['spine_01'].to_3x3()
    q = (mt.to_3x3().inverted() @ want).to_quaternion()
    loc, _, sc = basis['spine_01'].decompose()
    b['spine_01'] = Matrix.LocRotScale(loc, q, sc)
    # Bàn chân: các xương chân (thigh, calf) đi cùng hông; foot/ball xoay bù một phần.
    for side in ('l', 'r'):
        new[f'thigh_{side}'] = piv @ m[f'thigh_{side}']
        new[f'calf_{side}'] = piv @ m[f'calf_{side}']
        mt = new[f'calf_{side}'] @ rig.rel[f'foot_{side}']
        want = (Matrix.Rotation(theta * (1 - foot_counter), 3, 'Z') @ m[f'foot_{side}'].to_3x3())
        q = (mt.to_3x3().inverted() @ want).to_quaternion()
        loc, _, sc = basis[f'foot_{side}'].decompose()
        b[f'foot_{side}'] = Matrix.LocRotScale(loc, q, sc)
    return b


def torso_lean(rig, samples):
    """Góc ngả thân (rad, dương = nghiêng về trước, −Y) trung bình: vector pelvis → neck_01 so với phương đứng."""
    tot = 0.0
    for s in samples[:-1]:
        m = rig.chain(s)
        d = m['neck_01'].translation - m['pelvis'].translation
        tot += math.atan2(-d.y, d.z)
    return tot / (len(samples) - 1)


def pitch_spine(rig, basis, alpha):
    """Xoay spine_01 quanh trục X của armature `alpha` rad (dương = ngả về trước), con cháu đi theo."""
    b = {k: v.copy() for k, v in basis.items()}
    m = rig.chain(basis)
    want = Matrix.Rotation(alpha, 3, 'X') @ m['spine_01'].to_3x3()
    mt = m['pelvis'] @ rig.rel['spine_01']
    q = (mt.to_3x3().inverted() @ want).to_quaternion()
    loc, _, sc = basis['spine_01'].decompose()
    b['spine_01'] = Matrix.LocRotScale(loc, q, sc)
    return b


def measure(rig, samples, u, label=''):
    """Đo trượt chân của bộ mẫu một chu kỳ. u: hướng đi (Vector, armature). Trả {stride, slip, slipRel, stance}."""
    n = len(samples) - 1
    pos = {f: [rig.chain(s)[f].translation.copy() for s in samples] for f in FOOT}
    zmin = min(p.z for f in FOOT for p in pos[f])
    thr = 0.045
    vs = []
    for f in FOOT:
        for k in range(n):
            a, c = pos[f][k], pos[f][k + 1]
            if a.z - zmin < thr and c.z - zmin < thr:
                vs.append(Vector(((c.x - a.x) * n, (c.y - a.y) * n, 0)))  # m/chu kỳ
    if not vs:
        return {'stride': 0.0, 'slip': 0.0, 'slipRel': 0.0, 'stance': 0.0}
    ux = Vector((u.x, u.y, 0)).normalized()
    stride = -sum(v.dot(ux) for v in vs) / len(vs)
    res = [(v + ux * stride).length for v in vs]
    slip = math.sqrt(sum(r * r for r in res) / len(res))
    return {
        'stride': round(stride, 3),
        'slip': round(slip, 3),
        'slipRel': round(slip / max(stride, 1e-6), 4),
        'stance': round(len(vs) / (2 * n), 3),
    }


def write_action(arm, rig, name, samples, fps_frames):
    """Ghi các mẫu vào action mới `name` (khóa tuyến tính, mỗi khung một khóa)."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    n = len(samples) - 1
    f0 = 1
    for k, s in enumerate(samples):
        frame = f0 + k * fps_frames / n
        for pb in arm.pose.bones:
            loc, rot, sc = s[pb.name].decompose()
            pb.rotation_mode = 'QUATERNION'
            pb.location = loc
            pb.rotation_quaternion = rot
            pb.scale = sc
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('scale', frame=frame)
    arm.animation_data.action = None
    return act


def build(arm, acts):
    """acts: {tên: action nguồn} có Walk_Loop, Jog_Fwd_Loop, Sprint_Loop. Trả (danh sách tên clip mới, báo cáo)."""
    rig = Rig(arm)
    arm.animation_data_create()
    report = {}
    made = []
    for band, src_name in (('Walk', 'Walk_Loop'), ('Jog', 'Jog_Fwd_Loop'), ('Sprint', 'Sprint_Loop')):
        src = acts[src_name]
        n = max(12, int(round(src.frame_range[1] - src.frame_range[0])))
        frames = src.frame_range[1] - src.frame_range[0]
        fwd = sample(arm, rig, src, lambda p: p, n)
        report[src_name] = measure(rig, fwd, DIRS['Fwd'])
        lean = torso_lean(rig, fwd)
        report[src_name]['leanDeg'] = round(math.degrees(lean), 1)
        # Đi lùi: đảo chiều thời gian, dịch pha 0,5 (chân trụ trùng pha với clip tới); thân ngả nhẹ ra sau.
        bwd = sample(arm, rig, src, lambda p: 0.5 - p, n)
        bwd = [pitch_spine(rig, s, -lean * 1.3) for s in bwd]
        nm = f'{band}_Bwd_Loop'
        report[nm] = measure(rig, bwd, DIRS['Bwd'])
        write_action(arm, rig, nm, bwd, frames)
        made.append(nm)
        for tag, th in (('StrafeL', STRAFE_YAW), ('StrafeR', -STRAFE_YAW)):
            st = [yaw_sample(rig, s, th, FOOT_COUNTER) for s in fwd]
            nm = f'{band}_{tag}_Loop'
            report[nm] = measure(rig, st, DIRS[tag])
            write_action(arm, rig, nm, st, frames)
            made.append(nm)
        # Chéo 45° (trộn 50/50 hai clip kề nhau, như client): chỉ để đo, không xuất.
        if band == 'Jog':
            half = [yaw_sample(rig, s, STRAFE_YAW * 0.5, FOOT_COUNTER) for s in fwd]
            report['Jog_FwdL45_yawOnly'] = measure(rig, half, (DIRS['Fwd'] + DIRS['StrafeL']))
            mix = []
            full = [yaw_sample(rig, s, STRAFE_YAW, FOOT_COUNTER) for s in fwd]
            for a, c in zip(fwd, full):
                mix.append(_blend(a, c, 0.5))
            report['Jog_FwdL45_blend'] = measure(rig, mix, (DIRS['Fwd'] + DIRS['StrafeL']))
    arm.animation_data.action = None
    return made, report


def _blend(a, b, w):
    """Trộn hai tư thế như three.js: nội suy vị trí, slerp quaternion, theo từng xương."""
    out = {}
    for k in a:
        la, ra, sa = a[k].decompose()
        lb, rb, sb = b[k].decompose()
        out[k] = Matrix.LocRotScale(la.lerp(lb, w), ra.slerp(rb, w), sa.lerp(sb, w))
    return out
