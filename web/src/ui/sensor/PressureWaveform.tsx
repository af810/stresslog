import { useCanvas } from '../common/useCanvas';

const ADC_MAX = 4095;
const PRIMARY = '#6750a4';

/** 圧力センサーの直近rawAdc値を折れ線で描く。0〜4095に固定スケールなので瞬間の押下強度が視覚的に安定する */
export function PressureWaveform({ values }: { values: number[] }) {
  const ref = useCanvas(
    (ctx, w, h) => {
      if (values.length < 2) return;
      const padding = 8;

      const xFor = (index: number) => padding + (index / (values.length - 1)) * (w - padding * 2);
      const yFor = (value: number) => h - padding - (value / ADC_MAX) * (h - padding * 2);

      ctx.strokeStyle = PRIMARY;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      values.forEach((v, i) => {
        if (i === 0) ctx.moveTo(xFor(i), yFor(v));
        else ctx.lineTo(xFor(i), yFor(v));
      });
      ctx.stroke();

      const last = values.length - 1;
      ctx.fillStyle = PRIMARY;
      ctx.beginPath();
      ctx.arc(xFor(last), yFor(values[last]), 3.5, 0, Math.PI * 2);
      ctx.fill();
    },
    [values],
  );

  if (values.length < 2) {
    return <div className="chart-empty">受信待ち…</div>;
  }
  return <canvas ref={ref} className="chart-canvas" style={{ height: 160 }} />;
}
