#!/usr/bin/env python3
"""A4 (Họa Pháp Lô 2): timeline riêng cho 2 tinh anh Vân Lam (concept đã duyệt, đường sprite Codex), vạch báo THEO MÀU HỆ (không đỏ/cam):
Huyết Nha Lang (hỏa ám: caster quạt r9/35°) — vạch báo tím-hồng sẫm (palette `mon_hoa_am`), nổ lửa ma ám tím lõi đen viền trắng-tím (sprite `lua_*`);
Cự Nham Viên (thổ: caster quạt r9/40°) — vạch báo vàng hổ phách (palette `mon_tho_pk`), nổ gai đá nâu + vết nứt sáng hổ phách + bụi (sprite `ham_*`).
Vạch báo: `mon_warn_cone__<quái>__caster` (decal `warn_crack` tô lại theo màu bảng màu khi không đỏ/cam, xem `render/vfx/forgeTex.ts`) + vùng nổ `mon_boom_cone__<quái>__caster`.
Cỡ: quạt `mul` = r/8 = 1,125 (kẹp 0,5..4): sprite dọc chia `k`; `size` của `sp` là cạnh ô vuông (mét thật).
Chạy: python tools/vfx/gen-fx-a4.py  (ghi vào packages/content/data/fx/)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from mon_helpers import *  # noqa: E402,F401,F403

LIFT = 0.35
K = 1.125  # r9

# ================= Huyết Nha Lang (hỏa ám tím) =================
B = 'elite_huyet_nha_lang'
P = 'mon_hoa_am'
write(f'mon_warn_cone__{B}__caster', warn_fan(1.2, 35), P)
write(f'mon_boom_cone__{B}__caster', [
    decal('bolt_scorch', 0, 8, 2.6, 'body', 1.0, 0.04, top=False, untilDelay=False, sector=35, lift=LIFT),  # nền tím sẫm (bolt_scorch có nền chàm-tím)
    *[sp('lua_blast', 0.05 * i, 1.3, 9.5 + i, y=0.6, z=2.2, k=K, aim=True, to=(0, 6.4), alpha=1.0, erode=0.6, seed=3100 + i) for i in range(2)],  # quạt lửa ma quét ra
    *[sp('lua_plume', 0.03 + 0.04 * i, 1.2, 4.6, x=px, y=2.0, z=pz, k=K, alpha=1.0, erode=0.55, seed=3110 + i) for i, (px, pz) in enumerate([(-2.0, 4.0), (2.0, 4.0), (0.0, 6.8)])],
    sp('lua_lick', 0.02, 1.0, 8.0, y=0.9, z=2.5, k=K, aim=True, to=(0, 6.0), alpha=0.95, erode=0.5, seed=3120),
    sp('lua_smoke', 0.1, 1.9, 7.0, y=1.2, z=5.5, k=K, alpha=0.8, erode=0.65, seed=3121),  # khói tím đọng lại (dư ba)
    sp('lua_scar', 0.04, 1.9, 7.0, y=0.5, z=4.5, k=K, flat=True, alpha=0.9, erode=0.65, seed=3122),
    sp('lua_embers', 0.04, 1.4, 5.0, y=1.4, z=4.0, k=K, alpha=0.95, erode=0.5, seed=3123),
    parts('spark', 0, 30, 5, 0.5, 1.4, 0.08, 'rim', offset=[0, 0.5 / K, 4 / K], grav=-0.4, tier=0),
    parts('dust', 0, 24, 4, 0.5, 1.6, 0.24, 'core', offset=[0, 0.3 / K, 3 / K], grav=0.6),
], P)

# ================= Cự Nham Viên (thổ + hổ phách) =================
B = 'elite_cu_nham_vien'
P = 'mon_tho_pk'
write(f'mon_warn_cone__{B}__caster', warn_fan(1.3, 40), P)
write(f'mon_boom_cone__{B}__caster', [
    decal('jade_crack', 0, 8, 2.8, 'core', 0.8, 0.04, top=False, untilDelay=False, sector=40, lift=LIFT),  # nền đất sẫm
    sp('ham_crack', 0.0, 1.6, 8.0, y=0.45, z=4.5, k=K, flat=True, alpha=1.0, erode=0.65, seed=3200),  # vết nứt sáng hổ phách tỏa từ gốc
    *[sp('ham_spikes', 0.03 + 0.04 * i, 1.5, 5.2, x=px, y=2.0, z=pz, k=K, alpha=1.0, erode=0.6, seed=3210 + i) for i, (px, pz) in enumerate([(-2.6, 4.0), (2.6, 4.0), (0.0, 6.6)])],
    *[sp('ham_pillar', 0.06 + 0.04 * i, 1.4, 4.4, x=px, y=1.8, z=pz, k=K, alpha=1.0, erode=0.6, seed=3220 + i) for i, (px, pz) in enumerate([(-1.2, 2.6), (1.2, 2.6)])],
    sp('ham_ridge', 0.02, 1.5, 9.5, y=0.7, z=2.2, k=K, aim=True, to=(0, 6.0), alpha=1.0, erode=0.6, seed=3230),
    sp('ham_dust', 0.04, 1.9, 8.0, y=0.5, z=4.6, k=K, flat=True, alpha=0.8, erode=0.65, seed=3231),
    sp('ham_debris', 0.05, 1.3, 5.6, y=1.9, z=4.2, k=K, alpha=1.0, erode=0.55, seed=3232),
    parts('shard', 0, 30, 6, 0.5, 1.2, 0.1, 'rim', offset=[0, 0.5 / K, 3 / K], grav=8, tier=0),
    parts('dust', 0, 28, 4, 0.5, 1.6, 0.26, 'body', offset=[0, 0.3 / K, 3 / K], grav=0.8),
], P)
print('ok')
