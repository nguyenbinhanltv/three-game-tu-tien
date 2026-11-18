// Prop bày của Phục Mạch Quật (E2-C): lòng chảo Kiếm Trủng dựng thành hầm mỏ cũ của Tàng Mạch Hội.
// Dùng prop sẵn có (PROP_LIB bản đồ 2 + đèn đá Vân Lam), không va chạm (chỉ tô cảnh); tất định, tính từ vòng tròn quanh tâm hầm.
import type { HandProp } from './props.types';

const CX = 1520;
const CZ = 1300;
const PI = Math.PI;
const at = (r: number, a: number) => ({
  x: Math.round((CX + Math.cos(a) * r) * 100) / 100,
  z: Math.round((CZ + Math.sin(a) * r) * 100) / 100,
});

export const PHUC_MACH_PROPS: readonly HandProp[] = (() => {
  const out: HandProp[] = [];
  // Vòng trụ đá quanh hầm (cách tâm 70–74 m), chừa cửa hầm phía nam (hướng +z, nơi vào/ra).
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2))) < 0.3) continue;
    const p = at(70 + (i % 3) * 2, a);
    out.push({
      id: i % 4 === 3 ? 'prop_mach_tinh_tru' : 'prop_tru_nham_do',
      ...p,
      yaw: (i * 2.399) % (PI * 2),
      s: 0.9 + ((i * 7) % 5) * 0.05,
    });
  }
  // Mạch tinh trong hầm (ánh lam lục, nguồn sáng chính) và gốc cây khô làm cột chống.
  for (const [r, a, id] of [
    [30, 0.5, 'prop_mach_tinh_tru'],
    [38, 2.2, 'prop_mach_tinh_tru'],
    [34, 4.0, 'prop_mach_tinh_tru'],
    [52, 5.2, 'prop_mach_tinh_tru'],
    [24, 3.3, 'prop_cay_goc_kho'],
    [46, 1.2, 'prop_cay_goc_kho'],
    [44, 4.7, 'prop_cay_goc_kho'],
  ] as const) {
    out.push({ id, ...at(r, a), yaw: a * 3, s: 1 });
  }
  // Đèn đá dọc lối vào và quanh khu đánh boss: sáng vàng ấm trên nền tối.
  for (const z of [1332, 1344, 1356, 1368]) {
    out.push({ id: 'prop_den_da', x: 1511, z, yaw: 0, s: 1 }, { id: 'prop_den_da', x: 1529, z, yaw: 0, s: 1 });
  }
  for (const a of [0.9, 2.0, 3.1, 4.3, 5.5]) out.push({ id: 'prop_den_da', ...at(54, a), yaw: 0, s: 1.1 });
  // Đá nằm và phiến đá vụn rải sàn.
  for (let i = 0; i < 14; i++) {
    const a = i * 2.17;
    out.push({ id: i % 2 ? 'prop_da_nam' : 'prop_da_phien', ...at(20 + ((i * 11) % 40), a), yaw: a * 2, s: 0.9 + (i % 4) * 0.08 });
  }
  return out;
})();
