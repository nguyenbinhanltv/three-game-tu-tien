import { describe, expect, it } from 'vitest';
import { fxDrawCount, fxEventsFor, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import { FX_TIMELINE, METHOD_SKILLS, SKILL } from '@dtl/content';
import { paletteOf } from '../../render/vfx/palette';

const METHOD = 'cam_che_kinh';
const OWN = ['skl_phong_cam', 'skl_mau_don_cam', 'skl_pha_diet_cam', 'skl_tue_nguyet_cam', 'skl_sinh_tu_cam', 'skl_phien_thien_an'];
const evs = (id: string) => fxEventsFor(FX_TIMELINE.get(id)!, -1);

describe('VFX Cấm chế sư: timeline chiêu', () => {
  it('mỗi chiêu có timeline riêng, thay đúng loại FX của chiêu, hợp lệ, trong ngân sách (hitstop <= 80 ms)', () => {
    for (const id of OWN) {
      const tl = FX_TIMELINE.get(id)!;
      const sk = METHOD_SKILLS.find((s) => s.id === id)!;
      expect(tl, id).toBeDefined();
      expect(tl.replaces, id).toEqual([sk.fx]);
      expect(
        validateFxTimeline(tl, (x) => SKILL.has(x)),
        id,
      ).toEqual([]);
      expect(fxDrawCount(evs(id)), id).toBeLessThanOrEqual(12);
      expect(fxParticleCount(evs(id)), id).toBeLessThanOrEqual(1500);
      for (const e of evs(id)) if (e.type === 'hitstop') expect(e.ms, id).toBeLessThanOrEqual(80);
    }
  });

  it('không có timeline cho chiêu tư thế / lướt / đòn thường (mượn hình chiêu nền)', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD && !OWN.includes(x.id)))
      expect(FX_TIMELINE.has(s.id), s.id).toBe(false);
  });

  it('bảng màu theo kiểu: sát đỏ tía, khốn lam, sinh tử tím, Phiên Thiên Ấn theo công pháp; bảng đều có thật', () => {
    const pal = (id: string) => FX_TIMELINE.get(id)!.palette;
    expect(pal('skl_phong_cam')).toBe('tran_sat');
    expect(pal('skl_mau_don_cam')).toBe('tran_sat');
    expect(pal('skl_pha_diet_cam')).toBe('tran_sat');
    expect(pal('skl_tue_nguyet_cam')).toBe('tran_khon');
    expect(pal('skl_sinh_tu_cam')).toBe('tran_sinhtu');
    expect(pal('skl_phien_thien_an')).toBe(METHOD);
    for (const id of OWN) expect(paletteOf(pal(id)), id).not.toBe(paletteOf(undefined));
  });

  it('vết nứt nối tới đích: chiêu đơn/vùng có vệt chạy từ người tới target/area; hình cao đều camFade; ấn rơi cao <= 6 m', () => {
    for (const id of ['skl_phong_cam', 'skl_pha_diet_cam', 'skl_tue_nguyet_cam', 'skl_phien_thien_an']) {
      const link = evs(id).find(
        (x) => x.type === 'mesh' && x.shape === 'spark_streak' && x.at === 'self' && (x.move?.to === 'target' || x.move?.to === 'area'),
      );
      expect(link, id).toBeDefined();
    }
    for (const id of OWN)
      for (const x of evs(id)) {
        if (x.type !== 'mesh') continue;
        const y = x.offset?.[1] ?? 0;
        if (y > 2) {
          expect(x.camFade, `${id}:${x.shape}`).toBe(true);
          expect(y, `${id}:${x.shape}`).toBeLessThanOrEqual(6.1);
        }
      }
  });

  it('chỉ Mẫu Đơn Thập Bát Cấm (tối thượng) dùng slowmo và kéo máy', () => {
    for (const id of OWN) {
      const e = evs(id);
      expect(
        e.some((x) => x.type === 'slowmo'),
        id,
      ).toBe(id === 'skl_mau_don_cam');
      expect(
        e.some((x) => x.type === 'camera' && (x.pull ?? 0) > 0),
        id,
      ).toBe(id === 'skl_mau_don_cam');
    }
  });
});
