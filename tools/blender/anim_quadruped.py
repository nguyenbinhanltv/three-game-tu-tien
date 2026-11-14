# Clip thủ tục cho quái bốn chân dùng rig Tripo (quadruped: sói 28 xương, boss 33 xương), chạy như bước `import.post`
# của import_tripo.py. Rig 33 xương còn được sửa trọng số chéo chân (mục 1b) và có thể thêm clip boss (mục 4, import.extra).
#
# Không chạy riêng: import_tripo.py gọi file này sau khi chuẩn hóa (mét, gốc ở đáy, mặt trước +Z glTF = -Y Blender,
# bên trái con vật = +X), trước khi xuất. Biến toàn cục nhận từ import_tripo: ASSET_ID, META, ARMATURES, MESHES, fail.
#
# 1. Đổi tên xương Tripo sang tên dễ đọc, xác định trái/phải theo vị trí thật (+X là trái) vì Tripo đặt tên chân sau
#    ngược với chân trước: spine_0..2, neck, head, shoulder_l/r, leg_f{l,r}_0..2, leg_h{l,r}_0..3, tail_0..3, hip_aux_*.
# 2. Thêm 5 clip (30 khung/giây), mỗi clip đặt khóa cho mọi xương:
#      idle      2,4 s lặp   thở, nhìn quanh, vẫy đuôi
#      run       0,6 s lặp   phi nước đại (gallop xoay vòng), lưng uốn, nhún, tại chỗ
#      attack    0,8 s       thu người → lao tới → đớp bằng đầu/cổ (rig không có xương hàm) → về chỗ cũ
#      hit_light 0,4 s       giật lùi, ngửa đầu, cụp đuôi
#      death     1,4 s       khuỵu chân trước, đổ nghiêng sang phải, nằm yên ở khung cuối
#    Góc tính quanh trục thế giới rồi đổi sang trục cục bộ của từng xương (q = M⁻¹·R·M với M là hướng nghỉ của xương),
#    nên không phụ thuộc trục xương Tripo. Không có ngẫu nhiên: cùng đầu vào cho cùng clip.

import math

import bpy
from mathutils import Matrix, Vector

FPS = 30
X = Vector((1, 0, 0))  # trục ngang: xoay +θ quanh X làm mõm chúi xuống, chân đá ra sau
Y = Vector((0, 1, 0))  # trục dọc thân (đầu ở -Y)
Z = Vector((0, 0, 1))  # trục đứng

if len(ARMATURES) != 1:  # noqa: F821 (biến do import_tripo truyền vào)
    fail(f'anim_quadruped cần đúng 1 armature, có {len(ARMATURES)}')  # noqa: F821
arm = ARMATURES[0]  # noqa: F821
bones = arm.data.bones


# ---------- 1. đổi tên ----------

def need(name):
    if name not in bones:
        fail(f'anim_quadruped: rig không có xương "{name}" (không phải rig quadruped Tripo 28 xương?)')  # noqa: F821
    return bones[name]


def head_x(name):
    return need(name).head_local.x


def chain(prefix, n):
    return [f'{prefix}_{i}' for i in range(n)]


def limb_len(prefix):
    n = 0
    while f'{prefix}_{n}' in bones:
        n += 1
    return n


# Tên sau rename_all của import_tripo ("tripo::Spine_0" → "tripo_spine_0").
# Hai kiểu rig quadruped Tripo đã gặp:
#   sói (28 xương): không có xương gốc, cổ là bone_4, vai trái/phải là tripo_spine_3 / bone_10, đuôi bone_14..16 + tail_0;
#   boss (33 xương, M3-8): có xương gốc tripo_root, vai bone_x là con của spine_2, cổ spine_3..4, đầu head_0..2 (mõm,
#   không có hàm), chân trước 4 đốt, đuôi bone_x + tail_0..3. Kiểu boss dò theo cấu trúc cây, không theo số bone_x.
WOLF28 = 'bone_10' in bones and 'tripo_root' not in bones
FRONT_N = 3 if WOLF28 else limb_len('tripo_0_left_limb')
front_a, front_b = chain('tripo_0_right_limb', FRONT_N), chain('tripo_0_left_limb', FRONT_N)
hind_a = chain('tripo_1_right_limb', 4 if WOLF28 else limb_len('tripo_1_right_limb'))
hind_b = chain('tripo_1_left_limb', 4 if WOLF28 else limb_len('tripo_1_left_limb'))
if min(len(front_a), len(hind_a), len(hind_b)) < 3:
    fail('anim_quadruped: thiếu chuỗi xương chân tripo_{0,1}_{left,right}_limb_*')  # noqa: F821
front_l, front_r = (front_a, front_b) if head_x(front_a[1]) > head_x(front_b[1]) else (front_b, front_a)
hind_l, hind_r = (hind_a, hind_b) if head_x(hind_a[1]) > head_x(hind_b[1]) else (hind_b, hind_a)
if abs(head_x(front_a[1]) - head_x(front_b[1])) < 1e-4 or abs(head_x(hind_a[1]) - head_x(hind_b[1])) < 1e-4:
    fail('anim_quadruped: không phân biệt được chân trái/phải theo X')  # noqa: F821
if WOLF28:
    shoulder_of = {front_a[0]: 'tripo_spine_3', front_b[0]: 'bone_10'}
else:
    shoulder_of = {f[0]: need(f[0]).parent.name for f in (front_a, front_b) if need(f[0]).parent}
    if len(shoulder_of) != 2 or any(need(s).parent is None or need(s).parent.name != 'tripo_spine_2' for s in shoulder_of.values()):
        fail('anim_quadruped: vai (cha của chân trước) phải là con của tripo_spine_2')  # noqa: F821
for limb, sh in shoulder_of.items():
    if need(limb).parent is None or need(limb).parent.name != sh:
        fail(f'anim_quadruped: {limb} không phải con của {sh} (cây xương Tripo khác dự kiến)')  # noqa: F821

if WOLF28:
    RENAME = {
        'tripo_spine_0': 'spine_0', 'tripo_spine_1': 'spine_1', 'tripo_spine_2': 'spine_2',
        'bone_4': 'neck', 'tripo_head_0': 'head',
        shoulder_of[front_l[0]]: 'shoulder_l', shoulder_of[front_r[0]]: 'shoulder_r',
        'bone_14': 'tail_0', 'bone_15': 'tail_1', 'bone_16': 'tail_2', 'tripo_tail_0': 'tail_3',
        'bone_26': 'hip_aux_0', 'bone_27': 'hip_aux_1', 'bone_28': 'hip_aux_2',
    }
else:
    RENAME = {
        'tripo_root': 'root', 'tripo_spine_0': 'spine_0', 'tripo_spine_1': 'spine_1', 'tripo_spine_2': 'spine_2',
        'tripo_spine_3': 'neck', 'tripo_spine_4': 'neck_1',
        shoulder_of[front_l[0]]: 'shoulder_l', shoulder_of[front_r[0]]: 'shoulder_r',
    }
    for i in range(limb_len('tripo_head')):
        RENAME[f'tripo_head_{i}'] = 'head' if i == 0 else f'head_{i}'
    # Đuôi: từ tripo_tail_0 đi ngược lên tới con trực tiếp của gốc (bone_x nối đuôi với gốc), rồi xuôi xuống.
    tail = []
    b = need('tripo_tail_0').parent
    while b is not None and b.parent is not None:
        tail.insert(0, b.name)
        b = b.parent
    tail += chain('tripo_tail', limb_len('tripo_tail'))
    for i, name in enumerate(tail):
        RENAME[name] = f'tail_{i}'
for i, b in enumerate(front_l):
    RENAME[b] = f'leg_fl_{i}'
for i, b in enumerate(front_r):
    RENAME[b] = f'leg_fr_{i}'
for i, b in enumerate(hind_l):
    RENAME[b] = f'leg_hl_{i}'
for i, b in enumerate(hind_r):
    RENAME[b] = f'leg_hr_{i}'
for old in RENAME:
    need(old)
for old, new in RENAME.items():
    bones[old].name = new  # Blender đổi luôn tên vertex group của mesh gắn armature
if head_x('leg_fl_1') <= 0 or head_x('leg_hl_1') <= 0:
    fail('anim_quadruped: chân trái phải nằm ở +X sau chuẩn hóa (kiểm import.yaw)')  # noqa: F821

# ---------- 1b. sửa trọng số chéo chân (rig boss) ----------
# Auto-rig Tripo (rig 33 xương) gán một phần đỉnh bàn chân trước cho xương chân sau cùng bên (và ngược lại): khi một
# chân gập, các đỉnh đó bị kéo thành gai dài. Bỏ trọng số của xương chân/đuôi mà đoạn xương (tư thế nghỉ) cách đỉnh xa
# hơn REACH_W, rồi chuẩn hóa lại tổng trọng số. Đỉnh mất hết trọng số thì giữ nguyên. Rig sói đã dùng trong game không đổi.

def segment_dist(p, a, b):
    ab = b - a
    t = 0.0 if ab.length_squared < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


weights_fixed = 0
if not WOLF28:
    _lo = Vector((1e9,) * 3)
    _hi = Vector((-1e9,) * 3)
    for m in MESHES:  # noqa: F821
        for v in m.data.vertices:
            w = m.matrix_world @ v.co
            _lo = Vector(map(min, _lo, w))
            _hi = Vector(map(max, _hi, w))
    REACH_W = 0.2 * (_hi.y - _lo.y)
    SEG = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local)
           for b in bones if b.name.startswith(('leg_', 'tail_'))}
    for m in MESHES:  # noqa: F821
        names = {g.index: g.name for g in m.vertex_groups}
        for v in m.data.vertices:
            p = m.matrix_world @ v.co
            far = [g for g in v.groups if names[g.group] in SEG and g.weight > 0 and segment_dist(p, *SEG[names[g.group]]) > REACH_W]
            if not far or len(far) == len([g for g in v.groups if g.weight > 0]):
                continue
            for g in far:
                m.vertex_groups[g.group].remove([v.index])
            total = sum(g.weight for g in v.groups)
            if total > 0:
                for g in v.groups:
                    g.weight /= total
            weights_fixed += 1

# ---------- 2. công cụ đặt dáng ----------

pb = arm.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'
REST = {p.name: p.bone.matrix_local.to_3x3() for p in pb}
NAMES = sorted(p.name for p in pb)

# Kích thước để tính độ lún khi nằm và quãng lao.
lo = Vector((1e9,) * 3)
hi = Vector((-1e9,) * 3)
for m in MESHES:  # noqa: F821
    for v in m.data.vertices:
        w = m.matrix_world @ v.co
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
WIDTH, HEIGHT, LENGTH = hi.x - lo.x, hi.z - lo.z, hi.y - lo.y


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


def set_pose(spec, root_move=(0.0, 0.0, 0.0), root_rot=None, pitch=0.0):
    """spec: {xương: [(trục, độ), ...]} xoay quanh trục thế giới (tính ở tư thế nghỉ, áp theo thứ tự). Thiếu = nghỉ.
    Rig Tripo không có xương gốc (gốc là object armature, nhiều xương không cha), nên chuyển động cả thân
    (root_move, root_rot quanh gốc tọa độ ở mặt đất) được áp như nhau lên mọi xương không cha.
    pitch: chúi cả thân quanh trục ngang X (độ, âm = chồm lên), áp sau root_rot; 0 thì không đổi phép tính."""
    R0 = rot(*root_rot) if root_rot else Matrix.Identity(3)
    if pitch:
        R0 = rot(X, pitch) @ R0
    T0 = Vector(root_move)
    for p in pb:
        p.location = (0, 0, 0)
        p.scale = (1, 1, 1)
        R = Matrix.Identity(3)
        for axis, deg in spec.get(p.name, []):
            R = rot(axis, deg) @ R
        M = REST[p.name]
        if p.parent is None:
            h = p.bone.head_local
            R = R0 @ R
            p.location = M.inverted() @ ((R0 @ h + T0) - h)
        p.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()


def key_all(frame):
    for p in pb:
        p.keyframe_insert('rotation_quaternion', frame=frame)
        p.keyframe_insert('location', frame=frame)


def new_clip(name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    return act


def finish_clip(act, frames):
    act.frame_range = (0, frames)
    track = arm.animation_data.nla_tracks.new()
    track.name = act.name
    track.strips.new(act.name, 0, act)
    arm.animation_data.action = None


def ground_min():
    """Đáy thấp nhất (Z thế giới) của lưới đã skin theo dáng hiện tại."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    low = 1e9
    for m in MESHES:  # noqa: F821
        ev = m.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ev.matrix_world
        low = min(low, min((mw @ v.co).z for v in me.vertices))
        ev.to_mesh_clear()
    return low


def grounded(spec, move=(0.0, 0.0, 0.0), rr=None, pitch=0.0):
    """Đặt dáng rồi nâng cả thân nếu có phần lún dưới mặt đất (Y = 0 glTF), để chân và thân không xuyên đất."""
    set_pose(spec, move, rr, pitch)
    low = ground_min()
    if low < 0:
        set_pose(spec, (move[0], move[1], move[2] - low), rr, pitch)


def sampled(name, seconds, pose_at, step=2):
    """Clip lặp: lấy mẫu pose_at(t), t ∈ [0, 1], khung đầu và cuối trùng nhau."""
    act = new_clip(name)
    n = round(seconds * FPS)
    for f in list(range(0, n, step)) + [n]:
        grounded(*pose_at((f % n) / n))
        key_all(f)
    finish_clip(act, n)
    return n


def as_table(spec):
    return {(b, tuple(ax)): deg for b, lst in spec.items() for ax, deg in lst}


def blend(ka, kb, w):
    ta, tb = as_table(ka[1]), as_table(kb[1])
    spec = {}
    for key in sorted(set(ta) | set(tb)):
        spec.setdefault(key[0], []).append((Vector(key[1]), ta.get(key, 0.0) * (1 - w) + tb.get(key, 0.0) * w))
    move = tuple(a * (1 - w) + b * w for a, b in zip(ka[2], kb[2]))
    ra = ka[3][1] if ka[3] else 0.0
    rb = kb[3][1] if kb[3] else 0.0
    pa = ka[4] if len(ka) > 4 else 0.0
    pb_ = kb[4] if len(kb) > 4 else 0.0
    return spec, move, (Y, ra * (1 - w) + rb * w), pa * (1 - w) + pb_ * w


def keyed(name, seconds, keys, settle=None):
    """Clip một lần: keys = [(t ∈ [0, 1], spec, root_move, root_rot quanh Y | None[, pitch])]. Nội suy smoothstep giữa các
    khóa, đặt khóa từng khung (để dò lún đất từng khung). settle(t, dáng) → (dx, dy) chỉnh thêm vị trí ngang."""
    act = new_clip(name)
    n = round(seconds * FPS)
    for f in range(n + 1):
        t = f / n
        i = max(k for k in range(len(keys)) if keys[k][0] <= t + 1e-9)
        j = min(i + 1, len(keys) - 1)
        span = keys[j][0] - keys[i][0]
        u = 0.0 if span <= 0 else (t - keys[i][0]) / span
        spec, move, rr, pitch = blend(keys[i], keys[j], u * u * (3 - 2 * u))
        if settle:
            dx, dy = settle(rr[1])
            move = (move[0] + dx, move[1] + dy, move[2])
        grounded(spec, move, rr, pitch)
        key_all(f)
    finish_clip(act, n)
    return n


S = math.sin
TAU = 2 * math.pi
TAIL = [f'tail_{i}' for i in range(4 if WOLF28 else limb_len('tail'))]


def merge(*specs):
    out = {}
    for s in specs:
        for k, v in s.items():
            out.setdefault(k, []).extend(v)
    return out


# ---------- 3. clip ----------

def idle(t):
    a = TAU * t
    spec = {
        'spine_1': [(X, 1.5 * S(a))], 'spine_2': [(X, -1.5 * S(a))],
        'neck': [(Z, 7 * S(a)), (X, 2 * S(2 * a))], 'head': [(Z, 4 * S(a - 0.6)), (X, -2 * S(2 * a))],
    }
    for i, b in enumerate(TAIL):
        spec[b] = [(X, -3), (Z, (6 + 3 * i) * S(a - 0.5 * i))]
    return spec, (0, 0, 0.004 * HEIGHT * S(2 * a)), None


def gallop_leg(t, phase, upper, lower, amp, flex, flex_sign):
    a = TAU * (t + phase)
    out = {upper: [(X, -amp * S(a))]}  # dương = đá ra trước
    lift = max(0.0, math.cos(a))  # chân đang vung ra trước thì gập để nhấc bàn
    out[lower] = [(X, flex_sign * flex * lift)]
    return out


def run(t):
    a = TAU * t
    spec = merge(
        gallop_leg(t, 0.00, 'leg_hl_0', 'leg_hl_1', 30, 35, 1), gallop_leg(t, 0.08, 'leg_hr_0', 'leg_hr_1', 30, 35, 1),
        gallop_leg(t, 0.50, 'leg_fl_0', 'leg_fl_1', 34, 55, 1), gallop_leg(t, 0.58, 'leg_fr_0', 'leg_fr_1', 34, 55, 1),
        {
            'leg_hl_2': [(X, -20 * max(0.0, math.cos(a)))], 'leg_hr_2': [(X, -20 * max(0.0, math.cos(a + 0.5)))],
            'spine_0': [(X, 5 * S(a))], 'spine_1': [(X, -6 * S(a))], 'spine_2': [(X, -4 * S(a))],
            'neck': [(X, -8 + 6 * S(a + 1.2))], 'head': [(X, 4 - 5 * S(a + 1.2))],
        },
    )
    for i, b in enumerate(TAIL):
        spec[b] = [(X, 12 + 6 * S(a - 0.7 * i)), (Z, 5 * S(a - 0.7 * i))]
    return spec, (0, 0, 0.035 * HEIGHT * S(2 * a - 0.8)), None


REST_KEY = {}
crouch = {
    'leg_fl_0': [(X, 12)], 'leg_fr_0': [(X, 12)], 'leg_fl_1': [(X, -25)], 'leg_fr_1': [(X, -25)],
    'leg_hl_0': [(X, -18)], 'leg_hr_0': [(X, -18)], 'leg_hl_1': [(X, 30)], 'leg_hr_1': [(X, 30)],
    'spine_1': [(X, 4)], 'neck': [(X, 18)], 'head': [(X, -10)], 'tail_0': [(X, -10)],
}
lunge = {
    'leg_fl_0': [(X, -35)], 'leg_fr_0': [(X, -28)], 'leg_hl_0': [(X, 20)], 'leg_hr_0': [(X, 24)],
    'leg_hl_1': [(X, -10)], 'leg_hr_1': [(X, -10)], 'spine_1': [(X, -5)], 'spine_2': [(X, -4)],
    'neck': [(X, -6)], 'head': [(X, -18)], 'tail_0': [(X, 15)], 'tail_1': [(X, 8)],
}
bite = merge(lunge, {'neck': [(X, 14)], 'head': [(X, 40)]})
REACH = 0.18 * LENGTH

hit = {
    'neck': [(X, -16), (Z, 6)], 'head': [(X, -12)], 'spine_1': [(X, 5)], 'spine_2': [(X, 3)],
    'leg_fl_0': [(X, 8)], 'leg_fr_0': [(X, 10)], 'leg_hl_1': [(X, 12)], 'leg_hr_1': [(X, 12)],
    'tail_0': [(X, -25)], 'tail_1': [(X, -15)], 'tail_2': [(X, -10)],
}

buckle = {
    'leg_fl_0': [(X, 25)], 'leg_fr_0': [(X, 20)], 'leg_fl_1': [(X, -70)], 'leg_fr_1': [(X, -60)],
    'leg_hl_1': [(X, 20)], 'leg_hr_1': [(X, 20)], 'neck': [(X, 25)], 'head': [(X, 10)], 'tail_0': [(X, -15)],
}
limp = {
    'leg_fl_0': [(X, -20)], 'leg_fr_0': [(X, 10)], 'leg_hl_0': [(X, 15)], 'leg_hr_0': [(X, -10)],
    'leg_fl_1': [(X, -15)], 'leg_hl_1': [(X, 15)], 'neck': [(X, 10), (Y, -10)], 'head': [(X, 5)],
    'tail_0': [(X, -5)], 'tail_1': [(Z, 10)], 'tail_2': [(Z, 10)],
}
LIE = WIDTH * 0.5 * 0.85  # nằm nghiêng: nâng gốc khoảng nửa bề ngang thân để thân không chìm xuống đất

n_idle = sampled('idle', 2.4, idle)
n_run = sampled('run', 0.6, run, step=1)
n_attack = keyed('attack', 0.8, [
    (0.00, REST_KEY, (0, 0, 0), None),
    (0.30, crouch, (0, 0.03 * LENGTH, -0.06 * HEIGHT), None),
    (0.50, lunge, (0, -REACH, 0.02 * HEIGHT), None),
    (0.62, bite, (0, -REACH, 0.0), None),
    (1.00, REST_KEY, (0, 0, 0), None),
])
n_hit = keyed('hit_light', 0.4, [
    (0.00, REST_KEY, (0, 0, 0), None),
    (0.30, hit, (0, 0.05 * LENGTH, -0.02 * HEIGHT), None),
    (1.00, REST_KEY, (0, 0, 0), None),
])
# Lệch ngang của thân khi nằm hẳn (đo ở dáng cuối) → bù dần theo góc đổ để xác nằm đúng chỗ đứng.
grounded(limp, (0, 0, LIE), (Y, -88))
bpy.context.view_layer.update()
_dg = bpy.context.evaluated_depsgraph_get()
_xs = [(m.evaluated_get(_dg).matrix_world @ v.co).x for m in MESHES for v in m.evaluated_get(_dg).to_mesh().vertices]  # noqa: F821
DEATH_DX = -(min(_xs) + max(_xs)) / 2
n_death = keyed('death', 1.4, [
    (0.00, REST_KEY, (0, 0, 0), None),
    (0.25, buckle, (0, 0, -0.15 * HEIGHT), (Y, -10)),
    (0.55, merge(buckle, {'neck': [(X, 10)]}), (0, 0, -0.08 * HEIGHT + 0.4 * LIE), (Y, -55)),
    (0.85, limp, (0, 0, LIE), (Y, -88)),
    (1.00, limp, (0, 0, LIE), (Y, -88)),
], settle=lambda roll: (DEATH_DX * min(1.0, abs(roll) / 88), 0.0))

# ---------- 4. clip boss (tùy chọn, import.extra) ----------
# Đòn lớn đọc được từ xa: client (monsterSkins.ts, BOSS_MOVES) phát clip sao cho khung chạm đất (IMPACT) rơi đúng lúc vùng
# báo trước của server nổ. Đổi thời điểm ở đây thì sửa cùng IMPACT phía client.
#   slam   1,8 s  thu người → chồm đứng hai chân sau → nện hai chân trước xuống (chạm đất 1,0 s) → giữ → về chỗ cũ
#   sweep  1,7 s  ngửa cổ lấy đà → hạ đầu sát đất và quét đầu từ phải sang trái theo hình quạt (giữa quạt ở 0,9 s)
#   stun   1,6 s lặp  quỵ chân trước, đầu gục, lắc lư (bị ngắt chú hoặc mất thế)
EXTRA = list((META.get('import') or {}).get('extra', []))  # noqa: F821
extra_clips = {}
for name in EXTRA:
    if name not in ('slam', 'sweep', 'stun'):
        fail(f'anim_quadruped: import.extra "{name}" chưa hỗ trợ cho thú bốn chân (slam | sweep | stun)')  # noqa: F821

if 'slam' in EXTRA:
    rear = {
        'leg_fl_0': [(X, -55)], 'leg_fr_0': [(X, -48)], 'leg_fl_1': [(X, 70)], 'leg_fr_1': [(X, 64)],
        'leg_hl_0': [(X, 18)], 'leg_hr_0': [(X, 18)], 'leg_hl_1': [(X, -12)], 'leg_hr_1': [(X, -12)],
        'spine_1': [(X, -4)], 'neck': [(X, -18)], 'head': [(X, -12)], 'tail_0': [(X, 20)], 'tail_1': [(X, 10)],
    }
    stomp = {
        'leg_fl_0': [(X, -22)], 'leg_fr_0': [(X, -18)], 'leg_fl_1': [(X, 6)], 'leg_fr_1': [(X, 6)],
        'leg_hl_0': [(X, -16)], 'leg_hr_0': [(X, -16)], 'leg_hl_1': [(X, 26)], 'leg_hr_1': [(X, 26)],
        'spine_1': [(X, 5)], 'neck': [(X, 26)], 'head': [(X, 14)], 'tail_0': [(X, -12)],
    }
    extra_clips['slam'] = keyed('slam', 1.8, [
        (0.00, REST_KEY, (0, 0, 0), None, 0.0),
        (0.22, crouch, (0, 0.04 * LENGTH, -0.05 * HEIGHT), None, 0.0),
        (0.47, rear, (0, 0.08 * LENGTH, 0.0), None, -38.0),
        (0.53, rear, (0, 0.06 * LENGTH, 0.0), None, -40.0),
        (0.556, stomp, (0, -0.10 * LENGTH, -0.06 * HEIGHT), None, 8.0),
        (0.75, stomp, (0, -0.10 * LENGTH, -0.06 * HEIGHT), None, 6.0),
        (1.00, REST_KEY, (0, 0, 0), None, 0.0),
    ])

if 'sweep' in EXTRA:
    draw = merge(crouch, {'neck': [(X, -34), (Z, 26)], 'head': [(X, -14)], 'tail_0': [(X, 14)]})
    sweep_r = merge(lunge, {'neck': [(X, 16), (Z, 30)], 'head': [(X, 10), (Z, 10)]})
    sweep_l = merge(lunge, {'neck': [(X, 16), (Z, -30)], 'head': [(X, 10), (Z, -10)]})
    extra_clips['sweep'] = keyed('sweep', 1.7, [
        (0.00, REST_KEY, (0, 0, 0), None),
        (0.30, draw, (0, 0.06 * LENGTH, -0.05 * HEIGHT), None),
        (0.42, sweep_r, (0, -0.08 * LENGTH, 0.0), None),
        (0.64, sweep_l, (0, -0.08 * LENGTH, 0.0), None),
        (0.76, sweep_l, (0, -0.08 * LENGTH, 0.0), None),
        (1.00, REST_KEY, (0, 0, 0), None),
    ])

if 'stun' in EXTRA:
    def stun(t):
        a = TAU * t
        spec = merge(buckle, {
            'neck': [(X, 28), (Z, 8 * S(a))], 'head': [(X, 14), (Z, 5 * S(a - 0.5))], 'spine_1': [(Z, 3 * S(a))],
        })
        for i, b in enumerate(TAIL):
            spec.setdefault(b, []).extend([(X, -12), (Z, 4 * S(a - 0.4 * i))])
        return spec, (0, 0, -0.15 * HEIGHT + 0.01 * HEIGHT * S(2 * a)), (Y, 4 * S(a))
    extra_clips['stun'] = sampled('stun', 1.6, stun)

set_pose({})
bpy.context.scene.render.fps = FPS
REPORT = {
    'renamed': len(RENAME),
    'weightsFixed': weights_fixed,
    'clips': {'idle': n_idle, 'run': n_run, 'attack': n_attack, 'hit_light': n_hit, 'death': n_death, **extra_clips},
    'size': [round(WIDTH, 3), round(HEIGHT, 3), round(LENGTH, 3)],
    'deathDx': round(DEATH_DX, 3),
}
print(f'[anim_quadruped] {ASSET_ID}: {REPORT}')  # noqa: F821
