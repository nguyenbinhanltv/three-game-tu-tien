// Tên chiêu trên dải vệt mực: sự kiện `windup` mang id chiêu tra theo fx/pose, nên chiêu tư thế mượn hình của chiêu nền
// (Kim Thân, Hóa Hình cùng mượn `sonnhac`) bị gọi nhầm tên chiêu nền ("Sơn Nhạc Hóa Thân"). Hàm thuần: nếu chiêu nền thuộc công pháp
// khác mình đang tu, và công pháp của mình có chiêu tư thế mượn đúng fx đó thì hiện tên chiêu tư thế.
import { METHOD_SKILLS, SKILL } from '@dtl/content';

export function bannerSkill(id: string, myMethod: string | undefined): string {
  const def = SKILL.get(id);
  if (!def || !myMethod || def.method === myMethod || def.kind === 'stance') return id;
  const mine = METHOD_SKILLS.find((s) => s.method === myMethod && s.kind === 'stance' && s.fx === def.fx);
  return mine?.id ?? id;
}
