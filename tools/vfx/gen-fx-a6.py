#!/usr/bin/env python3
"""A6 (Họa Pháp Lô 2): timeline riêng cho 9 boss chương 6–7 (Hư Ảnh Chủ, Đỉnh Linh, Phủ Chủ, Tử Quang Dực Chủ, Kiều Thủ, Vệ Kiều, Thạch Tượng, Đạo Linh, Lộ Linh)
và 5 tinh anh (Hư Ảnh Nhân, Ảnh Hạc Vương, Lộ Thạch Tướng, Sa Tướng, Mây Lang Vương): 33 chiêu, concept đã duyệt (artifacts a6/bang-concept-dot1..4).
Mỗi chiêu: `mon_warn*__<quái>__<chiêu>` (vạch báo ĐỎ chuẩn kẻ địch, decal `top` đè lên thân boss) + `mon_boom_*__<quái>__<chiêu>` (vùng nổ theo màu hệ, KHÔNG đỏ/cam,
phủ đúng vùng server `zone.r`). Chiêu niệm (chant) thêm `mon_cast__<quái>`.
Hình vùng nổ là SPRITE Codex vẽ (nhóm atlas `guong`, `dong`, `kieu`; tiền tố `guong_ dao_ dong_ phu_ tuq_ kieu_ sa_ may_`, kiểu tô dùng lại số có sẵn) + decal nền + hạt.
Hệ số `mul` của runner: vùng tròn = r/4 (decal/sprite phẳng viết theo r=4; sprite dựng đứng chia `k`); quạt/dải = clamp(r/8, 0,5..4): mọi mét viết thật rồi chia `k`.
Lộ Linh và Đạo Linh (thân lớn che vùng ở camera chéo): lớp nổ chính là decal đặt đất `top` (lõi sẫm + viền sáng, phủ đúng zone), sprite chỉ làm điểm nhấn.
Chạy: python tools/vfx/gen-fx-a6.py  (ghi vào packages/content/data/fx/; số sprite/tên nằm trong packages/shared/src/fxtimeline.ts `FX_SPRITES`)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from mon_helpers import *  # noqa: E402,F401,F403

LIFT = 0.35


def clamp(x, a, b):
    return max(a, min(b, x))


def arc_pts(n, rad, half_deg, frac=0.55):
    """n điểm trên cung bán kính `rad` (mét thật) trong quạt nửa góc `half_deg`; (x ngang, z dọc hướng quạt)."""
    if n == 1:
        return [(0.0, rad)]
    out = []
    for i in range(n):
        a = math.radians(half_deg * frac * (-1 + 2 * i / (n - 1)))
        out.append((math.sin(a) * rad, math.cos(a) * rad))
    return out


def circle_boom(B, mv, P, r, base, flats, ups, seed, elite=False, topbase=False, shard=34, spark=24):
    """Vùng tròn r (mul = r/4): `flats` = (sprite, hệ số cỡ, alpha) phẳng phủ đĩa; `ups` = (sprite, cỡ mét, số lượng, bán kính vòng / r, độ cao) dựng đứng quanh tâm."""
    k = r / 4.0
    a = 0.8 if elite else 1.0
    ev = []
    if topbase:
        ev += [
            decal(base, 0, 4, 2.4, 'core', 0.6, 0.02, top=True, untilDelay=False),  # lõi sẫm phủ đúng zone, vẽ ĐÈ lên thân boss
            decal('steel_crack', 0, 4, 1.8, 'rim', 0.35, 0.02, top=True, untilDelay=False),  # viền sáng
        ]
    else:
        ev.append(decal(base, 0, 4, 2.4, 'core', 0.9 * a, 0.02, top=False, untilDelay=False, lift=LIFT))
    for i, (name, fac, al) in enumerate(flats):
        ev.append(sp(name, 0.02 * i, 0.9, 8.0 * fac, y=0.4 + 0.02 * i, flat=True, alpha=al * a, erode=0.35, seed=seed + i))
    j = 0
    for name, size, n, ring, y in ups:
        pts = [(0.0, 0.0)] if n == 1 or ring == 0 else ring_pts(n, ring * r, 0.4 + j)
        for q, p in enumerate(pts):
            ev.append(sp(name, 0.03 + 0.035 * (j + q), 0.8, size, x=p[0], y=y, z=p[1], k=k, alpha=0.95 * a, erode=0.35, seed=seed + 20 + j * 4 + q))
        j += 1
    ev.append(parts('shard', 0, int(shard * a), 6, 0.9, 0.8, 0.1, 'rim', offset=[0, 0.3, 0], grav=9, tier=0))
    ev.append(parts('spark', 0, int(spark * a), 5, 0.9, 0.8, 0.08, 'rim', offset=[0, 0.4, 0], grav=2, tier=0))
    write(f'mon_boom_circle__{B}__{mv}', ev, P)


def cone_boom(B, mv, P, r, half, base, sweeps, ups, seed, elite=False, topbase=False):
    base = 'bolt_scorch' if base == 'scorch' else base  # decal `sector` không nhận `scorch`
    k = clamp(r / 8.0, 0.5, 4.0)
    a = 0.8 if elite else 1.0
    ev = []
    if topbase:
        ev += [
            decal(base, 0, 8, 2.2, 'core', 0.6, 0.04, top=True, untilDelay=False, sector=half),
            decal('steel_crack', 0, 8, 1.8, 'rim', 0.3, 0.04, top=True, untilDelay=False, sector=half),
        ]
    else:
        ev.append(decal(base, 0, 8, 2.2, 'core', 0.85 * a, 0.04, top=False, untilDelay=False, sector=half, lift=LIFT))
    for i, (name, size, al) in enumerate(sweeps):
        ev.append(sp(name, 0.06 * i, 0.85, size + i, y=0.7, z=0.18 * r, k=k, aim=True, to=(0, 0.82 * r), alpha=al * a, erode=0.4, seed=seed + i))
    j = 0
    for name, size, n in ups:
        for q, (px, pz) in enumerate(arc_pts(n, 0.72 * r, half)):
            ev.append(sp(name, 0.05 + 0.03 * (j + q), 0.8, size, x=px, y=1.2, z=pz, k=k, alpha=0.95 * a, erode=0.4, seed=seed + 20 + j * 4 + q))
        j += 1
    ev.append(parts('shard', 0, int(34 * a), 8, 0.4, 0.7, 0.1, 'rim', offset=[0, 0.5 / k, 0.8 / k], grav=4, tier=0))
    ev.append(parts('spark', 0.04, int(24 * a), 4, 0.7, 0.8, 0.08, 'rim', offset=[0, 0.3 / k, 0.4 * r / k], grav=1.5, tier=0))
    write(f'mon_boom_cone__{B}__{mv}', ev, P)


def line_boom(B, mv, P, r, w, base, beams, ups, seed, elite=False, topbase=False):
    base = 'bolt_scorch' if base == 'scorch' else base  # decal `strip` không nhận `scorch`
    k = clamp(r / 8.0, 0.5, 4.0)
    a = 0.8 if elite else 1.0
    ev = []
    if topbase:
        ev += [
            decal(base, 0, 1, 2.6, 'core', 0.6, 0.1, top=True, untilDelay=False, strip=[r, w]),
            decal('steel_crack', 0, 1, 1.9, 'rim', 0.3, 0.1, top=True, untilDelay=False, strip=[r, w]),
        ]
    else:
        ev.append(decal(base, 0, 1, 2.6, 'core', 0.8 * a, 0.1, top=False, untilDelay=False, strip=[r, w], lift=LIFT))
    for i, (name, size, al) in enumerate(beams):
        bx = (i % 2 - 0.5) * 0.4 * w
        ev.append(sp(name, 0.05 * i, 0.8, size, y=1.0, x=bx, z=0.1 * r, k=k, aim=True, to=(bx, 0.86 * r - 0.07 * r * (i % 2)), alpha=al * a, erode=0.45, seed=seed + i))
    j = 0
    for name, size, n in ups:
        for q in range(n):
            sd = -1 if (q + j) % 2 == 0 else 1
            ev.append(sp(name, 0.08 + 0.05 * (j * 2 + q), 0.7, size, x=sd * 0.34 * w, y=1.4, z=r * (q + 1) / (n + 1), k=k, alpha=0.95 * a, erode=0.4, seed=seed + 20 + j * 4 + q))
        j += 1
    ev.append(parts('shard', 0, int(40 * a), 8, 0.5, 0.8, 0.1, 'rim', offset=[0, 0.4 / k, 0.35 * r / k], grav=9, tier=0))
    ev.append(parts('spark', 0, int(26 * a), 5, 0.5, 0.9, 0.08, 'body', offset=[0, 0.3 / k, 0.3 * r / k], grav=1.5, tier=0))
    write(f'mon_boom_line__{B}__{mv}', ev, P)


# ---- bảng màu (palette.ts: `mon_a6_*`; accent = ĐỎ chuẩn kẻ địch, thân theo hệ KHÔNG đỏ/cam) ----
PG, PD, PP, PT, PK, PV, PS, PA, PL, PN, PX, PM = (
    'mon_a6_guong', 'mon_a6_dong', 'mon_a6_phu', 'mon_a6_tuq', 'mon_a6_kieu', 'mon_a6_ve', 'mon_a6_thach', 'mon_a6_dao', 'mon_a6_lo', 'mon_a6_nhan', 'mon_a6_sa', 'mon_a6_may',
)

# ================= Hư Ảnh Chủ (thủy; gương/bóng) =================
B, P = 'boss_hu_anh_chu', PG
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 4.5, 'steel_crack', [('guong_crack', 1.0, 0.9), ('guong_spiral', 0.9, 0.7)],
            [('guong_shard', 3.6, 4, 0.5, 1.4), ('guong_figure', 3.4, 1, 0, 1.7)], 6100)
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.3, 45), P)
cone_boom(B, 'sweep', P, 14, 45, 'steel_crack', [('guong_hands', 8.5, 0.95), ('guong_glint', 7.0, 0.7)], [('guong_hand', 4.0, 3), ('guong_feather', 3.2, 2)], 6200)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 20, 4, spark=26), P)
line_boom(B, 'line', P, 20, 4, 'steel_crack', [('guong_ray', 12.0, 0.9), ('guong_ray', 11.0, 0.8), ('guong_pane', 7.0, 0.85)], [('guong_shard', 3.4, 4), ('guong_splinter', 2.6, 3)], 6300)

# ================= Hư Ảnh Nhân (tinh anh, kim; gương) =================
B, P = 'elite_hu_anh_nhan', PN
write(f'mon_warn_line__{B}__line', warn_strip(1.4, 10, 4, spark=14), P)
line_boom(B, 'line', P, 10, 4, 'steel_crack', [('guong_ray', 7.0, 0.9), ('guong_ray', 6.0, 0.75)], [('guong_splinter', 2.4, 3)], 6400, elite=True)

# ================= Ảnh Hạc Vương (tinh anh, thủy; bóng hạc) =================
B, P = 'elite_anh_hac_vuong', PG
write(f'mon_warn_line__{B}__charge', warn_strip(1.0, 14, 3, spark=14), P)
line_boom(B, 'charge', P, 14, 3, 'scorch', [('guong_crane', 9.0, 0.9), ('guong_crane', 8.0, 0.7)], [('guong_feather', 2.6, 3)], 6500, elite=True)

# ================= Đỉnh Linh (kim; đồng đỉnh) =================
B, P = 'boss_dinh_linh', PD
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 5, 'scorch', [('dong_glyph', 1.0, 0.9), ('dong_bell', 1.1, 0.7)],
            [('dong_pillar', 4.4, 1, 0, 2.0), ('dong_drops', 3.4, 3, 0.5, 1.3)], 6600)
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.3, 45), P)
cone_boom(B, 'sweep', P, 14, 45, 'scorch', [('dong_heat', 9.0, 0.8), ('dong_stream', 8.5, 0.85)], [('dong_plate', 4.0, 3), ('dong_scale', 3.2, 2)], 6700)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 22, 4, spark=28), P)
line_boom(B, 'line', P, 22, 4, 'scorch', [('dong_stream', 13.0, 0.95), ('dong_stream', 12.0, 0.8)], [('dong_drops', 3.2, 4), ('dong_scale', 2.6, 3)], 6800)

# ================= Phủ Chủ (thổ; cửa hai mặt) =================
B, P = 'boss_phu_chu', PP
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 4.5, 'jade_crack', [('phu_half', 1.0, 0.9), ('phu_split', 0.9, 0.7)],
            [('phu_flip', 4.0, 2, 0.45, 1.5), ('phu_dust', 4.4, 1, 0, 0.8)], 6900)
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.3, 45), P)
cone_boom(B, 'sweep', P, 14, 45, 'jade_crack', [('phu_leaf', 8.5, 0.95), ('phu_dust', 7.0, 0.6)], [('phu_flip', 4.0, 3), ('phu_dust', 3.6, 2)], 7000)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 22, 4, spark=28), P)
line_boom(B, 'line', P, 22, 4, 'jade_crack', [('phu_split', 13.0, 0.9), ('phu_split', 11.0, 0.75)], [('phu_door', 4.6, 3), ('phu_dust', 3.2, 3)], 7100)

# ================= Tử Quang Dực Chủ (thủy tím; cánh, tàn quang) =================
B, P = 'boss_tu_quang_duc_chu', PT
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.4, 25), P)
cone_boom(B, 'sweep', P, 16, 25, 'bolt_scorch', [('tuq_wing', 9.5, 0.95), ('tuq_halo', 8.0, 0.6)], [('tuq_feather', 3.6, 3), ('tuq_trail', 3.0, 2)], 7200)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 22, 3, spark=24), P)
line_boom(B, 'line', P, 22, 3, 'bolt_scorch', [('tuq_beam', 13.0, 0.95), ('tuq_beam', 12.0, 0.8)], [('tuq_rain', 3.4, 3), ('tuq_trail', 2.8, 3)], 7300)
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 4, 'bolt_scorch', [('tuq_burn', 1.0, 0.9)], [('tuq_rain', 5.0, 1, 0, 2.4), ('tuq_trail', 3.2, 4, 0.5, 2.0)], 7400)
cast_ring(B, 12, P)
write(f'mon_warn__{B}__chant', warn_circle(1.0, 70, -20, spark=24), P)
circle_boom(B, 'chant', P, 12, 'bolt_scorch', [('tuq_vortex', 1.0, 0.9), ('tuq_vein', 1.0, 0.75)], [('tuq_halo', 6.0, 1, 0, 1.0), ('tuq_flock', 5.0, 3, 0.5, 1.8)], 7500)

# ================= Kiều Thủ (kim; cầu đá ngà) =================
B, P = 'boss_kieu_thu', PK
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 5, 'steel_crack', [('kieu_crack', 1.0, 0.9), ('kieu_bell', 1.0, 0.6)],
            [('kieu_chunks', 3.6, 3, 0.45, 1.4), ('kieu_blade', 5.0, 1, 0, 2.4)], 7600)
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.3, 45), P)
cone_boom(B, 'sweep', P, 14, 45, 'steel_crack', [('kieu_wind', 9.0, 0.9), ('kieu_wind', 8.0, 0.7)], [('kieu_dust', 4.0, 3), ('kieu_chunks', 3.0, 2)], 7700)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 22, 4, spark=28), P)
line_boom(B, 'line', P, 22, 4, 'steel_crack', [('kieu_vein', 13.0, 0.9), ('kieu_ridge', 11.0, 0.9)], [('kieu_chunks', 3.4, 4)], 7800)

# ================= Vệ Kiều (thổ; tia đá hai mặt, lục ngọc) =================
B, P = 'boss_ve_kieu', PV
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 18, 3.5, spark=24), P)
line_boom(B, 'line', P, 18, 3.5, 'jade_crack', [('kieu_vein', 11.0, 0.95), ('kieu_ridge', 10.0, 0.85)], [('kieu_chunks', 3.2, 3), ('kieu_dust', 3.0, 2)], 7900)

# ================= Thạch Tượng (thổ; giáp đá nứt) — đá dựng bằng kiểu ngà =================
B, P = 'boss_thach_tuong', PS
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 5, 'jade_crack', [('kieu_vein', 1.0, 0.9), ('kieu_dust', 1.0, 0.5)],
            [('kieu_armor', 4.2, 3, 0.5, 1.5), ('kieu_chunks', 3.0, 3, 0.75, 1.2)], 8000)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 22, 4, spark=28), P)
line_boom(B, 'line', P, 22, 4, 'jade_crack', [('kieu_ridge', 12.0, 0.95), ('kieu_ridge', 11.0, 0.8)], [('kieu_armor', 3.6, 3), ('kieu_chunks', 3.0, 3)], 8100)

# ================= Đạo Linh (thủy; nét cọ bạc) — thân lớn: lớp nổ chính là decal đất top =================
B, P = 'boss_dao_linh', PA
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 5, 'scorch', [('mac_arcs', 1.0, 0.9), ('mac_blot', 1.0, 0.6)], [('mac_drops', 3.4, 4, 0.5, 1.4), ('mac_stroke', 4.0, 3, 0.4, 1.6)], 8200, topbase=True)
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.3, 45), P)
cone_boom(B, 'sweep', P, 14, 45, 'scorch', [('mac_stroke', 9.5, 0.95), ('mac_stroke', 8.5, 0.8)], [('mac_drops', 3.4, 3), ('mac_blot', 3.6, 2)], 8300, topbase=True)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 22, 4, spark=28), P)
line_boom(B, 'line', P, 22, 4, 'scorch', [('mac_stroke', 12.0, 0.95), ('mac_stroke', 11.0, 0.85), ('mac_blot', 6.0, 0.7)], [('mac_drops', 3.2, 4)], 8400, topbase=True)

# ================= Lộ Linh (kim; cầu ánh sáng) — thân scale 3,8 che vùng: lớp nổ chính là decal đất top =================
B, P = 'boss_lo_linh', PL
write(f'mon_warn__{B}__slam', warn_circle(1.3, 35, -50), P)
circle_boom(B, 'slam', P, 5, 'steel_crack', [('kieu_flip', 1.0, 0.9), ('kieu_slab', 1.0, 0.6)], [('kieu_chunks', 3.4, 3, 0.5, 1.4)], 8500, topbase=True)
write(f'mon_warn_cone__{B}__sweep', warn_fan(1.3, 45), P)
cone_boom(B, 'sweep', P, 14, 45, 'steel_crack', [('kieu_sweep', 9.0, 0.95), ('kieu_sweep', 8.0, 0.8)], [('kieu_chunks', 3.4, 3)], 8600, topbase=True)
write(f'mon_warn_line__{B}__line', warn_strip(1.3, 22, 4, spark=28), P)
line_boom(B, 'line', P, 22, 4, 'steel_crack', [('kieu_slab', 13.0, 0.95), ('kieu_slab', 12.0, 0.8)], [('kieu_chunks', 3.2, 3)], 8700, topbase=True)

# ================= Lộ Thạch Tướng (tinh anh, thổ; chuông trầm) =================
B, P = 'elite_lo_thach_tuong', PS
write(f'mon_warn__{B}__leap', warn_circle(1.5, 35, -50, spark=12), P)
circle_boom(B, 'leap', P, 5.5, 'jade_crack', [('kieu_bell', 1.0, 0.85), ('kieu_dust', 0.9, 0.5)], [('kieu_chunks', 3.0, 3, 0.5, 1.2)], 8800, elite=True, shard=26, spark=16)
write(f'mon_warn_line__{B}__line', warn_strip(1.4, 11, 4, spark=14), P)
line_boom(B, 'line', P, 11, 4, 'jade_crack', [('kieu_ridge', 8.0, 0.95), ('kieu_ridge', 7.0, 0.8)], [('kieu_chunks', 2.6, 3)], 8900, elite=True)

# ================= Sa Tướng (tinh anh, thổ; cát vàng, giữ hue 46–50) =================
B, P = 'elite_sa_tuong', PX
write(f'mon_warn__{B}__leap', warn_circle(1.5, 35, -50, spark=12), P)
circle_boom(B, 'leap', P, 5.5, 'scorch', [('sa_swirl', 1.0, 0.85), ('sa_dust', 1.0, 0.5)], [('sa_blade', 3.4, 3, 0.55, 1.2), ('sa_grain', 3.0, 1, 0, 1.0)], 9000, elite=True, shard=26, spark=16)
write(f'mon_warn_line__{B}__line', warn_strip(1.4, 11, 4, spark=14), P)
line_boom(B, 'line', P, 11, 4, 'scorch', [('sa_dune', 8.0, 0.95), ('sa_storm', 6.0, 0.7)], [('sa_grain', 2.6, 3)], 9100, elite=True)

# ================= Mây Lang Vương (tinh anh, thủy; mây trắng viền lục ngọc) =================
B, P = 'elite_may_lang_vuong', PM
write(f'mon_warn_line__{B}__charge', warn_strip(1.0, 13, 2.6, spark=14), P)
line_boom(B, 'charge', P, 13, 2.6, 'scorch', [('may_streak', 9.0, 0.95), ('may_tail', 8.0, 0.8)], [('may_tuft', 2.6, 3)], 9200, elite=True)
write(f'mon_warn__{B}__leap', warn_circle(1.4, 35, -50, spark=12), P)
circle_boom(B, 'leap', P, 5, 'scorch', [('may_ring', 1.0, 0.85)], [('may_ball', 3.4, 3, 0.5, 1.2), ('may_burst', 3.6, 1, 0, 1.4)], 9300, elite=True, shard=22, spark=14)
print('ok')
