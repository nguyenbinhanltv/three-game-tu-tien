import { describe, expect, it } from 'vitest';
import { MONSTER } from './index';

// TN-7: Lộ Linh (cầu 9) và dáng thủ tục của ba boss Cửu Kiều.
describe('boss Cửu Kiều: Lộ Linh và dáng thủ tục', () => {
  it('Lộ Linh: pha 1 gọi Lộ Ảnh, pha 2 lật mặt Âm/Dương, pha 3 dồn vùng nổ; kháng nguồn ba hình thái', () => {
    const b = MONSTER.get('boss_lo_linh')!;
    expect(b.boss).toBe(true);
    expect(b.ai!.summon!.mon).toBe('mon_lo_anh');
    expect(MONSTER.has('mon_lo_anh')).toBe(true);
    expect(b.phases).toHaveLength(2);
    expect(b.phases![0]!.ai!.faces).toBeTruthy();
    expect(b.phases![1]!.ai!.faces).toBeNull();
    expect(b.ai!.resist!.forms).toHaveLength(3);
  });
  it('mỗi boss cầu có look riêng', () => {
    expect(MONSTER.get('boss_thach_tuong')!.look).toBe('golem');
    expect(MONSTER.get('boss_dao_linh')!.look).toBe('wisp');
    expect(MONSTER.get('boss_lo_linh')!.look).toBe('road');
  });
});
