# C2 (NV3-B, thí nghiệm "cách 2 — tách lưới"): giai đoạn chen vào chr_v3.py (cờ `--c2`), chạy NGAY SAU khi trọng số C4 + lò xo đã tính (biến W, COLS, VP, adj…),
# trước khi tạo nhóm đỉnh. Nạp bằng exec trong không gian tên của chr_v3.py (dùng chung BODY, ARM đang ở Edit Mode, add_bone, Fp_HEAD/TAIL…).
#
# Làm gì (chỉ áp cho model giữ gốc Tripo, UV/texture/pháp tuyến giữ nguyên):
#   1. Phân vùng đỉnh: 0 thân (đầu, ngực, tay, giáp vai, tóc), 1/2 voan trái/phải (lớp lavender treo từ tay xuống gấu), 3/4 vạt váy trước/sau,
#      5 chân (ủng + cẳng dưới gấu).
#   2. Cắt lưới: mọi cạnh giữa hai mặt khác vùng bị tách (bmesh.split_edges) → đỉnh ở đường cắt nhân đôi (cùng vị trí/UV/pháp tuyến); số cạnh "cầu nối" voan–thân
#      và vạt–chân về 0. Đường cắt là viền mềm: trọng số hai bản sao ở đường cắt trộn `seamTie` về trung bình để mép không hở khi đứng yên.
#   3. Thân dưới áo (vùng 6): ống elip lofted dọc thân, hông, tay, đùi/cẳng, thu nhỏ vào trong lớp vải (cỡ theo bách phân vị 10 khoảng cách đỉnh vải), UV trỏ vào một
#      texel màu nền áo (cùng vật liệu → không thêm draw call), trọng số cứng theo xương lõi; chỉ lộ ra khi vải hở.
#   4. Trọng số theo lớp: voan có chuỗi xương phụ riêng (`dtl_o_sleeve_veil_<l|r>_<k>_<j>`, con của cẳng tay), trọng số chuyển từ xương tay (phần trên) sang hông + chuỗi
#      (phần dưới); mỗi vùng làm mượt riêng trên đồ thị cạnh MỚI (không còn cạnh hàn giữa các lớp).
import heapq
import json as _json

C2 = (_json.load(open(C2_CFG, encoding='utf-8')).get('c2') or {}) if C2_CFG else {}
for _g in ('nam', 'nu'):  # ghi đè theo giới: c2.nam / c2.nu (id asset kết thúc bằng _nam/_nu); khóa còn lại dùng chung
    _ov = C2.pop(_g, None)
    if _ov and ID.endswith('_' + _g):
        C2.update(_ov)
if os.environ.get('C2_JSON'):
    C2.update(_json.loads(os.environ['C2_JSON']))  # thử tham số nhanh, không sửa file cấu hình
_H = height
_SD = {'l': 1.0, 'r': -1.0}
_cxs = float(Fp_HEAD['pelvis'][0])


def _segd(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + np.outer(t, ab)), axis=1)


_N0 = NV
_lum = (TEXEL @ np.array([0.299, 0.587, 0.114])) if TEXEL is not None else np.zeros(NV)
_lav = (_lum > C2.get('lavLum', 0.42)) & (TEXEL[:, 2] > TEXEL[:, 1] + 0.06) & (TEXEL[:, 2] >= TEXEL[:, 0] - 0.02)
_ax = np.abs(VP[:, 0] - _cxs)
_arm_d = np.full(NV, 9.0)
for _s, _g in _SD.items():
    _m = (VP[:, 0] - _cxs) * _g > 0
    _arm_d[_m] = np.minimum(_segd(VP[_m], Fp_HEAD[f'upperarm_{_s}'], Fp_HEAD[f'lowerarm_{_s}']), _segd(VP[_m], Fp_HEAD[f'lowerarm_{_s}'], Fp_HEAD[f'hand_{_s}']))
_cand = ((_ax > C2.get('veilX', 0.12) * _H / 1.7) & _lav & (_arm_d > C2.get('armKeep', 0.045) * _H / 1.7)) | (
    (_ax > C2.get('veilXLow', 0.20) * _H / 1.7) & (VP[:, 2] < C2.get('veilZLow', 0.9) * _H / 1.7) & (_arm_d > C2.get('armKeep', 0.045) * _H / 1.7))
if C2.get('veilGeo'):  # voan nhận theo hình học (không theo màu): bộ voan trắng/kem, màu không tách được khỏi áo
    _cand |= (_ax > C2.get('veilX', 0.12) * _H / 1.7) & (VP[:, 2] < C2.get('veilZMax', 1.12) * _H / 1.7) & (_arm_d > C2.get('armKeep', 0.045) * _H / 1.7)
_cand &= VP[:, 2] > 0.03 * _H / 1.7
_lab_v = _cand.copy()
for _it in range(8):  # lọc đa số trên đồ thị cạnh: bỏ đốm lẻ
    _nl = _lab_v.copy()
    for _i in range(NV):
        if adj[_i]:
            _f = float(np.mean([_lab_v[_j] for _j in adj[_i]]))
            _nl[_i] = (_f > 0.5) if abs(_f - 0.5) > 0.15 else _lab_v[_i]
    _lab_v = _nl
LAB = np.zeros(NV, int)
_zw = C2.get('waistZ', 0.96) * _H / 1.7
_side = np.where(VP[:, 0] - _cxs > 0, 1, 2)
LAB[(VP[:, 2] < _zw) & ~_lab_v] = 3
LAB[(VP[:, 2] < _zw) & ~_lab_v & (VP[:, 1] >= Fp_HEAD['pelvis'][1])] = 4
LAB[_lab_v] = _side[_lab_v]
_hk = C2.get('handKeep', 0) * _H / 1.7  # bàn tay/cổ tay ở dưới eo (người cao, tay buông thấp) không thuộc vạt: giữ vùng thân
if _hk > 0:
    _hand_d = np.full(NV, 9.0)
    for _s in _SD:
        _hand_d = np.minimum(_hand_d, _segd(VP, Fp_HEAD[f'hand_{_s}'], Fp_TAIL[f'hand_{_s}']))
        _hand_d = np.minimum(_hand_d, _segd(VP, Fp_HEAD[f'lowerarm_{_s}'], Fp_HEAD[f'hand_{_s}']))
    LAB[(_hand_d < _hk) & (LAB != 1) & (LAB != 2)] = 0
_leg_d = np.full(NV, 9.0)
for _s in _SD:
    for _a, _b in ((f'calf_{_s}', f'foot_{_s}'), (f'foot_{_s}', f'ball_{_s}')):
        _leg_d = np.minimum(_leg_d, _segd(VP, Fp_HEAD[_a], Fp_HEAD[_b]))
LAB[(LAB != 1) & (LAB != 2) & (_leg_d < C2.get('legR', 0.065) * _H / 1.7) & (VP[:, 2] < C2.get('legZ', 0.30) * _H / 1.7)] = 5
log('C2 phân vùng (đỉnh): ' + ', '.join(f'{n}={int((LAB == k).sum())}' for k, n in enumerate(('than', 'voan_l', 'voan_r', 'vay_truoc', 'vay_sau', 'chan'))))

# ---------- cắt lưới ----------
_bm = bmesh.new()
_bm.from_mesh(BODY.data)
_bm.verts.ensure_lookup_table()
_bm.faces.ensure_lookup_table()
_orig_l = _bm.verts.layers.int.new('c2orig')
for _v in _bm.verts:
    _v[_orig_l] = _v.index
_fl = []
for _f in _bm.faces:
    _c = np.bincount([LAB[_v.index] for _v in _f.verts], minlength=6)
    _fl.append(int(np.argmax(_c)) if _c.max() > 1 or len(_f.verts) == 3 else int(LAB[_f.verts[0].index]))
_fl = np.array(_fl)
_n_edges_cut = 0
_cut = []
for _e in _bm.edges:
    _fs = _e.link_faces
    if len(_fs) == 2 and _fl[_fs[0].index] != _fl[_fs[1].index]:
        _cut.append(_e)
_n_edges_cut = len(_cut)
_n_v_before = len(_bm.verts)
bmesh.ops.split_edges(_bm, edges=_cut)
_bm.verts.ensure_lookup_table()
_bm.faces.ensure_lookup_table()
log(f'C2 cắt lưới: {_n_edges_cut} cạnh, đỉnh {_n_v_before} → {len(_bm.verts)} (+{len(_bm.verts) - _n_v_before})')
REP['c2_cut_edges'] = _n_edges_cut
REP['c2_verts_added_by_cut'] = len(_bm.verts) - _n_v_before
# nhãn vùng của từng đỉnh sau cắt = nhãn mặt (đỉnh nào cũng chỉ còn thuộc một vùng mặt)
_vlab = np.zeros(len(_bm.verts), int)
for _f in _bm.faces:
    for _v in _f.verts:
        _vlab[_v.index] = _fl[_f.index]
_vorig = np.array([_v[_orig_l] for _v in _bm.verts], int)

# ---------- thân dưới áo ----------
_U = []   # (center, normal-frame basis u, v, rx, ry, bone-weights dict)
_chains = {
    'torso': [('pelvis', 0.9), ('spine_01', 1.0), ('spine_02', 1.05), ('spine_03', 1.0), ('neck_01', 0.8)],
}
_core_names = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
               'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']
_core_idx = {n: IDX[n] for n in _core_names}
_body_mask = (_vlab[np.arange(len(_vlab))] != 6)
_PV = np.array([_v.co[:] for _v in _bm.verts], float)


def _inner_radius(a, b, lo=0.03, hi=0.12, pct=10, t0=0.1, t1=0.9):
    """Bán kính ống: bách phân vị thấp của khoảng cách đỉnh THÂN (vùng 0) quanh đoạn a→b (nhân hệ số thu nhỏ) → ống nằm trong lớp vải trong cùng."""
    ab = b - a
    L = float(np.linalg.norm(ab))
    t = ((_PV - a) @ ab) / max(L * L, 1e-9)
    rad = np.linalg.norm(_PV - (a + np.outer(t, ab)), axis=1)
    sel = (t > t0) & (t < t1) & (rad < 0.22 * _H / 1.7) & (_vlab == 0)
    if sel.sum() < 20:
        return lo * _H / 1.7
    r = float(np.percentile(rad[sel], pct)) * C2.get('underScale', 0.85)
    return float(np.clip(r, lo * _H / 1.7, hi * _H / 1.7))


_ring_verts = []
_ring_w = []   # trọng số (bone → w) cho từng đỉnh ống
_ringN = 8
_ufaces = []


def _tube(nodes, bones, radii, ell=1.0):
    """nodes: các điểm dọc đường; bones[i]: xương cho đoạn i→i+1; radii: bán kính tại mỗi nút. Khung ring: u = X thế giới (x elip nhân ell), v = vuông góc."""
    base = len(_ring_verts)
    for i, p in enumerate(nodes):
        d = (nodes[min(i + 1, len(nodes) - 1)] - nodes[max(i - 1, 0)])
        d = d / max(np.linalg.norm(d), 1e-9)
        u = np.cross(d, [0, 1.0, 0]) if abs(d[1]) < 0.9 else np.cross(d, [1.0, 0, 0])
        u /= np.linalg.norm(u)
        v = np.cross(d, u)
        for k in range(_ringN):
            a = 2 * math.pi * k / _ringN
            _ring_verts.append(p + radii[i] * (ell * math.cos(a) * u + math.sin(a) * v))
            if i == 0:
                w = {bones[0]: 1.0}
            elif i == len(nodes) - 1:
                w = {bones[-1]: 1.0}
            else:
                w = {bones[i - 1]: 0.5, bones[i]: 0.5}
            if len(bones) == 1:
                w = {bones[0]: 1.0}
            _ring_w.append(w)
    for i in range(len(nodes) - 1):
        for k in range(_ringN):
            a0, a1 = base + i * _ringN + k, base + i * _ringN + (k + 1) % _ringN
            _ufaces.append((a0, a1, a1 + _ringN, a0 + _ringN))


_tp = [Fp_HEAD[n] for n, _ in _chains['torso']] + [Fp_TAIL['neck_01']]
_trad = []
for _i in range(len(_tp) - 1):
    _trad.append(_inner_radius(_tp[_i], _tp[_i + 1], 0.05, 0.13))
_trad.append(_trad[-1] * 0.7)
_tnames = [n for n, _ in _chains['torso']]
_tube(_tp, _tnames, _trad, ell=1.25)
for _s in _SD:
    if C2.get('legTube', False):  # ống đùi/cẳng: mặc định tắt (lòi ra ngoài khi váy dạt)
        _tube([Fp_HEAD[f'thigh_{_s}'], Fp_HEAD[f'calf_{_s}'], Fp_HEAD[f'foot_{_s}']], [f'thigh_{_s}', f'calf_{_s}'],
              [_inner_radius(Fp_HEAD[f'thigh_{_s}'], Fp_HEAD[f'calf_{_s}'], 0.05, 0.11) * 0.9, _inner_radius(Fp_HEAD[f'calf_{_s}'], Fp_HEAD[f'foot_{_s}'], 0.04, 0.08) * 0.9,
               0.04 * _H / 1.7])
    if C2.get('armTube', False):  # chỉ đoạn vai → khuỷu, nhỏ: mặc định tắt
        _tube([Fp_HEAD[f'upperarm_{_s}'], Fp_HEAD[f'lowerarm_{_s}']], [f'upperarm_{_s}'], [0.03 * _H / 1.7, 0.028 * _H / 1.7])
_ring_verts_np = np.array(_ring_verts)
log(f'C2 thân dưới áo: {len(_ring_verts)} đỉnh, {len(_ufaces)} mặt; bán kính thân {[round(float(r), 3) for r in _trad]}')

# texel màu nền: đỉnh thân có texel gần màu tím áo nhất → UV của nó
_uv_l = _bm.loops.layers.uv.active
_target = np.array(C2.get('underColor', [0.25, 0.20, 0.34]))
_TEX0 = TEXEL
_best_o = int(np.argmin(np.linalg.norm(_TEX0 - _target, axis=1)))
_best_uv = None
for _v in _bm.verts:
    if _v[_orig_l] == _best_o:
        for _l in _v.link_loops:
            _best_uv = _l[_uv_l].uv.copy()
            break
        break
log(f'C2 texel nền áo: đỉnh {_best_o} rgb={np.round(_TEX0[_best_o], 2).tolist()} uv={tuple(round(float(x), 3) for x in _best_uv)}')
_nb = len(_bm.verts)
_newv = [_bm.verts.new(Vector(p.tolist())) for p in _ring_verts]
for _v in _newv:
    _v[_orig_l] = -1
_bm.verts.ensure_lookup_table()
for _fi in _ufaces:
    try:
        _f = _bm.faces.new([_newv[i] for i in _fi])
    except ValueError:
        continue
    for _l in _f.loops:
        _l[_uv_l].uv = _best_uv
_bm.verts.index_update()
_bm.faces.ensure_lookup_table()
_vlab = np.concatenate([_vlab, np.full(len(_newv), 6, int)])
_vorig = np.concatenate([_vorig, np.full(len(_newv), -1, int)])
_bm.to_mesh(BODY.data)
_bm.free()
BODY.data.update()
# pháp tuyến thân dưới áo (không có custom normal): để Blender tự tính hoặc đặt cùng hướng ngoài
NV = len(BODY.data.vertices)
assert NV == len(_vlab), (NV, len(_vlab))
VPn = np.array([v.co[:] for v in BODY.data.vertices], float)
assert np.allclose(VPn[:_nb][_vorig[:_nb] >= 0], VP[_vorig[:_nb][_vorig[:_nb] >= 0]], atol=1e-4), 'thứ tự đỉnh đổi'
# ánh xạ cũ → mới
_o2 = np.where(_vorig >= 0, _vorig, 0)
VP = VPn
_adjn = [[] for _ in range(NV)]
for _p in BODY.data.polygons:
    _vs = list(_p.vertices)
    for _a_ in range(len(_vs)):
        _x, _y = _vs[_a_], _vs[(_a_ + 1) % len(_vs)]
        _adjn[_x].append(_y)
        _adjn[_y].append(_x)
adj = [sorted(set(a)) for a in _adjn]
RIGID = np.where(_vorig >= 0, RIGID[_o2], True)
W = np.where((_vorig >= 0)[:, None], W[_o2], 0.0)
if 'SLEEVE' in globals():
    SLEEVE = np.where(_vorig >= 0, SLEEVE[_o2], False)
TEXEL = np.where((_vorig >= 0)[:, None], TEXEL[_o2], 0.5)
LABN = _vlab


def _bridge_count(a, b):
    n = 0
    for _u in range(NV):
        for _w in adj[_u]:
            if _u < _w and ((LABN[_u] in a and LABN[_w] in b) or (LABN[_u] in b and LABN[_w] in a)):
                n += 1
    return n


REP['c2_bridge_after'] = {'voan-khac': _bridge_count((1, 2), (0, 3, 4, 5)), 'chan-khac': _bridge_count((5,), (0, 3, 4, 1, 2)), 'underbody-vai': _bridge_count((6,), (0, 1, 2, 3, 4, 5))}
log(f'C2 cạnh cầu nối sau cắt: {REP["c2_bridge_after"]}')

# ---------- xương phụ voan + trọng số theo lớp ----------
_K = C2.get('veilStrips', 3)
_J = C2.get('veilLinks', 2)
_zt, _zh = C2.get('veilTop', 1.05) * _H / 1.7, C2.get('veilHem', 0.08) * _H / 1.7
_new_cols = {}
_veil_info = {}
for _s, _g in _SD.items():
    _lbl = 1 if _g > 0 else 2
    _vi = np.where(LABN == _lbl)[0]
    _ys = VP[_vi, 1]
    _edges = np.quantile(_ys, np.linspace(0, 1, _K + 1))
    _cent = []
    for _k in range(_K):
        _row = []
        for _j in range(_J + 1):
            _z = _zt + (_zh - _zt) * _j / _J
            _m = (_ys >= _edges[_k]) & (_ys <= _edges[_k + 1]) & (np.abs(VP[_vi, 2] - _z) < (_zt - _zh) / _J * 0.6)
            _pts = VP[_vi[_m]] if _m.any() else VP[_vi]
            _row.append(np.array([float(_pts[:, 0].mean()), float(_pts[:, 1].mean()), _z]))
        _cent.append(_row)
        _prev = C2.get('veilParent', 'pelvis')
        for _j in range(_J):
            _nm = f'dtl_o_sleeve_veil_{_s}_{_k}_{_j}'
            add_bone(_nm, _prev, _row[_j], _row[_j + 1])
            _new_cols[_nm] = len(COLS) + len(_new_cols)
            _prev = _nm
            n_spring += 1
    _veil_info[_s] = (_vi, None, _cent, _edges)
_base_c = len(COLS)
COLS += list(_new_cols)
W = np.hstack([W, np.zeros((NV, len(_new_cols)))])
_ci = {n: _base_c + i for i, n in enumerate(_new_cols)}


def _smooth01(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


_sgn_l = 1.0 if Fp_HEAD['thigh_l'][0] > _cxs else -1.0
_R_ARM = C2.get('veilArmR', 0.10) * _H / 1.7
_CH = C2.get('veilChain', 0.45)
_PEL = C2.get('veilPelvis', 0.7)
for _s, _g in _SD.items():
    _vi, _, _cent, _edges = _veil_info[_s]
    _names_arm = [f'upperarm_{_s}', f'lowerarm_{_s}', f'hand_{_s}']
    _ycent = np.array([np.mean([_cent[k][j][1] for j in range(_J + 1)]) for k in range(_K)])
    _zlev = np.array([_zt + (_zh - _zt) * (_j + 0.5) / _J for _j in range(_J)])
    for _i in _vi:
        x, y, z = VP[_i]
        _dd = np.array([_segd(VP[_i][None], Fp_HEAD[n], Fp_TAIL[n])[0] for n in _names_arm])
        _iw = 1.0 / (_dd ** 2 + 1e-4)
        _iw /= _iw.sum()
        _garm = float(math.exp(-((_dd.min() / max(_R_ARM, 1e-6)) ** 2))) * float(_smooth01((z - 0.55 * _H / 1.7) / (0.3 * _H / 1.7)))
        _u = float(np.clip((_zt - z) / (_zt - _zh), 0, 1))
        _sc = (1 - _garm) * _CH * float(_smooth01((_u - 0.15) / 0.4))
        _rest = 1 - _garm - _sc
        W[_i] = 0
        for _n, _w in zip(_names_arm, _iw):
            W[_i, IDX[_n]] = _garm * _w
        W[_i, IDX['pelvis']] += _rest * _PEL
        W[_i, IDX[f'thigh_{_s}']] += _rest * (1 - _PEL) * float(_smooth01((0.6 * _H / 1.7 - z) / (0.3 * _H / 1.7)))
        W[_i, IDX['pelvis']] += _rest * (1 - _PEL) * (1 - float(_smooth01((0.6 * _H / 1.7 - z) / (0.3 * _H / 1.7))))
        # chuỗi: nội suy tuyến tính theo y giữa hai dải kề, theo z giữa hai khớp kề
        _wy = np.maximum(0, 1 - np.abs(y - _ycent) / max((_ycent[-1] - _ycent[0]) / max(_K - 1, 1), 1e-3))
        _wy = _wy / max(_wy.sum(), 1e-9)
        _wz = np.maximum(0, 1 - np.abs(z - _zlev) / max((_zlev[0] - _zlev[-1]) / max(_J - 1, 1), 1e-3))
        _wz = _wz / max(_wz.sum(), 1e-9)
        for _k in range(_K):
            for _j in range(_J):
                W[_i, _ci[f'dtl_o_sleeve_veil_{_s}_{_k}_{_j}']] += _sc * _wy[_k] * _wz[_j]

# chân (ủng + cẳng dưới gấu): chỉ xương chân cùng phía (cẳng, bàn, mũi), nội suy theo khoảng cách tới đoạn xương → ống cứng theo chân, không bị hông kéo
for _i in np.where(LABN == 5)[0]:
    _sd_ = 'l' if (VP[_i][0] - _cxs) * _sgn_l > 0 else 'r'
    _nm_ = [f'calf_{_sd_}', f'foot_{_sd_}', f'ball_{_sd_}']
    _dd = np.array([_segd(VP[_i][None], Fp_HEAD[n], Fp_TAIL[n])[0] for n in _nm_])
    _iw = 1.0 / (_dd ** 2 + 1e-4)
    _iw /= _iw.sum()
    W[_i] = 0
    for _n, _w in zip(_nm_, _iw):
        W[_i, IDX[_n]] = _w
# vạt váy: giảm phần bám đùi/cẳng (hai nửa váy ăn hai chân nên xé khi bước), chuyển sang hông
_kt = float(C2.get('skirtThighK', 0.5))
_ciall = {n: i for i, n in enumerate(COLS)}
for _n in ('thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r', 'thigh_twist_l', 'thigh_twist_r'):
    _ix = _ciall[_n]
    for _i in np.where((LABN == 3) | (LABN == 4))[0]:
        _mv = W[_i, _ix] * (1 - _kt)
        W[_i, _ix] -= _mv
        W[_i, IDX['pelvis']] += _mv

# thân dưới áo: trọng số cứng theo xương lõi
for _q, _w in enumerate(_ring_w):
    _vi = _nb + _q
    W[_vi] = 0
    for _n, _wv in _w.items():
        W[_vi, IDX[_n]] = _wv
RIGID[_nb:] = True

# viền mềm: hai bản sao của một đỉnh gốc ở hai vùng kề nhau trộn `seamTie` về trung bình
_tie = float(C2.get('seamTie', 0.3))
if _tie > 0:
    _groups = {}
    for _i in range(_nb):
        _groups.setdefault(int(_vorig[_i]), []).append(_i)
    _n_tied = 0
    for _o, _ids in _groups.items():
        if len(_ids) > 1:
            _ids = [i for i in _ids if LABN[i] != 6]
            _mean = W[_ids].mean(axis=0)
            for _i in _ids:
                W[_i] = (1 - _tie) * W[_i] + _tie * _mean
            _n_tied += len(_ids)
    log(f'C2 viền mềm: {_n_tied} đỉnh trộn {_tie}')
    REP['c2_seam_tied'] = _n_tied

# làm mượt riêng trong từng vùng (đồ thị cạnh mới: không còn cạnh nối vùng)
_it_s = int(C2.get('smooth', 12))
for _it in range(_it_s):
    _Wn = W.copy()
    for _vi in range(NV):
        if RIGID[_vi] or not adj[_vi] or LABN[_vi] == 6:
            continue
        _nb_i = [j for j in adj[_vi] if LABN[j] == LABN[_vi]]
        if _nb_i:
            _Wn[_vi] = 0.5 * W[_vi] + 0.5 * W[_nb_i].mean(axis=0)
    W = _Wn
for _vi in range(NV):
    _row = W[_vi]
    if np.count_nonzero(_row) > 4:
        _row[_row < np.sort(_row)[-4]] = 0
    _sm = _row.sum()
    W[_vi] = _row / _sm if _sm > 1e-9 else _row
if os.environ.get('C2_DUMP2'):  # chẩn đoán: vị trí/nhãn vùng/trọng số cuối
    np.savez(os.environ['C2_DUMP2'], VP=VP, LAB=LABN, W=W, COLS=np.array(COLS), BN=np.array(list(Fp_HEAD)), BH=np.array([Fp_HEAD[k] for k in Fp_HEAD], float), BT=np.array([Fp_TAIL[k] for k in Fp_HEAD], float))
REP['c2_verts'] = NV
REP['c2_underbody'] = {'verts': len(_ring_verts), 'tris_quads': len(_ufaces)}
log(f'C2 xong: {NV} đỉnh (gốc {_N0}), {len(COLS)} cột trọng số')
