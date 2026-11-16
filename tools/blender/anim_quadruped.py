# Clip thủ tục cho quái bốn chân dùng rig Tripo quadruped, chạy như bước `import.post` của import_tripo.py.
#
# Không chạy riêng: import_tripo.py gọi file này sau khi chuẩn hóa (mét, gốc ở đáy, mặt trước +Z glTF = -Y Blender,
# bên trái con vật = +X), trước khi xuất. Biến toàn cục nhận từ import_tripo: ASSET_ID, META, ARMATURES, MESHES, REPO,
# SOURCE_ROOT, fail, ascii_name.
#
# 1. Đổi tên xương Tripo sang tên vai trò: spine_0..2, neck, head, shoulder_l/r, leg_f{l,r}_<i>, leg_h{l,r}_<i>,
#    tail_<i> (hip_aux_* riêng của sói). Trái/phải xác định theo vị trí thật (+X là trái) vì Tripo có khi đặt tên chân
#    sau ngược với chân trước. Rig sói 28 xương dùng bảng tên cố định; rig khác (Tripo đổi số xương theo con: heo 32,
#    cáo 42) dò vai trò theo cây xương và vị trí (xem generic_layout). Đuôi nhiều đốt hơn 4 thì chia đều góc.
# 2. Thêm 5 clip (30 khung/giây), mỗi clip đặt khóa cho mọi xương:
#      idle      2,4 s lặp   thở, nhìn quanh, vẫy đuôi
#      run       0,6 s lặp   phi nước đại (gallop xoay vòng), lưng uốn, nhún, tại chỗ
#      attack    `import.quadruped.attack`:
#                  bite (mặc định) 0,8 s: thu người → lao tới → đớp bằng đầu/cổ (rig không có xương hàm) → về chỗ cũ
#                  gore            0,9 s: cúi đầu dồn vai → lao xa → hất nanh lên → về chỗ cũ (heo rừng)
#      hit_light 0,4 s       giật lùi, ngửa đầu, cụp đuôi
#      death     1,4 s       khuỵu chân trước, đổ nghiêng sang phải, nằm yên ở khung cuối
#    Góc tính quanh trục thế giới rồi đổi sang trục cục bộ của từng xương (q = M⁻¹·R·M với M là hướng nghỉ của xương),
#    nên không phụ thuộc trục xương Tripo. Không có ngẫu nhiên: cùng đầu vào cho cùng clip.
# 3. Clip Tripo kèm theo (`import.clips`, ví dụ walk của web): ghép bằng tools/blender/tripo_clips.py, đổi tên kênh theo
#    bảng ở bước 1.
# 4. Báo cáo tốc độ tự nhiên (m/s, scale 1) của run/walk khi phát 1× (đo theo chân trụ), để đặt refSpeed ở client.
# 5. Tùy chọn boss (M3-8): `import.quadruped.fixCrossWeights` sửa trọng số chéo chân của auto-rig (mục 1b);
#    `import.extra` thêm clip đòn lớn slam/sweep/stun (mục 3b).

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
IMPORT = META.get('import') or {}  # noqa: F821
QUAD = IMPORT.get('quadruped') or {}


# ---------- 1. đổi tên ----------

def need(name):
    if name not in bones:
        fail(f'anim_quadruped: rig không có xương "{name}" (không phải rig quadruped Tripo 28 xương?)')  # noqa: F821
    return bones[name]


def head_x(name):
    return need(name).head_local.x


def chain(prefix, n):
    return [f'{prefix}_{i}' for i in range(n)]


def wolf_layout():
    """Rig quadruped Tripo 28 xương (sói): tên cố định, vai là spine_3/bone_10. None nếu không phải rig này."""
    # Tên sau rename_all của import_tripo ("tripo::Spine_0" → "tripo_spine_0").
    if 'bone_10' not in bones or 'tripo_spine_3' not in bones or 'tripo_root' in bones:
        return None
    front_a, front_b = chain('tripo_0_right_limb', 3), chain('tripo_0_left_limb', 3)
    hind_a, hind_b = chain('tripo_1_right_limb', 4), chain('tripo_1_left_limb', 4)
    front_l, front_r = (front_a, front_b) if head_x(front_a[1]) > head_x(front_b[1]) else (front_b, front_a)
    hind_l, hind_r = (hind_a, hind_b) if head_x(hind_a[1]) > head_x(hind_b[1]) else (hind_b, hind_a)
    if abs(head_x(front_a[1]) - head_x(front_b[1])) < 1e-4 or abs(head_x(hind_a[1]) - head_x(hind_b[1])) < 1e-4:
        fail('anim_quadruped: không phân biệt được chân trái/phải theo X')  # noqa: F821
    shoulder_of = {front_a[0]: 'tripo_spine_3', front_b[0]: 'bone_10'}
    for limb, sh in shoulder_of.items():
        if need(limb).parent is None or need(limb).parent.name != sh:
            fail(f'anim_quadruped: {limb} không phải con của {sh} (cây xương Tripo khác dự kiến)')  # noqa: F821
    out = {
        'tripo_spine_0': 'spine_0', 'tripo_spine_1': 'spine_1', 'tripo_spine_2': 'spine_2',
        'bone_4': 'neck', 'tripo_head_0': 'head',
        shoulder_of[front_l[0]]: 'shoulder_l', shoulder_of[front_r[0]]: 'shoulder_r',
        'bone_14': 'tail_0', 'bone_15': 'tail_1', 'bone_16': 'tail_2', 'tripo_tail_0': 'tail_3',
        'bone_26': 'hip_aux_0', 'bone_27': 'hip_aux_1', 'bone_28': 'hip_aux_2',
    }
    for side, lst in (('fl', front_l), ('fr', front_r), ('hl', hind_l), ('hr', hind_r)):
        for i, b in enumerate(lst):
            out[b] = f'leg_{side}_{i}'
    return out


def generic_layout():
    """Rig quadruped Tripo khác (có xương tripo_root, số đốt chân/đuôi tùy con): dò vai trò theo cây xương và vị trí
    sau chuẩn hóa (đầu ở -Y, trái ở +X, đất ở Z = 0).
      cột sống: tổ tiên của tripo_head_0, bỏ xương gốc nằm sát đất; cuối là neck, ngược lên là spine_2, spine_1, spine_0.
      chân: con của xương cột sống/gốc mà cây con chạm đất; đi xuống theo nhánh thấp nhất. Chuỗi chân trước có xương vai
            (shoulder_*) đứng đầu rồi leg_f*_0..; chuỗi chân sau bắt đầu từ hông là leg_h*_0. Trước/sau theo Y, trái/phải theo X.
      đuôi: chuỗi xương giữa (|x| nhỏ) dài nhất mọc ra sau từ cột sống/gốc."""
    head = need('tripo_head_0')
    top = max(b.head_local.z for b in bones)
    path = []
    p = head.parent
    while p is not None:
        path.append(p)
        p = p.parent
    path.reverse()
    spine = [b for b in path if b.head_local.z > 0.3 * top]
    if len(spine) < 2:
        fail('anim_quadruped: cột sống quá ngắn (cây xương khác dự kiến)')  # noqa: F821
    hosts = path + [None]  # xương có thể mọc chân/đuôi (None = không cha)
    span = max(b.head_local.x for b in bones) - min(b.head_local.x for b in bones)
    centered = lambda b: abs(b.head_local.x) < 0.08 * span and abs(b.tail_local.x) < 0.08 * span

    def low(b):
        return min([b.tail_local.z] + [low(c) for c in b.children])

    def down(b):
        out = [b]
        while b.children:
            b = min(b.children, key=low)
            out.append(b)
        return out
    kids = [b for b in bones if (b.parent in hosts) and b not in path and b != head]
    # Chân: cây con chạm đất và đầu mút lệch khỏi đường giữa (đuôi cong rủ gần đất vẫn nằm giữa).
    legs = [c for c in (down(b) for b in kids if low(b) < 0.25 * top) if abs(c[-1].tail_local.x) > 0.08 * span]
    if len(legs) != 4:
        fail(f'anim_quadruped: tìm thấy {len(legs)} chân, cần 4')  # noqa: F821
    legs.sort(key=lambda c: c[-1].tail_local.y)  # đầu ở -Y: hai chân trước đứng trước
    out = {head.name: 'head', spine[-1].name: 'neck'}
    for name, b in zip(('spine_2', 'spine_1', 'spine_0'), reversed(spine[:-1])):
        out[b.name] = name
    for pair, front in ((legs[:2], True), (legs[2:], False)):
        pair.sort(key=lambda c: -c[-1].tail_local.x)  # +X (trái) trước
        if pair[0][-1].tail_local.x <= 0 or pair[1][-1].tail_local.x >= 0:
            fail('anim_quadruped: không phân biệt được chân trái/phải theo X')  # noqa: F821
        for side, c in zip('lr', pair):
            if front:
                out[c[0].name] = f'shoulder_{side}'
                c = c[1:]
            for i, b in enumerate(c):
                out[b.name] = f'leg_{"f" if front else "h"}{side}_{i}'
    tails = []
    for b in kids:
        if b in [c[0] for c in legs] or not centered(b) or b.tail_local.y <= b.head_local.y:
            continue
        c = [b]
        while c[-1].children:
            c.append(max(c[-1].children, key=lambda x: len(x.children_recursive)))
        tails.append(c)
    if tails:
        for i, b in enumerate(max(tails, key=len)):
            out[b.name] = f'tail_{i}'
    return out


def geometric_layout():
    """Rig Tripo quadruped có cây xương lộn xộn (tinh anh P3-E: chân mọc từ xương đầu hoặc đuôi, tên "Limb" gắn nhầm vào
    đuôi, có khi không có xương đầu riêng). Không tin tên và cha-con: tách cây thành chuỗi xương đơn (cắt ở chỗ rẽ nhánh),
    phân loại theo hình học sau chuẩn hóa (đầu ở -Y, trái ở +X, đất ở Z = 0):
      chân:  chuỗi bắt đầu cao, rơi xuống nhiều hơn đi ngang (đúng 4);
      đuôi:  chuỗi lá còn lại dài nhất đi về phía +Y (các đuôi phụ giữ nguyên, chỉ đi theo cha);
      đầu:   chuỗi lá còn lại nằm xa nhất về phía -Y; cột sống là tổ tiên của nó (bỏ xương gốc sát đất). Nếu đường cột sống
             có xương tên "head" thì từ đó trở đi là nhóm đầu (head = xương đó), trước nó là neck, cột sống; không thì
             xương cuối là head.
    Chân/đuôi gắn sai cha (con của nhóm đầu, đuôi, hay chân khác) được gắn lại vào xương cột sống gần nhất ở chế độ Edit
    (tư thế nghỉ và trọng số không đổi). Trả về (bảng đổi tên, bảng gắn lại cha {tên: tên cha mới})."""
    top = max(b.head_local.z for b in bones)

    def chain_from(b):
        c = [b]
        while len(c[-1].children) == 1:
            c.append(c[-1].children[0])
        return c

    chains, stack = [], [b for b in bones if b.parent is None]
    seen = set()
    while stack:
        b = stack.pop()
        c = chain_from(b)
        chains.append(c)
        seen.update(x.name for x in c)
        stack.extend(c[-1].children)
    legs, others = [], []
    for c in chains:
        a, z = c[0].head_local, c[-1].tail_local
        horiz = math.hypot(z.x - a.x, z.y - a.y)
        drop = a.z - z.z
        (legs if len(c) >= 2 and a.z > 0.25 * top and z.z < 0.25 * top and drop > 0.8 * horiz and drop > 0.15 * top else others).append(c)
    if len(legs) != 4:
        fail(f'anim_quadruped: dò hình học thấy {len(legs)} chân, cần 4')  # noqa: F821
    leaf = [c for c in others if not c[-1].children]
    tail_chain = max((c for c in leaf if c[-1].tail_local.y > c[0].head_local.y), key=lambda c: len(c), default=None)
    head_cands = [c for c in leaf if c is not tail_chain]
    if not head_cands:  # đầu là chuỗi dài có chân mọc ngang cuối (không phải lá)
        head_cands = [c for c in others if c is not tail_chain and c[-1].tail_local.z > 0.3 * top]
    if not head_cands:
        fail('anim_quadruped: không thấy chuỗi đầu')  # noqa: F821
    head_leaf = min(head_cands, key=lambda c: c[-1].tail_local.y)
    path, p = [], head_leaf[-1]
    while p is not None:
        path.append(p)
        p = p.parent
    path.reverse()
    path = [b for b in path if b.head_local.z > 0.3 * top] or path
    hi = next((i for i, b in enumerate(path) if 'head' in b.name.lower()), None)
    if hi is None:
        hi = len(path) - 1
    spine = path[:hi]
    out = {path[hi].name: 'head'}
    if len(spine) >= 2:
        out[spine[-1].name] = 'neck'
        for name, b in zip(('spine_2', 'spine_1', 'spine_0'), reversed(spine[:-1])):
            out[b.name] = name
    elif len(spine) == 1:
        out[spine[0].name] = 'spine_1'
    if not spine:
        fail('anim_quadruped: không có xương cột sống')  # noqa: F821
    legs.sort(key=lambda c: c[0].head_local.y)  # đầu ở -Y: hai chân trước đứng trước
    reparent = {}
    host = list(spine) + [b for b in bones if b.parent is None]

    def nearest_host(b):
        return min(host, key=lambda h: (h.head_local - b.head_local).length)

    for pair, front in ((legs[:2], True), (legs[2:], False)):
        pair.sort(key=lambda c: -c[0].head_local.x)  # +X (trái) trước
        if pair[0][0].head_local.x <= pair[1][0].head_local.x:
            fail('anim_quadruped: không phân biệt được chân trái/phải theo X')  # noqa: F821
        for side, c in zip('lr', pair):
            if front:
                out[c[0].name] = f'shoulder_{side}'
                names = c[1:]
            else:
                names = c
            for i, b in enumerate(names):
                out[b.name] = f'leg_{"f" if front else "h"}{side}_{i}'
            if c[0].parent is None or c[0].parent not in host:
                reparent[c[0].name] = nearest_host(c[0]).name
    if tail_chain:
        for i, b in enumerate(tail_chain):
            out[b.name] = f'tail_{i}'
        if tail_chain[0].parent is None or tail_chain[0].parent not in host:
            reparent[tail_chain[0].name] = nearest_host(tail_chain[0]).name
    return out, reparent


REPARENT = {}
RENAME = QUAD.get('layout') or wolf_layout()  # layout: bảng tên cũ → vai trò khai trong meta
if not RENAME:
    try:
        RENAME = generic_layout()
    except SystemExit:
        RENAME, REPARENT = geometric_layout()
        print(f'[anim_quadruped] bố cục hình học: {RENAME} gắn lại cha: {REPARENT}')
if REPARENT:
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for child, new_parent in REPARENT.items():
        eb[child].use_connect = False
        eb[child].parent = eb[new_parent]
    bpy.ops.object.mode_set(mode='OBJECT')
LAYOUT = 'wolf28' if 'bone_10' in RENAME else 'generic'
for old in RENAME:
    need(old)
for old, new in RENAME.items():
    bones[old].name = new  # Blender đổi luôn tên vertex group của mesh gắn armature
if head_x('leg_fl_1') <= 0 or head_x('leg_hl_1') <= 0:
    fail('anim_quadruped: chân trái phải nằm ở +X sau chuẩn hóa (kiểm import.yaw)')  # noqa: F821

# ---------- 1b. sửa trọng số chéo chân (tùy chọn) ----------
# Auto-rig Tripo (Huyết Lang Vương) gán một phần đỉnh bàn chân trước cho xương chân sau cùng bên (và ngược lại): khi một
# chân gập, các đỉnh đó bị kéo thành gai dài. Bỏ trọng số của xương chân/đuôi mà đoạn xương (tư thế nghỉ) cách đỉnh xa
# hơn 20% chiều dài thân, rồi chuẩn hóa lại tổng trọng số. Đỉnh mất hết trọng số thì giữ nguyên.

def segment_dist(p, a, b):
    ab = b - a
    t = 0.0 if ab.length_squared < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


weights_fixed = 0
if QUAD.get('fixCrossWeights'):
    ys = [(m.matrix_world @ v.co).y for m in MESHES for v in m.data.vertices]  # noqa: F821
    REACH_W = 0.2 * (max(ys) - min(ys))
    SEG = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local)
           for b in bones if b.name.startswith(('leg_', 'tail_'))}
    for m in MESHES:  # noqa: F821
        names = {g.index: g.name for g in m.vertex_groups}
        for v in m.data.vertices:
            p = m.matrix_world @ v.co
            live = [g for g in v.groups if g.weight > 0]
            far = [g for g in live if names[g.group] in SEG and segment_dist(p, *SEG[names[g.group]]) > REACH_W]
            if not far or len(far) == len(live):
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
TAIL = sorted((b.name for b in bones if b.name.startswith('tail_')), key=lambda n: int(n[5:]))
# Góc/pha đuôi viết cho 4 đốt (sói). Đuôi nhiều đốt hơn thì chia đều để tổng độ cong giữ nguyên; đuôi ít đốt hơn (heo:
# một xương) giữ góc mỗi đốt, không nhân lên (một xương quay cả góc của 4 đốt thì đuôi quật như roi).
TK = min(1.0, 4 / len(TAIL)) if TAIL else 1.0


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
        j = i * TK
        spec[b] = [(X, -3 * TK), (Z, (6 + 3 * j) * TK * S(a - 0.5 * j))]
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
        j = i * TK
        spec[b] = [(X, (12 + 6 * S(a - 0.7 * j)) * TK), (Z, 5 * TK * S(a - 0.7 * j))]
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
# Húc nanh (heo rừng): cúi thấp đầu, dồn sức vai, lao xa hơn đớp, rồi hất đầu lên ở cuối cú lao.
gore_brace = {
    'leg_fl_0': [(X, 18)], 'leg_fr_0': [(X, 18)], 'leg_fl_1': [(X, -20)], 'leg_fr_1': [(X, -20)],
    'leg_hl_0': [(X, -22)], 'leg_hr_0': [(X, -22)], 'leg_hl_1': [(X, 34)], 'leg_hr_1': [(X, 34)],
    'spine_1': [(X, 6)], 'spine_2': [(X, 6)], 'neck': [(X, 26)], 'head': [(X, 14)], 'tail_0': [(X, 10)],
}
gore_charge = {
    'leg_fl_0': [(X, -38)], 'leg_fr_0': [(X, -30)], 'leg_hl_0': [(X, 26)], 'leg_hr_0': [(X, 30)],
    'leg_hl_1': [(X, -12)], 'leg_hr_1': [(X, -12)], 'spine_1': [(X, 2)], 'spine_2': [(X, 4)],
    'neck': [(X, 28)], 'head': [(X, 16)], 'tail_0': [(X, 20)],
}
gore_hook = merge(gore_charge, {'neck': [(X, -34), (Z, 8)], 'head': [(X, -14)], 'spine_2': [(X, -4)]})
GORE = 0.3 * LENGTH

ATTACK = QUAD.get('attack', 'bite')
if ATTACK == 'bite':
    n_attack = keyed('attack', 0.8, [
        (0.00, REST_KEY, (0, 0, 0), None),
        (0.30, crouch, (0, 0.03 * LENGTH, -0.06 * HEIGHT), None),
        (0.50, lunge, (0, -REACH, 0.02 * HEIGHT), None),
        (0.62, bite, (0, -REACH, 0.0), None),
        (1.00, REST_KEY, (0, 0, 0), None),
    ])
elif ATTACK == 'gore':
    n_attack = keyed('attack', 0.9, [
        (0.00, REST_KEY, (0, 0, 0), None),
        (0.32, gore_brace, (0, 0.06 * LENGTH, -0.05 * HEIGHT), None),
        (0.50, gore_charge, (0, -GORE, 0.0), None),
        (0.60, gore_hook, (0, -GORE, 0.03 * HEIGHT), None),
        (1.00, REST_KEY, (0, 0, 0), None),
    ])
else:
    fail(f'anim_quadruped: import.quadruped.attack "{ATTACK}" chưa hỗ trợ (bite | gore)')  # noqa: F821
n_hit = keyed('hit_light', 0.4, [
    (0.00, REST_KEY, (0, 0, 0), None),
    (0.30, hit, (0, 0.05 * LENGTH, -0.02 * HEIGHT), None),
    (1.00, REST_KEY, (0, 0, 0), None),
])
DEATH = QUAD.get('death', 'side')
DEATH_DX = 0.0
if DEATH == 'prone':
    # Thú thân rộng, dẹt khi lăn nghiêng (tê giáp): quỵ bốn chân rồi nằm sấp, hơi nghiêng 10°, đầu gục xuống đất.
    prone = merge(buckle, {'neck': [(X, 32)], 'head': [(X, 18)], 'leg_hl_1': [(X, 25)], 'leg_hr_1': [(X, 25)], 'tail_0': [(X, -20)]})
    n_death = keyed('death', 1.4, [
        (0.00, REST_KEY, (0, 0, 0), None),
        (0.30, buckle, (0, 0, -0.14 * HEIGHT), (Y, -4)),
        (0.70, prone, (0, 0, -0.30 * HEIGHT), (Y, -10)),
        (1.00, prone, (0, 0, -0.30 * HEIGHT), (Y, -10)),
    ])
else:
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

# ---------- 3b. clip boss (tùy chọn, import.extra) ----------
# Đòn lớn đọc được từ xa: client (monsterSkins.ts, QUAD_MOVES) phát clip sao cho khung chạm đất rơi đúng lúc vùng báo
# trước của server nổ. Đổi thời điểm ở đây thì sửa cùng phía client.
#   slam   1,8 s  thu người → chồm đứng hai chân sau → nện hai chân trước xuống (chạm đất 1,0 s) → giữ → về chỗ cũ
#   sweep  1,7 s  ngửa cổ lấy đà → hạ đầu sát đất, quét đầu từ phải sang trái theo hình quạt (giữa quạt 0,9 s)
#   stun   1,6 s lặp  quỵ chân trước, đầu gục, lắc lư (bị ngắt chú hoặc mất thế)
EXTRA = list(IMPORT.get('extra', []))
extra_clips = {}
for name in EXTRA:
    if name not in ('slam', 'sweep', 'stun'):
        fail(f'anim_quadruped: import.extra "{name}" chưa hỗ trợ cho thú bốn chân (slam | sweep | stun)')  # noqa: F821

if 'slam' in EXTRA:
    if QUAD.get('slam') == 'rear':
        # Tùy chọn `import.quadruped.slam: "rear"` (Địa Mạch Long, thân rồng dài): chồm đứng thẳng trên hai chân sau (đùi sau duỗi
        # dọc, thân ngả ~58°, đuôi chống đất), hai chân trước giơ cao rồi nện xuống: lúc chạm (1,0 s) thân đổ về trước, hai chân
        # sau vẫn bám đất, chân trước chạm đất.
        rear = {
            'leg_fl_0': [(X, -60)], 'leg_fr_0': [(X, -54)], 'leg_fl_1': [(X, 78)], 'leg_fr_1': [(X, 72)],
            'leg_hl_0': [(X, 34)], 'leg_hr_0': [(X, 34)], 'leg_hl_1': [(X, -26)], 'leg_hr_1': [(X, -26)],
            'spine_1': [(X, -6)], 'spine_2': [(X, -4)], 'neck': [(X, -22)], 'head': [(X, -14)], 'tail_0': [(X, 24)], 'tail_1': [(X, 12)],
        }
        stomp = {
            'leg_fl_0': [(X, -6)], 'leg_fr_0': [(X, -4)], 'leg_fl_1': [(X, -4)], 'leg_fr_1': [(X, -4)],
            'leg_hl_0': [(X, 4)], 'leg_hr_0': [(X, 4)], 'leg_hl_1': [(X, 0)], 'leg_hr_1': [(X, 0)],
            'spine_1': [(X, 6)], 'neck': [(X, 26)], 'head': [(X, 14)], 'tail_0': [(X, -12)],
        }
        slam_keys = [
            (0.00, REST_KEY, (0, 0, 0), None, 0.0),
            (0.22, crouch, (0, 0.04 * LENGTH, -0.05 * HEIGHT), None, 0.0),
            (0.47, rear, (0, 0.10 * LENGTH, 0.0), None, -58.0),
            (0.53, rear, (0, 0.08 * LENGTH, 0.0), None, -60.0),
            (0.556, stomp, (0, -0.12 * LENGTH, 0.0), None, 4.0),
            (0.75, stomp, (0, -0.12 * LENGTH, 0.0), None, 3.0),
            (1.00, REST_KEY, (0, 0, 0), None, 0.0),
        ]
    else:
        # Mặc định (Huyết Lang Vương và các thú khác): giữ nguyên dáng cũ, không đổi khi dựng lại.
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
        slam_keys = [
            (0.00, REST_KEY, (0, 0, 0), None, 0.0),
            (0.22, crouch, (0, 0.04 * LENGTH, -0.05 * HEIGHT), None, 0.0),
            (0.47, rear, (0, 0.08 * LENGTH, 0.0), None, -38.0),
            (0.53, rear, (0, 0.06 * LENGTH, 0.0), None, -40.0),
            (0.556, stomp, (0, -0.10 * LENGTH, -0.06 * HEIGHT), None, 8.0),
            (0.75, stomp, (0, -0.10 * LENGTH, -0.06 * HEIGHT), None, 6.0),
            (1.00, REST_KEY, (0, 0, 0), None, 0.0),
        ]
    extra_clips['slam'] = keyed('slam', 1.8, slam_keys)

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
            j = i * TK
            spec.setdefault(b, []).extend([(X, -12 * TK), (Z, 4 * TK * S(a - 0.4 * j))])
        return spec, (0, 0, -0.15 * HEIGHT + 0.01 * HEIGHT * S(2 * a)), (Y, 4 * S(a))
    extra_clips['stun'] = sampled('stun', 1.6, stun)

set_pose({})
bpy.context.scene.render.fps = FPS

# ---------- 4. clip Tripo kèm theo (import.clips, ví dụ walk) ----------

merged = {}
if IMPORT.get('clips'):
    import os
    import re
    import runpy
    TC = runpy.run_path(os.path.join(REPO, 'tools/blender/tripo_clips.py'))  # noqa: F821

    def bone_map(name):
        n = name if re.fullmatch(r'[A-Za-z0-9_.]+', name) else ascii_name(name)  # noqa: F821
        n = RENAME.get(n, n)
        return n if n in bones else None

    def span_of(a):
        found = {bone_map(b.name): b for b in a.data.bones}
        if 'head' not in found or 'leg_hl_0' not in found:
            fail('anim_quadruped: GLB clip thiếu xương đầu/hông')  # noqa: F821
        return (found['head'].head_local - found['leg_hl_0'].head_local).length

    merged = TC['merge_clips'](arm, IMPORT['clips'], source_root=SOURCE_ROOT, fail=fail, bone_map=bone_map,  # noqa: F821
                               main_span=(bones['head'].head_local - bones['leg_hl_0'].head_local).length, span_of=span_of)


# ---------- 5. tốc độ tự nhiên của clip di chuyển ----------

def natural_speed(name):
    """Tốc độ thân (m/s, scale 1) khi phát clip 1×: trung vị vận tốc lùi của bàn chân đang chạm đất (đầu mút chuỗi chân
    thấp hơn 1,5% chiều cao so với điểm thấp nhất của chính bàn chân đó trong clip). Client đặt refSpeed theo số này."""
    act = bpy.data.actions.get(name)
    if not act:
        return None
    feet = []
    for side in ('fl', 'fr', 'hl', 'hr'):
        ns = sorted((b.name for b in bones if b.name.startswith(f'leg_{side}_')), key=lambda n: int(n.rsplit('_', 1)[1]))
        feet.append(ns[-1])
    arm.animation_data_create()
    saved = [(t, t.mute) for t in arm.animation_data.nla_tracks]
    for t, _ in saved:
        t.mute = True
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and getattr(act, 'slots', None):
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    track = {f: [] for f in feet}
    for fr in range(f0, f1 + 1):
        bpy.context.scene.frame_set(fr)
        for f in feet:
            track[f].append((arm.matrix_world @ arm.pose.bones[f].tail).copy())
    arm.animation_data.action = None
    for t, m in saved:
        t.mute = m
    v = []
    for f in feet:
        pts = track[f]
        zmin = min(p.z for p in pts)
        for a, b in zip(pts, pts[1:]):
            if a.z < zmin + 0.015 * HEIGHT and b.z < zmin + 0.015 * HEIGHT:
                v.append((b.y - a.y) * FPS)  # đầu ở -Y: chân trụ trôi về +Y khi thân tiến
    v.sort()
    return round(v[len(v) // 2], 3) if v else None


REPORT = {
    'layout': LAYOUT,
    'renamed': len(RENAME),
    'weightsFixed': weights_fixed,
    'attack': ATTACK,
    'clips': {'idle': n_idle, 'run': n_run, 'attack': n_attack, 'hit_light': n_hit, 'death': n_death, **extra_clips},
    'merged': merged,
    'naturalSpeed': {c: natural_speed(c) for c in ('run', 'walk') if bpy.data.actions.get(c)},
    'tail': len(TAIL),
    'size': [round(WIDTH, 3), round(HEIGHT, 3), round(LENGTH, 3)],
    'deathDx': round(DEATH_DX, 3),
}
print(f'[anim_quadruped] {ASSET_ID}: {REPORT}')  # noqa: F821
