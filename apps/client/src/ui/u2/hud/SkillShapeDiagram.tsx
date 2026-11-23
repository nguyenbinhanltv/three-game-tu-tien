// Minh họa vùng chiêu trên sàn (Chân Cảnh U4): nhìn từ trên xuống, người ra chiêu ở dưới nhìn lên (cùng hướng camera chéo).
import type { SkillShape } from '../../skillTip';

const W = 132;
const H = 112;
const PX = W / 2;
const PY = H - 14; // chỗ người ra chiêu

export function SkillShapeDiagram({ shape }: { shape: SkillShape }) {
  // Tỉ lệ mét → điểm ảnh: vừa khung theo cạnh dài nhất.
  const reach =
    shape.k === 'single' ? shape.range : shape.k === 'circle' ? shape.range + shape.r : shape.k === 'line' ? shape.len : shape.dist;
  const sideHalf = shape.k === 'circle' ? shape.r : shape.k === 'line' ? shape.width / 2 : shape.k === 'dash' ? shape.width / 2 : 0;
  const s = Math.min((PY - 6) / Math.max(1, reach), (PX - 6) / Math.max(1, sideHalf), 12);
  return (
    <svg className="sk-shape" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-hidden="true" data-shape={shape.k}>
      {shape.k === 'single' && (
        <>
          <path
            className="sk-range"
            d={`M ${PX - shape.range * s} ${PY} A ${shape.range * s} ${shape.range * s} 0 0 1 ${PX + shape.range * s} ${PY}`}
          />
          <circle className="sk-hit" cx={PX} cy={PY - shape.range * s * 0.7} r={4} />
        </>
      )}
      {shape.k === 'circle' && (
        <>
          {!shape.self && <path className="sk-range" d={`M ${PX} ${PY} L ${PX} ${PY - shape.range * s}`} />}
          <circle className="sk-area" cx={PX} cy={PY - shape.range * s} r={shape.r * s} />
        </>
      )}
      {shape.k === 'line' && (
        <rect className="sk-area" x={PX - (shape.width * s) / 2} y={PY - shape.len * s} width={shape.width * s} height={shape.len * s} />
      )}
      {shape.k === 'dash' && (
        <>
          <rect
            className="sk-area"
            x={PX - Math.max(2, (shape.width * s) / 2)}
            y={PY - shape.dist * s}
            width={Math.max(4, shape.width * s)}
            height={shape.dist * s}
          />
          <path
            className="sk-arrow"
            d={`M ${PX} ${PY} L ${PX} ${PY - shape.dist * s + 3} M ${PX - 4} ${PY - shape.dist * s + 8} L ${PX} ${PY - shape.dist * s + 2} L ${PX + 4} ${PY - shape.dist * s + 8}`}
          />
        </>
      )}
      <circle className="sk-self" cx={PX} cy={PY} r={5} />
    </svg>
  );
}
