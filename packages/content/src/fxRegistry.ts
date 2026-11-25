// Đăng ký timeline VFX (`data/fx/*.json`) cho chiêu, quái, Ngũ Suy, Huyền Kiếp, kiếp chương 6, hồn tu, cổ tu, trận.
// Tách từ index.ts (Đợt E); index.ts `export *` lại nên đường import `@dtl/content` không đổi.
import type { FxTimeline } from '@dtl/shared';

import fxKiemKhiTramJson from '../data/fx/skl_kiem_khi_tram.json';
import fxPhiKiemJson from '../data/fx/skl_phi_kiem.json';
import fx_mon_bolt_impact from '../data/fx/mon_bolt_impact.json';
import fx_mon_bolt_muzzle from '../data/fx/mon_bolt_muzzle.json';
import fx_mon_boom_circle from '../data/fx/mon_boom_circle.json';
import fx_mon_boom_cone from '../data/fx/mon_boom_cone.json';
import fx_mon_boom_line from '../data/fx/mon_boom_line.json';
import fx_mon_cast from '../data/fx/mon_cast.json';
import fx_mon_death from '../data/fx/mon_death.json';
import fx_mon_face from '../data/fx/mon_face.json';
import fx_mon_face_warn from '../data/fx/mon_face_warn.json';
import fx_mon_hit from '../data/fx/mon_hit.json';
import fx_mon_strike from '../data/fx/mon_strike.json';
import fx_mon_warn from '../data/fx/mon_warn.json';
import fx_mon_warn_cone from '../data/fx/mon_warn_cone.json';
import fx_mon_warn_line from '../data/fx/mon_warn_line.json';
import fx_mon_cast__boss_han_giao from '../data/fx/mon_cast__boss_han_giao.json';
import fx_mon_boom_circle__elite_ho_mach_khoi_tuong__leap from '../data/fx/mon_boom_circle__elite_ho_mach_khoi_tuong__leap.json';
import fx_mon_boom_circle__elite_liet_cot_bao__leap from '../data/fx/mon_boom_circle__elite_liet_cot_bao__leap.json';
import fx_mon_boom_circle__elite_loi_van_su_vuong__caster from '../data/fx/mon_boom_circle__elite_loi_van_su_vuong__caster.json';
import fx_mon_boom_circle__elite_loi_van_su_vuong__leap from '../data/fx/mon_boom_circle__elite_loi_van_su_vuong__leap.json';
import fx_mon_boom_circle__elite_xich_sa_ngo_cong__burrow from '../data/fx/mon_boom_circle__elite_xich_sa_ngo_cong__burrow.json';
import fx_mon_boom_cone__elite_xich_sa_ngo_cong__caster from '../data/fx/mon_boom_cone__elite_xich_sa_ngo_cong__caster.json';
import fx_mon_boom_cone__elite_xich_sa_ngo_cong__emerge from '../data/fx/mon_boom_cone__elite_xich_sa_ngo_cong__emerge.json';
import fx_mon_boom_line__elite_kinh_dien_ma_quan__line from '../data/fx/mon_boom_line__elite_kinh_dien_ma_quan__line.json';
import fx_mon_warn__elite_ho_mach_khoi_tuong__leap from '../data/fx/mon_warn__elite_ho_mach_khoi_tuong__leap.json';
import fx_mon_warn__elite_liet_cot_bao__leap from '../data/fx/mon_warn__elite_liet_cot_bao__leap.json';
import fx_mon_warn__elite_loi_van_su_vuong__caster from '../data/fx/mon_warn__elite_loi_van_su_vuong__caster.json';
import fx_mon_warn__elite_loi_van_su_vuong__leap from '../data/fx/mon_warn__elite_loi_van_su_vuong__leap.json';
import fx_mon_warn__elite_xich_sa_ngo_cong__burrow from '../data/fx/mon_warn__elite_xich_sa_ngo_cong__burrow.json';
import fx_mon_warn_cone__elite_xich_sa_ngo_cong__caster from '../data/fx/mon_warn_cone__elite_xich_sa_ngo_cong__caster.json';
import fx_mon_warn_cone__elite_xich_sa_ngo_cong__emerge from '../data/fx/mon_warn_cone__elite_xich_sa_ngo_cong__emerge.json';
import fx_mon_warn_line__elite_kinh_dien_ma_quan__line from '../data/fx/mon_warn_line__elite_kinh_dien_ma_quan__line.json';
import fx_mon_boom_cone__elite_cu_nham_vien__caster from '../data/fx/mon_boom_cone__elite_cu_nham_vien__caster.json';
import fx_mon_boom_cone__elite_huyet_nha_lang__caster from '../data/fx/mon_boom_cone__elite_huyet_nha_lang__caster.json';
import fx_mon_warn_cone__elite_cu_nham_vien__caster from '../data/fx/mon_warn_cone__elite_cu_nham_vien__caster.json';
import fx_mon_warn_cone__elite_huyet_nha_lang__caster from '../data/fx/mon_warn_cone__elite_huyet_nha_lang__caster.json';
import fx_mon_boom_circle__boss_dia_mach_long__chant from '../data/fx/mon_boom_circle__boss_dia_mach_long__chant.json';
import fx_mon_boom_circle__boss_huyet_lang_vuong__slam from '../data/fx/mon_boom_circle__boss_huyet_lang_vuong__slam.json';
import fx_mon_boom_circle__boss_kiem_khoi__slam from '../data/fx/mon_boom_circle__boss_kiem_khoi__slam.json';
import fx_mon_boom_circle__boss_thach_tam_khoi_vuong__leap from '../data/fx/mon_boom_circle__boss_thach_tam_khoi_vuong__leap.json';
import fx_mon_boom_circle__boss_kinh_nguyet_chan_quan__slam from '../data/fx/mon_boom_circle__boss_kinh_nguyet_chan_quan__slam.json';
import fx_mon_boom_circle__boss_van_hai_kinh_vuong__chant from '../data/fx/mon_boom_circle__boss_van_hai_kinh_vuong__chant.json';
import fx_mon_boom_circle__boss_van_hai_kinh_vuong__slam from '../data/fx/mon_boom_circle__boss_van_hai_kinh_vuong__slam.json';
import fx_mon_boom_cone__boss_kinh_nguyet_chan_quan__sweep from '../data/fx/mon_boom_cone__boss_kinh_nguyet_chan_quan__sweep.json';
import fx_mon_boom_cone__boss_van_hai_kinh_vuong__sweep from '../data/fx/mon_boom_cone__boss_van_hai_kinh_vuong__sweep.json';
import fx_mon_boom_line__boss_kinh_nguyet_chan_quan__line from '../data/fx/mon_boom_line__boss_kinh_nguyet_chan_quan__line.json';
import fx_mon_boom_line__boss_van_hai_kinh_vuong__line from '../data/fx/mon_boom_line__boss_van_hai_kinh_vuong__line.json';
import fx_mon_cast__boss_van_hai_kinh_vuong from '../data/fx/mon_cast__boss_van_hai_kinh_vuong.json';
import fx_mon_warn__boss_kinh_nguyet_chan_quan__slam from '../data/fx/mon_warn__boss_kinh_nguyet_chan_quan__slam.json';
import fx_mon_warn__boss_van_hai_kinh_vuong__chant from '../data/fx/mon_warn__boss_van_hai_kinh_vuong__chant.json';
import fx_mon_warn__boss_van_hai_kinh_vuong__slam from '../data/fx/mon_warn__boss_van_hai_kinh_vuong__slam.json';
import fx_mon_warn_cone__boss_kinh_nguyet_chan_quan__sweep from '../data/fx/mon_warn_cone__boss_kinh_nguyet_chan_quan__sweep.json';
import fx_mon_warn_cone__boss_van_hai_kinh_vuong__sweep from '../data/fx/mon_warn_cone__boss_van_hai_kinh_vuong__sweep.json';
import fx_mon_warn_line__boss_kinh_nguyet_chan_quan__line from '../data/fx/mon_warn_line__boss_kinh_nguyet_chan_quan__line.json';
import fx_mon_warn_line__boss_van_hai_kinh_vuong__line from '../data/fx/mon_warn_line__boss_van_hai_kinh_vuong__line.json';
import fx_mon_boom_circle__boss_thon_mach_ngo_cong_vuong__burrow from '../data/fx/mon_boom_circle__boss_thon_mach_ngo_cong_vuong__burrow.json';
import fx_mon_boom_cone__boss_thon_mach_ngo_cong_vuong__emerge from '../data/fx/mon_boom_cone__boss_thon_mach_ngo_cong_vuong__emerge.json';
import fx_mon_warn__boss_thon_mach_ngo_cong_vuong__burrow from '../data/fx/mon_warn__boss_thon_mach_ngo_cong_vuong__burrow.json';
import fx_mon_warn_cone__boss_thon_mach_ngo_cong_vuong__emerge from '../data/fx/mon_warn_cone__boss_thon_mach_ngo_cong_vuong__emerge.json';
import fx_mon_boom_circle__boss_thon_mach_ngo_cong_vuong__chant from '../data/fx/mon_boom_circle__boss_thon_mach_ngo_cong_vuong__chant.json';
import fx_mon_boom_circle__boss_thon_mach_ngo_cong_vuong__slam from '../data/fx/mon_boom_circle__boss_thon_mach_ngo_cong_vuong__slam.json';
import fx_mon_boom_circle__boss_thu_mo_tuong__chant from '../data/fx/mon_boom_circle__boss_thu_mo_tuong__chant.json';
import fx_mon_boom_cone__boss_huyet_lang_vuong__sweep from '../data/fx/mon_boom_cone__boss_huyet_lang_vuong__sweep.json';
import fx_mon_boom_line__boss_dia_mach_long__line from '../data/fx/mon_boom_line__boss_dia_mach_long__line.json';
import fx_mon_boom_line__boss_kiem_khoi__sweep from '../data/fx/mon_boom_line__boss_kiem_khoi__sweep.json';
import fx_mon_boom_line__boss_thach_tam_khoi_vuong__line from '../data/fx/mon_boom_line__boss_thach_tam_khoi_vuong__line.json';
import fx_mon_boom_line__boss_thu_mo_tuong__sweep from '../data/fx/mon_boom_line__boss_thu_mo_tuong__sweep.json';
import fx_mon_cast__boss_dia_mach_long from '../data/fx/mon_cast__boss_dia_mach_long.json';
import fx_mon_cast__boss_thon_mach_ngo_cong_vuong from '../data/fx/mon_cast__boss_thon_mach_ngo_cong_vuong.json';
import fx_mon_cast__boss_thu_mo_tuong from '../data/fx/mon_cast__boss_thu_mo_tuong.json';
import fx_mon_warn__boss_dia_mach_long__chant from '../data/fx/mon_warn__boss_dia_mach_long__chant.json';
import fx_mon_warn__boss_huyet_lang_vuong__slam from '../data/fx/mon_warn__boss_huyet_lang_vuong__slam.json';
import fx_mon_warn__boss_kiem_khoi__slam from '../data/fx/mon_warn__boss_kiem_khoi__slam.json';
import fx_mon_warn__boss_thach_tam_khoi_vuong__leap from '../data/fx/mon_warn__boss_thach_tam_khoi_vuong__leap.json';
import fx_mon_warn__boss_thon_mach_ngo_cong_vuong__chant from '../data/fx/mon_warn__boss_thon_mach_ngo_cong_vuong__chant.json';
import fx_mon_warn__boss_thon_mach_ngo_cong_vuong__slam from '../data/fx/mon_warn__boss_thon_mach_ngo_cong_vuong__slam.json';
import fx_mon_warn__boss_thu_mo_tuong__chant from '../data/fx/mon_warn__boss_thu_mo_tuong__chant.json';
import fx_mon_warn_cone__boss_huyet_lang_vuong__sweep from '../data/fx/mon_warn_cone__boss_huyet_lang_vuong__sweep.json';
import fx_mon_warn_line__boss_dia_mach_long__line from '../data/fx/mon_warn_line__boss_dia_mach_long__line.json';
import fx_mon_warn_line__boss_kiem_khoi__sweep from '../data/fx/mon_warn_line__boss_kiem_khoi__sweep.json';
import fx_mon_warn_line__boss_thach_tam_khoi_vuong__line from '../data/fx/mon_warn_line__boss_thach_tam_khoi_vuong__line.json';
import fx_mon_warn_line__boss_thu_mo_tuong__sweep from '../data/fx/mon_warn_line__boss_thu_mo_tuong__sweep.json';
import fx_mon_boom_circle__boss_tam_thu_nguc_khuyen__chant from '../data/fx/mon_boom_circle__boss_tam_thu_nguc_khuyen__chant.json';
import fx_mon_boom_circle__boss_tam_thu_nguc_khuyen__slam from '../data/fx/mon_boom_circle__boss_tam_thu_nguc_khuyen__slam.json';
import fx_mon_boom_circle__boss_thien_khuyet_thu_linh__chant from '../data/fx/mon_boom_circle__boss_thien_khuyet_thu_linh__chant.json';
import fx_mon_boom_circle__boss_thien_khuyet_thu_linh__slam from '../data/fx/mon_boom_circle__boss_thien_khuyet_thu_linh__slam.json';
import fx_mon_boom_circle__boss_thu_khich_duc_chu__slam from '../data/fx/mon_boom_circle__boss_thu_khich_duc_chu__slam.json';
import fx_mon_boom_cone__boss_tam_thu_nguc_khuyen__sweep from '../data/fx/mon_boom_cone__boss_tam_thu_nguc_khuyen__sweep.json';
import fx_mon_boom_cone__boss_thien_khuyet_thu_linh__sweep from '../data/fx/mon_boom_cone__boss_thien_khuyet_thu_linh__sweep.json';
import fx_mon_boom_cone__boss_thu_khich_duc_chu__sweep from '../data/fx/mon_boom_cone__boss_thu_khich_duc_chu__sweep.json';
import fx_mon_boom_cone__boss_vo_dien_than_quan__sweep from '../data/fx/mon_boom_cone__boss_vo_dien_than_quan__sweep.json';
import fx_mon_boom_line__boss_tam_thu_nguc_khuyen__line from '../data/fx/mon_boom_line__boss_tam_thu_nguc_khuyen__line.json';
import fx_mon_boom_line__boss_thien_khuyet_thu_linh__line from '../data/fx/mon_boom_line__boss_thien_khuyet_thu_linh__line.json';
import fx_mon_boom_line__boss_thu_khich_duc_chu__line from '../data/fx/mon_boom_line__boss_thu_khich_duc_chu__line.json';
import fx_mon_cast__boss_tam_thu_nguc_khuyen from '../data/fx/mon_cast__boss_tam_thu_nguc_khuyen.json';
import fx_mon_cast__boss_thien_khuyet_thu_linh from '../data/fx/mon_cast__boss_thien_khuyet_thu_linh.json';
import fx_mon_warn__boss_tam_thu_nguc_khuyen__chant from '../data/fx/mon_warn__boss_tam_thu_nguc_khuyen__chant.json';
import fx_mon_warn__boss_tam_thu_nguc_khuyen__slam from '../data/fx/mon_warn__boss_tam_thu_nguc_khuyen__slam.json';
import fx_mon_warn__boss_thien_khuyet_thu_linh__chant from '../data/fx/mon_warn__boss_thien_khuyet_thu_linh__chant.json';
import fx_mon_warn__boss_thien_khuyet_thu_linh__slam from '../data/fx/mon_warn__boss_thien_khuyet_thu_linh__slam.json';
import fx_mon_warn__boss_thu_khich_duc_chu__slam from '../data/fx/mon_warn__boss_thu_khich_duc_chu__slam.json';
import fx_mon_warn_cone__boss_tam_thu_nguc_khuyen__sweep from '../data/fx/mon_warn_cone__boss_tam_thu_nguc_khuyen__sweep.json';
import fx_mon_warn_cone__boss_thien_khuyet_thu_linh__sweep from '../data/fx/mon_warn_cone__boss_thien_khuyet_thu_linh__sweep.json';
import fx_mon_warn_cone__boss_thu_khich_duc_chu__sweep from '../data/fx/mon_warn_cone__boss_thu_khich_duc_chu__sweep.json';
import fx_mon_warn_cone__boss_vo_dien_than_quan__sweep from '../data/fx/mon_warn_cone__boss_vo_dien_than_quan__sweep.json';
import fx_mon_warn_line__boss_tam_thu_nguc_khuyen__line from '../data/fx/mon_warn_line__boss_tam_thu_nguc_khuyen__line.json';
import fx_mon_warn_line__boss_thien_khuyet_thu_linh__line from '../data/fx/mon_warn_line__boss_thien_khuyet_thu_linh__line.json';
import fx_mon_warn_line__boss_thu_khich_duc_chu__line from '../data/fx/mon_warn_line__boss_thu_khich_duc_chu__line.json';
import fx_mon_warn__boss_han_giao__slam from '../data/fx/mon_warn__boss_han_giao__slam.json';
import fx_mon_boom_circle__boss_han_giao__slam from '../data/fx/mon_boom_circle__boss_han_giao__slam.json';
import fx_mon_warn__boss_han_giao__chant from '../data/fx/mon_warn__boss_han_giao__chant.json';
import fx_mon_boom_circle__boss_han_giao__chant from '../data/fx/mon_boom_circle__boss_han_giao__chant.json';
import fx_mon_warn_cone__boss_han_giao__sweep from '../data/fx/mon_warn_cone__boss_han_giao__sweep.json';
import fx_mon_boom_cone__boss_han_giao__sweep from '../data/fx/mon_boom_cone__boss_han_giao__sweep.json';
import fx_fx_blink from '../data/fx/fx_blink.json';
import fx_fx_dotpha_kd from '../data/fx/fx_dotpha_kd.json';
import fx_fx_dotpha_hn from '../data/fx/fx_dotpha_hn.json';
import fx_fx_dotpha_na from '../data/fx/fx_dotpha_na.json';
import fx_fx_dotpha_tc from '../data/fx/fx_dotpha_tc.json';
import fx_fx_fly_on from '../data/fx/fx_fly_on.json';
import fx_fx_kiep_kd from '../data/fx/fx_kiep_kd.json';
import fx_fx_kiep_hn from '../data/fx/fx_kiep_hn.json';
import fx_fx_kiep_na from '../data/fx/fx_kiep_na.json';
import fx_fx_kiep_tc from '../data/fx/fx_kiep_tc.json';
import fx_suy_den_dark from '../data/fx/suy_den_dark.json';
import fx_suy_den_gust from '../data/fx/suy_den_gust.json';
import fx_suy_den_light from '../data/fx/suy_den_light.json';
import fx_suy_den_lit from '../data/fx/suy_den_lit.json';
import fx_suy_den_out from '../data/fx/suy_den_out.json';
import fx_suy_den_relit from '../data/fx/suy_den_relit.json';
import fx_suy_enter_linh from '../data/fx/suy_enter_linh.json';
import fx_suy_enter_tam from '../data/fx/suy_enter_tam.json';
import fx_suy_enter_the from '../data/fx/suy_enter_the.json';
import fx_suy_enter_tho from '../data/fx/suy_enter_tho.json';
import fx_suy_enter_thuc from '../data/fx/suy_enter_thuc.json';
import fx_suy_fail from '../data/fx/suy_fail.json';
import fx_suy_nhan from '../data/fx/suy_nhan.json';
import fx_suy_nhan_end from '../data/fx/suy_nhan_end.json';
import fx_suy_nhan_open from '../data/fx/suy_nhan_open.json';
import fx_suy_ok from '../data/fx/suy_ok.json';
import fx_suy_tam_bad from '../data/fx/suy_tam_bad.json';
import fx_suy_tam_good from '../data/fx/suy_tam_good.json';
import fx_suy_tam_miss from '../data/fx/suy_tam_miss.json';
import fx_suy_tam_open from '../data/fx/suy_tam_open.json';
import fx_suy_thuc_boom from '../data/fx/suy_thuc_boom.json';
import fx_suy_thuc_brew from '../data/fx/suy_thuc_brew.json';
import fx_suy_thuc_pulse from '../data/fx/suy_thuc_pulse.json';
import fx_suy_thuc_void from '../data/fx/suy_thuc_void.json';
import fx_suy_toi_hit from '../data/fx/suy_toi_hit.json';
import fx_suy_toi_miss from '../data/fx/suy_toi_miss.json';
import fx_suy_toi_warn from '../data/fx/suy_toi_warn.json';
import fx_kc_am_end from '../data/fx/kc_am_end.json';
import fx_kc_am_pool from '../data/fx/kc_am_pool.json';
import fx_kc_dt_hit from '../data/fx/kc_dt_hit.json';
import fx_kc_dt_now from '../data/fx/kc_dt_now.json';
import fx_kc_dt_parry from '../data/fx/kc_dt_parry.json';
import fx_kc_dt_wind from '../data/fx/kc_dt_wind.json';
import fx_kc_gate_1 from '../data/fx/kc_gate_1.json';
import fx_kc_gate_2 from '../data/fx/kc_gate_2.json';
import fx_kc_gate_3 from '../data/fx/kc_gate_3.json';
import fx_kc_hd_bad from '../data/fx/kc_hd_bad.json';
import fx_kc_hd_path from '../data/fx/kc_hd_path.json';
import fx_kc_hd_ok from '../data/fx/kc_hd_ok.json';
import fx_kc_mark_1 from '../data/fx/kc_mark_1.json';
import fx_kc_mark_2 from '../data/fx/kc_mark_2.json';
import fx_kc_mark_3 from '../data/fx/kc_mark_3.json';
import fx_hk_chau from '../data/fx/hk_chau.json';
import fx_hk_chau_get from '../data/fx/hk_chau_get.json';
import fx_hk_chau_gone from '../data/fx/hk_chau_gone.json';
import fx_hk_enter from '../data/fx/hk_enter.json';
import fx_hk_huyet_kill from '../data/fx/hk_huyet_kill.json';
import fx_hk_huyet_spawn from '../data/fx/hk_huyet_spawn.json';
import fx_hk_loi_boom from '../data/fx/hk_loi_boom.json';
import fx_hk_loi_hot from '../data/fx/hk_loi_hot.json';
import fx_hk_loi_rod from '../data/fx/hk_loi_rod.json';
import fx_hk_loi_zap from '../data/fx/hk_loi_zap.json';
import fx_hk_luan_grind from '../data/fx/hk_luan_grind.json';
import fx_hk_luan_warn from '../data/fx/hk_luan_warn.json';
import fx_hk_luan_wheel from '../data/fx/hk_luan_wheel.json';
import fx_hk_ly_cut from '../data/fx/hk_ly_cut.json';
import fx_hk_ly_out from '../data/fx/hk_ly_out.json';
import fx_hk_ly_seal from '../data/fx/hk_ly_seal.json';
import fx_hk_phong_blow from '../data/fx/hk_phong_blow.json';
import fx_hk_phong_hit from '../data/fx/hk_phong_hit.json';
import fx_hk_phong_pillar from '../data/fx/hk_phong_pillar.json';
import fx_hk_phong_safe from '../data/fx/hk_phong_safe.json';
import fx_hk_phong_warn from '../data/fx/hk_phong_warn.json';
import fx_hk_tuc_bad from '../data/fx/hk_tuc_bad.json';
import fx_hk_tuc_beat from '../data/fx/hk_tuc_beat.json';
import fx_hk_tuc_good from '../data/fx/hk_tuc_good.json';
import fx_hk_tuyet_drift from '../data/fx/hk_tuyet_drift.json';
import fx_hk_van_bad from '../data/fx/hk_van_bad.json';
import fx_hk_van_ok from '../data/fx/hk_van_ok.json';
import fx_hk_van_spin from '../data/fx/hk_van_spin.json';
import fx_hk_van_true from '../data/fx/hk_van_true.json';
import fx_fx_soul_in from '../data/fx/fx_soul_in.json';
import fx_fx_soul_out from '../data/fx/fx_soul_out.json';
import fx_skl_anh_duoc_hoa_than from '../data/fx/skl_anh_duoc_hoa_than.json';
import fx_skl_anh_thiet_than from '../data/fx/skl_anh_thiet_than.json';
import fx_skl_dan_hoa_phong_tran from '../data/fx/skl_dan_hoa_phong_tran.json';
import fx_skl_dich_son_xung from '../data/fx/skl_dich_son_xung.json';
import fx_skl_duoc_vu from '../data/fx/skl_duoc_vu.json';
import fx_skl_hoanh_kiem_pha_mach from '../data/fx/skl_hoanh_kiem_pha_mach.json';
import fx_skl_hoi_nguyen_thuat from '../data/fx/skl_hoi_nguyen_thuat.json';
import fx_skl_hoi_thien_dan_lo from '../data/fx/skl_hoi_thien_dan_lo.json';
import fx_skl_hoi_xuan_quyet from '../data/fx/skl_hoi_xuan_quyet.json';
import fx_skl_ngu_kiem_tran from '../data/fx/skl_ngu_kiem_tran.json';
import fx_skl_tran_kiem from '../data/fx/skl_tran_kiem.json';
import fx_skl_tran_kiem_tram from '../data/fx/skl_tran_kiem_tram.json';
import fx_skl_tran_kiem_vu from '../data/fx/skl_tran_kiem_vu.json';
import fx_skl_kim_than from '../data/fx/skl_kim_than.json';
import fx_skl_kim_than_quyen from '../data/fx/skl_kim_than_quyen.json';
import fx_skl_chan_son_quyen from '../data/fx/skl_chan_son_quyen.json';
import fx_skl_kim_than_ho_the from '../data/fx/skl_kim_than_ho_the.json';
import fx_skl_te_phien from '../data/fx/skl_te_phien.json';
import fx_skl_hon_trao from '../data/fx/skl_hon_trao.json';
import fx_skl_am_phong from '../data/fx/skl_am_phong.json';
import fx_skl_hon_chuong from '../data/fx/skl_hon_chuong.json';
import fx_skl_dan_lo from '../data/fx/skl_dan_lo.json';
import fx_skl_dan_hoa_chi from '../data/fx/skl_dan_hoa_chi.json';
import fx_skl_lo_hoa_hoi_nguyen from '../data/fx/skl_lo_hoa_hoi_nguyen.json';
import fx_skl_dan_hoa_vu from '../data/fx/skl_dan_hoa_vu.json';
import fx_skl_kiem_anh_bo from '../data/fx/skl_kiem_anh_bo.json';
import fx_skl_kiem_dan_ban_menh from '../data/fx/skl_kiem_dan_ban_menh.json';
import fx_skl_u_anh_bo from '../data/fx/skl_u_anh_bo.json';
import fx_skl_phe_hon from '../data/fx/skl_phe_hon.json';
import fx_skl_suu_hon_thuat from '../data/fx/skl_suu_hon_thuat.json';
import fx_skl_am_hon_trieu from '../data/fx/skl_am_hon_trieu.json';
import fx_skl_dinh_than_thuat from '../data/fx/skl_dinh_than_thuat.json';
import fx_skl_hoang_tuyen_dan from '../data/fx/skl_hoang_tuyen_dan.json';
import fx_skl_tat_dau_thanh_binh from '../data/fx/skl_tat_dau_thanh_binh.json';
import fx_hon_binh_hit from '../data/fx/hon_binh_hit.json';
import fx_hon_reap from '../data/fx/hon_reap.json';
import fx_hon_binh_stand from '../data/fx/hon_binh_stand.json';
import fx_skl_kiem_vu_tam_diep from '../data/fx/skl_kiem_vu_tam_diep.json';
import fx_skl_kim_chung_tran from '../data/fx/skl_kim_chung_tran.json';
import fx_skl_bao_nhan from '../data/fx/skl_bao_nhan.json';
import fx_skl_tram_son_dao from '../data/fx/skl_tram_son_dao.json';
import fx_skl_hoanh_dao from '../data/fx/skl_hoanh_dao.json';
import fx_skl_thuan_dao_tram from '../data/fx/skl_thuan_dao_tram.json';
import fx_skl_huyet_chien_the from '../data/fx/skl_huyet_chien_the.json';
import fx_skl_doan_thien_dao from '../data/fx/skl_doan_thien_dao.json';
import fx_skl_phan_co_thuat from '../data/fx/skl_phan_co_thuat.json';
import fx_skl_kim_thien_co from '../data/fx/skl_kim_thien_co.json';
import fx_skl_van_co_phe_the from '../data/fx/skl_van_co_phe_the.json';
import fx_skl_dia_sat_tran from '../data/fx/skl_dia_sat_tran.json';
import fx_skl_thai_hu_ho_tran from '../data/fx/skl_thai_hu_ho_tran.json';
import fx_skl_lac_thu_dai_tran from '../data/fx/skl_lac_thu_dai_tran.json';
import fx_skl_tam_dao from '../data/fx/skl_tam_dao.json';
import fx_skl_doan_luu from '../data/fx/skl_doan_luu.json';
import fx_skl_liet_dia_tram from '../data/fx/skl_liet_dia_tram.json';
import fx_skl_tha_co from '../data/fx/skl_tha_co.json';
import fx_skl_phong_cam from '../data/fx/skl_phong_cam.json';
import fx_skl_mau_don_cam from '../data/fx/skl_mau_don_cam.json';
import fx_skl_pha_diet_cam from '../data/fx/skl_pha_diet_cam.json';
import fx_skl_tue_nguyet_cam from '../data/fx/skl_tue_nguyet_cam.json';
import fx_skl_sinh_tu_cam from '../data/fx/skl_sinh_tu_cam.json';
import fx_skl_phien_thien_an from '../data/fx/skl_phien_thien_an.json';
import fx_skl_co_trieu from '../data/fx/skl_co_trieu.json';
import fx_skl_hut_mau_co from '../data/fx/skl_hut_mau_co.json';
import fx_skl_co_bao from '../data/fx/skl_co_bao.json';
import fx_skl_thu_co from '../data/fx/skl_thu_co.json';
import fx_skl_hoa_co_vuong from '../data/fx/skl_hoa_co_vuong.json';
import fx_co_bay_hit from '../data/fx/co_bay_hit.json';
import fx_co_vuong_hit from '../data/fx/co_vuong_hit.json';
import fx_co_bay_stand from '../data/fx/co_bay_stand.json';
import fx_co_vuong_stand from '../data/fx/co_vuong_stand.json';
import fx_tran_sat_stand from '../data/fx/tran_sat_stand.json';
import fx_tran_khon_stand from '../data/fx/tran_khon_stand.json';
import fx_tran_ho_stand from '../data/fx/tran_ho_stand.json';
import fx_tran_sinhtu_stand from '../data/fx/tran_sinhtu_stand.json';
import fx_tran_sat_tick from '../data/fx/tran_sat_tick.json';
import fx_tran_khon_tick from '../data/fx/tran_khon_tick.json';
import fx_tran_ho_tick from '../data/fx/tran_ho_tick.json';
import fx_tran_sinhtu_tick from '../data/fx/tran_sinhtu_tick.json';
import fx_skl_thai_co_quyen from '../data/fx/skl_thai_co_quyen.json';
import fx_skl_tinh_bao from '../data/fx/skl_tinh_bao.json';
import fx_skl_huyet_cu_ho from '../data/fx/skl_huyet_cu_ho.json';
import fx_skl_co_than_nhat_kich from '../data/fx/skl_co_than_nhat_kich.json';
import fx_skl_hoa_hinh from '../data/fx/skl_hoa_hinh.json';
import fx_skl_loi_an_kich from '../data/fx/skl_loi_an_kich.json';
import fx_skl_cuu_tieu_thien_loi from '../data/fx/skl_cuu_tieu_thien_loi.json';
import fx_skl_phich_lich from '../data/fx/skl_phich_lich.json';
import fx_skl_loi_vong from '../data/fx/skl_loi_vong.json';
import fx_skl_thiem_loi_bo from '../data/fx/skl_thiem_loi_bo.json';
import fx_skl_pha_phong_tien from '../data/fx/skl_pha_phong_tien.json';
import fx_skl_cu_bo_xung from '../data/fx/skl_cu_bo_xung.json';
import fx_skl_loi_chich from '../data/fx/skl_loi_chich.json';
import fx_skl_loi_the from '../data/fx/skl_loi_the.json';
import fx_skl_loi_lien from '../data/fx/skl_loi_lien.json';
import fx_skl_loi_giap from '../data/fx/skl_loi_giap.json';
import fx_skl_loi_phat from '../data/fx/skl_loi_phat.json';
import fx_skl_loi_hai from '../data/fx/skl_loi_hai.json';
import fx_skl_kim_cuong_bat_hoai from '../data/fx/skl_kim_cuong_bat_hoai.json';
import fx_skl_linh_khi_ho_the from '../data/fx/skl_linh_khi_ho_the.json';
import fx_skl_loi_dinh_nhat_kiem from '../data/fx/skl_loi_dinh_nhat_kiem.json';
import fx_skl_luu_huong_bo from '../data/fx/skl_luu_huong_bo.json';
import fx_skl_moc_linh_tran from '../data/fx/skl_moc_linh_tran.json';
import fx_skl_nghich_kiem_chuyen_phong from '../data/fx/skl_nghich_kiem_chuyen_phong.json';
import fx_skl_ngung_dan_ho_the from '../data/fx/skl_ngung_dan_ho_the.json';
import fx_skl_phan_anh_kiem_anh from '../data/fx/skl_phan_anh_kiem_anh.json';
import fx_skl_phi_kiem_truy_hon from '../data/fx/skl_phi_kiem_truy_hon.json';
import fx_skl_son_nhac_hoa_than from '../data/fx/skl_son_nhac_hoa_than.json';
import fx_skl_thien_dan_phap_gioi from '../data/fx/skl_thien_dan_phap_gioi.json';
import fx_skl_thien_kiem_hoa_hinh from '../data/fx/skl_thien_kiem_hoa_hinh.json';
import fx_skl_thien_kiem_vu from '../data/fx/skl_thien_kiem_vu.json';
import fx_skl_thien_kim_phap_tuong from '../data/fx/skl_thien_kim_phap_tuong.json';
import fx_skl_thiet_bich_xung from '../data/fx/skl_thiet_bich_xung.json';
import fx_skl_thiet_quyen_chan_dia from '../data/fx/skl_thiet_quyen_chan_dia.json';
import fx_skl_thuan_di_cuu_vien from '../data/fx/skl_thuan_di_cuu_vien.json';
import fx_skl_thuan_di_ho_the from '../data/fx/skl_thuan_di_ho_the.json';
import fx_skl_thuan_di_tram from '../data/fx/skl_thuan_di_tram.json';
import fx_skl_tran_son_an from '../data/fx/skl_tran_son_an.json';
import fx_skl_van_kiem_quy_tong from '../data/fx/skl_van_kiem_quy_tong.json';

/** Dòng thời gian hiệu ứng theo chiêu (VFX-V0): `data/fx/<id chiêu>.json`. Chiêu không có thì dùng đường hiệu ứng cũ. */
export const FX_TIMELINES = [
  fxKiemKhiTramJson,
  fxPhiKiemJson,
  fx_fx_blink,
  fx_fx_dotpha_hn,
  fx_fx_dotpha_kd,
  fx_fx_dotpha_na,
  fx_fx_dotpha_tc,
  fx_fx_fly_on,
  fx_fx_kiep_hn,
  fx_fx_kiep_kd,
  fx_fx_kiep_na,
  fx_fx_kiep_tc,
  fx_fx_soul_in,
  fx_fx_soul_out,
  fx_skl_anh_duoc_hoa_than,
  fx_skl_anh_thiet_than,
  fx_skl_dan_hoa_phong_tran,
  fx_skl_dich_son_xung,
  fx_skl_duoc_vu,
  fx_skl_hoanh_kiem_pha_mach,
  fx_skl_hoi_nguyen_thuat,
  fx_skl_hoi_thien_dan_lo,
  fx_skl_hoi_xuan_quyet,
  fx_skl_kiem_anh_bo,
  fx_skl_te_phien,
  fx_skl_hon_trao,
  fx_skl_am_phong,
  fx_skl_hon_chuong,
  fx_skl_dan_lo,
  fx_skl_dan_hoa_chi,
  fx_skl_lo_hoa_hoi_nguyen,
  fx_skl_dan_hoa_vu,
  fx_skl_kim_than,
  fx_skl_kim_than_quyen,
  fx_skl_chan_son_quyen,
  fx_skl_kim_than_ho_the,
  fx_skl_ngu_kiem_tran,
  fx_skl_tran_kiem,
  fx_skl_tran_kiem_tram,
  fx_skl_tran_kiem_vu,
  fx_skl_kiem_dan_ban_menh,
  fx_skl_u_anh_bo,
  fx_skl_phe_hon,
  fx_skl_suu_hon_thuat,
  fx_skl_am_hon_trieu,
  fx_skl_dinh_than_thuat,
  fx_skl_hoang_tuyen_dan,
  fx_skl_tat_dau_thanh_binh,
  fx_skl_kiem_vu_tam_diep,
  fx_skl_kim_chung_tran,
  fx_skl_bao_nhan,
  fx_skl_tram_son_dao,
  fx_skl_hoanh_dao,
  fx_skl_thuan_dao_tram,
  fx_skl_huyet_chien_the,
  fx_skl_doan_thien_dao,
  fx_skl_phan_co_thuat,
  fx_skl_kim_thien_co,
  fx_skl_van_co_phe_the,
  fx_skl_dia_sat_tran,
  fx_skl_thai_hu_ho_tran,
  fx_skl_lac_thu_dai_tran,
  fx_skl_tam_dao,
  fx_skl_doan_luu,
  fx_skl_liet_dia_tram,
  fx_skl_tha_co,
  fx_skl_co_trieu,
  fx_skl_phong_cam,
  fx_skl_mau_don_cam,
  fx_skl_pha_diet_cam,
  fx_skl_tue_nguyet_cam,
  fx_skl_sinh_tu_cam,
  fx_skl_phien_thien_an,
  fx_skl_hut_mau_co,
  fx_skl_co_bao,
  fx_skl_thu_co,
  fx_skl_hoa_co_vuong,
  fx_skl_thai_co_quyen,
  fx_skl_tinh_bao,
  fx_skl_huyet_cu_ho,
  fx_skl_co_than_nhat_kich,
  fx_skl_hoa_hinh,
  fx_skl_loi_an_kich,
  fx_skl_cuu_tieu_thien_loi,
  fx_skl_phich_lich,
  fx_skl_loi_vong,
  fx_skl_loi_phat,
  fx_skl_loi_hai,
  fx_skl_kim_cuong_bat_hoai,
  fx_skl_linh_khi_ho_the,
  fx_skl_loi_dinh_nhat_kiem,
  fx_skl_luu_huong_bo,
  fx_skl_moc_linh_tran,
  fx_skl_nghich_kiem_chuyen_phong,
  fx_skl_ngung_dan_ho_the,
  fx_skl_phan_anh_kiem_anh,
  fx_skl_phi_kiem_truy_hon,
  fx_skl_son_nhac_hoa_than,
  fx_skl_thien_dan_phap_gioi,
  fx_skl_thien_kiem_hoa_hinh,
  fx_skl_thien_kiem_vu,
  fx_skl_thien_kim_phap_tuong,
  fx_skl_thiet_bich_xung,
  fx_skl_thiet_quyen_chan_dia,
  fx_skl_thuan_di_cuu_vien,
  fx_skl_thuan_di_ho_the,
  fx_skl_thuan_di_tram,
  fx_skl_tran_son_an,
  fx_skl_van_kiem_quy_tong,
  fx_skl_thiem_loi_bo,
  fx_skl_pha_phong_tien,
  fx_skl_cu_bo_xung,
  fx_skl_loi_chich,
  fx_skl_loi_the,
  fx_skl_loi_lien,
  fx_skl_loi_giap,
] as unknown as FxTimeline[];
export const FX_TIMELINE = new Map(FX_TIMELINES.map((f) => [f.skill, f]));
/** Dòng thời gian hiệu ứng của quái/tinh anh/boss (VFX-V5): `data/fx/mon_*.json`, khóa theo loại sự kiện (mon_hit, mon_strike, mon_boom_circle...). Màu theo ngũ hành lúc chạy. */
export const MON_FX_TIMELINES = [
  fx_mon_bolt_impact,
  fx_mon_bolt_muzzle,
  fx_mon_boom_circle,
  fx_mon_boom_cone,
  fx_mon_boom_line,
  fx_mon_cast,
  fx_mon_death,
  fx_mon_face,
  fx_mon_face_warn,
  fx_mon_hit,
  fx_mon_strike,
  fx_mon_warn_cone,
  fx_mon_warn_line,
  fx_mon_warn,
  fx_mon_cast__boss_han_giao,
  fx_mon_boom_circle__elite_ho_mach_khoi_tuong__leap,
  fx_mon_boom_circle__elite_liet_cot_bao__leap,
  fx_mon_boom_circle__elite_loi_van_su_vuong__caster,
  fx_mon_boom_circle__elite_loi_van_su_vuong__leap,
  fx_mon_boom_circle__elite_xich_sa_ngo_cong__burrow,
  fx_mon_boom_cone__elite_xich_sa_ngo_cong__caster,
  fx_mon_boom_cone__elite_xich_sa_ngo_cong__emerge,
  fx_mon_boom_line__elite_kinh_dien_ma_quan__line,
  fx_mon_warn__elite_ho_mach_khoi_tuong__leap,
  fx_mon_warn__elite_liet_cot_bao__leap,
  fx_mon_warn__elite_loi_van_su_vuong__caster,
  fx_mon_warn__elite_loi_van_su_vuong__leap,
  fx_mon_warn__elite_xich_sa_ngo_cong__burrow,
  fx_mon_warn_cone__elite_xich_sa_ngo_cong__caster,
  fx_mon_warn_cone__elite_xich_sa_ngo_cong__emerge,
  fx_mon_warn_line__elite_kinh_dien_ma_quan__line,
  fx_mon_boom_cone__elite_cu_nham_vien__caster,
  fx_mon_boom_cone__elite_huyet_nha_lang__caster,
  fx_mon_warn_cone__elite_cu_nham_vien__caster,
  fx_mon_warn_cone__elite_huyet_nha_lang__caster,
  fx_mon_boom_circle__boss_dia_mach_long__chant,
  fx_mon_boom_circle__boss_huyet_lang_vuong__slam,
  fx_mon_boom_circle__boss_kiem_khoi__slam,
  fx_mon_boom_circle__boss_thach_tam_khoi_vuong__leap,
  fx_mon_boom_circle__boss_kinh_nguyet_chan_quan__slam,
  fx_mon_boom_circle__boss_van_hai_kinh_vuong__chant,
  fx_mon_boom_circle__boss_van_hai_kinh_vuong__slam,
  fx_mon_boom_cone__boss_kinh_nguyet_chan_quan__sweep,
  fx_mon_boom_cone__boss_van_hai_kinh_vuong__sweep,
  fx_mon_boom_line__boss_kinh_nguyet_chan_quan__line,
  fx_mon_boom_line__boss_van_hai_kinh_vuong__line,
  fx_mon_cast__boss_van_hai_kinh_vuong,
  fx_mon_warn__boss_kinh_nguyet_chan_quan__slam,
  fx_mon_warn__boss_van_hai_kinh_vuong__chant,
  fx_mon_warn__boss_van_hai_kinh_vuong__slam,
  fx_mon_warn_cone__boss_kinh_nguyet_chan_quan__sweep,
  fx_mon_warn_cone__boss_van_hai_kinh_vuong__sweep,
  fx_mon_warn_line__boss_kinh_nguyet_chan_quan__line,
  fx_mon_warn_line__boss_van_hai_kinh_vuong__line,
  fx_mon_boom_circle__boss_thon_mach_ngo_cong_vuong__burrow,
  fx_mon_boom_cone__boss_thon_mach_ngo_cong_vuong__emerge,
  fx_mon_warn__boss_thon_mach_ngo_cong_vuong__burrow,
  fx_mon_warn_cone__boss_thon_mach_ngo_cong_vuong__emerge,
  fx_mon_boom_circle__boss_thon_mach_ngo_cong_vuong__chant,
  fx_mon_boom_circle__boss_thon_mach_ngo_cong_vuong__slam,
  fx_mon_boom_circle__boss_thu_mo_tuong__chant,
  fx_mon_boom_cone__boss_huyet_lang_vuong__sweep,
  fx_mon_boom_line__boss_dia_mach_long__line,
  fx_mon_boom_line__boss_kiem_khoi__sweep,
  fx_mon_boom_line__boss_thach_tam_khoi_vuong__line,
  fx_mon_boom_line__boss_thu_mo_tuong__sweep,
  fx_mon_cast__boss_dia_mach_long,
  fx_mon_cast__boss_thon_mach_ngo_cong_vuong,
  fx_mon_cast__boss_thu_mo_tuong,
  fx_mon_warn__boss_dia_mach_long__chant,
  fx_mon_warn__boss_huyet_lang_vuong__slam,
  fx_mon_warn__boss_kiem_khoi__slam,
  fx_mon_warn__boss_thach_tam_khoi_vuong__leap,
  fx_mon_warn__boss_thon_mach_ngo_cong_vuong__chant,
  fx_mon_warn__boss_thon_mach_ngo_cong_vuong__slam,
  fx_mon_warn__boss_thu_mo_tuong__chant,
  fx_mon_warn_cone__boss_huyet_lang_vuong__sweep,
  fx_mon_warn_line__boss_dia_mach_long__line,
  fx_mon_warn_line__boss_kiem_khoi__sweep,
  fx_mon_warn_line__boss_thach_tam_khoi_vuong__line,
  fx_mon_warn_line__boss_thu_mo_tuong__sweep,
  fx_mon_boom_circle__boss_tam_thu_nguc_khuyen__chant,
  fx_mon_boom_circle__boss_tam_thu_nguc_khuyen__slam,
  fx_mon_boom_circle__boss_thien_khuyet_thu_linh__chant,
  fx_mon_boom_circle__boss_thien_khuyet_thu_linh__slam,
  fx_mon_boom_circle__boss_thu_khich_duc_chu__slam,
  fx_mon_boom_cone__boss_tam_thu_nguc_khuyen__sweep,
  fx_mon_boom_cone__boss_thien_khuyet_thu_linh__sweep,
  fx_mon_boom_cone__boss_thu_khich_duc_chu__sweep,
  fx_mon_boom_cone__boss_vo_dien_than_quan__sweep,
  fx_mon_boom_line__boss_tam_thu_nguc_khuyen__line,
  fx_mon_boom_line__boss_thien_khuyet_thu_linh__line,
  fx_mon_boom_line__boss_thu_khich_duc_chu__line,
  fx_mon_cast__boss_tam_thu_nguc_khuyen,
  fx_mon_cast__boss_thien_khuyet_thu_linh,
  fx_mon_warn__boss_tam_thu_nguc_khuyen__chant,
  fx_mon_warn__boss_tam_thu_nguc_khuyen__slam,
  fx_mon_warn__boss_thien_khuyet_thu_linh__chant,
  fx_mon_warn__boss_thien_khuyet_thu_linh__slam,
  fx_mon_warn__boss_thu_khich_duc_chu__slam,
  fx_mon_warn_cone__boss_tam_thu_nguc_khuyen__sweep,
  fx_mon_warn_cone__boss_thien_khuyet_thu_linh__sweep,
  fx_mon_warn_cone__boss_thu_khich_duc_chu__sweep,
  fx_mon_warn_cone__boss_vo_dien_than_quan__sweep,
  fx_mon_warn_line__boss_tam_thu_nguc_khuyen__line,
  fx_mon_warn_line__boss_thien_khuyet_thu_linh__line,
  fx_mon_warn_line__boss_thu_khich_duc_chu__line,
  fx_mon_warn__boss_han_giao__slam,
  fx_mon_boom_circle__boss_han_giao__slam,
  fx_mon_warn__boss_han_giao__chant,
  fx_mon_boom_circle__boss_han_giao__chant,
  fx_mon_warn_cone__boss_han_giao__sweep,
  fx_mon_boom_cone__boss_han_giao__sweep,
] as unknown as FxTimeline[];
export const MON_FX = new Map(MON_FX_TIMELINES.map((f) => [f.skill, f]));
/**
 * Dòng thời gian hiệu ứng của Thiên Nhân Ngũ Suy (TN-4): `data/fx/suy_*.json`, sinh bằng `tools/vfx/gen-fx-suy.py`. Khóa theo sự kiện trên sân
 * (suy_nhan, suy_toi_hit, suy_den_lit...); client phát tại điểm server báo (`game/fx/suyFx.ts`).
 */
export const SUY_FX_TIMELINES = [
  fx_suy_den_dark,
  fx_suy_den_gust,
  fx_suy_den_light,
  fx_suy_den_lit,
  fx_suy_den_out,
  fx_suy_den_relit,
  fx_suy_enter_linh,
  fx_suy_enter_tam,
  fx_suy_enter_the,
  fx_suy_enter_tho,
  fx_suy_enter_thuc,
  fx_suy_fail,
  fx_suy_nhan,
  fx_suy_nhan_end,
  fx_suy_nhan_open,
  fx_suy_ok,
  fx_suy_tam_bad,
  fx_suy_tam_good,
  fx_suy_tam_miss,
  fx_suy_tam_open,
  fx_suy_thuc_boom,
  fx_suy_thuc_brew,
  fx_suy_thuc_pulse,
  fx_suy_thuc_void,
  fx_suy_toi_hit,
  fx_suy_toi_miss,
  fx_suy_toi_warn,
] as unknown as FxTimeline[];
export const SUY_FX = new Map(SUY_FX_TIMELINES.map((f) => [f.skill, f]));
/**
 * Dòng thời gian hiệu ứng của Huyền Kiếp (TN-6): `data/fx/hk_*.json`, sinh bằng `tools/vfx/gen-fx-hk.py`; client phát tại điểm server báo qua `hkmark`.
 */
export const HK_FX_TIMELINES = [
  fx_hk_chau,
  fx_hk_chau_get,
  fx_hk_chau_gone,
  fx_hk_enter,
  fx_hk_huyet_kill,
  fx_hk_huyet_spawn,
  fx_hk_loi_boom,
  fx_hk_loi_hot,
  fx_hk_loi_rod,
  fx_hk_loi_zap,
  fx_hk_luan_grind,
  fx_hk_luan_warn,
  fx_hk_luan_wheel,
  fx_hk_ly_cut,
  fx_hk_ly_out,
  fx_hk_ly_seal,
  fx_hk_phong_blow,
  fx_hk_phong_hit,
  fx_hk_phong_pillar,
  fx_hk_phong_safe,
  fx_hk_phong_warn,
  fx_hk_tuc_bad,
  fx_hk_tuc_beat,
  fx_hk_tuc_good,
  fx_hk_tuyet_drift,
  fx_hk_van_bad,
  fx_hk_van_ok,
  fx_hk_van_spin,
  fx_hk_van_true,
] as unknown as FxTimeline[];
export const HK_FX = new Map(HK_FX_TIMELINES.map((f) => [f.skill, f]));

/**
 * Dòng thời gian hiệu ứng ba cơ chế kiếp chương 6 (TN-3): `data/fx/kc_*.json`, sinh bằng `tools/vfx/gen-fx-ch6.py`; client phát tại điểm server báo qua `kcmark`.
 */
export const KC_FX_TIMELINES = [
  fx_kc_am_end,
  fx_kc_am_pool,
  fx_kc_dt_hit,
  fx_kc_dt_now,
  fx_kc_dt_parry,
  fx_kc_dt_wind,
  fx_kc_gate_1,
  fx_kc_gate_2,
  fx_kc_gate_3,
  fx_kc_hd_bad,
  fx_kc_hd_path,
  fx_kc_hd_ok,
  fx_kc_mark_1,
  fx_kc_mark_2,
  fx_kc_mark_3,
] as unknown as FxTimeline[];
export const KC_FX = new Map(KC_FX_TIMELINES.map((f) => [f.skill, f]));
/** Timeline của từng cơ chế kiếp chương 6: ngân sách draw call kiểm theo nhóm này. */
export const KC_FX_STAGE: Record<string, string[]> = {
  hoi_dao: ['kc_gate_1', 'kc_gate_2', 'kc_gate_3', 'kc_mark_1', 'kc_mark_2', 'kc_mark_3', 'kc_hd_path', 'kc_hd_ok', 'kc_hd_bad'],
  am_lan: ['kc_am_pool', 'kc_am_end'],
  duong_dap: ['kc_dt_wind', 'kc_dt_now', 'kc_dt_parry', 'kc_dt_hit'],
};

/** TN-2: hiệu ứng tại điểm của Hồn tu (nhịp hồn binh, tia hồn thu về), client phát bằng `FxRunner.startAt` (`game/fx/honFx.ts`). */
export const HON_FX_TIMELINES = [fx_hon_binh_hit, fx_hon_reap, fx_hon_binh_stand] as unknown as FxTimeline[];
export const HON_FX = new Map(HON_FX_TIMELINES.map((f) => [f.skill, f]));
// Cổ tu (PR VFX): hiệu ứng tại điểm (nhịp bầy cổ/Cổ Vương cắn, bầy cổ và Cổ Vương đứng quanh người gọi), client phát bằng `FxRunner.startAt` (`game/fx/coFx.ts`).
export const CO_FX_TIMELINES = [fx_co_bay_hit, fx_co_vuong_hit, fx_co_bay_stand, fx_co_vuong_stand] as unknown as FxTimeline[];
export const CO_FX = new Map(CO_FX_TIMELINES.map((f) => [f.skill, f]));
/** TN-8: hình trận đứng và nhịp trận của Cấm chế sư (hiệu ứng tại điểm, `tools/vfx/recipes_tran.py`). */
export const TRAN_FX_TIMELINES = [
  fx_tran_sat_stand,
  fx_tran_khon_stand,
  fx_tran_ho_stand,
  fx_tran_sinhtu_stand,
  fx_tran_sat_tick,
  fx_tran_khon_tick,
  fx_tran_ho_tick,
  fx_tran_sinhtu_tick,
] as unknown as FxTimeline[];
export const TRAN_FX = new Map(TRAN_FX_TIMELINES.map((f) => [f.skill, f]));
/** Timeline của từng kiếp nhỏ (theo cơ chế `hk_*`), gồm cả phần chung vào/qua/trượt: ngân sách draw call kiểm theo nhóm này. */
export const HK_FX_STAGE: Record<string, string[]> = {
  hk_tuyet: ['hk_enter', 'hk_tuyet_drift', 'suy_ok', 'suy_fail'],
  hk_phong: ['hk_enter', 'hk_phong_pillar', 'hk_phong_warn', 'hk_phong_blow', 'hk_phong_safe', 'hk_phong_hit', 'suy_ok', 'suy_fail'],
  hk_loi: ['hk_enter', 'hk_loi_rod', 'hk_loi_hot', 'hk_loi_zap', 'hk_loi_boom', 'suy_ok', 'suy_fail'],
  hk_tram_ly: ['hk_enter', 'hk_ly_seal', 'hk_ly_out', 'hk_ly_cut', 'suy_ok', 'suy_fail'],
  hk_huyet_anh: ['hk_enter', 'hk_huyet_spawn', 'hk_huyet_kill', 'suy_ok', 'suy_fail'],
  hk_van_tam: ['hk_enter', 'hk_van_true', 'hk_van_spin', 'hk_van_ok', 'hk_van_bad', 'suy_ok', 'suy_fail'],
  hk_kho_than: ['hk_enter', 'hk_tuc_beat', 'hk_tuc_good', 'hk_tuc_bad', 'suy_ok', 'suy_fail'],
  hk_hon_tho: ['hk_enter', 'hk_chau', 'hk_chau_get', 'hk_chau_gone', 'suy_ok', 'suy_fail'],
  hk_luan_hoi: ['hk_enter', 'hk_luan_wheel', 'hk_luan_warn', 'hk_luan_grind', 'suy_ok', 'suy_fail'],
};
/** Timeline của từng ải (theo cơ chế `suy_*`), tính cả phần chung vào/qua/trượt ải: ngân sách draw call kiểm theo nhóm này. */
export const SUY_FX_STAGE: Record<string, string[]> = {
  suy_linh: ['suy_enter_linh', 'suy_nhan_open', 'suy_nhan', 'suy_nhan_end', 'suy_ok', 'suy_fail'],
  suy_the: ['suy_enter_the', 'suy_toi_warn', 'suy_toi_hit', 'suy_toi_miss', 'suy_ok', 'suy_fail'],
  suy_thuc: ['suy_enter_thuc', 'suy_thuc_brew', 'suy_thuc_pulse', 'suy_thuc_void', 'suy_thuc_boom', 'suy_ok', 'suy_fail'],
  suy_tho: [
    'suy_enter_tho',
    'suy_den_lit',
    'suy_den_dark',
    'suy_den_gust',
    'suy_den_out',
    'suy_den_light',
    'suy_den_relit',
    'suy_ok',
    'suy_fail',
  ],
  suy_tam: ['suy_enter_tam', 'suy_tam_open', 'suy_tam_good', 'suy_tam_bad', 'suy_tam_miss', 'suy_ok', 'suy_fail'],
};
