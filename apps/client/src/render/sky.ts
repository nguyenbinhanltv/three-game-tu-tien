import * as THREE from 'three/webgpu';
import {
  clamp,
  dot,
  exp,
  float,
  Fn,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { getCloudNoise } from './noiseTex';

/**
 * Bầu trời buổi sớm: gradient chân trời (trùng màu sương để không lộ mép) lên đỉnh lam ngọc, mặt trời ấm
 * có quầng, dải sáng ấm sát chân trời phía mặt trời và mây ti mỏng kéo thành sợi.
 * Mặt trời lấy đúng hướng đèn hướng của cảnh (`setSunDirection`), nên hướng bóng đổ và ánh trời khớp nhau.
 * Preset Thấp bỏ mây ti (không lấy mẫu texture).
 */
export const skyParams = {
  horizon: uniform(new THREE.Color(0xe4e3d6)),
  top: uniform(new THREE.Color(0x7ea6b6)),
  /** Sắc quầng nắng ấm (highlightTint của preset). */
  glow: uniform(new THREE.Color(0xffd49a)),
  sunColor: uniform(new THREE.Color(0xf6c27e)),
  /** Hướng TỚI mặt trời (đơn vị). */
  sunDir: uniform(new THREE.Vector3(0.45, 0.82, 0.34).normalize()),
  /** 0 = không mây ti (preset Thấp), 1 = có. */
  cirrus: uniform(1),
  /** Độ đậm mây ti theo thời điểm (đêm nhạt). */
  cirrusAmt: uniform(1),
};

const SKY_RADIUS = 4200;

export function createSky(): THREE.Mesh {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false });
  const noise = getCloudNoise();
  mat.colorNode = Fn(() => {
    const d = normalize(positionLocal);
    const h = d.y;
    const sd = max(dot(d, skyParams.sunDir), 0);

    // Gradient: dưới chân trời giữ màu sương; lên cao ngả dần về lam ngọc.
    const up = pow(smoothstep(0.0, 0.75, h), 0.55);
    const base = mix(skyParams.horizon, skyParams.top, up).toVar();

    // Dải sáng ấm sát chân trời, đậm hơn về phía mặt trời.
    const band = exp(h.max(0).mul(-7));
    const toward = float(0.25).add(pow(sd, 3).mul(0.75));
    base.assign(mix(base, skyParams.glow, band.mul(toward).mul(0.55)));

    // Quầng và đĩa mặt trời (HDR > 1, ACES kéo về trắng ấm).
    // Quầng mềm liền một dải (không có số mũ cao tách thành vành riêng quanh đĩa), đĩa có mép mờ rộng.
    const halo = pow(sd, 6).mul(0.2).add(pow(sd, 90).mul(0.42));
    const disc = smoothstep(0.9992, 0.99975, sd).mul(2.4);
    base.addAssign(skyParams.sunColor.mul(halo.add(disc)));

    // Mây ti: chiếu hướng nhìn lên một mặt phẳng cao, kéo giãn thành sợi, trôi chậm.
    const proj = vec2(d.x, d.z).div(h.max(0.06).add(0.22));
    const wind = vec2(time.mul(0.0035), time.mul(0.0012));
    const streak = texture(noise, proj.mul(vec2(0.16, 0.6)).add(wind)).a;
    const detail = texture(noise, proj.mul(0.55).add(wind.mul(1.7))).g;
    const dens = smoothstep(0.52, 0.82, streak.mul(0.75).add(detail.mul(0.35)));
    const cover = dens
      .mul(smoothstep(0.03, 0.22, h))
      .mul(float(1).sub(smoothstep(0.55, 0.9, h).mul(0.4)))
      .mul(0.55)
      .mul(skyParams.cirrus)
      .mul(skyParams.cirrusAmt);
    // Sợi mây sáng ấm về phía mặt trời, lạnh ở phía đối diện.
    const cirrusCol = mix(mix(skyParams.horizon, vec3(1), 0.55), skyParams.glow.add(0.25), pow(sd, 2).mul(0.8));
    return mix(base, cirrusCol, clamp(cover, 0, 1));
  })();
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 20);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

/** Màu đỉnh trời theo preset (không có trong art bible, chọn cho khớp màu sương). */
const TOP: Record<string, number> = {
  dawn: 0x7ea6b6,
  day: 0x4f93bf,
  night: 0x0b1520,
  ochre_dawn: 0x8c8ea0,
  ochre: 0x6f8fa6,
  ochre_night: 0x0c1420,
  cloud_dawn: 0x6fb2c6,
  cloud: 0x4f9fc9,
  cloud_night: 0x0d1a2c,
  tk_dawn: 0x6a5aa8,
  tk: 0x5a62b8,
  tk_dusk: 0x3d2a7a,
  tk_night: 0x0c0a24,
  kt: 0x35495f,
  pm: 0x2a2018,
  kn: 0x18233f,
  tt: 0x120c26,
  xk: 0x3a2018,
  kd: 0x1c120a,
  lk_dawn: 0x6fb0d0,
  lk_day: 0x3f8fd0,
  lk_dusk: 0x5a76a8,
  lk_night: 0x07101f,
  dm_dawn: 0x8a8cae,
  dm_day: 0x5f86b4,
  dm_dusk: 0x7a6aa8,
  dm_night: 0x0a0e22,
  vh_dawn: 0x5f9fd6,
  vh_day: 0x3a82cc,
  vh_dusk: 0x4f66a8,
  vh_night: 0x060e22,
  ash_dawn: 0x8a99a3,
  rift: 0x241634,
  rift_pit: 0x4a4668,
  bh_dawn: 0x4a5ca8,
  bh_day: 0x5a80c0,
  bh_dusk: 0x4a3c78,
  bh_night: 0x0a0f2a,
  bhr_dawn: 0x2c2058,
  bhr_day: 0x3a2e70,
  bhr_dusk: 0x20103e,
  bhr_night: 0x08041c,
};

/** Màu đỉnh trời của preset (để trộn mood theo vị trí). */
export const skyTopOf = (name: string): number => TOP[name] ?? TOP.day!;

export function applySkyPreset(name: string, fogColor: number, glowColor: number, sunColor: number, top?: number): void {
  skyParams.horizon.value.setHex(fogColor);
  skyParams.top.value.setHex(top ?? TOP[name] ?? TOP.day!);
  skyParams.glow.value.setHex(glowColor);
  skyParams.sunColor.value.setHex(sunColor);
  // Đêm: bớt quầng và không mây ti sáng.
  skyParams.cirrusAmt.value = name.endsWith('night') ? 0.25 : 1;
}

export function setSunDirection(x: number, y: number, z: number): void {
  skyParams.sunDir.value.set(x, y, z).normalize();
}

export function setSkyQuality(preset: string): void {
  skyParams.cirrus.value = preset === 'low' ? 0 : 1;
}
