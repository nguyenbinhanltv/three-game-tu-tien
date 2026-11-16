# Rig và clip thủ tục cho quái dạng rắn/giao (Hàn Giao), chạy như bước `import.post` của import_tripo.py.
#
# Tripo Auto Rig không hợp thân dài không chân, nên model Tripo nhập vào CHƯA có xương. Script này dựng bộ xương rồi
# làm clip, theo cùng quy ước của anim_quadruped.py (hệ chuẩn: mét, gốc ở đáy, mặt trước = +Z glTF = -Y Blender,
# bên trái con vật = +X Blender).
#
# 1. Đường tâm: SPINE_RAW là đa tuyến thô (tọa độ GLB Tripo chưa chuẩn hóa: x dọc thân, đầu ở +x, z lên, đơn vị của
#    bbox chiều dài 1) đo từ ảnh nghiêng của model, làm mượt Catmull-Rom. Tọa độ này gắn với model v01 của Tripo
#    (boss_han_giao/tripo/raw_v01.glb); đổi model thì đo lại. Đổi sang hệ chuẩn bằng cách nhân chiều dài thật.
# 2. Xương: 17 đốt `tail_00..tail_NN` (đuôi) → `body` (gốc, ở chỗ cổ bắt đầu nâng) → `neck_01..` → `head` (xương đầu cứng,
#    dài hơn, không uốn trong đầu). Gốc ở thân nên cả đuôi lẫn cổ là con của `body`.
# 3. Trọng số: mỗi đỉnh lấy vị trí dọc đường tâm (điểm gần nhất), trộn tuyến tính giữa hai xương kề; vây, sừng, râu đi theo
#    đoạn gần nhất. Đầu cứng (một xương).
# 4. Clip (30 khung/giây): idle 3,2 s lặp, run 1,0 s lặp (trườn), attack 0,9 s (thu cổ → lao đớp), hit_light 0,4 s,
#    death 2,6 s (cổ đổ, nằm yên cuối), và `import.extra`: slam 1,8 s, sweep 1,7 s, stun 1,6 s lặp, chant 2,0 s lặp.
#    Góc mô tả theo góc TUYỆT ĐỐI của từng đốt so với tư thế nghỉ: chúi (quanh X, + là cổ cúi về phía trước) và quay
#    (quanh trục đứng của đốt, + là rẽ sang trái); script đổi sang góc tương đối cha-con và sang trục cục bộ của xương
#    (q = M⁻¹·R·M), nên không phụ thuộc trục xương. Không có ngẫu nhiên.
# 5. Đòn lớn: thời điểm chạm slam 1,0 s, sweep 0,9 s khớp BOSS_MOVES của apps/client/src/game/character/monsterSkins.ts.

import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

FPS = 30
X = Vector((1, 0, 0))
IMPORT = META.get('import') or {}  # noqa: F821 (biến do import_tripo truyền vào)
EXTRA = list(IMPORT.get('extra', []))
for _n in EXTRA:
    if _n not in ('slam', 'sweep', 'stun', 'chant'):
        fail(f'anim_serpent: import.extra "{_n}" chưa hỗ trợ (slam | sweep | stun | chant)')  # noqa: F821
SERP = IMPORT.get('serpent') or {}
# `import.serpent` (mọi trường tùy chọn; bỏ khối = Hàn Giao, đường tâm đo tay SPINE_RAW):
#   spine: "auto"  đường tâm tự đo từ lưới (khoảng cách đo trên mặt lưới từ chóp đuôi, lấy trung vị từng lớp), cho model mới;
#   dropRig: true  bỏ rig Tripo kèm theo (Tripo rig thân dài bằng xương bone_N lộn xộn, không dùng được);
#   bones (17), headFrom (tỉ lệ chiều dài đường tâm tính từ đuôi, nơi đầu bắt đầu), rootAt (nơi cổ bắt đầu nâng, xương gốc);
#   amp: hệ số nhân góc uốn của mọi clip (1 = rắn);
#   style: "swim" (kình ngư bay lượn: sóng dọc chúi/ngẩng là chính) | "crawl" (mặc định).
if SERP.get('dropRig'):
    for _a in list(ARMATURES):  # noqa: F821
        bpy.data.objects.remove(_a, do_unlink=True)
    for _m in list(MESHES[0].modifiers):  # noqa: F821
        if _m.type == 'ARMATURE':
            MESHES[0].modifiers.remove(_m)  # noqa: F821
    MESHES[0].vertex_groups.clear()  # noqa: F821
    MESHES[0].parent = None  # noqa: F821
    ARMATURES.clear()  # noqa: F821
if len(MESHES) != 1 or ARMATURES:  # noqa: F821
    fail('anim_serpent cần đúng 1 mesh và chưa có armature (model Tripo chưa rig; hoặc đặt import.serpent.dropRig)')  # noqa: F821
mesh = MESHES[0]  # noqa: F821
STYLE = SERP.get('style', 'crawl')
AMP = float(SERP.get('amp', 1.0))  # nhân mọi góc uốn của clip (thân dẹt, vây rộng như kình ngư: uốn nhỏ để lưới không gập)

# ---------- 1. đường tâm ----------

# Đường tâm thô của Hàn Giao: (x, z) trong hệ GLB thô, x ∈ [-0.5, 0.5] dọc thân (đầu ở +x), z lên. Đo từ ảnh nghiêng raw_v01.glb.
SPINE_RAW = [
    (-0.500, 0.016), (-0.329, 0.038), (-0.164, 0.053), (0.000, 0.059), (0.123, 0.061), (0.230, 0.073),
    (0.296, 0.102), (0.329, 0.143), (0.335, 0.200), (0.322, 0.265), (0.329, 0.314), (0.353, 0.345),
    (0.411, 0.351), (0.490, 0.351),
]
HEAD_FROM = 11  # chỉ số điểm thô nơi đầu bắt đầu (sau cổ)
ROOT_AT = (0.296, 0.102)  # chỗ cổ bắt đầu nâng: xương gốc `body` nằm quanh đây

wv = np.array([(mesh.matrix_world @ v.co)[:] for v in mesh.data.vertices], dtype=float)
LENGTH = wv[:, 1].max() - wv[:, 1].min()
HEIGHT = wv[:, 2].max() - wv[:, 2].min()
Y_MID = (wv[:, 1].max() + wv[:, 1].min()) / 2
RAW_X_EXTENT = 1.0  # bbox x của raw_v01.glb


def to_std(x, z):
    k = LENGTH / RAW_X_EXTENT
    return np.array([0.0, Y_MID - x * k, z * k])


def auto_spine(k=18):
    """Đường tâm từ lưới: hàn đỉnh trùng vị trí, Dijkstra theo cạnh từ đỉnh chóp đuôi (Y lớn nhất; đầu ở -Y), chia theo
    khoảng cách mặt lưới thành k lớp, mỗi lớp lấy trung vị Y/Z (chân, vây lệch ít vì trung vị). Cổ cong chữ S vẫn đúng
    vì đo theo mặt lưới chứ không theo trục Y."""
    import heapq
    me = mesh.data
    keys = np.round(wv / 1e-4).astype(np.int64)
    _, first, inv = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    inv = np.asarray(inv).reshape(-1)
    n = len(first)
    adj = [[] for _ in range(n)]
    for e in me.edges:
        a, b = int(inv[e.vertices[0]]), int(inv[e.vertices[1]])
        if a != b:
            w = float(np.linalg.norm(wv[e.vertices[0]] - wv[e.vertices[1]]))
            adj[a].append((b, w))
            adj[b].append((a, w))
    pos = wv[first]
    src = int(np.argmax(pos[:, 1]))
    dist = np.full(n, np.inf)
    dist[src] = 0.0
    pq = [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    ok = np.isfinite(dist)
    # chỉ xét thân: bỏ đỉnh có khoảng cách lớn hơn quãng đường tới mút đầu (chân, râu dài hơn)
    head_idx = np.where(ok)[0][np.argsort(pos[ok, 1])[: max(8, int(ok.sum() * 0.004))]]
    dmax = float(np.median(dist[head_idx]))
    edges = np.linspace(0.0, dmax, k + 1)
    pts = [np.array([0.0, pos[src, 1], pos[src, 2]])]
    for i in range(k):
        sel = ok & (dist >= edges[i]) & (dist < edges[i + 1] + (1e-9 if i == k - 1 else 0))
        if sel.sum() < 5:
            continue
        pts.append(np.array([0.0, float(np.median(pos[sel, 1])), float(np.median(pos[sel, 2]))]))
    tip = pos[head_idx]
    pts.append(np.array([0.0, float(tip[:, 1].mean()), float(tip[:, 2].mean())]))
    # làm mượt nhẹ (trung bình 3 điểm, giữ hai mút)
    sm = [pts[0]] + [(pts[i - 1] + 2 * pts[i] + pts[i + 1]) / 4 for i in range(1, len(pts) - 1)] + [pts[-1]]
    return sm


def catmull(pts, per=24):
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return np.array(out)


if SERP.get('spine') == 'auto':
    knots = auto_spine()
    dense = catmull(knots)
    seg = np.linalg.norm(np.diff(dense, axis=0), axis=1)
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    TOTAL = arc[-1]
    HEAD_S = float(SERP.get('headFrom', 0.9)) * TOTAL
    ROOT_S = float(SERP.get('rootAt', 0.6)) * TOTAL
elif SERP.get('auto'):
    # Đường tâm tự đo từ lưới (ngô công nằm ngang, uốn chữ S trên mặt đất, không có ảnh nghiêng để đo tay như Hàn Giao):
    # chia thân thành `bins` lát theo trục dài Y (đuôi +Y → đầu -Y), lấy trọng tâm từng lát (x, z), kéo hai đầu ra mút.
    # `headFrac`: phần thân ở đầu tính là đầu; `rootFrac`: chỗ xương gốc `body` (0 = đuôi, 1 = mõm).
    nb = int(SERP.get('bins', 16))
    edges = np.linspace(wv[:, 1].max(), wv[:, 1].min(), nb + 1)
    knots = []
    for k in range(nb):
        sel = (wv[:, 1] <= edges[k] + 1e-9) & (wv[:, 1] >= edges[k + 1] - 1e-9)
        c = wv[sel].mean(axis=0) if sel.any() else np.array([0.0, (edges[k] + edges[k + 1]) / 2, wv[:, 2].min()])
        knots.append(np.array([c[0], (edges[k] + edges[k + 1]) / 2, c[2]]))
    knots[0][1] = edges[0]
    knots[-1][1] = edges[-1]
    HEAD_FROM = max(1, min(nb - 1, round(nb * (1 - float(SERP.get('headFrac', 0.15))))))
    ROOT_AT = None
    ROOT_PT = knots[max(1, min(nb - 2, round(nb * float(SERP.get('rootFrac', 0.7)))))]
    dense = catmull(knots)
    seg = np.linalg.norm(np.diff(dense, axis=0), axis=1)
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    TOTAL = arc[-1]
    HEAD_S = arc[int(np.argmin(np.linalg.norm(dense - knots[HEAD_FROM], axis=1)))]
    ROOT_S = arc[int(np.argmin(np.linalg.norm(dense - ROOT_PT, axis=1)))]
else:
    knots = [to_std(x, z) for x, z in SPINE_RAW]
    dense = catmull(knots)
    seg = np.linalg.norm(np.diff(dense, axis=0), axis=1)
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    TOTAL = arc[-1]
    head_knot = knots[HEAD_FROM]
    HEAD_S = arc[int(np.argmin(np.linalg.norm(dense - head_knot, axis=1)))]
    root_pt = to_std(*ROOT_AT)
    ROOT_S = arc[int(np.argmin(np.linalg.norm(dense - root_pt, axis=1)))]


def point_at(s):
    return np.array([np.interp(s, arc, dense[:, k]) for k in range(3)])


# ---------- 2. xương ----------

NB = int(SERP.get('bones', 17))  # số xương; xương NB-1 là đầu
D = HEAD_S / (NB - 1)
JOINT_S = [i * D for i in range(NB)] + [TOTAL]  # NB + 1 khớp; khớp NB-1 = đầu cổ, khớp NB = mõm
ROOT = max(0, min(NB - 2, round(ROOT_S / D)))  # xương gốc: đoạn [ROOT*D, (ROOT+1)*D] gần chỗ cổ nâng
J = [point_at(s) for s in JOINT_S]


def bone_name(i):
    if i == ROOT:
        return 'body'
    if i < ROOT:
        return f'tail_{ROOT - i - 1:02d}'  # tail_00 sát gốc, tăng dần ra mút đuôi
    if i == NB - 1:
        return 'head'
    return f'neck_{i - ROOT:02d}'


NAMES = [bone_name(i) for i in range(NB)]
PARENT = [None if i == ROOT else (i + 1 if i < ROOT else i - 1) for i in range(NB)]

arm_data = bpy.data.armatures.new(f'{ASSET_ID}_rig')  # noqa: F821
arm = bpy.data.objects.new(f'{ASSET_ID}_rig', arm_data)  # noqa: F821
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for i in range(NB):
    eb = arm_data.edit_bones.new(NAMES[i])
    a, b = J[i], J[i + 1]
    if i < ROOT:  # đuôi: xương trỏ về phía mút đuôi, đầu xương ở khớp gần gốc
        eb.head, eb.tail = Vector(b), Vector(a)
    else:
        eb.head, eb.tail = Vector(a), Vector(b)
    eb.roll = 0.0
    ebs[i] = eb
for i in range(NB):
    if PARENT[i] is not None:
        ebs[i].parent = ebs[PARENT[i]]
        ebs[i].use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

REST = {NAMES[i]: arm.data.bones[NAMES[i]].matrix_local.to_3x3() for i in range(NB)}
# Hướng tới (từ đuôi lên đầu) của từng đốt, để suy trục quay "rẽ trái" = F × X.
FWD = [(Vector(J[i + 1]) - Vector(J[i])).normalized() for i in range(NB)]
UP_AXIS = [FWD[i].cross(X).normalized() for i in range(NB)]

# ---------- 3. trọng số ----------

centers = [(JOINT_S[i] + JOINT_S[i + 1]) / 2 for i in range(NB - 1)] + [HEAD_S + 0.12 * (TOTAL - HEAD_S)]
for i in range(NB):
    mesh.vertex_groups.new(name=NAMES[i])
VG = [mesh.vertex_groups[NAMES[i]] for i in range(NB)]
# tham số dọc đường tâm của từng đỉnh: điểm gần nhất trên đa tuyến đã làm mượt
dv = wv[:, None, :] - dense[None, :, :]
near = np.argmin((dv ** 2).sum(axis=2), axis=1)
sv = arc[near]
for vi, s in enumerate(sv):
    if s <= centers[0]:
        VG[0].add([vi], 1.0, 'REPLACE')
    elif s >= centers[-1]:
        VG[NB - 1].add([vi], 1.0, 'REPLACE')
    else:
        k = int(np.searchsorted(centers, s) - 1)
        u = (s - centers[k]) / (centers[k + 1] - centers[k])
        VG[k].add([vi], 1.0 - u, 'REPLACE')
        VG[k + 1].add([vi], u, 'REPLACE')
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
mesh.parent = arm
mesh.matrix_parent_inverse = Matrix.Identity(4)

# ---------- 4. dáng và clip ----------

pb = arm.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'
PB = [pb[n] for n in NAMES]
TAIL_N = ROOT  # số đốt đuôi
NECK_N = NB - 1 - ROOT  # số đốt cổ + đầu


def tau(i):
    """0 ở gốc → 1 ở mút đuôi (chỉ đốt đuôi)."""
    return (ROOT - i) / max(1, TAIL_N) if i < ROOT else 0.0


def nu(i):
    """0 ở gốc → 1 ở đầu (chỉ đốt cổ/đầu)."""
    return (i - ROOT) / max(1, NECK_N) if i > ROOT else 0.0


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


def set_pose(angles, move=(0.0, 0.0, 0.0)):
    """angles: {chỉ số đốt: (chúi°, quay°)} góc tuyệt đối; thiếu = nghỉ. move: dịch cả thân (mét) bằng xương gốc."""
    tot = []
    for i in range(NB):
        a, b = angles.get(i, (0.0, 0.0))
        a, b = a * AMP, b * AMP
        tot.append(rot(UP_AXIS[i], b) @ rot(X, a))
    for i in range(NB):
        p = PB[i]
        p.location = (0, 0, 0)
        p.scale = (1, 1, 1)
        M = REST[NAMES[i]]
        R = tot[i] if PARENT[i] is None else tot[PARENT[i]].inverted() @ tot[i]
        p.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()
        if PARENT[i] is None:
            p.location = M.inverted() @ Vector(move)


def key_all(frame):
    for p in PB:
        p.keyframe_insert('rotation_quaternion', frame=frame)
        p.keyframe_insert('location', frame=frame)


def new_clip(name):
    LIFT_BY[name] = 0.0
    LIFT_CLIP[0] = name
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


LIFT_CLIP = ['']
LIFTS = []
LIFT_BY = {}  # clip -> nâng thân lớn nhất (m) để chống xuyên đất; lớn nghĩa là dáng đang ép đầu/thân xuống đất


def ground_min():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    low = min((mw @ v.co).z for v in me.vertices)
    ev.to_mesh_clear()
    return low


def grounded(angles, move):
    """Đặt dáng, nâng cả thân nếu có phần xuyên đất (Z < 0)."""
    set_pose(angles, move)
    low = ground_min()
    if low < -1e-4:
        LIFTS.append(-low)
        LIFT_BY[LIFT_CLIP[0]] = max(LIFT_BY.get(LIFT_CLIP[0], 0.0), -low)
        set_pose(angles, (move[0], move[1], move[2] - low))


def sampled(name, seconds, pose_at, step=2):
    """Clip lặp: pose_at(t ∈ [0, 1)) → (angles, move); khung đầu và cuối trùng nhau."""
    act = new_clip(name)
    n = round(seconds * FPS)
    for f in list(range(0, n, step)) + [n]:
        grounded(*pose_at((f % n) / n))
        key_all(f)
    finish_clip(act, n)
    return n


def lerp_angles(a, b, w):
    out = {}
    for i in range(NB):
        pa, ya = a.get(i, (0.0, 0.0))
        pbb, yb = b.get(i, (0.0, 0.0))
        out[i] = (pa * (1 - w) + pbb * w, ya * (1 - w) + yb * w)
    return out


def keyed(name, seconds, keys):
    """Clip một lần: keys = [(t ∈ [0, 1], angles, move)], nội suy smoothstep giữa các khóa."""
    act = new_clip(name)
    n = round(seconds * FPS)
    for f in range(n + 1):
        t = f / n
        i = max(k for k in range(len(keys)) if keys[k][0] <= t + 1e-9)
        j = min(i + 1, len(keys) - 1)
        span = keys[j][0] - keys[i][0]
        u = 0.0 if span <= 0 else (t - keys[i][0]) / span
        w = u * u * (3 - 2 * u)
        ang = lerp_angles(keys[i][1], keys[j][1], w)
        mv = tuple(a * (1 - w) + b * w for a, b in zip(keys[i][2], keys[j][2]))
        grounded(ang, mv)
        key_all(f)
    finish_clip(act, n)
    return n


FRONT_SPAN = 6  # số đốt thân sau gốc tham gia nhấc thân trước (bản lề trải đều, không gập một khớp)


def pose(neck_pitch=0.0, head_pitch=0.0, neck_yaw=0.0, head_yaw=0.0, tail_pitch=0.0, tail_yaw=0.0, body_yaw=0.0, body_pitch=0.0,
         front=0.0, s_curve=0.0, s_waves=0.75):
    """Dáng tĩnh. Góc tuyệt đối tăng dần dọc cổ (theo nu) và đuôi (theo tau), đầu thêm riêng.
    front: nhấc thân trước (độ): đốt gốc, cổ, đầu ngả lên hẳn; FRONT_SPAN đốt thân kề gốc giảm dần về 0 nên đoạn thân
    sau vẫn nằm đất. s_curve: đuôi uốn chữ S (biên độ độ, s_waves nửa chu kỳ... theo chiều dài đuôi) cho dáng đổ/nằm."""
    ang = {ROOT: (body_pitch - front, body_yaw)}
    for i in range(NB):
        if i > ROOT:
            n = nu(i)
            ang[i] = (body_pitch - front + neck_pitch * n, body_yaw + neck_yaw * n)
        elif i < ROOT:
            t = tau(i)
            k = ROOT - i  # 1 = đốt kề gốc
            ramp = max(0.0, 1.0 - k / FRONT_SPAN)
            s = s_curve * math.sin(TAU * s_waves * t) * min(1.0, t * 4.0)
            ang[i] = (body_pitch + tail_pitch * t - front * ramp, body_yaw + tail_yaw * t + s)
    h = NB - 1
    ang[h] = (ang[h][0] + head_pitch, ang[h][1] + head_yaw)
    return ang


def wave(ph, tail_amp, body_amp, neck_amp, speed_k, neck_phase=1.0, head_amp=0.0, vert_amp=0.0, vert_k=None):
    """Sóng chạy dọc thân: rẽ ngang (quay, biên độ tăng dần về đuôi, pha lệch theo đốt) và nhấp nhô dọc (chúi, vert_amp).
    ph: radian. Cổ lắc nhẹ ngược pha đuôi, đầu lệch pha."""
    vk = speed_k if vert_k is None else vert_k
    ang = {ROOT: (0.0, body_amp * math.sin(ph))}
    for i in range(NB):
        if i < ROOT:
            t = tau(i)
            amp = body_amp + (tail_amp - body_amp) * t
            ang[i] = (vert_amp * math.sin(ph - vk * t + 1.3) * min(1.0, t * 3.0), amp * math.sin(ph - speed_k * t))
        elif i > ROOT:
            n = nu(i)
            ang[i] = (0.0, neck_amp * n * math.sin(ph + neck_phase * n))
    h = NB - 1
    ang[h] = (0.0, ang[h][1] + head_amp * math.sin(ph + neck_phase + 0.6))
    return ang


def add(a, b):
    out = {}
    for i in range(NB):
        pa, ya = a.get(i, (0.0, 0.0))
        pbb, yb = b.get(i, (0.0, 0.0))
        out[i] = (pa + pbb, ya + yb)
    return out


REST_KEY = {}
LEN = LENGTH  # tham chiếu cho dịch chuyển (mét)
TAU = 2 * math.pi


# idle: thở, cổ đung đưa, thân và đuôi uốn lượn chậm (sóng chạy từ gốc ra đuôi)
def idle(t):
    a = TAU * t
    if STYLE == 'swim':  # lơ lửng: sóng dọc nhấp nhô chậm, rẽ ngang ít
        ang = add(wave(a, 8.0, 2.0, 3.0, 4.0, head_amp=1.5, vert_amp=13.0, vert_k=4.4),
                  pose(neck_pitch=3.0 * math.sin(a), head_pitch=3.0 * math.sin(a - 0.8)))
        return ang, (0.0, 0.0, 0.02 * LEN * math.sin(a))
    ang = add(wave(a, 26.0, 8.0, 7.0, 5.2, head_amp=3.0, vert_amp=2.0),
              pose(neck_pitch=2.0 * math.sin(a), head_pitch=3.0 * math.sin(a - 0.8)))
    return ang, (0.0, 0.0, 0.0)


# run: trườn, sóng lớn chạy dọc thân, cổ ngẩng hơi chúi tới
def run(t):
    a = TAU * t
    if STYLE == 'swim':  # bơi trong không khí: sóng dọc lớn từ thân ra đuôi, đầu dẫn
        ang = add(wave(a, 12.0, 3.0, 4.0, 6.0, neck_phase=1.6, head_amp=2.0, vert_amp=24.0, vert_k=5.5),
                  pose(neck_pitch=4.0, head_pitch=-4.0))
        return ang, (0.0, 0.0, 0.03 * LEN * math.sin(a))
    ang = add(wave(a, 34.0, 15.0, 10.0, 7.5, neck_phase=2.2, head_amp=4.0, vert_amp=4.0),
              pose(neck_pitch=12.0, head_pitch=-6.0, front=4.0 * math.sin(a)))
    return ang, (0.0, 0.0, 0.0)


REACH = 0.16 * LEN  # lao tới tối đa (m)
coil = pose(neck_pitch=-30.0, head_pitch=-20.0, tail_yaw=14.0, front=16.0)
strike = pose(neck_pitch=66.0, head_pitch=34.0, tail_yaw=-12.0, front=-4.0)
biteo = pose(neck_pitch=58.0, head_pitch=52.0, tail_yaw=-18.0, front=-6.0)

n_idle = sampled('idle', 3.2, idle)
n_run = sampled('run', 1.0, run)
n_attack = keyed('attack', 0.9, [
    (0.00, REST_KEY, (0, 0, 0)),
    (0.26, coil, (0, 0.04 * LEN, 0)),
    (0.42, strike, (0, -REACH, 0)),
    (0.52, biteo, (0, -REACH, 0)),
    (0.70, pose(neck_pitch=22.0, head_pitch=14.0, tail_yaw=8.0), (0, -0.05 * LEN, 0)),
    (1.00, REST_KEY, (0, 0, 0)),
])
n_hit = keyed('hit_light', 0.4, [
    (0.00, REST_KEY, (0, 0, 0)),
    (0.30, pose(neck_pitch=-20.0, head_pitch=-20.0, tail_yaw=-24.0, s_curve=10.0, front=8.0), (0, 0.03 * LEN, 0)),
    (1.00, REST_KEY, (0, 0, 0)),
])
n_death = keyed('death', 2.6, [
    (0.00, REST_KEY, (0, 0, 0)),
    (0.14, pose(neck_pitch=-24.0, head_pitch=-16.0, front=28.0, tail_yaw=10.0), (0, 0.03 * LEN, 0)),
    (0.34, pose(neck_pitch=40.0, head_pitch=24.0, neck_yaw=18.0, front=8.0, tail_yaw=26.0, s_curve=18.0), (0, -0.05 * LEN, 0)),
    (0.60, pose(neck_pitch=104.0, head_pitch=8.0, neck_yaw=38.0, tail_yaw=40.0, body_yaw=8.0, s_curve=34.0), (0, -0.08 * LEN, 0)),
    (1.00, pose(neck_pitch=108.0, head_pitch=4.0, neck_yaw=42.0, tail_yaw=46.0, body_yaw=10.0, s_curve=40.0), (0, -0.08 * LEN, 0)),
])

extra_clips = {}
if 'slam' in EXTRA:
    # nhấc thân trước lên cao ngửa cổ → nện cả thân trước và đầu xuống (chạm 1,0 s) → giữ → về
    rear = pose(neck_pitch=-30.0, head_pitch=-22.0, front=58.0, tail_yaw=12.0)
    smash = pose(neck_pitch=88.0, head_pitch=40.0, front=-6.0, tail_yaw=-16.0)
    extra_clips['slam'] = keyed('slam', 1.8, [
        (0.00, REST_KEY, (0, 0, 0)),
        (0.22, pose(neck_pitch=-18.0, head_pitch=-10.0, front=26.0, tail_yaw=6.0), (0, 0.03 * LEN, 0)),
        (0.47, rear, (0, 0.06 * LEN, 0)),
        (0.53, rear, (0, 0.06 * LEN, 0)),
        (0.556, smash, (0, -0.12 * LEN, 0)),
        (0.75, smash, (0, -0.12 * LEN, 0)),
        (1.00, REST_KEY, (0, 0, 0)),
    ])
if 'sweep' in EXTRA:
    # ngả cổ sang phải, đuôi cuộn sang trái lấy đà → quật: đầu quét từ phải sang trái (giữa quạt 0,9 s) cùng đuôi quật ngược lại
    draw = pose(neck_pitch=-18.0, head_pitch=4.0, neck_yaw=-60.0, head_yaw=-14.0, tail_yaw=62.0, body_yaw=-6.0, front=14.0)
    mid = pose(neck_pitch=46.0, head_pitch=22.0, neck_yaw=0.0, tail_yaw=0.0, body_yaw=0.0, front=0.0)
    end = pose(neck_pitch=46.0, head_pitch=22.0, neck_yaw=60.0, head_yaw=14.0, tail_yaw=-70.0, body_yaw=6.0, front=0.0)
    extra_clips['sweep'] = keyed('sweep', 1.7, [
        (0.00, REST_KEY, (0, 0, 0)),
        (0.30, draw, (0, 0.05 * LEN, 0)),
        (0.53, mid, (0, -0.08 * LEN, 0)),
        (0.66, end, (0, -0.08 * LEN, 0)),
        (0.78, end, (0, -0.08 * LEN, 0)),
        (1.00, REST_KEY, (0, 0, 0)),
    ])
if 'stun' in EXTRA:
    def stun(t):
        a = TAU * t
        ang = add(wave(a, 9.0, 2.0, 5.0, 3.0, vert_amp=1.5), pose(neck_pitch=40.0 + 3.0 * math.sin(2 * a), head_pitch=24.0, s_curve=10.0))
        return ang, (0.0, 0.0, 0.0)
    extra_clips['stun'] = sampled('stun', 1.6, stun)
if 'chant' in EXTRA:
    def chant(t):
        a = TAU * t
        pulse = math.sin(2 * a)
        ang = add(wave(a, 14.0, 5.0, 4.0, 4.5, vert_amp=2.0),
                  pose(neck_pitch=-24.0 + 4.0 * pulse, head_pitch=-22.0 + 5.0 * pulse, front=22.0 + 3.0 * pulse))
        return ang, (0.0, 0.0, 0.0)
    extra_clips['chant'] = sampled('chant', 2.0, chant)

set_pose({})
bpy.context.scene.render.fps = FPS

REPORT = {
    'bones': NB,
    'root': NAMES[ROOT],
    'tail': TAIL_N,
    'neck': NECK_N,
    'length': round(float(LENGTH), 3),
    'height': round(float(HEIGHT), 3),
    'clips': {'idle': n_idle, 'run': n_run, 'attack': n_attack, 'hit_light': n_hit, 'death': n_death, **extra_clips},
    'maxLift': round(max(LIFTS), 3) if LIFTS else 0.0,
    'liftByClip': {k: round(v, 3) for k, v in LIFT_BY.items()},
}
print(f'[anim_serpent] {ASSET_ID}: {REPORT}')  # noqa: F821
