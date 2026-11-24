#!/usr/bin/env python3
"""A3 (Họa Pháp Lô 2): timeline riêng cho 8 chiêu của 5 tinh anh chương 2–3 (concept đã duyệt, đường sprite Codex):
Liệt Cốt Báo (xương: leap r3), Hổ Mạch Khôi Tướng (đá: leap r5), Xích Sa Ngô Công (đất + độc: caster quạt r12/30°, burrow r3, emerge quạt r10/35°),
Kính Điện Ma Quan (gương bạc: line 9×3), Lôi Vân Sư Vương (sét TÍM: caster tròn r4, leap r4).
Mỗi chiêu: `mon_warn*__<quái>__<chiêu>` (vạch báo đỏ đặc vân nứt tô dần theo `delay`, đúng hitbox) + `mon_boom_*__<quái>__<chiêu>` (vùng nổ theo hệ, KHÔNG đỏ/cam).
Sprite Codex: ô `cot_*`, `tho_*`, `doc_*`, `tim_*` (kiểu tô vẽ tay nguyên màu, `fxA.x` = 5) và dùng lại `nguyet_*` (bạc) cho Kính Điện.
Quy ước cỡ như gen-fx-a2.py: vùng tròn `mul` = r/4 (kẹp 0,5..4): sprite phẳng viết theo r=4 (k=1), sprite dọc/quay mặt camera chia `k` = mul để ra mét thật;
quạt/dải `mul` = r/8: viết mét thật rồi chia `k`. `size` của `sp` là cạnh ô vuông (mesh scale = nửa cạnh).
Chạy: python tools/vfx/gen-fx-a3.py  (ghi vào packages/content/data/fx/)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from mon_helpers import *  # noqa: E402,F401,F403

LIFT = 0.35
R = 'ff1f3d'

# ================= Liệt Cốt Báo (kim/xương): vồ — vết cào xương, mảnh xương vỡ, bụi xám =================
B = 'elite_liet_cot_bao'
P = 'mon_kim'
k = 0.75  # r3
write(f'mon_warn__{B}__leap', warn_circle(0.8, 35, -50, spark=12), P)
write(f'mon_boom_circle__{B}__leap', [
    decal('scorch', 0, 4, 2.2, 'core', 0.9, 0.02, top=False, untilDelay=False, lift=LIFT),
    sp('cot_crack', 0.0, 1.0, 8.0, y=0.4, flat=True, alpha=0.9, erode=0.4, seed=2100),
    sp('cot_dust', 0.03, 0.8, 8.4, y=0.45, flat=True, alpha=0.75, erode=0.3, seed=2101),
    sp('cot_burst', 0.02, 0.6, 7.0, y=0.5, flat=True, alpha=0.9, erode=0.25, seed=2102),
    *[sp('cot_claw', 0.02 + 0.04 * i, 0.7, 4.6, x=(-1.3 if i == 0 else 1.3), y=1.3, z=0.3, k=k, alpha=0.95, erode=0.35, seed=2103 + i) for i in range(2)],
    sp('cot_frags', 0.03, 0.7, 4.4, y=1.5, k=k, alpha=0.95, erode=0.35, seed=2110),
    sp('cot_swipe', 0.0, 0.6, 5.2, y=1.4, z=-0.4, k=k, alpha=0.9, erode=0.3, seed=2111),
    parts('shard', 0, 28, 6, 0.9, 0.7, 0.1, 'rim', offset=[0, 0.3, 0], grav=9, tier=0),
    parts('dust', 0, 22, 3, 0.9, 0.9, 0.22, 'core', offset=[0, 0.2, 0], grav=0.8),
], P)

# ================= Hổ Mạch Khôi Tướng (thổ/đá): nện — gai đá, khe ngọc lam, bụi nâu =================
B = 'elite_ho_mach_khoi_tuong'
P = 'mon_tho'
k = 1.25  # r5
write(f'mon_warn__{B}__leap', warn_circle(1.4, 35, -50), P)
write(f'mon_boom_circle__{B}__leap', [
    decal('scorch', 0, 4, 2.4, 'core', 0.9, 0.02, top=False, untilDelay=False, lift=LIFT),
    sp('tho_crack', 0.0, 1.1, 8.0, y=0.4, flat=True, alpha=0.9, erode=0.45, seed=2200),
    sp('tho_jade', 0.03, 0.95, 7.4, y=0.45, flat=True, alpha=0.85, erode=0.4, seed=2201),
    sp('tho_dust', 0.02, 0.8, 9.0, y=0.5, flat=True, alpha=0.7, erode=0.3, seed=2202),
    sp('tho_spikes', 0.04, 0.9, 7.6, y=0.55, flat=True, alpha=0.9, erode=0.4, seed=2203),
    *[sp('tho_column', 0.02 + 0.03 * i, 0.75, 4.8, x=p[0], y=2.0, z=p[1], k=k, alpha=0.95, erode=0.35, seed=2204 + i) for i, p in enumerate(ring_pts(3, 3.0, 0.5))],
    sp('tho_debris', 0.03, 0.7, 5.2, y=1.9, k=k, alpha=0.95, erode=0.35, seed=2210),
    parts('dust', 0, 36, 3.5, 0.9, 1.0, 0.26, 'body', offset=[0, 0.3, 0], grav=0.8),
    parts('shard', 0, 26, 6, 0.9, 0.7, 0.11, 'core', offset=[0, 0.3, 0], grav=9, tier=0),
], P)

# ================= Xích Sa Ngô Công (mộc/độc + đất) =================
B = 'elite_xich_sa_ngo_cong'
P = 'mon_moc'
k = 1.5  # caster quạt r12/30°
write(f'mon_warn_cone__{B}__caster', warn_fan(1.3, 30), P)
write(f'mon_boom_cone__{B}__caster', [
    decal('jade_crack', 0, 8, 2.2, 'body', 0.7, 0.04, top=False, untilDelay=False, sector=30, lift=LIFT),
    *[sp('doc_spray', 0.05 * i, 0.8, 8.0 + i, y=0.9, z=2.0, k=k, aim=True, to=(0, 9.5), alpha=0.95, erode=0.4, seed=2300 + i) for i in range(3)],
    sp('doc_swirl', 0.04, 0.9, 7.0, y=0.5, z=8.0, k=k, flat=True, alpha=0.85, erode=0.4, seed=2310),
    *[sp('doc_spores', 0.05 + 0.03 * i, 0.8, 3.6, x=px, y=1.2, z=pz, k=k, alpha=0.95, erode=0.4, seed=2311 + i) for i, (px, pz) in enumerate([(-2.2, 6.5), (0.0, 9.0), (2.2, 6.5)])],
    parts('dust', 0, 30, 4, 0.5, 1.0, 0.24, 'body', offset=[0, 0.3 / k, 4 / k], grav=0.8),
    parts('spark', 0.02, 26, 5, 0.5, 0.9, 0.08, 'rim', offset=[0, 0.5 / k, 5 / k], grav=-0.4, tier=0),
], P)

k = 0.75  # burrow r3
write(f'mon_warn__{B}__burrow', warn_circle(2.0, 20, -65, spark=14), P)
write(f'mon_boom_circle__{B}__burrow', [
    decal('scorch', 0, 4, 2.4, 'core', 0.9, 0.02, top=False, untilDelay=False, lift=LIFT),
    sp('doc_crater', 0.0, 1.0, 8.0, y=0.4, flat=True, alpha=0.95, erode=0.4, seed=2400),
    sp('doc_swirl', 0.03, 0.9, 6.8, y=0.5, flat=True, alpha=0.8, erode=0.4, seed=2401),
    *[sp('doc_roots', 0.02 + 0.03 * i, 0.75, 4.2, x=p[0], y=1.6, z=p[1], k=k, alpha=0.95, erode=0.35, seed=2402 + i) for i, p in enumerate(ring_pts(3, 1.7, 0.4))],
    sp('doc_spores', 0.03, 0.8, 3.6, y=1.5, k=k, alpha=0.95, erode=0.4, seed=2410),
    parts('dust', 0, 30, 4, 0.9, 1.0, 0.24, 'body', offset=[0, 0.3, 0], grav=1.2),
    parts('spark', 0, 18, 4, 0.9, 0.9, 0.08, 'rim', offset=[0, 0.3, 0], grav=-0.4, tier=0),
], P)

k = 1.25  # emerge quạt r10/35°
write(f'mon_warn_cone__{B}__emerge', warn_fan(1.6, 35), P)
write(f'mon_boom_cone__{B}__emerge', [
    decal('jade_crack', 0, 8, 2.2, 'body', 0.7, 0.04, top=False, untilDelay=False, sector=35, lift=LIFT),
    *[sp('doc_mound', 0.05 * i, 0.85, 8.0 + i, y=0.6, z=1.0, k=k, aim=True, to=(0, 8.0), alpha=0.95, erode=0.4, seed=2500 + i) for i in range(2)],
    *[sp('doc_roots', 0.04 + 0.03 * i, 0.8, 4.2, x=px, y=1.6, z=pz, k=k, alpha=0.95, erode=0.4, seed=2510 + i) for i, (px, pz) in enumerate([(-2.0, 5.0), (2.0, 5.0), (0.0, 8.0)])],
    sp('doc_crater', 0.02, 0.8, 7.0, y=0.5, z=3.0, k=k, flat=True, alpha=0.9, erode=0.35, seed=2520),
    sp('doc_spray', 0.06, 0.7, 7.0, y=0.9, z=2.0, k=k, aim=True, to=(0, 8.0), alpha=0.9, erode=0.4, seed=2521),
    parts('dust', 0, 30, 5, 0.5, 1.0, 0.24, 'body', offset=[0, 0.3 / k, 3 / k], grav=1.0),
    parts('spark', 0.02, 22, 5, 0.5, 0.9, 0.08, 'rim', offset=[0, 0.5 / k, 4 / k], grav=-0.4, tier=0),
], P)

# ================= Kính Điện Ma Quan (kim/gương bạc): line 9×3 =================
B = 'elite_kinh_dien_ma_quan'
P = 'mon_kim'
k = 1.125  # r9
write(f'mon_warn_line__{B}__line', warn_strip(1.1, 9, 3, spark=14), P)
write(f'mon_boom_line__{B}__line', [
    decal('steel_crack', 0, 1, 2.2, 'core', 0.85, 0.04, top=False, untilDelay=False, strip=[9, 3], lift=LIFT),
    decal('steel_crack', 0, 1, 1.6, 'rim', 0.3, 0.04, top=False, untilDelay=False, strip=[9, 3], lift=0.36),
    *[sp('nguyet_beam', 0.04 * i, 0.7, 8.0, y=0.9, z=1.5, k=k, aim=True, to=(0, 7.5 - i), alpha=1.0, erode=0.45, seed=2600 + i) for i in range(3)],
    *[sp('nguyet_slash', 0.03 + 0.05 * i, 0.7, 6.0, y=0.7, z=1.0, k=k, aim=True, to=(0, 7.0 - i), erode=0.4, seed=2610 + i) for i in range(2)],
    *[sp('nguyet_shards', 0.04 + 0.04 * i, 0.75, 3.0, x=(-1.4 if i % 2 == 0 else 1.4), y=1.0, z=2.5 + 2.5 * i, k=k, erode=0.4, seed=2620 + i) for i in range(3)],
    parts('shard', 0, 26, 7, 0.4, 0.7, 0.1, 'rim', offset=[0, 0.4 / k, 3 / k], grav=6, tier=0),
    parts('spark', 0, 18, 5, 0.5, 0.8, 0.08, 'rim', offset=[0, 0.3 / k, 4 / k], grav=1.5, tier=0),
], P)

# ================= Lôi Vân Sư Vương (sét TÍM, tách lam của Lôi tu người chơi) =================
B = 'elite_loi_van_su_vuong'
P = 'mon_boss_loi'
k = 1.0  # r4 (caster tròn và leap)
write(f'mon_warn__{B}__caster', warn_circle(1.2, 35, -50, spark=14), P)
write(f'mon_boom_circle__{B}__caster', [
    decal('scorch', 0, 4, 2.4, 'core', 0.9, 0.02, top=False, untilDelay=False, lift=LIFT),
    sp('tim_arcs', 0.0, 1.0, 8.0, y=0.4, flat=True, alpha=0.95, erode=0.4, seed=2700),
    sp('tim_flash', 0.0, 0.5, 6.5, y=0.5, flat=True, alpha=0.9, erode=0.2, seed=2701),
    *[sp('tim_bolt', 0.02 + 0.03 * i, 0.7, 6.0, x=p[0], y=3.0, z=p[1], alpha=1.0, erode=0.35, seed=2702 + i) for i, p in enumerate(ring_pts(3, 1.6, 0.3))],
    sp('tim_cloud', 0.0, 0.9, 7.0, y=5.0, alpha=0.85, erode=0.4, seed=2710),
    sp('tim_orb', 0.03, 0.7, 3.2, y=1.2, alpha=1.0, erode=0.3, seed=2711),
    parts('spark', 0, 34, 6, 1, 0.7, 0.09, 'rim', offset=[0, 0.4, 0], grav=2, tier=0),
    parts('dust', 0, 20, 3, 0.9, 0.9, 0.22, 'core', offset=[0, 0.2, 0], grav=0.8),
], P)

write(f'mon_warn__{B}__leap', warn_circle(1.0, 35, -50, spark=14), P)
write(f'mon_boom_circle__{B}__leap', [
    decal('scorch', 0, 4, 2.2, 'core', 0.9, 0.02, top=False, untilDelay=False, lift=LIFT),
    sp('tim_arcs', 0.0, 0.95, 8.0, y=0.4, flat=True, alpha=0.95, erode=0.4, seed=2800),
    sp('tim_flash', 0.0, 0.45, 7.0, y=1.4, alpha=0.95, erode=0.2, seed=2801),
    *[sp('tim_zigzag', 0.02 + 0.03 * i, 0.65, 5.0, x=math.cos(a) * 1.0, y=0.8, z=math.sin(a) * 1.0, aim=True, to=(math.cos(a) * 3.4, math.sin(a) * 3.4), alpha=0.95, erode=0.4, seed=2802 + i) for i, a in enumerate([0.4, 2.5, 4.6])],
    sp('tim_orb', 0.02, 0.6, 3.4, y=1.3, alpha=1.0, erode=0.3, seed=2810),
    parts('spark', 0, 30, 6, 1, 0.7, 0.09, 'rim', offset=[0, 0.4, 0], grav=2, tier=0),
], P)
print('ok')
