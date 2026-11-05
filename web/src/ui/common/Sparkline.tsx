import { LEVEL_COLOR, type StressLevel } from '../../domain/stressLevel';
import { useCanvas } from './useCanvas';

/** 記録カードに添える小さな波形。前後±30分程度のスコア推移をレベル色の線で描く */
export function Sparkline({
  scores,
  level,
  width = 64,
  height = 36,
}: {
  scores: number[];
  level: StressLevel;
  width?: number;
  height?: number;
}) {
  const ref = useCanvas(
    (ctx, w, h) => {
      if (scores.length < 2) return;
      const padding = 3;
      const minScore = Math.min(...scores);
      let maxScore = Math.max(...scores);
      if (maxScore === minScore) maxScore = minScore + 1;

      const xFor = (i: number) => padding + (i / (scores.length - 1)) * (w - padding * 2);
      const yFor = (v: number) =>
        h - padding - ((v - minScore) / (maxScore - minScore)) * (h - padding * 2);

      ctx.strokeStyle = LEVEL_COLOR[level];
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      scores.forEach((v, i) => {
        if (i === 0) ctx.moveTo(xFor(i), yFor(v));
        else ctx.lineTo(xFor(i), yFor(v));
      });
      ctx.stroke();
    },
    [scores, level],
  );

  if (scores.length < 2) return null;
  return <canvas ref={ref} style={{ width, height, flexShrink: 0 }} />;
}
