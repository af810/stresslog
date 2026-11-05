import { LEVEL_COLOR, type StressLevel } from '../../domain/stressLevel';
import { useCanvas } from './useCanvas';

export interface TimelineDot {
  hourFraction: number;
  level: StressLevel;
}

/** 0時〜24時の横軸上に、その日の反応をレベル色のドットで表示する（ホーム画面の「今日の記録」用） */
export function DotTimeline({ dots }: { dots: TimelineDot[] }) {
  const ref = useCanvas(
    (ctx, w, h) => {
      const padding = 8;
      const lineY = h * 0.3;

      ctx.strokeStyle = '#cac4d0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padding, lineY);
      ctx.lineTo(w - padding, lineY);
      ctx.stroke();

      for (const dot of dots) {
        const fraction = Math.min(1, Math.max(0, dot.hourFraction / 24));
        const x = padding + fraction * (w - padding * 2);
        ctx.fillStyle = LEVEL_COLOR[dot.level];
        ctx.beginPath();
        ctx.arc(x, lineY, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // 時刻ラベル
      const labels = ['0時', '6時', '12時', '18時', '24時'];
      ctx.fillStyle = '#9e9e9e';
      ctx.font = '11px sans-serif';
      labels.forEach((label, index) => {
        const fraction = index / (labels.length - 1);
        const x = padding + fraction * (w - padding * 2);
        ctx.textAlign = index === 0 ? 'left' : index === labels.length - 1 ? 'right' : 'center';
        ctx.fillText(label, x, h - 6);
      });
    },
    [dots],
  );

  return <canvas ref={ref} className="chart-canvas" style={{ height: 70 }} />;
}
