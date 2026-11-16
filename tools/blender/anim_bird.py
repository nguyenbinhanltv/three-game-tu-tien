# Clip thủ tục cho quái chim/hạc có cánh dùng rig Tripo (tinh anh Tuyết Vũ Vân Hạc Vương), chạy như bước `import.post` của
# import_tripo.py. Cùng hệ chuẩn với anim_quadruped.py: mét, gốc ở đáy, mặt trước = +Z glTF = -Y Blender, trái = +X.
#
# Rig Tripo của chim lộn xộn (xương tên bone_N, cánh là hai chuỗi 5 xương mọc từ xương gốc, đầu 2 xương). Không tin tên:
#   cánh   hai chuỗi xương dài nhất mọc ngang (|x| ở mút lớn nhất), một chuỗi mỗi bên → wing_l_<i>, wing_r_<i>
#   đầu    chuỗi lá còn lại nằm xa nhất về phía -Y → neck, head (xương có tên "head" hoặc xương cuối)
#   đuôi   chuỗi lá còn lại xa nhất về phía +Y → tail_<i>
# Xương còn lại đi theo cha (không có khóa). Thêm 5 clip (30 khung/giây), mỗi khóa là góc quay quanh trục thế giới đổi sang
# trục cục bộ của xương (q = M⁻¹·R·M), nên không phụ thuộc trục xương Tripo:
#   idle       1,4 s lặp   lơ lửng: vỗ cánh chậm, thân nhún, đầu xoay nhẹ
#   run        0,7 s lặp   bay tới: vỗ nhanh biên độ lớn, chúi nhẹ
#   attack     0,9 s       vỗ lùi, ngửa đầu → lao xuống chúi đầu (chạm 0,4 s) → về
#   hit_light  0,4 s       giật lùi, cánh co
#   death      1,6 s       cánh co, lật nghiêng rơi xuống đất, nằm yên
# Cánh lên xuống theo trục dọc thân (Y): cánh trái (+X) lên là quay -θ quanh Y, cánh phải ngược lại.

import math

import bpy
from mathutils import Matrix, Vector

FPS = 30
X = Vector((1, 0, 0))
Y = Vector((0, 1, 0))
Z = Vector((0, 0, 1))
S = math.sin
TAU = 2 * math.pi

if len(ARMATURES) != 1:  # noqa: F821
    fail(f'anim_bird cần đúng 1 armature, có {len(ARMATURES)}')  # noqa: F821
arm = ARMATURES[0]  # noqa: F821
bones = arm.data.bones
report = {"clips": {}}
bpy.context.scene.render.fps = FPS


def chain_from(b):
    c = [b]
    while len(c[-1].children) == 1:
        c.append(c[-1].children[0])
    return c


# ---------- 1. phân vai theo hình học ----------

chains, stack = [], [b for b in bones if b.parent is None]
while stack:
    b = stack.pop()
    c = chain_from(b)
    chains.append(c)
    stack.extend(c[-1].children)
top = max(b.head_local.z for b in bones)
lat = lambda c: abs(c[-1].tail_local.x)
wing_l = max((c for c in chains if c[-1].tail_local.x > 0 and len(c) >= 3), key=lat, default=None)
wing_r = max((c for c in chains if c[-1].tail_local.x < 0 and len(c) >= 3), key=lat, default=None)
if not wing_l or not wing_r:
    fail('anim_bird: không tìm thấy hai chuỗi cánh (kiểm import.yaw)')  # noqa: F821
rest = [c for c in chains if c is not wing_l and c is not wing_r and not c[-1].children and c[0].parent is not None]
if not rest:
    fail('anim_bird: không còn chuỗi đầu/đuôi')  # noqa: F821
head_chain = min(rest, key=lambda c: c[-1].tail_local.y)
tail_cands = [c for c in rest if c is not head_chain and c[-1].tail_local.y > c[0].head_local.y]
tail_chain = max(tail_cands, key=lambda c: c[-1].tail_local.y) if tail_cands else None
RENAME = {}
for tag, c in (('l', wing_l), ('r', wing_r)):
    for i, b in enumerate(c):
        RENAME[b.name] = f'wing_{tag}_{i}'
hi = next((i for i, b in enumerate(head_chain) if 'head' in b.name.lower()), len(head_chain) - 1)
RENAME[head_chain[hi].name] = 'head'
if hi > 0:
    RENAME[head_chain[hi - 1].name] = 'neck'
if tail_chain:
    for i, b in enumerate(tail_chain):
        RENAME[b.name] = f'tail_{i}'
for old, new in RENAME.items():
    bones[old].name = new
print(f'[anim_bird] vai: {RENAME}')

# ---------- 2. công cụ đặt dáng ----------

pb = arm.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'
REST = {p.name: p.bone.matrix_local.to_3x3() for p in pb}
WING_L = sorted((b.name for b in bones if b.name.startswith('wing_l_')), key=lambda n: int(n[7:]))
WING_R = sorted((b.name for b in bones if b.name.startswith('wing_r_')), key=lambda n: int(n[7:]))
TAIL = sorted((b.name for b in bones if b.name.startswith('tail_')), key=lambda n: int(n[5:]))


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


def set_pose(spec, root_move=(0.0, 0.0, 0.0), root_rot=None):
    """spec: {xương: [(trục, độ), ...]} quay quanh trục thế giới (ở tư thế nghỉ). Xương không cha nhận chung chuyển động cả
    thân (root_move, root_rot quanh gốc tọa độ ở mặt đất)."""
    R0 = rot(*root_rot) if root_rot else Matrix.Identity(3)
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


def merge(*specs):
    out = {}
    for s in specs:
        for k, v in s.items():
            out.setdefault(k, []).extend(v)
    return out


def flap(a, amp, lag=0.55, tilt=0.0, fold=0.0):
    """Hai cánh đối xứng: góc quanh Y theo pha a, mỗi xương sau trễ pha `lag` rad và biên độ nhân 1,25. fold: co cánh
    (độ, + là hạ xuống) cộng cho mọi xương."""
    spec = {}
    for names, sign in ((WING_L, -1.0), (WING_R, 1.0)):
        for i, n in enumerate(names):
            ang = amp * (1 + 0.25 * i) * S(a - lag * i) + tilt + fold * (1 if i else 0.6)
            spec[n] = [(Y, sign * ang * (1 if i == 0 else 0.55))]
    return spec


def sampled(name, seconds, pose_at):
    act = new_clip(name)
    n = round(seconds * FPS)
    for f in range(n + 1):
        set_pose(*pose_at((f % n) / n))
        key_all(f)
    finish_clip(act, n)
    report['clips'][name] = {'seconds': round(n / FPS, 3), 'procedural': True, 'loop': True}


def blend(ka, kb, w):
    def table(spec):
        return {(b, tuple(ax)): d for b, lst in spec.items() for ax, d in lst}
    ta, tb = table(ka[0]), table(kb[0])
    spec = {}
    for key in sorted(set(ta) | set(tb)):
        spec.setdefault(key[0], []).append((Vector(key[1]), ta.get(key, 0.0) * (1 - w) + tb.get(key, 0.0) * w))
    move = tuple(a * (1 - w) + b * w for a, b in zip(ka[1], kb[1]))
    ra = ka[2][1] if ka[2] else 0.0
    rb = kb[2][1] if kb[2] else 0.0
    ax = (ka[2] or kb[2] or (X, 0.0))[0]
    return spec, move, (ax, ra * (1 - w) + rb * w)


def keyed(name, seconds, keys, ground=False):
    """keys = [(t ∈ [0, 1], spec, root_move, root_rot (trục, độ) | None)]. Nội suy smoothstep. ground: nâng thân nếu lún đất."""
    act = new_clip(name)
    n = round(seconds * FPS)
    for f in range(n + 1):
        t = f / n
        i = max(k for k in range(len(keys)) if keys[k][0] <= t + 1e-9)
        j = min(i + 1, len(keys) - 1)
        span = keys[j][0] - keys[i][0]
        u = 0.0 if span <= 0 else (t - keys[i][0]) / span
        spec, move, rr = blend(keys[i][1:], keys[j][1:], u * u * (3 - 2 * u))
        set_pose(spec, move, rr)
        if ground:
            low = ground_min()
            if low < 0:
                set_pose(spec, (move[0], move[1], move[2] - low), rr)
        key_all(f)
    finish_clip(act, n)
    report['clips'][name] = {'seconds': round(n / FPS, 3), 'procedural': True}


# ---------- 3. clip ----------

def tail_spec(a, amp):
    return {n: [(X, amp * S(a - 0.5 * i))] for i, n in enumerate(TAIL)}


def idle(t):
    a = TAU * t
    spec = merge(flap(a, 16), tail_spec(a, 4), {'neck': [(X, 3 * S(a + 1))], 'head': [(Z, 6 * S(a)), (X, -2 * S(2 * a))]})
    return spec, (0, 0, 0.03 * S(a + 0.8)), None


def run(t):
    a = TAU * t
    spec = merge(flap(a, 30, tilt=-4), tail_spec(a, 6), {'neck': [(X, -6)], 'head': [(X, -4)]})
    return spec, (0, 0, 0.05 * S(a + 0.8)), (X, 6)


sampled('idle', 1.4, idle)
sampled('run', 0.7, run)

rest_k = ({}, (0, 0, 0), None)
keyed('attack', 0.9, [
    (0.0, *rest_k),
    (0.3, merge(flap(0, 0, tilt=-30), {'neck': [(X, -25)], 'head': [(X, -18)]}), (0, 0.25, 0.12), (X, -12)),
    (0.45, merge(flap(0, 0, tilt=22), {'neck': [(X, 28)], 'head': [(X, 22)]}), (0, -0.45, -0.1), (X, 24)),
    (0.65, merge(flap(0, 0, tilt=10), {'neck': [(X, 20)], 'head': [(X, 14)]}), (0, -0.4, -0.08), (X, 18)),
    (0.9, *rest_k),
])
keyed('hit_light', 0.4, [
    (0.0, *rest_k),
    (0.12, merge(flap(0, 0, tilt=-24), {'neck': [(X, -14)], 'head': [(X, -18)]}), (0, 0.12, 0.02), (X, -8)),
    (0.4, *rest_k),
])
keyed('death', 1.6, [
    (0.0, *rest_k),
    (0.35, merge(flap(0, 0, tilt=-10), {'neck': [(X, -16)], 'head': [(X, -20)]}), (0, 0.1, 0.1), (X, -10)),
    (1.0, merge(flap(0, 0, tilt=50), {'neck': [(X, 20)], 'head': [(X, 30)]}), (0, 0, -0.6), (Y, 70)),
    (1.6, merge(flap(0, 0, tilt=55), {'neck': [(X, 24)], 'head': [(X, 34)]}), (0, 0, -2.0), (Y, 90)),
], ground=True)
for k in ('idle', 'run', 'attack', 'hit_light', 'death'):
    pass

set_pose({})
REPORT = report
print(f'[anim_bird] {ASSET_ID}: {REPORT}')  # noqa: F821
