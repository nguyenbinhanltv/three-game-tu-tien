# K-3: hậu xử lý clip chung của thư viện anim_human_base (rig Mixamo). Chạy bởi export_anim_lib.py SAU anim_biped_extra.py
# (clip Tripo đã ghép bằng `import.clips`, clip thủ tục IK đã dựng bằng `import.extra`). Cấu hình ở meta.json `import.k3`:
#
#   fix:    [{ name, yaw?, pin?, loop? }]   sửa clip đã ghép (đổi chỗ, không đổi tên)
#   derive: [{ name, op, from, ... }]       sinh clip mới từ clip có sẵn
#   drop:   [tên]                           bỏ clip trung gian khỏi thư viện
#
# Mọi phép biến đổi làm trên ma trận xương ở không gian armature (đã chuẩn hóa = mô hình: +Z lên, mặt trước -Y, trái +X),
# lấy mẫu 30 khung/giây, rồi đổi lại thành quay/vị trí cục bộ (basis) của từng xương và đặt khóa mọi khung:
#   basis = (rest_cha⁻¹·rest)⁻¹ · M_cha⁻¹ · M      (gốc: rest⁻¹ · M)
#
# - Trôi gốc (root drift): clip Tripo "in place" vẫn có hông lệch vài cm; `pin` tịnh tiến cả cơ thể sao cho thành phần
#   NGANG của hông cố định (bằng khung đầu clip idle), giữ nguyên nhấp nhô theo chiều đứng.
# - Lệch hướng: đo góc đảo (yaw) của trục hông (trái→phải) và trục vai ở từng khung so với tư thế nghỉ; clip lệch quá
#   YAW_TOL ở khung đầu thì xoay cả clip quanh trục đứng qua hông để khung đầu quay mặt về trước (`yaw` ghi đè).
# - Nối vòng: dồn chênh lệch cuối-đầu đều dọc clip (quay: slerp, vị trí: tuyến tính) ở không gian basis.
# - Ops: mirror (đối xứng trái/phải theo biến đổi Δ = M·rest⁻¹), reverse, strafe (hông xoay `yaw`, thân trên vặn ngược),
#   sideroll (xoay cả thân theo hình sin² để lăn sang bên rồi trả mặt về trước), layer (thân dưới của clip A + thân trên
#   của clip B), slice (cắt [start, end] giây), speed.
# - Đo: góc lệch hướng, độ khép vòng, tốc độ chân trụ (tốc độ nền m/s ở 1×) và độ trượt chân; ghi docs/k3-anim/clips.json.

import json
import math
import os
import re

import bpy
from mathutils import Matrix, Quaternion, Vector

K3 = (IMPORT.get('k3') or {})  # noqa: F821
if not K3:
    raise RuntimeError('anim_human_k3: meta thiếu import.k3')

FPS = 30
YAW_TOL = 20.0
scene = bpy.context.scene
scene.render.fps = FPS
pb = arm.pose.bones  # noqa: F821
arm.animation_data_create()  # noqa: F821
NAMES = [p.name for p in pb]
REST = {p.name: p.bone.matrix_local.copy() for p in pb}
PARENT = {p.name: (p.parent.name if p.parent else None) for p in pb}


def depth(n):
    d = 0
    while PARENT[n]:
        n = PARENT[n]
        d += 1
    return d


ORDER = sorted(NAMES, key=depth)  # cha trước con
CHILDREN = {n: [] for n in NAMES}
for n_, p_ in PARENT.items():
    if p_:
        CHILDREN[p_].append(n_)


def subtree(n):
    out = [n]
    for c in CHILDREN[n]:
        out += subtree(c)
    return out


def bone(suffix):
    return bone_like(suffix).name  # noqa: F821


def suffix_exists(name):
    return suffix_bone(arm.data.bones, name) is not None  # noqa: F821


HIPS = bone('hips')
SPINE, SPINE1, SPINE2 = bone('spine'), bone('spine1'), bone('spine2')
L_UPLEG, R_UPLEG, L_ARM, R_ARM = bone('leftupleg'), bone('rightupleg'), bone('leftarm'), bone('rightarm')
L_FOOT, R_FOOT = bone('leftfoot'), bone('rightfoot')
UPPER = set(subtree(SPINE))
LOWER = set(NAMES) - UPPER  # hông + chân (hông chứa cả thân nên thân trên tách riêng)
Z = Vector((0, 0, 1))
SIDE_RE = re.compile(r'(Left|Right)')


def mirror_name(n):
    if 'Left' in n:
        return n.replace('Left', 'Right')
    if 'Right' in n:
        return n.replace('Right', 'Left')
    return n


# ---------- lấy mẫu / ghi ----------

NLA_ON = arm.animation_data.use_nla  # noqa: F821
arm.animation_data.use_nla = False  # noqa: F821


def assign(act):
    arm.animation_data.action = act  # noqa: F821
    if hasattr(arm.animation_data, 'action_slot') and getattr(act, 'slots', None) and len(act.slots):  # noqa: F821
        arm.animation_data.action_slot = act.slots[0]  # noqa: F821


def sample(act):
    """Danh sách khung; mỗi khung {xương: Matrix armature}. Lấy mẫu đúng 30 khung/giây từ khung 0 của action."""
    assign(act)
    n = int(round(act.frame_range[1] - act.frame_range[0]))
    out = []
    for f in range(n + 1):
        scene.frame_set(int(round(act.frame_range[0])) + f)
        bpy.context.view_layer.update()
        out.append({p.name: p.matrix.copy() for p in pb})
    arm.animation_data.action = None  # noqa: F821
    return out


def basis_frames(frames):
    """Ma trận armature → (vị trí, quay) cục bộ từng xương cho mỗi khung."""
    rel_inv = {}
    for n in NAMES:
        par = PARENT[n]
        rel_inv[n] = (REST[par].inverted() @ REST[n]).inverted() if par else REST[n].inverted()
    out = []
    for M in frames:
        fr = {}
        for n in ORDER:
            par = PARENT[n]
            b = rel_inv[n] @ (M[par].inverted() @ M[n] if par else M[n])
            loc, rot, _ = b.decompose()
            fr[n] = [loc, rot]
        out.append(fr)
    return out


def close_loop(bf):
    """Khung cuối trùng khung đầu: dồn chênh lệch đều dọc clip (quay slerp, vị trí tuyến tính)."""
    n = len(bf) - 1
    if n < 2:
        return
    for name in NAMES:
        q0, qn = bf[0][name][1], bf[n][name][1]
        c = q0 @ qn.inverted()
        dl = bf[0][name][0] - bf[n][name][0]
        for i in range(n + 1):
            w = i / n
            bf[i][name][1] = Quaternion().slerp(c, w) @ bf[i][name][1]
            bf[i][name][0] = bf[i][name][0] + dl * w
    # Giữ liên tục dấu quay để nội suy tuyến tính khi xuất không đi đường vòng.


def write_action(name, bf, loop=False):
    old = bpy.data.actions.get(name)
    if old:
        old.name = name + '.old'
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act  # noqa: F821
    for p in pb:
        p.rotation_mode = 'QUATERNION'
    prev = {}
    for i, fr in enumerate(bf):
        for p in pb:
            loc, rot = fr[p.name]
            rot = rot.copy()
            q = prev.get(p.name)
            if q is not None and q.dot(rot) < 0:
                rot.negate()
            prev[p.name] = rot
            p.location = loc
            p.rotation_quaternion = rot
            p.keyframe_insert('location', frame=i)
            p.keyframe_insert('rotation_quaternion', frame=i)
    act.frame_range = (0, len(bf) - 1)
    arm.animation_data.action = None  # noqa: F821
    TC['add_to_nla'](arm, act)  # noqa: F821
    return act


def replace_clip(name, frames, loop=False):
    bf = basis_frames(frames)
    if loop:
        close_loop(bf)
    old = bpy.data.actions.get(name)
    if old:
        for t in list(arm.animation_data.nla_tracks):  # noqa: F821
            if any(s.action == old for s in t.strips):
                arm.animation_data.nla_tracks.remove(t)  # noqa: F821
        old.name = name + '.old'
        bpy.data.actions.remove(old)
    return write_action(name, bf, loop)


# ---------- phép biến đổi trên ma trận ----------

def rot_about(angle, pivot, axis=Z):
    return Matrix.Translation(pivot) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-pivot)


def yaw_frames(frames, deg_at):
    """Xoay cả cơ thể quanh trục đứng qua hông khung đầu. deg_at(i, n) → độ (+ quay mặt sang trái, tức -Y → +X)."""
    p0 = frames[0][HIPS].translation.copy()
    p0.z = 0
    n = len(frames) - 1
    out = []
    for i, M in enumerate(frames):
        R = rot_about(math.radians(deg_at(i, n)), p0)
        out.append({k: R @ v for k, v in M.items()})
    return out


def pin_frames(frames, anchor):
    """Tịnh tiến cả cơ thể để hông có thành phần ngang = anchor (x, y); giữ nguyên độ cao (nhấp nhô)."""
    out = []
    for M in frames:
        h = M[HIPS].translation
        T = Matrix.Translation(Vector((anchor[0] - h.x, anchor[1] - h.y, 0)))
        out.append({k: T @ v for k, v in M.items()})
    return out


def mirror_frames(frames):
    S = Matrix.Diagonal((-1, 1, 1, 1))
    out = []
    for M in frames:
        fr = {}
        for n in NAMES:
            d = S @ (M[n] @ REST[n].inverted()) @ S
            fr[mirror_name(n)] = d @ REST[mirror_name(n)]
        out.append(fr)
    return out


def twist_upper(frames, total_deg, split=(1 / 3, 1 / 3, 1 / 3), head=0.0):
    """Vặn thân trên quanh trục đứng: mỗi đốt sống xoay (cùng nhánh con) quanh đầu xương của nó."""
    out = []
    for M in frames:
        M = {k: v.copy() for k, v in M.items()}
        for b, w in zip((SPINE, SPINE1, SPINE2), split):
            R = rot_about(math.radians(total_deg * w), M[b].translation.copy())
            for k in subtree(b):
                M[k] = R @ M[k]
        out.append(M)
    return out


def fk(fr):
    """Quay/vị trí cục bộ (basis) → ma trận armature (ngược của basis_frames)."""
    M = {}
    for n in ORDER:
        par = PARENT[n]
        loc, rot = fr[n]
        b = Matrix.Translation(loc) @ rot.to_matrix().to_4x4()
        M[n] = (M[par] @ (REST[par].inverted() @ REST[n]) @ b) if par else (REST[n] @ b)
    return M


def layer_frames(lower, upper):
    """Thân dưới (hông + chân) lấy ở A, thân trên (từ Spine) lấy ở B; ghép ở không gian basis để cột sống bám đúng hông của A."""
    n = min(len(lower), len(upper))
    bl, bu = basis_frames(lower[:n]), basis_frames(upper[:n])
    return [fk({k: (bu[i][k] if k in UPPER else bl[i][k]) for k in NAMES}) for i in range(n)]


def pingpong_frames(frames):
    return frames + frames[-2:0:-1]


def fit_frames(frames, n):
    """Co giãn về đúng n+1 khung (lấy khung gần nhất)."""
    m = len(frames) - 1
    return [frames[min(m, int(round(i * m / n)))] for i in range(n + 1)]


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


GROUP_HEAD = {HEAD_ for HEAD_ in subtree(bone('neck'))}
GROUP_ARMS = set(subtree(bone('leftshoulder')) + subtree(bone('rightshoulder'))) if suffix_exists('leftshoulder') else set()
GROUP_LEGS = set(subtree(L_UPLEG) + subtree(R_UPLEG))


def getup_frames(lying, crouch, stand, t1, t2):
    """Đứng dậy: nằm → ngồi xổm (t1 giây, đầu dẫn trước, chân vào sau) → đứng (t2 giây, chân đẩy trước, hông, thân trên, đầu theo sau).
    Mỗi nhóm xương nội suy basis với độ trễ/độ dài riêng nên trọng tâm dồn dần, không gập-mở đồng loạt."""
    A, B, C = basis_frames([lying])[0], basis_frames([crouch])[0], basis_frames([stand])[0]
    n1, n2 = int(round(t1 * FPS)), int(round(t2 * FPS))

    def weights(g, u, up):
        # (bắt đầu, kết thúc) của nhóm trong pha, theo phần pha
        if not up:
            span = {'head': (0.0, 0.7), 'arms': (0.05, 0.85), 'spine': (0.05, 0.8), 'hips': (0.15, 0.95), 'legs': (0.3, 1.0)}[g]
        else:
            span = {'legs': (0.0, 0.7), 'hips': (0.1, 0.85), 'spine': (0.2, 0.95), 'arms': (0.2, 1.0), 'head': (0.35, 1.0)}[g]
        return ease((u - span[0]) / (span[1] - span[0]))

    def group(k):
        if k in GROUP_HEAD:
            return 'head'
        if k in GROUP_LEGS:
            return 'legs'
        if k in GROUP_ARMS:
            return 'arms'
        if k == HIPS:
            return 'hips'
        return 'spine'

    out = []
    for up, (P, Q, n) in enumerate(((A, B, n1), (B, C, n2))):
        for i in range(n + (1 if up else 0)):
            u = i / n
            fr = {}
            for k in NAMES:
                w = weights(group(k), u, bool(up))
                fr[k] = [P[k][0].lerp(Q[k][0], w), P[k][1].slerp(Q[k][1], w)]
            out.append(fk(fr))
    return clamp_ground(out)


def clamp_ground(frames, floor=None):
    """Nâng cả cơ thể sao cho bàn chân/bàn tay/đầu không chui xuống đất (độ cao tối thiểu đo từ dáng đứng yên idle), làm mượt 7 khung."""
    lim = {L_FOOT: idle_frames[0][L_FOOT].translation.z * 0.9, R_FOOT: idle_frames[0][R_FOOT].translation.z * 0.9,
           bone('lefthand'): 0.03, bone('righthand'): 0.03, bone('head'): 0.08}
    lift = [max(0.0, max(v - M[k].translation.z for k, v in lim.items())) for M in frames]
    sm = [sum(lift[max(0, i - 3):i + 4]) / len(lift[max(0, i - 3):i + 4]) for i in range(len(lift))]
    sm = [max(a, 0.6 * b) for a, b in zip(sm, lift)]
    out = []
    for M, h in zip(frames, sm):
        T = Matrix.Translation(Vector((0, 0, h)))
        out.append({k: T @ v for k, v in M.items()})
    return out


def reverse_frames(frames):
    return [dict(f) for f in reversed(frames)]


# ---------- đo ----------

def axis_yaw(M, a, b):
    """Góc (độ) của vector a→b ở mặt phẳng ngang."""
    v = M[b].translation - M[a].translation
    return math.degrees(math.atan2(v.y, v.x))


def wrap(d):
    return (d + 180.0) % 360.0 - 180.0


STANCE_H = 0.025  # cổ chân cách điểm thấp nhất của clip dưới ngưỡng này (m) = chân trụ


def stance_info(frames, thr=STANCE_H, min_len=4, cyclic=True):
    """Các pha chân trụ ({foot, pts=[(khung, giây)], tm, p}), vận tốc ngang chung v (trung vị độ dốc hồi quy cổ chân theo thời gian
    trong mỗi pha; chân trụ trượt về sau nên v hướng ngược chiều thân đi) và độ trượt tối đa khỏi đường thẳng đều đó. Clip lặp
    (`cyclic`): pha chạm đất ở cả khung cuối lẫn khung đầu là MỘT pha nối qua chỗ lặp (khung cuối ≡ khung đầu, chu kỳ n khung).
    None nếu clip không có ≥ 2 pha trụ (clip đứng yên/tại chỗ)."""
    nf = len(frames)
    period = nf - 1
    floor = min(M[f].translation.z for M in frames for f in (L_FOOT, R_FOOT))
    segs = []
    for f in (L_FOOT, R_FOOT):
        runs, a = [], None
        for i in range(nf + 1):
            low = i < nf and frames[i][f].translation.z < floor + thr
            if low and a is None:
                a = i
            elif not low and a is not None:
                runs.append([a, i - 1])
                a = None
        if cyclic and len(runs) >= 2 and runs[0][0] == 0 and runs[-1][1] == nf - 1:
            head, tail = runs.pop(0), runs.pop()
            pts = [(i, i / FPS) for i in range(tail[0], nf - 1)] + [(i, (i + period) / FPS) for i in range(head[0], head[1] + 1)]
            runs.append(pts)
        for r in runs:
            pts = r if isinstance(r[0], tuple) else [(i, i / FPS) for i in range(r[0], r[1] + 1)]
            if len(pts) >= min_len:
                segs.append({'foot': f, 'pts': pts})
    if len(segs) < 2:
        return None
    slopes = []
    for sg in segs:
        t = [x[1] for x in sg['pts']]
        tm = sum(t) / len(t)
        den = sum((x - tm) ** 2 for x in t)
        px = [frames[i][sg['foot']].translation.x for i, _ in sg['pts']]
        py = [frames[i][sg['foot']].translation.y for i, _ in sg['pts']]
        mx, my = sum(px) / len(px), sum(py) / len(py)
        slopes.append((sum((x - tm) * (p - mx) for x, p in zip(t, px)) / den, sum((x - tm) * (p - my) for x, p in zip(t, py)) / den))
        sg['tm'], sg['p'] = tm, Vector((mx, my))
    vxs, vys = sorted(v[0] for v in slopes), sorted(v[1] for v in slopes)
    v = Vector((vxs[len(vxs) // 2], vys[len(vys) // 2]))
    slip = 0.0
    for sg in segs:
        for i, t in sg['pts']:
            p = Vector((frames[i][sg['foot']].translation.x, frames[i][sg['foot']].translation.y))
            slip = max(slip, (p - (sg['p'] + v * (t - sg['tm']))).length)
    return {'segments': segs, 'v': v, 'slip': slip, 'floor': floor}


def leg_ik_matrix(M, up, leg, foot, target):
    """IK hai đốt trên ma trận armature: đưa cổ chân về `target` (Vector 3), giữ mặt phẳng gập gối hiện tại và hướng bàn chân."""
    hip, knee, ankle = M[up].translation.copy(), M[leg].translation.copy(), M[foot].translation.copy()
    l1, l2 = (knee - hip).length, (ankle - knee).length
    d = target - hip
    dist = min(max(d.length, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
    dn = d.normalized()
    u = (ankle - hip).normalized()
    pole = (knee - hip) - u * (knee - hip).dot(u)
    perp = pole - dn * pole.dot(dn)
    perp = perp.normalized() if perp.length > 1e-6 else Vector((0, -1, 0))
    along = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist)
    new_knee = hip + dn * along + perp * math.sqrt(max(l1 * l1 - along * along, 0.0))
    goal = hip + dn * dist
    foot_rot = M[foot].to_3x3().copy()

    def turn(names, pivot, q):
        R = rot_pivot(q, pivot)
        for k in names:
            M[k] = R @ M[k]

    turn(subtree(up), hip, (knee - hip).rotation_difference(new_knee - hip))
    ankle1 = M[foot].translation.copy()
    turn(subtree(leg), new_knee, (ankle1 - new_knee).rotation_difference(goal - new_knee))
    cur = M[foot].to_3x3()
    turn(subtree(foot), M[foot].translation.copy(), (foot_rot @ cur.inverted()).to_quaternion())


def rot_pivot(q, pivot):
    return Matrix.Translation(pivot) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pivot)


def foot_lock(frames, fade=2):
    """Dọn trượt chân: trong mỗi pha trụ, cổ chân đi đúng đường thẳng đều với vận tốc nền v chung của clip (vị trí neo = trung bình
    pha), rồi IK hai đốt đưa chân về đó; độ cao cổ chân giữ nguyên (gót nhấc, mũi chạm vẫn còn). Hai đầu pha hòa dần `fade` khung."""
    st = stance_info(frames)
    if not st:
        return frames
    out = [dict((k, v.copy()) for k, v in M.items()) for M in frames]
    legs = {L_FOOT: (L_UPLEG, bone('leftleg')), R_FOOT: (R_UPLEG, bone('rightleg'))}
    for sg in st['segments']:
        up, leg = legs[sg['foot']]
        n_pts = len(sg['pts'])
        for k, (i, t) in enumerate(sg['pts']):
            w = min(1.0, (k + 1) / (fade + 1), (n_pts - k) / (fade + 1))
            tgt2 = sg['p'] + st['v'] * (t - sg['tm'])
            a = out[i][sg['foot']].translation
            target = Vector((a.x + w * (tgt2.x - a.x), a.y + w * (tgt2.y - a.y), a.z))
            leg_ik_matrix(out[i], up, leg, sg['foot'], target)
    return out


def limit_lean(frames, max_deg):
    """Giới hạn độ cúi của thân (góc giữa hông→cổ và phương đứng): quá `max_deg` thì xoay cả nhánh từ Spine quanh đầu Spine để ngẩng
    bớt. Cúi gập 90° làm vỏ kiếm đeo lưng (gắn xương ngực spine2) chĩa ngang qua đầu; giữ dưới ngưỡng thì kiếm nằm sát lưng."""
    neck = bone('neck')
    out = []
    for M in frames:
        u = M[neck].translation - M[HIPS].translation
        ang = math.degrees(u.angle(Z))
        if ang > max_deg:
            axis = u.cross(Z)
            if axis.length > 1e-6:
                R = rot_pivot(Quaternion(axis.normalized(), math.radians(ang - max_deg)), M[SPINE].translation.copy())
                M = dict(M)
                for k in subtree(SPINE):
                    M[k] = R @ M[k]
        out.append(M)
    return out


def measure(frames, rest_frame):
    """Lệch hướng so với tư thế nghỉ ở khung đầu/giữa/cuối, độ khép vòng, tốc độ chân trụ."""
    ref_p = axis_yaw(rest_frame, L_UPLEG, R_UPLEG)
    ref_s = axis_yaw(rest_frame, L_ARM, R_ARM)

    def yaw_of(M):
        return wrap(axis_yaw(M, L_UPLEG, R_UPLEG) - ref_p), wrap(axis_yaw(M, L_ARM, R_ARM) - ref_s)

    n = len(frames) - 1
    heads = [yaw_of(frames[i]) for i in (0, n // 2, n)]
    closure = sum((frames[0][k].translation - frames[n][k].translation - (frames[0][HIPS].translation - frames[n][HIPS].translation)).length for k in NAMES) / len(NAMES)
    # Chân trụ: khung có bàn chân thấp (cách đáy ≤ 4 cm so với thấp nhất cả clip); tốc độ ngang trung vị.
    out = {'frames': n + 1, 'seconds': round(n / FPS, 3), 'yawPelvis0': round(heads[0][0], 1), 'yawShoulder0': round(heads[0][1], 1),
           'yawPelvisMid': round(heads[1][0], 1), 'yawPelvisEnd': round(heads[2][0], 1), 'loopGap': round(closure, 4)}
    st = stance_info(frames)
    if st:
        out['refSpeed'] = round(st['v'].length, 3)  # m/s ở 1×: tốc độ nền khiến chân trụ đứng yên
        out['refDir'] = round(math.degrees(math.atan2(-st['v'].y, -st['v'].x)), 1)  # hướng thân di chuyển (độ, 0 = +X trái)
        out['slipM'] = round(st['slip'], 3)  # xê dịch tối đa của cổ chân khỏi đường thẳng đều trong pha trụ (m)
        out['stanceSegments'] = len(st['segments'])
    hz = [M[HIPS].translation.z for M in frames]
    out['hipsZ'] = [round(min(hz), 3), round(max(hz), 3)]
    out['hipsCurve'] = [round(hz[i], 2) for i in range(0, len(hz), 6)]  # mỗi 0,2 s, để chọn đoạn cắt
    return out


def activity(frames):
    """Mức chuyển động mỗi khung (m): tổng dịch chuyển đầu xương so với hông giữa hai khung liền nhau."""
    out = [0.0]
    for i in range(1, len(frames)):
        a, b = frames[i - 1], frames[i]
        out.append(sum(((b[k].translation - b[HIPS].translation) - (a[k].translation - a[HIPS].translation)).length
                       + abs((b[HIPS].translation.z - a[HIPS].translation.z)) for k in NAMES))
    return out


def active_window(frames, lead, tail, frac=0.06):
    """Khoảng khung có chuyển động thật (mức > frac × đỉnh đã làm mượt), nới `lead`/`tail` giây hai đầu."""
    act = activity(frames)
    sm = [sum(act[max(0, i - 2):i + 3]) / len(act[max(0, i - 2):i + 3]) for i in range(len(act))]
    thr = frac * max(sm)
    idx = [i for i, v in enumerate(sm) if v > thr]
    a = max(0, idx[0] - int(lead * FPS))
    b = min(len(frames) - 1, idx[-1] + int(tail * FPS))
    return a, b


# ---------- chạy ----------

def action_of(name):
    a = bpy.data.actions.get(name)
    if not a:
        fail(f'k3: không có clip {name}')  # noqa: F821
    return a


idle_frames = sample(action_of('idle'))
REST_FRAME = {n: REST[n].copy() for n in NAMES}
ANCHOR = (idle_frames[0][HIPS].translation.x, idle_frames[0][HIPS].translation.y)
CACHE = {}


def frames_of(name):
    if name not in CACHE:
        CACHE[name] = sample(action_of(name))
    return CACHE[name]


def put(name, frames, loop):
    CACHE[name] = frames
    replace_clip(name, frames, loop)


MEASURE = {}
for spec in K3.get('fix', []):
    name = spec['name']
    fr = frames_of(name)
    m = measure(fr, REST_FRAME)
    yaw = spec.get('yaw')
    if yaw is None:
        yaw = -m['yawPelvis0'] if abs(m['yawPelvis0']) > YAW_TOL and abs(m['yawShoulder0']) > YAW_TOL else 0.0
    if yaw:
        fr = yaw_frames(fr, lambda i, n, y=yaw: y)
    if spec.get('pin', True):
        fr = pin_frames(fr, ANCHOR)
    if spec.get('lean'):
        fr = limit_lean(fr, spec['lean'])
    if spec.get('lock'):
        m['slipBefore'] = round((stance_info(fr) or {'slip': 0})['slip'], 3)
        fr = foot_lock(fr)
    if spec.get('slice'):
        a, b = spec['slice']
        fr = fr[int(round(a * FPS)):int(round(b * FPS)) + 1]
    elif spec.get('trim') is not None:
        lead, tail = spec['trim']
        a, b = active_window(fr, lead, tail, spec.get('frac', 0.06))
        m['window'] = [round(a / FPS, 2), round(b / FPS, 2)]
        fr = fr[a:b + 1]
    put(name, fr, spec.get('loop', False))
    final = measure(fr, REST_FRAME)
    final['raw'] = {k: m[k] for k in ('seconds', 'yawPelvis0', 'yawShoulder0', 'slipBefore', 'window') if k in m}
    final['yawFixed'] = round(yaw, 1)
    MEASURE[name] = final


def smooth(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


for spec in K3.get('derive', []):
    name, op = spec['name'], spec['op']
    src = frames_of(spec['from'])
    loop = spec.get('loop', False)
    if op == 'mirror':
        fr = mirror_frames(src)
    elif op == 'reverse':
        fr = reverse_frames(src)
    elif op == 'strafe':
        deg = spec['yaw']
        fr = twist_upper(yaw_frames(src, lambda i, n: deg), -deg, tuple(spec.get('split', (1 / 3, 1 / 3, 1 / 3))))
    elif op == 'sideroll':
        deg = spec['yaw']
        fr = yaw_frames(src, lambda i, n: deg * math.sin(math.pi * i / max(n, 1)) ** 2)
    elif op == 'layer':
        up = frames_of(spec['upper'])
        if spec.get('pingpong'):
            up = pingpong_frames(up)
        up = fit_frames(up, len(src) - 1)
        fr = layer_frames(src, up)
    elif op == 'getup':
        low = frames_of(spec['from'])
        via = frames_of(spec['via'])
        # Khung ngồi xổm của clip lăn: sau đáy lăn (hông thấp nhất), khung đầu tiên hông ≥ ngưỡng.
        zs = [M[HIPS].translation.z for M in via]
        lo = zs.index(min(zs))
        ci = next(i for i in range(lo, len(via)) if zs[i] >= spec.get('crouchZ', 0.5))
        fr = getup_frames(low[-1], via[ci], frames_of(spec['to'])[0], spec['t1'], spec['t2'])
    elif op == 'slice':
        a, b = spec['range']
        fr = src[int(round(a * FPS)):int(round(b * FPS)) + 1]
    elif op == 'speed':
        k = spec['k']
        n = int((len(src) - 1) / k)
        fr = [src[min(int(round(i * k)), len(src) - 1)] for i in range(n + 1)]
    else:
        fail(f'k3: op {op}?')  # noqa: F821
    if spec.get('pin', True):
        fr = pin_frames(fr, ANCHOR)
    put(name, fr, loop)
    MEASURE[name] = measure(fr, REST_FRAME)

for name in K3.get('drop', []):
    act = bpy.data.actions.get(name)
    if act:
        for t in list(arm.animation_data.nla_tracks):  # noqa: F821
            if any(s.action == act for s in t.strips):
                arm.animation_data.nla_tracks.remove(t)  # noqa: F821
        bpy.data.actions.remove(act)

# Đo clip còn lại chưa qua fix/derive (clip gốc và thủ tục) để bảng đủ cả thư viện.
for act in bpy.data.actions:
    if act.name not in MEASURE:
        MEASURE[act.name] = measure(frames_of(act.name), REST_FRAME)

arm.animation_data.use_nla = NLA_ON  # noqa: F821
for p in pb:
    p.rotation_quaternion = (1, 0, 0, 0)
    p.location = (0, 0, 0)
out_path = os.path.join(REPO, K3.get('report', 'docs/k3-anim/clips.json'))  # noqa: F821
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as fh:
    json.dump(dict(sorted(MEASURE.items())), fh, ensure_ascii=False, indent=1)
print(f'[anim_human_k3] {len(MEASURE)} clip, đo ghi {out_path}')
