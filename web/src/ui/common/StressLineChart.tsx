import { LEVEL_COLOR, levelOf } from '../../domain/stressLevel';
import { useCanvas } from './useCanvas';

const PRIMARY = '#6750a4';

export interface LinePoint {
  timestamp: number;
  score: number;
}

/** 時系列のストレススコアを折れ線で描く汎用チャート。timestamp は横軸に線形マッピングする */
export function StressLineChart({
  points,
  thresholdScore = null,
  colorPointsByLevel = false,
}: {
  points: LinePoint[];
  thresholdScore?: number | null;
  colorPointsByLevel?: boolean;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      if (points.length === 0) return;
      const padding = 8;
      const minX = points[0].timestamp;
      let maxX = points[points.length - 1].timestamp;
      if (maxX === minX) maxX = minX + 1;

      const xFor = (t: number) => padding + ((t - minX) / (maxX - minX)) * (w - padding * 2);
      const yFor = (score: number) => h - padding - (score / 100) * (h - padding * 2);

      // 閾値ライン
      if (thresholdScore !== null) {
        ctx.strokeStyle = 'rgba(229, 57, 53, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(0, yFor(thresholdScore));
        ctx.lineTo(w, yFor(thresholdScore));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = xFor(p.timestamp);
        const y = yFor(p.score);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      for (const p of points) {
        ctx.fillStyle = colorPointsByLevel ? LEVEL_COLOR[levelOf(p.score)] : PRIMARY;
        ctx.beginPath();
        ctx.arc(xFor(p.timestamp), yFor(p.score), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [points, thresholdScore, colorPointsByLevel],
  );

  if (points.length === 0) {
    return <div className="chart-empty">データがありません</div>;
  }
  return <canvas ref={ref} className="chart-canvas" style={{ height: 160 }} />;
}
