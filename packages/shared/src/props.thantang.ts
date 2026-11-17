// Prop bày của Thần Tàng Điện (E4-C): lòng chảo dựng thành điện tàng cổ, cột đá khắc vân thành vòng, tượng võ sĩ canh ba hốc phong ấn.
// Dùng prop sẵn có của Thiên Khuyết, chỉ tô cảnh (không va chạm), tất định. Ba hốc cùng góc với `seals.doors` ở levels/than_tang.json (200°, 270°, 340°).
import type { HandProp } from './props';

const CX = 1520;
const CZ = 1300;
const PI = Math.PI;
const at = (r: number, a: number) => ({ x: Math.round((CX + Math.cos(a) * r) * 100) / 100, z: Math.round((CZ + Math.sin(a) * r) * 100) / 100 });
const DOOR_DEG = [200, 270, 340];

export const THAN_TANG_PROPS: readonly HandProp[] = (() => {
  const out: HandProp[] = [];
  // Vòng cột đá khắc vân cách tâm 76 m, chừa cửa phía nam (lối vào) và ba hốc phong ấn.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * PI * 2;
    const deg = (a * 180) / PI;
    if (Math.abs(((deg - 90 + 540) % 360) - 180) < 13) continue;
    if (DOOR_DEG.some((d) => Math.abs(((deg - d + 540) % 360) - 180) < 9)) continue;
    out.push({ id: 'prop_tru_da_khac_van', ...at(76 + (i % 2) * 4, a), yaw: a, s: 1 + ((i * 5) % 4) * 0.08 });
  }
  // Mỗi hốc phong ấn: hai tượng võ sĩ canh hai bên cửa, bia đá ở trận môn bên trong.
  for (const d of DOOR_DEG) {
    const a = (d * PI) / 180;
    for (const s of [-1, 1]) out.push({ id: 'prop_tuong_da_vo_si', ...at(52, a + s * 0.12), yaw: a + PI, s: 1 });
    out.push({ id: 'prop_bia_da', ...at(66, a), yaw: a + PI, s: 1.1 });
    out.push({ id: 'prop_den_long_troi', ...at(60, a + 0.07), yaw: 0, s: 1 });
    out.push({ id: 'prop_den_long_troi', ...at(60, a - 0.07), yaw: 0, s: 1 });
  }
  // Kiếm gãy cắm quanh sàn, gợi cảnh chiến trường cũ.
  for (let i = 0; i < 7; i++) out.push({ id: 'prop_kiem_gay', ...at(26 + (i % 3) * 9, i * 0.9 + 0.4), yaw: i * 1.7, s: 1 });
  return out;
})();
