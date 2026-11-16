import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, dot, float, Fn, length, mix, normalize, pow, positionWorld, reflect, smoothstep, texture, time, uv, vec2, vec3, vec4, max } from 'three/tsl';
import { getWaterNormals } from './noiseTex';
import { skyParams } from './sky';

/**
 * Mặt hồ gương nhỏ trên đảo (E3-I, Kính Hồ Đảo): phẳng lặng như gương, phản chiếu trời + vệt nắng, thân nước ngọc nhạt đậm dần về tâm, mép mờ dần vào bờ.
 * Một material dùng chung cho mọi hồ (UV của CircleGeometry cho khoảng cách tới tâm). Không đọc độ sâu, không bọt: hồ nông, sóng gần như không.
 */
export function pondMaterial(): THREE.MeshBasicNodeMaterial {
  const nTex = getWaterNormals();
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const shaded = Fn(() => {
    const p = positionWorld.xz;
    const toCam = cameraPosition.sub(positionWorld);
    const V = toCam.div(length(toCam));
    const t = time;
    const n1 = texture(nTex, p.mul(0.07).add(vec2(t.mul(0.004), t.mul(0.003)))).rg.sub(0.5).mul(2);
    const n2 = texture(nTex, p.mul(0.19).add(vec2(t.mul(-0.006), t.mul(0.005)).add(0.3))).rg.sub(0.5).mul(2);
    const nxz = n1.mul(0.1).add(n2.mul(0.05));
    const N = normalize(vec3(nxz.x, 1, nxz.y));
    const rim = length(uv().sub(0.5)).mul(2);
    const body = mix(vec3(0.07, 0.2, 0.2), vec3(0.025, 0.09, 0.11), smoothstep(0.9, 0.2, rim));
    const R = reflect(V.negate(), N);
    const ry = max(R.y, 0);
    const sky = mix(skyParams.horizon, skyParams.top, pow(smoothstep(0, 0.75, ry), 0.55));
    const sd = max(dot(R, skyParams.sunDir), 0);
    const glint = pow(sd, 160).mul(2.2).add(pow(sd, 14).mul(0.16));
    const refl = sky.add(skyParams.sunColor.mul(glint));
    const cosT = clamp(dot(N, V), 0, 1);
    const fres = clamp(float(0.1).add(pow(float(1).sub(cosT), 3).mul(0.8)), 0, 1);
    const col = mix(body, refl, fres);
    const alpha = mix(0.93, 0.0, smoothstep(0.78, 1.0, rim));
    return vec4(col, alpha);
  })();
  mat.colorNode = shaded.rgb;
  mat.opacityNode = shaded.a;
  return mat;
}
