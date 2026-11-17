# VFX-V4 phần 2: đột phá cảnh giới, độ kiếp (khởi vòng trận), di chuyển (ngự kiếm, xuất khiếu, thuấn di). Chỉ thêm lớp hình
# (timeline kích hoạt theo S.FX, id giả `fx_*`), không đổi luật. Nạp từ gen-fx-kiem.py sau recipes_d.


def register(R, H):
    mesh, parts, decal, flash, shake, ring_spikes = H['mesh'], H['parts'], H['decal'], H['flash'], H['shake'], H['ring_spikes']

    def cam(t, pull, dur):
        return {'type': 'camera', 't': t, 'pull': pull, 'dur': dur}

    def bolt(t, at, off, scale, tone, seed, tier=0, thick=1):
        e = {'type': 'bolt', 't': t, 'at': at, 'offset': off, 'scale': scale, 'tone': tone, 'seed': seed, 'tier': tier}
        if thick != 1:
            e['thick'] = thick
        return e

    # ---------- Đột phá cảnh giới ----------
    def dotpha(tid, pal, when, r, col_h, halo):
        def make():
            ev = [
                decal('rune', -0.2, r, 3.2, at='self', offset=[0, -1.15, 0], grow=0.5, tone='core', alpha=0.95, tier=0),
                decal('rune', -0.1, r * 0.7, 3.0, at='self', offset=[0, -1.15, 0], grow=0.6, tone='body', alpha=0.6, yaw=17, tier=1),
                mesh('ripple', 0.0, 1.3, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=min(r * 0.75, 5.5), sweep=0.4, erodeFrom=0.45, ragged=0.5, tone='core', alpha=0.9, seed=2, tier=0),
                mesh('ripple', 0.12, 1.1, at='self', offset=[0, -1.0, 0], scale=0.3, scaleTo=min(r * 0.55, 4.5), sweep=0.4, erodeFrom=0.45, tone='rim', alpha=0.75, seed=3, tier=1),
                # Cột sáng có lõi sẫm: hai dải xoắn ngược chiều (lõi sẫm + thân sáng) dựng quanh người.
                mesh('helix', 0.0, 2.8, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[1.6, 1.6, col_h], sweep=0.3, erodeFrom=0.6, spin=260, follow=True, tone='core', alpha=0.9, seed=4, tier=0),
                mesh('helix', 0.05, 2.7, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[2.2, 2.2, col_h * 0.85], sweep=0.3, erodeFrom=0.6, spin=-200, follow=True, tone='body', alpha=0.85, seed=5, tier=0),
                mesh('helix', 0.1, 2.5, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[3.0, 3.0, col_h * 0.6], sweep=0.3, erodeFrom=0.6, spin=140, follow=True, tone='rim', alpha=0.6, seed=6, tier=1),
                mesh('burst', 0.0, 0.11, at='self', scale=2.2, billboard=True, sweep=0.0, tone='rim', tier=0),
                *ring_spikes(8, r * 0.28, 0.0, 'self', 0.6, 1.6, tier=1, y=-1.15, tilt=-12, stagger=0.04),
                parts('spark', 0.0, 80, 3.2, 1, 2.2, 0.08, at='self', offset=[0, -0.5, 0], grav=-2.2, tone='accent', tier=0),
                parts('spark', 0.1, 50, 1.8, 1, 2.4, 0.07, at='self', offset=[0, -0.5, 0], grav=-3.0, tone='rim', tier=1),
                flash(0.0, 0.1, tier=1),
                shake(0.0, 0.2, tier=1),
                cam(-0.1, 0.1, 2.4),
            ]
            if halo:
                ev += [mesh('ripple', 0.2, 2.4, at='self', offset=[0, 3.6, 3.5], rot=[90, 0, 0], scale=halo, sweep=0.4, erodeFrom=0.7, ragged=0.2, tone='accent', alpha=0.85, seed=7, tier=0),
                       mesh('ripple', 0.3, 2.3, at='self', offset=[0, 3.6, 3.6], rot=[90, 0, 0], scale=halo * 0.7, sweep=0.4, erodeFrom=0.7, ragged=0.2, tone='rim', alpha=0.8, seed=8, tier=1)]
            tl = {'skill': tid, 'trigger': 'fx', 'fxKind': 'ascend', 'palette': pal, 'replaces': ['ascend'], 'events': ev}
            if when:
                tl['when'] = when
            return tl
        return make

    R['fx_dotpha_tc'] = dotpha('fx_dotpha_tc', 'dotpha_tc', None, 7.0, 14.0, 0)
    R['fx_dotpha_kd'] = dotpha('fx_dotpha_kd', 'dotpha_kd', 'ket_dan', 9.0, 18.0, 2.0)
    R['fx_dotpha_na'] = dotpha('fx_dotpha_na', 'dotpha_na', 'nguyen_anh', 11.0, 22.0, 2.6)
    # Hóa Thần (E4-D): vàng sao nhạt (bảng dotpha_hn), vòng trận lớn hơn một chút, vầng hào quang sau gáy.
    R['fx_dotpha_hn'] = dotpha('fx_dotpha_hn', 'dotpha_hn', 'hoa_than', 12.0, 24.0, 3.0)

    # ---------- Độ kiếp: khởi vòng trận lôi văn + sét mảnh nối tiếp (mây kiếp cũ giữ nguyên) ----------
    def kiep(tid, pal, when, r, nbolt):
        def make():
            ev = [
                decal('rune', -0.3, r * 0.5, 6.0, at='self', offset=[0, -1.15, 0], grow=0.6, tone='core', alpha=0.6, tier=0),
                decal('crack', 0.0, r * 0.4, 5.5, at='self', offset=[0, -1.15, 0], grow=0.4, tone='body', alpha=0.6, tier=0),
                decal('rune', 0.1, r * 0.3, 5.0, at='self', offset=[0, -1.15, 0], grow=0.5, tone='accent', alpha=0.35, yaw=23, tier=1),
                mesh('ripple', 0.0, 1.4, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=r * 0.4, sweep=0.4, erodeFrom=0.4, ragged=0.6, tone='core', alpha=0.45, seed=2, tier=0),
                mesh('burst', 0.0, 0.11, at='self', scale=1.6, billboard=True, sweep=0.0, tone='body', alpha=0.8, tier=0),
                parts('spark', 0.0, 60, 4.0, 1, 1.6, 0.07, at='self', offset=[0, -0.5, 0], grav=-1.2, tone='accent', tier=0),
                shake(0.0, 0.18, tier=1),
                cam(-0.1, 0.1, 3.0),
            ]
            # Sét dày, lõi trắng viền màu, rẽ nhánh: tia chính đánh thẳng xuống người, các tia sau quanh vòng trận; chớp ngắn + vết cháy đất.
            ev += [decal('scorch', 0.1, r * 0.4, 5.0, at='self', offset=[0, -1.15, 0], grow=0.1, tone='core', alpha=0.9, tier=0),
                   flash(0.12, 0.2, tier=0),
                   mesh('burst', 0.12, 0.11, at='self', scale=2.4, billboard=True, sweep=0.0, tone='rim', tier=0)]
            # Hai tia DÀY (lõi trắng gấp ~4 lần cũ) đánh thẳng người ở 0,1 s và 0,95 s (kèm chớp + cháy), hai tia mảnh gần chân ở 0,5 s và 1,4 s: nhịp sét ~1,8 s.
            ev += [flash(0.97, 0.15, tier=0),
                   decal('scorch', 0.95, 0.9, 3.0, at='self', offset=[0, -1.15, 0], grow=0.1, tone='core', alpha=0.9, tier=0)]
            offs = [[0, -1.15, 0], [1.4, -1.15, 0.6], [0, -1.15, 0], [-1.2, -1.15, -0.8]]
            ts = [0.1, 0.5, 0.95, 1.4]
            for i in range(min(nbolt, 4)):
                big = i % 2 == 0
                ev.append(bolt(ts[i], 'self', offs[i], 1.0 if big else 0.9, 'body' if big else 'accent', 30 + i, 0, thick=4.5 if big else 1))
            tl = {'skill': tid, 'trigger': 'fx', 'fxKind': 'tribstart', 'palette': pal, 'events': ev}
            if when:
                tl['when'] = when
            return tl
        return make

    R['fx_kiep_tc'] = kiep('fx_kiep_tc', 'loi', None, 8.0, 3)
    R['fx_kiep_kd'] = kiep('fx_kiep_kd', 'dotpha_kd', 'ket_dan', 9.0, 4)
    R['fx_kiep_na'] = kiep('fx_kiep_na', 'dotpha_na', 'nguyen_anh', 11.0, 4)
    R['fx_kiep_hn'] = kiep('fx_kiep_hn', 'dotpha_hn', 'hoa_than', 12.0, 4)

    # ---------- Nguyên anh xuất khiếu / nhập thể: hồn thể bán trong suốt (bản sao nhân vật màu lam) tách ra bay lên / hạ xuống nhập thể ----------
    R['fx_soul_out'] = lambda: {
        'skill': 'fx_soul_out', 'trigger': 'fx', 'fxKind': 'soul_out', 'palette': 'than_hanh',
        'events': [
            decal('rune', -0.2, 3.4, 2.4, at='self', offset=[0, -1.15, 0], grow=0.3, tone='core', alpha=0.95, tier=0),
            mesh('card', 0.0, 1.9, card='ghost', at='self', offset=[0, 0.1, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.25, erodeFrom=0.6, alpha=0.7, tone='body', seed=11,
                 move={'to': 'self', 'offset': [0, 3.2, 0], 'ease': 'out'}, tier=0),
            mesh('card', 0.12, 1.5, card='ghost', at='self', offset=[0, 0.1, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.25, erodeFrom=0.5, alpha=0.35, tone='rim', seed=12,
                 move={'to': 'self', 'offset': [0, 2.0, 0], 'ease': 'out'}, tier=1),
            mesh('ripple', 0.0, 0.9, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.8, sweep=0.4, erodeFrom=0.45, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('helix', 0.0, 1.2, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[1.6, 1.6, 5.0], sweep=0.3, erodeFrom=0.55, spin=300, tone='accent', alpha=0.8, seed=4, tier=1),
            mesh('burst', 0.0, 0.1, at='self', scale=1.6, billboard=True, sweep=0.0, tone='rim', tier=0),
            parts('spark', 0.0, 50, 2.6, 1, 1.6, 0.08, at='self', offset=[0, 0.4, 0], grav=-1.8, tone='rim', tier=0),
        ],
    }
    R['fx_soul_in'] = lambda: {
        'skill': 'fx_soul_in', 'trigger': 'fx', 'fxKind': 'soul_in', 'palette': 'than_hanh',
        'events': [
            parts('spark', -0.4, 40, 3.0, 1, 0.45, 0.07, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=0),
            mesh('card', -0.5, 0.9, card='ghost', at='self', offset=[0, 3.2, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.2, erodeFrom=0.55, alpha=0.7, tone='body', seed=13,
                 move={'to': 'self', 'offset': [0, 0.1, 0], 'ease': 'in'}, tier=0),
            mesh('ripple', -0.1, 0.6, at='self', offset=[0, -1.1, 0], scale=2.6, scaleTo=0.4, sweep=0.1, erodeFrom=0.55, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('burst', 0.3, 0.1, at='self', scale=1.6, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('ripple', 0.32, 0.7, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.4, tone='core', alpha=0.85, seed=3, tier=1),
        ],
    }

    # ---------- Thuấn di: tàn ảnh mờ ở điểm đi, vệt sáng nối hai điểm, nổ nhỏ ở điểm đến ----------
    R['fx_blink'] = lambda: {
        'skill': 'fx_blink', 'trigger': 'fx', 'fxKind': 'blink', 'palette': 'than_hanh',
        'events': [
            mesh('card', -0.05, 0.7, card='ghost', at='origin', offset=[0, 0, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.05, erodeFrom=0.1, alpha=0.65, tone='body', seed=21, tier=0),
            mesh('burst', -0.05, 0.1, at='origin', scale=1.8, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('ripple', -0.05, 0.5, at='origin', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.4, tone='core', alpha=0.85, seed=22, tier=1),
            mesh('helix', 0.0, 0.3, at='origin', scale=[1.4, 1.4, 6.0], sweep=0.2, erodeFrom=0.3, spin=800, tone='accent', alpha=0.9, move={'to': 'self', 'ease': 'in'}, seed=23, tier=0),
            mesh('crescent', 0.0, 0.3, at='origin', rot=[0, 0, 90], scale=2.2, sweep=0.3, erodeFrom=0.3, ragged=0.6, tone='body', alpha=0.9, move={'to': 'self', 'ease': 'in'}, seed=24, tier=0),
            mesh('burst', 0.28, 0.11, at='self', scale=2.4, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('ripple', 0.28, 0.6, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=3.2, sweep=0.4, erodeFrom=0.4, tone='body', seed=25, tier=0),
            *ring_spikes(6, 1.5, 0.3, 'self', 0.8, 0.7, tier=1, y=-1.15, tilt=20),
            parts('spark', 0.28, 50, 7, 1, 0.5, 0.07, at='self', tone='rim', tier=0),
            shake(0.28, 0.14, tier=1),
        ],
    }

    # ---------- Ngự kiếm: kiếm hóa quang bay ra dưới chân đỡ người lên, vệt gió ----------
    R['fx_fly_on'] = lambda: {
        'skill': 'fx_fly_on', 'palette': 'than_hanh',
        'events': [
            decal('rune', -0.1, 3.8, 1.6, at='self', offset=[0, -1.15, 0], grow=0.25, tone='core', alpha=0.95, tier=0),
            mesh('kite', 0.0, 1.2, at='self', offset=[0, -1.05, 6.0], scale=[1.8, 1.8, 6.5], sweep=0.2, erodeFrom=0.7, tone='rim', alpha=0.95, move={'to': 'self', 'offset': [0, -1.05, 0], 'ease': 'out'}, seed=3, tier=0),
            mesh('kite', 0.05, 1.1, at='self', offset=[0, -1.15, 6.0], scale=[2.4, 2.4, 6.5], sweep=0.2, erodeFrom=0.7, tone='core', alpha=0.75, move={'to': 'self', 'offset': [0, -1.15, 0], 'ease': 'out'}, seed=4, tier=1),
            mesh('ripple', 0.2, 0.8, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=3.8, sweep=0.4, erodeFrom=0.4, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('helix', 0.2, 0.9, at='self', offset=[0, -1.0, -3.0], scale=[1.4, 1.4, 7.0], sweep=0.3, erodeFrom=0.4, spin=500, tone='accent', alpha=0.85, seed=5, tier=0),
            mesh('helix', 0.22, 0.8, at='self', offset=[0.8, -0.8, -3.0], scale=[1.0, 1.0, 6.0], sweep=0.3, erodeFrom=0.4, spin=-500, tone='rim', alpha=0.7, seed=6, tier=1),
            mesh('burst', 0.2, 0.1, at='self', offset=[0, -0.9, 0], scale=1.6, billboard=True, sweep=0.0, tone='rim', tier=0),
            parts('spark', 0.2, 40, 4.0, 0.4, 0.8, 0.07, at='self', offset=[0, -1.0, 0], back=True, tone='rim', tier=0),
            parts('dust', 0.2, 20, 3.0, 0.8, 0.6, 0.25, at='self', offset=[0, -1.1, 0], tone='body', tier=1),
        ],
    }
