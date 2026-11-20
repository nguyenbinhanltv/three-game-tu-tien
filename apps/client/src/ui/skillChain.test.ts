import { describe, expect, it } from 'vitest';
import { METHOD_SKILLS, SKILL, SKILLS } from '@dtl/content';
import { chainBonusText, chainLines, skillMpNow } from './skillChain';

describe('tooltip chuỗi chiêu (VS-2b)', () => {
  it('chiêu không có chuỗi: không có dòng nào, linh lực giữ nguyên', () => {
    const basic = SKILL.get('skl_phi_kiem')!;
    expect(chainLines(basic, false)).toEqual([]);
    expect(skillMpNow(basic, true)).toBe(basic.mp);
  });
  it('nêu chiêu mở, cửa sổ và thưởng; số thập phân kiểu Việt', () => {
    const sk = SKILL.get('skl_hoanh_kiem_pha_mach')!;
    expect(chainBonusText(sk)).toBe('hiệu quả ×1,25, linh lực −30%');
    const [line] = chainLines(sk, false);
    expect(line!.text).toContain('Phi Kiếm Truy Hồn');
    expect(line!.text).toContain('4 giây');
    expect(line!.tone).toBeUndefined();
  });
  it('nhiều chiêu mở nối bằng "hoặc"; đang mở thì thêm dòng báo và tô màu', () => {
    const sk = SKILL.get('skl_thuan_di_tram')!;
    const lines = chainLines(sk, true);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.tone).toBe('good');
    expect(lines[1]!.text).toContain('Hoành Kiếm Phá Mạch hoặc Kiếm Vũ Tam Điệp');
    expect(lines[1]!.text).toContain('hồi chiêu −25%');
  });
  it('linh lực hiển thị theo thưởng chuỗi khi cửa sổ mở', () => {
    const heal = SKILL.get('skl_hoi_nguyen_thuat')!;
    expect(skillMpNow(heal, false)).toBe(heal.mp);
    expect(skillMpNow(heal, true)).toBe(Math.ceil(heal.mp * 0.5));
  });
  it('mọi chiêu có chuỗi đều ra được dòng tooltip không rỗng', () => {
    const chained = [...SKILLS, ...METHOD_SKILLS].filter((s) => s.chain);
    expect(chained.length).toBeGreaterThanOrEqual(10);
    for (const s of chained) {
      expect(chainBonusText(s), s.id).not.toBe('');
      expect(chainLines(s, false)[0]!.text, s.id).not.toMatch(/\{|skill\./);
    }
  });
});
