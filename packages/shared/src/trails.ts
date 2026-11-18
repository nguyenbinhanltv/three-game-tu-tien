// Đường mòn vẽ trên bản đồ (minimap/bản đồ lớn): chỉ để hiển thị.

/** Đường mòn Vân Lam: các điểm nối tông môn với từng vùng và cổng (chỉ để vẽ nền minimap, không ảnh hưởng di chuyển; dùng chung với bản đồ thủy mặc runtime). */
export const TRAILS: [number, number][][] = [
  [
    [2048, 2088],
    [2048, 2250],
    [2048, 2400],
    [2048, 2540],
  ],
  [
    [2048, 2250],
    [2200, 2330],
    [2390, 2440],
  ],
  [
    [2048, 2088],
    [2250, 2080],
    [2450, 2110],
  ],
  [
    [2450, 2110],
    [2470, 1930],
    [2450, 1740],
  ],
  [
    [2048, 2088],
    [2060, 1900],
    [2048, 1708],
  ],
  [
    [2048, 2088],
    [1860, 2150],
    [1700, 2215],
  ],
];

/** Đường mòn tự động cho level không có `TRAILS` riêng: nối tâm các vùng liên tiếp theo cấp (đường đi tu luyện). */
export function autoTrails(zones: { lvMin: number; poly: [number, number][] }[], hub?: [number, number]): [number, number][][] {
  // Có trạm trung tâm ngoài mọi vùng (Đoạn Mạch Cổ Cốc): đường mòn tỏa từ trạm tới tâm từng vùng.
  if (hub)
    return zones.map((z): [number, number][] => [
      hub,
      [z.poly.reduce((a, p) => a + p[0], 0) / z.poly.length, z.poly.reduce((a, p) => a + p[1], 0) / z.poly.length],
    ]);
  const centers = [...zones]
    .sort((a, b) => a.lvMin - b.lvMin)
    .map((z): [number, number] => [
      z.poly.reduce((a, p) => a + p[0], 0) / z.poly.length,
      z.poly.reduce((a, p) => a + p[1], 0) / z.poly.length,
    ]);
  return centers.slice(1).map((c, i): [number, number][] => [centers[i]!, c]);
}

/** Đường mòn của level: Vân Lam theo bảng tay, level khác nối tâm các vùng (hoặc tỏa từ trạm trung tâm nếu nằm ngoài mọi vùng). */
export function trailsOf(
  levelId: string,
  zones: { lvMin: number; poly: [number, number][] }[],
  play?: { cx: number; cz: number },
): [number, number][][] {
  if (levelId === 'van_lam') return TRAILS;
  const inside = (poly: [number, number][], x: number, z: number): boolean => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i]!;
      const [xj, zj] = poly[j]!;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const hub: [number, number] | undefined = play && !zones.some((z) => inside(z.poly, play.cx, play.cz)) ? [play.cx, play.cz] : undefined;
  return autoTrails(zones, hub);
}
