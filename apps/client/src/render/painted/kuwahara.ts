import { float, luminance, mix, screenSize, screenUV, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import type { Node } from './meadow';

/**
 * Họa Cảnh P5 rút gọn: lớp hoàn thiện Kuwahara bốn phần tư, làm tròn ảnh thành nét cọ phẳng: ở mỗi điểm, chia vùng lân cận bán kính `radius`
 * thành bốn góc chồng nhau; góc nào "lặng" nhất (phương sai nhỏ nhất) cho màu, nhưng không bao giờ chọn cứng (chọn cứng thì nhấp nháy).
 * Cạnh giữ nguyên, vùng giữa hai cạnh thành phẳng. Dựa trên `painted()` của painted-valley (src/lib/frame.js; MIT, © 2026 Patch, xem
 * assets/LICENSES.md), viết lại bằng TSL.
 *
 * Khác nguồn: nguồn bỏ qua phần đã "vẽ rồi" theo alpha < 0,6 của đích HDR và giảm bán kính theo độ sâu. Ở đây (chưa có mặt nạ alpha riêng,
 * sẽ làm ở bước nhân vật cel): bỏ qua trời (độ sâu ≈ 1) và điểm sáng HDR (hiệu ứng chiêu/bloom, độ sáng > ~1,3) để VFX không bị nhòe.
 */
/** Mức trộn Kuwahara với ảnh gốc (0 = gốc, 1 = Kuwahara thuần): giữ lại nét lá, chỉ làm tròn vừa phải. */
export const paintedFinishParams = { strength: uniform(0.55) };

export interface FinishIn {
  /** Node màu cảnh HDR (TextureNode của pass cảnh), lấy mẫu bằng `.sample(uv)`. */
  color: Node;
  /** Node độ sâu của pass cảnh. */
  depth: Node;
  /** Hệ số phơi sáng đã nhân vào `base`, nhân cho mọi mẫu lân cận để đồng nhất. */
  exposure: Node;
  /** Màu đã có (HDR sau quang sai/phơi sáng) tại điểm này: giữ nguyên ở trời và hiệu ứng sáng. */
  base: Node;
  /** 1..3 (số điểm ảnh lân cận mỗi phía). */
  radius: number;
}

export function paintedFinish({ color, depth, exposure, base, radius }: FinishIn): Node {
  const texel = vec2(1).div(screenSize);
  const m: Node[] = [vec3(0), vec3(0), vec3(0), vec3(0)];
  const s: Node[] = [vec3(0), vec3(0), vec3(0), vec3(0)];
  for (let j = -radius; j <= radius; j++) {
    for (let i = -radius; i <= radius; i++) {
      const raw: Node = color.sample(screenUV.add(texel.mul(vec2(i, j)))).rgb.mul(exposure);
      const c: Node = raw.div(raw.add(1));
      const cc: Node = c.mul(c);
      if (i <= 0 && j <= 0) {
        m[0] = m[0]!.add(c);
        s[0] = s[0]!.add(cc);
      }
      if (i >= 0 && j <= 0) {
        m[1] = m[1]!.add(c);
        s[1] = s[1]!.add(cc);
      }
      if (i <= 0 && j >= 0) {
        m[2] = m[2]!.add(c);
        s[2] = s[2]!.add(cc);
      }
      if (i >= 0 && j >= 0) {
        m[3] = m[3]!.add(c);
        s[3] = s[3]!.add(cc);
      }
    }
  }
  const n = (radius + 1) * (radius + 1);
  let sum: Node = vec3(0);
  let total: Node = float(0);
  for (let k = 0; k < 4; k++) {
    const mean: Node = m[k]!.div(n);
    const v: Node = s[k]!.div(n).sub(mean.mul(mean)).abs();
    const vs: Node = v.x.add(v.y).add(v.z);
    const w: Node = float(1).div(vs.mul(vs).mul(vs).mul(vs).mul(1e12).add(1e-7));
    sum = sum.add(mean.mul(w));
    total = total.add(w);
  }
  const o: Node = sum.div(total);
  const painted: Node = o.div(float(1).sub(o.min(0.985)));
  const sky: Node = smoothstep(0.9995, 0.99995, depth.sample(screenUV).r);
  const glow: Node = smoothstep(1.3, 2.2, luminance(base));
  return mix(mix(base, painted, paintedFinishParams.strength), base, sky.max(glow));
}
