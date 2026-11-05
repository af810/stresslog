import { LEVEL_COLOR, type StressLevel } from '../../domain/stressLevel';
import { useCanvas } from './useCanvas';

/** 2時間 x 3レベル(高/中/低) のセル件数 */
export interface HourlyLevelCount {
  hourBucket: number;
  level: StressLevel;
  count: number;
}

const LEVEL_ROWS: StressLevel[] = ['HIGH', 'MID', 'LOW'];

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 時間帯(横軸 0-24時, 2時間刻み) x レベル(縦軸 高/中/低) の頻度ヒートマップ */
export function TimeOfDayHeatmap({ counts }: { counts: HourlyLevelCount[] }) {
  const ref = useCanvas(
    (ctx, w, h) => {
      const labelHeight = 18;
      const gridH = h - labelHeight;
      const maxCount = Math.max(1, ...counts.map((c) => c.count));
      const countMap = new Map<string, number>();
      for (const c of counts) countMap.set(`${c.hourBucket}:${c.level}`, c.count);

      const cols = 12;
      const rows = LEVEL_ROWS.length;
      const cellW = w / cols;
      const cellH = gridH / rows;

      for (let colIdx = 0; colIdx < cols; colIdx++) {
        for (let row = 0; row < rows; row++) {
          const level = LEVEL_ROWS[row];
          const count = countMap.get(`${colIdx}:${level}`) ?? 0;
          const intensity = count / maxCount;
          ctx.fillStyle = withAlpha(LEVEL_COLOR[level], 0.15 + intensity * 0.75);
          ctx.fillRect(colIdx * cellW + 1, row * cellH + 1, cellW - 2, cellH - 2);
        }
      }

      const labels = ['0時', '6時', '12時', '18時', '24時'];
      ctx.fillStyle = '#9e9e9e';
      ctx.font = '10px sans-serif';
      labels.forEach((label, index) => {
        const fraction = index / (labels.length - 1);
        const x = fraction * w;
        ctx.textAlign = index === 0 ? 'left' : index === labels.length - 1 ? 'right' : 'center';
        ctx.fillText(label, x, h - 4);
      });
    },
    [counts],
  );

  return <canvas ref={ref} className="chart-canvas" style={{ height: 138 }} />;
}
