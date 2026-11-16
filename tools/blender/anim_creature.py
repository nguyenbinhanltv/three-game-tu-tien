# Clip thủ tục cho quái không phải thú bốn chân/người dùng rig Tripo tự dò (E-0): chim (Vân Hạc), rết (Ngô Công Ấu), côn trùng
# có cánh (Bích Ngọc Kim Thiền). Chạy như bước `import.post` của import_tripo.py, sau chuẩn hóa (mét, gốc ở đáy, mặt trước =
# -Y Blender = +Z glTF, trái = +X). Rig của ba con này không đủ đối xứng để dò vai trò tự động (Tripo thiếu xương cánh bên này,
# xương phụ không rõ nghĩa), nên vai trò xương khai báo trong `import.creature.groups` theo tên xương sau `rename_all`
# ("tripo::Spine_0" → "tripo_spine_0", "bone_29" giữ nguyên).
#
# import.creature = {
#   kind:   "bird" | "chain" | "insect"
#   groups: { body: [...], neck: [...], tail: [...], wings: [[chuỗi cánh bên A], [chuỗi bên B]], legs: [...], jaw: [...] }
#   flap:   { hz, amp }        (bird, insect)  tần số vỗ cánh khi idle (Hz) và biên độ (độ)
#   wave:   { len, amp }       (chain) số bước sóng dọc thân và biên độ uốn (độ)
# }
# Clip (30 khung/giây): idle, run, attack, hit_light, death. Góc tính quanh trục thế giới, đổi sang trục cục bộ của xương
# (q = M⁻¹·R·M, M là hướng nghỉ của xương); cùng chuỗi xương thì góc cộng dồn từ gốc ra ngọn. Không có ngẫu nhiên.
# Tốc độ tự nhiên của `run` báo ở report (naturalSpeed, m/s ở scale 1) cho refSpeed phía client.

import math

import bpy
from mathutils import Matrix, Vector

FPS = 30
AX = {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}

if len(ARMATURES) != 1:  # noqa: F821
    fail(f'anim_creature cần đúng 1 armature, có {len(ARMATURES)}')  # noqa: F821
arm = ARMATURES[0]  # noqa: F821
IMPORT = META.get('import') or {}  # noqa: F821
CFG = IMPORT.get('creature') or {}
KIND = CFG.get('kind')
if KIND not in ('bird', 'chain', 'insect'):
    fail('anim_creature: import.creature.kind phải là bird | chain | insect')  # noqa: F821
G = CFG.get('groups') or {}
pb = arm.pose.bones
for grp in G.values():
    for item in grp:
        for n in ([item] if isinstance(item, str) else item):
            if n not in pb:
                fail(f'anim_creature: không có xương "{n}" (xương hiện có: {sorted(b.name for b in arm.data.bones)})')  # noqa: F821
REST = {p.name: p.bone.matrix_local.to_3x3() for p in pb}
HEAD = {p.name: arm.matrix_world @ p.bone.head_local for p in pb}
bpy.context.scene.render.fps = FPS


def spans(group):
    return list(G.get(group, []))


def rot_q(name, axis, deg):
    M = REST[name]
    return M.inverted() @ Matrix.Rotation(math.radians(deg), 3, AX[axis]) @ M


def pose_frame(spec):
    """spec: { xương: [(trục, độ), ...], '_loc': { xương: (dx, dy, dz) mét thế giới } }."""
    loc = spec.get('_loc', {})
    for p in pb:
        p.rotation_mode = 'QUATERNION'
        m = Matrix.Identity(3)
        for axis, deg in spec.get(p.name, []):
            m = rot_q(p.name, axis, deg) @ m
        p.rotation_quaternion = m.to_quaternion()
        d = loc.get(p.name)
        p.location = (REST[p.name].inverted() @ Vector(d)) if d else (0, 0, 0)


def add(spec, name, axis, deg):
    spec.setdefault(name, []).append((axis, deg))


def clip(name, seconds, fn, loop=False, step=1):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    pose_frame({})
    bpy.context.view_layer.update()
    n = max(2, round(seconds * FPS))
    for f in sorted(set(list(range(0, n, step)) + [n])):
        t = (f % n) / n if loop else f / n
        pose_frame(fn(t))
        for p in pb:
            p.keyframe_insert('rotation_quaternion', frame=f)
            p.keyframe_insert('location', frame=f)
    act.frame_range = (0, n)
    arm.animation_data.action = None
    from_nla = arm.animation_data.nla_tracks.new()
    from_nla.name = name
    from_nla.strips.new(name, 0, act)
    REPORT['clips'][name] = {'seconds': round(n / FPS, 3), 'procedural': True, 'loop': loop}


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def key(t, keys):
    """Nội suy smoothstep giữa [(t, giá trị)]."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            return a + (b - a) * smooth((t - t0) / (t1 - t0))
    return keys[-1][1]


REPORT = {'clips': {}}
ROOT = next((p.name for p in pb if p.parent is None), None)
side = lambda chain: 1.0 if HEAD[chain[-1]].x > 0 else -1.0  # +1: cánh bên trái (+X)


def wings(spec, t, hz, amp, phase=0.0, fold=0.0, lag=0.5):
    """Vỗ cánh: quay quanh trục Y thế giới (trục dọc thân), cánh bên trái +X hạ khi góc dương; ngọn trễ pha."""
    for chain in G.get('wings', []):
        sg = side(chain)
        for i, b in enumerate(chain):
            ph = 2 * math.pi * (t * hz - lag * i * 0.15) + phase
            deg = amp * math.sin(ph) * (1 + 0.45 * i) * (1 - fold) - fold * 70 * sg * -1 * (1 if i else 0.5)
            add(spec, b, 'y', -sg * deg * 0.8 if i else -sg * deg)


def tilt_chain(spec, group, axis, deg, taper=1.0):
    ch = spans(group)
    for i, b in enumerate(ch):
        add(spec, b, axis, deg * (taper ** i))


def undulate(spec, group, t, waves, amp, phase=0.0, axis='z'):
    ch = spans(group)
    n = max(1, len(ch))
    for i, b in enumerate(ch):
        ph = 2 * math.pi * (t * waves[0] - waves[1] * i / n) + phase
        add(spec, b, axis, amp * math.sin(ph) / math.sqrt(n))


def bob(spec, dz, dy=0.0, dx=0.0):
    if ROOT:
        spec.setdefault('_loc', {})[ROOT] = (dx, dy, dz)


S = float(IMPORT.get('size', {}).get('width') or IMPORT.get('size', {}).get('longest') or 1.0)
FL = CFG.get('flap', {})
WV = CFG.get('wave', {})

if KIND == 'bird':
    hz, amp = float(FL.get('hz', 1.4)), float(FL.get('amp', 22))

    def idle(t):
        s = {}
        wings(s, t, hz, amp)
        tilt_chain(s, 'neck', 'x', 3 * math.sin(2 * math.pi * t))
        tilt_chain(s, 'tail', 'x', 4 * math.sin(2 * math.pi * t * 2 - 1))
        bob(s, 0.04 * S * math.sin(2 * math.pi * t))
        return s
    clip('idle', 2.4, idle, loop=True)

    def run(t):  # bay thấp lướt tới: vỗ nhanh, thân chúi, cổ duỗi
        s = {}
        wings(s, t, 3.0, amp * 1.5)
        tilt_chain(s, 'body', 'x', 8)
        tilt_chain(s, 'neck', 'x', -6)
        tilt_chain(s, 'tail', 'x', -6 + 5 * math.sin(2 * math.pi * t * 2))
        bob(s, 0.05 * S * math.sin(2 * math.pi * t * 2))
        return s
    clip('run', 0.66, run, loop=True)

    def attack(t):  # thu cổ, xòe cánh, ưỡn thân → vươn cổ phóng lông (chạm 0,55 s)
        s = {}
        k = lambda *ks: key(t, list(ks))
        wings(s, t, 2.5, amp * 1.2, fold=0.0)
        tilt_chain(s, 'neck', 'x', k((0, 0), (0.5, 28), (0.62, -34), (0.85, -10), (1, 0)))
        tilt_chain(s, 'body', 'x', k((0, 0), (0.5, -12), (0.62, 10), (1, 0)))
        bob(s, 0.05 * S * k((0, 0), (0.5, 1), (0.62, -0.4), (1, 0)), dy=0.03 * S * k((0, 0), (0.5, 1), (0.62, -1), (1, 0)))
        return s
    clip('attack', 1.0, attack)
    REPORT['clips']['attack']['impact'] = 0.55

    def hit(t):
        s = {}
        w = math.sin(math.pi * t)
        tilt_chain(s, 'neck', 'x', -22 * w)
        tilt_chain(s, 'body', 'x', -10 * w)
        wings(s, t, 3.0, amp * 0.8)
        bob(s, 0.03 * S * w, dy=0.04 * S * w)
        return s
    clip('hit_light', 0.35, hit)

    def death(t):  # cánh gập, rơi nghiêng, nằm nghiêng
        s = {}
        k = lambda *ks: key(t, list(ks))
        wings(s, t, 1.0, amp * 0.8 * (1 - k((0, 0), (0.35, 1))), fold=k((0, 0), (0.5, 1)))
        add(s, ROOT, 'y', 80 * k((0, 0), (0.55, 1)))
        tilt_chain(s, 'neck', 'x', 20 * k((0, 0), (0.5, 1)))
        bob(s, -0.2 * S * k((0, 0), (0.55, 1)))
        return s
    clip('death', 1.5, death)
    REPORT['clips']['run']['naturalSpeed'] = 3.0

elif KIND == 'chain':
    waves = (float(WV.get('len', 1.0)), float(WV.get('len', 1.0)))
    amp = float(WV.get('amp', 36))

    def idle(t):
        s = {}
        undulate(s, 'body', t, (1, 1.0), amp * 0.35)
        undulate(s, 'tail', t, (1, 1.5), amp * 0.6, phase=1.0)
        tilt_chain(s, 'jaw', 'z', 10 * math.sin(2 * math.pi * t * 2))
        return s
    clip('idle', 2.4, idle, loop=True)

    def run(t):
        s = {}
        undulate(s, 'body', t, (2, waves[0] * 2), amp)
        undulate(s, 'tail', t, (2, waves[0] * 3), amp * 1.1, phase=0.6)
        bob(s, 0.01 * S * math.sin(2 * math.pi * t * 4))
        return s
    clip('run', 0.6, run, loop=True)
    REPORT['clips']['run']['naturalSpeed'] = round(3.4 * S, 3)

    def attack(t):  # ngóc đầu → phóng tới phun độc (chạm 0,5 s) → về
        s = {}
        k = lambda *ks: key(t, list(ks))
        tilt_chain(s, 'body', 'x', k((0, 0), (0.45, -9), (0.55, 6), (1, 0)))
        undulate(s, 'body', t, (1, 1.0), amp * 0.6 * k((0, 1), (0.5, 0.2), (1, 1)))
        undulate(s, 'tail', t, (1, 1.5), amp * 0.5, phase=1.0)
        tilt_chain(s, 'jaw', 'z', 28 * k((0, 0), (0.5, 1), (0.7, 0.6), (1, 0)))
        bob(s, 0.0, dy=-0.18 * S * k((0, 0), (0.45, -0.4), (0.55, 1), (1, 0)))
        return s
    clip('attack', 0.9, attack)
    REPORT['clips']['attack']['impact'] = 0.5

    def hit(t):
        s = {}
        w = math.sin(math.pi * t)
        undulate(s, 'body', t, (1, 1.0), amp * 1.2 * w)
        bob(s, 0.0, dy=0.05 * S * w)
        return s
    clip('hit_light', 0.35, hit)

    def death(t):  # cuộn người lại, giật vài nhịp rồi nằm yên
        s = {}
        k = lambda *ks: key(t, list(ks))
        undulate(s, 'body', t, (3, 2.0), amp * 1.4 * k((0, 0), (0.25, 1), (0.8, 0.45)))
        undulate(s, 'tail', t, (3, 2.0), amp * 1.6 * k((0, 0), (0.25, 1), (0.8, 0.6)), phase=0.8)
        tilt_chain(s, 'body', 'z', 22 * k((0, 0), (0.7, 1)))
        add(s, ROOT, 'y', 70 * k((0, 0), (0.7, 1)))
        bob(s, -0.03 * S * k((0, 0), (0.7, 1)))
        return s
    clip('death', 1.6, death)

else:  # insect
    hz, amp = float(FL.get('hz', 6.0)), float(FL.get('amp', 26))

    def idle(t):
        s = {}
        wings(s, t, hz, amp)
        tilt_chain(s, 'body', 'x', 3 * math.sin(2 * math.pi * t))
        bob(s, 0.05 * S * math.sin(2 * math.pi * t))
        return s
    clip('idle', 1.2, idle, loop=True)

    def run(t):
        s = {}
        wings(s, t, hz * 1.3, amp * 1.15)
        tilt_chain(s, 'body', 'x', 14)
        bob(s, 0.03 * S * math.sin(2 * math.pi * t * 2))
        return s
    clip('run', 0.4, run, loop=True)
    REPORT['clips']['run']['naturalSpeed'] = 3.2

    def attack(t):  # lùi nhẹ → đâm thẳng (chạm 0,35 s) → về
        s = {}
        k = lambda *ks: key(t, list(ks))
        wings(s, t, hz * 1.3, amp * 1.2)
        tilt_chain(s, 'body', 'x', k((0, 0), (0.35, -14), (0.45, 24), (1, 0)))
        bob(s, 0.0, dy=-0.5 * S * k((0, 0), (0.35, -0.3), (0.45, 1), (1, 0)))
        return s
    clip('attack', 0.7, attack)
    REPORT['clips']['attack']['impact'] = 0.35

    def hit(t):
        s = {}
        w = math.sin(math.pi * t)
        tilt_chain(s, 'body', 'x', -20 * w)
        wings(s, t, hz, amp * 1.2)
        bob(s, 0.0, dy=0.2 * S * w)
        return s
    clip('hit_light', 0.3, hit)

    def death(t):  # cánh co giật rồi rơi ngửa, chân co
        s = {}
        k = lambda *ks: key(t, list(ks))
        wings(s, t, hz, amp * (1 - k((0, 0), (0.5, 1))), fold=k((0, 0), (0.6, 1)))
        add(s, ROOT, 'y', 170 * k((0, 0), (0.7, 1)))
        bob(s, -0.18 * S * k((0, 0), (0.75, 1)))
        return s
    clip('death', 1.0, death)

for p in pb:
    p.rotation_quaternion = (1, 0, 0, 0)
    p.location = (0, 0, 0)
print(f'[anim_creature] {ASSET_ID}: {REPORT}')  # noqa: F821
