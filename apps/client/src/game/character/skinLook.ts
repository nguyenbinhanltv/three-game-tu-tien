// Chỉnh vật liệu skin toàn thân v3 tối màu (Dạ Lang Chiến Tướng, Phù Văn Phủ Tướng): texture nướng rất tối nên ở 720p thành khối đen mất chi tiết giáp.
// Giữ chất dark fantasy nhưng đọc được hình: nâng albedo (gain), kéo kim loại/độ nhám về mức có phản xạ, nâng sáng nền (lift, như quái tối),
// viền sáng fresnel ở mép nhìn nghiêng và điểm tự phát sáng (mắt sói đỏ, rune lam) lấy từ chính texel bão hòa của texture màu.
// Dùng cùng kiểu với `MonsterSkin` (`monsterSkins.ts`): emissiveNode = viền + nền + phát sáng.
import * as THREE from 'three/webgpu';
import { color, dot, float, materialColor, max, min, normalView, positionViewDirection, pow, saturate, smoothstep, vec3, vec4 } from 'three/tsl';

export interface SkinLook {
  /** Nhân albedo (tuyến tính). */
  gain: number;
  /** Ép hệ số kim loại (nhân với metalnessMap nếu có). */
  metalness: number;
  /** Cộng vào độ nhám, kẹp 0–1. */
  roughness: number;
  /** Nâng sáng nền: cộng `màu texture × lift` vào emissive. */
  lift: number;
  /** Viền sáng fresnel: màu (sRGB) và cường độ. */
  rim: { color: string; k: number };
  /** Điểm phát sáng theo texel bão hòa của hướng màu `hue`. */
  glow: { color: string; hue: 'red' | 'blue'; k: number };
}

export const SKIN_LOOKS: Readonly<Record<string, SkinLook>> = {
  chr_v3_shadow_wolf_nam: {
    gain: 1.6,
    metalness: 0.25,
    roughness: -0.05,
    lift: 0.16,
    rim: { color: '#a59cb8', k: 0.3 },
    glow: { color: '#ff3a2a', hue: 'red', k: 2.4 },
  },
  chr_v3_korvaden_nam: {
    gain: 1.6,
    metalness: 0.3,
    roughness: -0.05,
    lift: 0.16,
    rim: { color: '#9fb2c6', k: 0.2 },
    glow: { color: '#4fd0ff', hue: 'blue', k: 1.3 },
  },
};

/** Gắn look vào material gốc của asset skin (một lần cho mỗi material). */
export function applySkinLook(m: THREE.MeshStandardNodeMaterial, look: SkinLook): THREE.MeshStandardNodeMaterial {
  const c = materialColor.rgb;
  const mx = max(max(c.x, c.y), c.z);
  const mn = min(min(c.x, c.y), c.z);
  const sat = mx.sub(mn).div(mx.add(1e-3));
  // Texel phát sáng: bão hòa cao, đủ sáng, và kênh chủ đạo trội hẳn hai kênh còn lại (mắt đỏ / rune lam).
  const dom = look.glow.hue === 'red' ? c.x.sub(max(c.y, c.z)) : c.z.sub(max(c.x, c.y));
  const hot = smoothstep(float(0.62), float(0.85), sat).mul(smoothstep(float(0.08), float(0.2), dom)).mul(smoothstep(float(0.02), float(0.08), mx));
  const glow = new THREE.Color(look.glow.color);
  const facing = saturate(dot(normalView, positionViewDirection));
  const rim = color(new THREE.Color(look.rim.color)).mul(pow(float(1).sub(facing), 3).mul(look.rim.k));
  m.colorNode = vec4(c.mul(look.gain), materialColor.a);
  m.emissiveNode = rim.add(c.mul(look.lift)).add(vec3(glow.r, glow.g, glow.b).mul(hot.mul(look.glow.k)));
  m.metalness = look.metalness;
  m.roughness = Math.min(1, Math.max(0, m.roughness + look.roughness));
  m.needsUpdate = true;
  return m;
}
