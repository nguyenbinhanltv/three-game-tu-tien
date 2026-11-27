# VFX Cấm chế sư (Cấm Chế Kinh): 6 timeline chiêu (Phong Cấm, Mẫu Đơn Thập Bát Cấm, Phá Diệt Cấm, Tuế Nguyệt Cấm, Sinh Tử Cấm, Phiên Thiên Ấn).
#   python tools/vfx/recipes_cam.py [id ...]      → ghi packages/content/data/fx/<id>.json
# Hình trận ĐỨNG sau khi đặt do `recipes_tran.py` (tin S.FX riêng) lo; timeline ở đây là cú ra chiêu (đặt trận, đánh, nổ ấn).
# Bảng màu theo kiểu chiêu (khóa `palette` của timeline, định nghĩa ở render/vfx/palette.ts): sát (Phong Cấm, Mẫu Đơn, Phá Diệt) đỏ tía,
# khốn (Tuế Nguyệt) lam, sinh tử tím + vàng, Phiên Thiên Ấn dùng bảng công pháp `cam_che_kinh` (chàm + vàng ấn). Ba tầng: lõi rất đậm có
# bóng đổ (decal/hình `core`), thân đậm màu, viền sáng/vàng; vòng viền tối ngoài cùng để không chìm trên đá trắng.
# Vết nứt NỐI từ chân người ra chiêu tới mục tiêu / tâm vùng khi kích nổ (vệt chạy dưới đất, rồi nứt tỏa tại đích).
# Tránh che: hình cao đều `camFade`, ấn rơi cao ≤ 6 m. Ngân sách: chiêu ≤ 12 draw cả chiêu, hitstop ≤ 80 ms.
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area_fit import fit_area_skill, fit_area  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import cam, decal, feel, flip, mesh, parts, slow, snd, vig, write  # noqa: E402

R = {}


def link(t, dur, to='target', tone='accent', seed=1, scale=2.4):
    """Vết nứt sáng chạy dưới đất từ chân người ra chiêu tới đích (`target` hoặc `area`)."""
    return mesh('spark_streak', t, dur, at='self', offset=[0, -1.05, 0.3], scale=scale, shadow=False, tone=tone, alpha=1, tier=0, seed=seed,
                move={'to': to, 'ease': 'in', 'offset': [0, 0.08, 0]})


def smoke(t, at, y=0.6, scale=3.0, tone='core', alpha=0.5, tier=1):
    return flip('ink_smoke', t, 0.9, scale, at=at, offset=[0, y, 0], alpha=alpha, tone=tone, tier=tier)


def seal(t, at, r, dur=3.0, tone_fill='core', tone_line='body', **k):
    """Triện đậm dưới đích: lõi tối phủ + vành màu (r mét)."""
    return [
        decal('scorch', t, r, dur, at=at, grow=0.1, tone=tone_fill, alpha=0.95, tier=0, **k),
        decal('rune', t, r, dur, at=at, grow=0.1, tone=tone_line, alpha=1, tier=0, **k),
    ]


# --------------------------------------------------------------------------------------------------------------------------------
def phong_cam():
    """Phong Cấm (đặc trưng, hit 0,3): bùa cấm bay dọc vết nứt tới mục tiêu, rồi ba vòng ấn khóa siết quanh thân nó (lõi đậm, thân đỏ tía, viền vàng mảnh)
    và triện khóa dưới chân. Không còn chớp vàng phủ kín mục tiêu (ảnh duyệt #473: mục tiêu sáng vàng nhạt, không đọc ra ấn phong)."""
    ev = [
        parts('spark', -0.3, 18, 1.3, 1, 0.26, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.3, 'cast', 0.45, 1.15),
        link(-0.25, 0.3, seed=3),
        mesh('spark_streak', -0.2, 0.2, at='ahead', offset=[0.1, 0.9, 0.4], scale=1.8, shadow=False, tone='rim', alpha=0.95, tier=1, seed=2,
             move={'to': 'target', 'ease': 'in', 'offset': [0, 1.0, 0]}),
        snd(-0.15, 'slash', 0.4, 1.2, 0.06),
        snd(0.0, 'impact', 0.5, 1.1),
        # ba vòng ấn quanh thân mục tiêu, siết từ ngoài vào (thấp / giữa / cao); mỗi vòng ba tầng: lõi đậm lớn nhất, thân đỏ tía, viền vàng nhỏ nhất
    ]
    for k, (y, r0, r1) in enumerate([(0.35, 1.35, 0.95), (1.0, 1.5, 1.05), (1.65, 1.3, 0.9)]):
        t = 0.0 + 0.03 * k
        ev += [
            mesh('rune_ring2', t, 1.6, at='target', offset=[0, y, 0], scale=r0 * 1.12, scaleTo=r1 * 1.12, sweep=0.15, erodeFrom=0.85, alpha=1, shadow=False, tone='core', camFade=True, tier=0, seed=20 + k),
            mesh('rune_ring2', t + 0.01, 1.6, at='target', offset=[0, y, 0], scale=r0, scaleTo=r1, sweep=0.15, erodeFrom=0.85, alpha=1, shadow=False, tone='body', camFade=True, tier=0, seed=30 + k),
            mesh('rune_ring2', t + 0.02, 1.6, at='target', offset=[0, y, 0], scale=r0 * 0.9, scaleTo=r1 * 0.9, sweep=0.15, erodeFrom=0.85, alpha=0.9, shadow=False, tone='accent', camFade=True, tier=1, seed=40 + k),
        ]
    ev += [
        parts('spark', 0.0, 14, 5, 1, 0.35, 0.07, at='target', offset=[0, 1.0, 0], tone='rim', tier=1),
        *seal(0.02, 'ground', 3.6, 3.0),
        mesh('crack_radial', 0.03, 1.0, at='ground', offset=[0, 0.06, 0], scale=3.4, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='accent', tier=0, seed=6),
        smoke(0.03, 'ground', y=0.5, scale=2.4, tone='body', alpha=0.4),
    ]
    ev += feel(0.0, ms=70, sh=0.22, fl=0.0, vg=0.28, fov=1.6)
    return {'skill': 'skl_phong_cam', 'palette': 'tran_sat', 'replaces': ['phongcam'], 'events': ev}


R['skl_phong_cam'] = phong_cam


# --------------------------------------------------------------------------------------------------------------------------------
def mau_don_cam():
    """Mẫu Đơn Thập Bát Cấm (tối thượng, đặt trận Sát 9 m dưới chân, hit 0,5): ấn nở như hoa mẫu đơn quanh người, nứt tỏa tới rìa; slowmo + kéo máy nhẹ."""
    ev = [
        parts('spark', -0.5, 30, 2.0, 1, 0.45, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.55, 0.85),
        vig(-0.45, 0.25, 500, tone='dark', tier=1),
        cam(-0.45, 0.15, 1.2, fov=3.5, tier=1),
        *seal(-0.4, 'area', 9.0, 3.6),
        mesh('rune_ring2', -0.4, 1.0, at='area', offset=[0, 0.06, 0], scale=0.2, scaleTo=1.03, fit='area', sweep=0.3, erodeFrom=0.85, alpha=1, shadow=False, tone='core', tier=0, seed=2),
        mesh('rune_ring2', -0.35, 1.0, at='area', offset=[0, 0.1, 0], scale=0.2, scaleTo=0.97, fit='area', sweep=0.3, erodeFrom=0.85, alpha=1, shadow=False, tone='rim', tier=0, seed=3),
        slow(0.0, 0.45, 220, tier=2),
        snd(0.0, 'impact', 0.7, 0.75),
        flip('spark_burst', 0.0, 0.4, 2.4, at='self', offset=[0, -0.6, 0], alpha=0.45, tone='rim', tier=0),
        mesh('crack_radial', 0.02, 1.2, at='area', offset=[0, 0.12, 0], scale=1.0, fit='area', alpha=0.8, sweep=0.15, erodeFrom=0.8, shadow=False, tone='body', tier=0, seed=4),
        mesh('shock_cone', 0.02, 0.5, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[8.0] * 3, alpha=0.9, sweep=0.3, erodeFrom=0.3, tone='body', tier=0, seed=3),
        parts('dust', 0.0, 80, 6, 1, 1.0, 0.22, at='self', offset=[0, -0.6, 0], tone='core', grav=-0.4, tier=0),
        parts('spark', 0.0, 40, 8, 1, 0.6, 0.08, at='self', offset=[0, -0.4, 0], tone='accent', tier=0),
        smoke(0.05, 'self', y=-0.6, scale=5.0, tone='core', alpha=0.6, tier=1),
    ]
    ev += feel(0.0, ms=60, sh=0.3, fl=0.08, vg=0.34, fov=3.5, pull=0.12)
    return {'skill': 'skl_mau_don_cam', 'palette': 'tran_sat', 'replaces': ['maudon'], 'events': ev}


R['skl_mau_don_cam'] = mau_don_cam


# --------------------------------------------------------------------------------------------------------------------------------
def pha_diet_cam():
    """Phá Diệt Cấm (nhánh 16, hit 0,2): vết nứt dày nối từ chân người tới mục tiêu rồi nổ tung dưới nó; choáng."""
    ev = [
        parts('spark', -0.2, 16, 1.2, 1, 0.22, 0.06, at='self', offset=[0.2, 0.2, 0.4], inward=True, tone='rim', tier=1),
        snd(-0.2, 'cast', 0.4, 1.3),
        link(-0.2, 0.25, tone='accent', seed=7, scale=3.0),
        link(-0.18, 0.25, tone='rim', seed=8, scale=2.0),
        # Điểm nổ đặt trên đầu mục tiêu (2,4 m) và tắt nhanh để thân nó vẫn đọc được (cổng duyệt che thân).
        mesh('burst', 0.0, 0.12, at='target', offset=[0, 2.4, 0], scale=2.2, camFade=True, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', 0.0, 0.22, 2.6, at='target', offset=[0, 2.5, 0], camFade=True, alpha=0.9, tone='accent', tier=0),
        mesh('shock_cone', 0.02, 0.3, at='ground', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[4.5] * 3, alpha=0.45, sweep=0.3, erodeFrom=0.2, tone='body', tier=0, seed=3),
        mesh('crack_radial', 0.02, 1.0, at='ground', offset=[0, 0.08, 0], scale=4.0, alpha=1, sweep=0.2, erodeFrom=0.7, shadow=False, tone='accent', tier=0, seed=9),
        *seal(0.0, 'ground', 3.4, 3.0),
        parts('dust', 0.0, 20, 4, 1, 0.4, 0.13, at='target', offset=[0, 2.2, 0], tone='core', grav=-0.4, tier=0),
        parts('spark', 0.0, 36, 7, 1, 0.45, 0.08, at='target', offset=[0, 2.3, 0], tone='rim', tier=1),
        snd(0.0, 'impact', 0.6, 0.95),
    ]
    ev += feel(0.0, ms=75, sh=0.3, fl=0.1, vg=0.3, fov=2.2)
    return {'skill': 'skl_pha_diet_cam', 'palette': 'tran_sat', 'replaces': ['phadiet'], 'events': ev}


R['skl_pha_diet_cam'] = pha_diet_cam


# --------------------------------------------------------------------------------------------------------------------------------
def tue_nguyet_cam():
    """Tuế Nguyệt Cấm (nhánh 16, đặt trận Khốn 7 m phía trước, hit 0,4): sóng lam co dần vào tâm, triện đậm; trận đứng do `tran_khon_*` vẽ tiếp."""
    ev = [
        parts('spark', -0.4, 22, 1.6, 1, 0.34, 0.06, at='self', offset=[0, 0.9, 0.3], inward=True, tone='rim', tier=1),
        snd(-0.4, 'cast', 0.5, 1.0),
        link(-0.35, 0.35, to='area', tone='accent', seed=12),
        *seal(-0.3, 'area', 7.0, 3.0),
        mesh('ripple', -0.3, 0.7, at='area', offset=[0, 0.12, 0], scale=1.0, scaleTo=0.2, fit='area', alpha=1, sweep=0.5, erodeFrom=0.4, shadow=False, tone='accent', tier=0, seed=13),
        mesh('ripple', -0.1, 0.7, at='area', offset=[0, 0.12, 0], scale=1.0, scaleTo=0.2, fit='area', alpha=1, sweep=0.5, erodeFrom=0.4, shadow=False, tone='rim', tier=1, seed=14),
        snd(0.0, 'impact', 0.55, 0.9),
        mesh('rune_ring2', 0.0, 0.6, at='area', offset=[0, 0.1, 0], scale=0.3, scaleTo=1.03, fit='area', alpha=1, sweep=0.3, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=15),
        mesh('shock_cone', 0.02, 0.5, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[6.0] * 3, alpha=0.8, sweep=0.3, erodeFrom=0.3, tone='body', tier=1, seed=16),
        parts('dust', 0.0, 50, 4, 1, 0.8, 0.18, at='area', offset=[0, 0.4, 0], tone='body', grav=-0.3, tier=0),
        smoke(0.05, 'area', y=0.5, scale=4.0, tone='core', alpha=0.5),
    ]
    ev += feel(0.0, ms=60, sh=0.2, fl=0.06, vg=0.26, fov=1.8)
    return {'skill': 'skl_tue_nguyet_cam', 'palette': 'tran_khon', 'replaces': ['tuenguyet'], 'events': ev}


R['skl_tue_nguyet_cam'] = tue_nguyet_cam


# --------------------------------------------------------------------------------------------------------------------------------
def sinh_tu_cam():
    """Sinh Tử Cấm (nhánh 20, đặt trận Sinh Tử 7 m dưới chân, hit 0,5): hai vòng ngược chiều (sinh nở ra, tử khép vào) tím + vàng, hạt vàng bay lên."""
    ev = [
        parts('spark', -0.5, 26, 2.0, 1, 0.4, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
        snd(-0.5, 'cast', 0.5, 0.95),
        *seal(-0.4, 'area', 7.0, 3.0),
        mesh('rune_ring2', -0.4, 0.9, at='area', offset=[0, 0.1, 0], scale=0.2, scaleTo=1.0, fit='area', alpha=1, sweep=0.4, erodeFrom=0.8, shadow=False, tone='accent', tier=0, seed=21),
        mesh('rune_ring2', -0.4, 0.9, at='area', offset=[0, 0.12, 0], scale=1.1, scaleTo=0.3, fit='area', alpha=1, sweep=0.4, erodeFrom=0.8, shadow=False, tone='rim', tier=0, seed=22),
        snd(0.0, 'impact', 0.6, 0.85),
        flip('spark_burst', 0.0, 0.4, 3.4, at='self', offset=[0, 0.5, 0], alpha=0.8, tone='accent', tier=0),
        mesh('shock_cone', 0.02, 0.5, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[6.0] * 3, alpha=0.8, sweep=0.3, erodeFrom=0.3, tone='body', tier=1, seed=23),
        parts('spark', 0.0, 60, 3, 1, 1.0, 0.1, at='self', offset=[0, -0.5, 0], tone='accent', grav=1.2, tier=0),
        smoke(0.05, 'self', y=-0.5, scale=4.0, tone='core', alpha=0.5),
    ]
    ev += feel(0.0, ms=60, sh=0.22, fl=0.08, vg=0.28, fov=2.4)
    return {'skill': 'skl_sinh_tu_cam', 'palette': 'tran_sinhtu', 'replaces': ['sinhtu'], 'events': ev}


R['skl_sinh_tu_cam'] = sinh_tu_cam


# --------------------------------------------------------------------------------------------------------------------------------
def phien_thien_an():
    """Phiên Thiên Ấn (nhánh 20, vùng 8 m, hit 0,45): vết nứt nối từ chân tới tâm vùng, ấn khổng lồ rơi từ cao 6 m (camFade) đóng xuống, nứt tỏa tới rìa."""
    ev = [
        parts('spark', -0.45, 24, 1.6, 1, 0.36, 0.06, at='self', offset=[0, 0.9, 0.3], inward=True, tone='rim', tier=1),
        snd(-0.45, 'cast', 0.5, 0.85),
        vig(-0.4, 0.2, 450, tone='dark', tier=1),
        link(-0.4, 0.35, to='area', tone='accent', seed=31, scale=3.0),
        *seal(-0.4, 'area', 8.0, 4.0),
        mesh('rune_ring2', -0.4, 0.45, at='area', offset=[0, 6.0, 0], scale=0.9, fit='area', alpha=1, sweep=0.1, erodeFrom=0.95, shadow=False, tone='accent', camFade=True, tier=0, seed=32,
             move={'to': 'area', 'ease': 'in', 'offset': [0, 0.15, 0]}),
        mesh('rune_ring2', -0.4, 0.45, at='area', offset=[0, 6.05, 0], scale=0.95, fit='area', alpha=1, sweep=0.1, erodeFrom=0.95, shadow=False, tone='core', camFade=True, tier=0, seed=33,
             move={'to': 'area', 'ease': 'in', 'offset': [0, 0.1, 0]}),
        snd(0.0, 'impact', 0.9, 0.7, 0.04),
        mesh('burst', 0.0, 0.12, at='area', offset=[0, 0.6, 0], scale=3.0, billboard=True, sweep=0, tone='accent', cross=True, tier=0),
        mesh('crack_radial', 0.0, 1.2, at='area', offset=[0, 0.1, 0], scale=1.0, fit='area', alpha=1, sweep=0.15, erodeFrom=0.8, shadow=False, tone='accent', tier=0, seed=34),
        mesh('shock_cone', 0.02, 0.5, at='area', offset=[0, 0.05, 0], scale=[1.0] * 3, scaleTo=[9.0] * 3, alpha=0.9, sweep=0.3, erodeFrom=0.3, tone='body', tier=0, seed=35),
        parts('dust', 0.0, 80, 6, 1, 0.9, 0.22, at='area', offset=[0, 0.5, 0], tone='core', grav=-0.4, tier=0),
        parts('spark', 0.0, 50, 8, 1, 0.5, 0.09, at='area', offset=[0, 1.0, 0], tone='rim', tier=1),
        smoke(0.04, 'area', y=0.6, scale=5.0, tone='core', alpha=0.6),
    ]
    ev += feel(0.0, ms=75, sh=0.45, fl=0.0, vg=0.32, fov=2.8)
    return {'skill': 'skl_phien_thien_an', 'palette': 'cam_che_kinh', 'replaces': ['phienthien'], 'events': ev}


R['skl_phien_thien_an'] = lambda: fit_area_skill(phien_thien_an(), 8.0)  # vùng 6 m (area_fit.py)


if __name__ == '__main__':
    for i in sys.argv[1:] or list(R):
        write(R[i]())
