import { stressScoreColor } from '../../domain/stressLevel';
import { useCanvas } from './useCanvas';

const TRACK_COLOR = '#e7e0ec';

/** 現在のストレススコアを表す円形ゲージ。0-100 を270度の弧で表現する */
export function StressGauge({ score, size = 200 }: { score: number; size?: number }) {
  const color = stressScoreColor(score);

  const ref = useCanvas(
    (ctx, w, h) => {
      const strokeWidth = w * 0.09;
      const cx = w / 2;
      const cy = h / 2;
      const radius = (Math.min(w, h) - strokeWidth) / 2;
      // Compose版と同じ: startAngle 135°、最大270°
      const startAngle = (135 * Math.PI) / 180;
      const sweepMax = (270 * Math.PI) / 180;

      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';

      ctx.strokeStyle = TRACK_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sweepMax);
      ctx.stroke();

      const fraction = Math.min(1, Math.max(0, score / 100));
      if (fraction > 0) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, startAngle + sweepMax * fraction);
        ctx.stroke();
      }
    },
    [score],
  );

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <canvas ref={ref} style={{ width: size, height: size }} />
      <div className="gauge-score" style={{ color }}>
        {score}
      </div>
    </div>
  );
}
