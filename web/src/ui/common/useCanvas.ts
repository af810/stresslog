import { useEffect, useRef } from 'react';

export type CanvasDraw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * devicePixelRatio 対応の Canvas 描画フック。
 * 要素サイズの変化（ResizeObserver）とdeps変化で再描画する。
 * Compose の Canvas { } に相当する共通基盤
 */
export function useCanvas(draw: CanvasDraw, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      drawRef.current(ctx, rect.width, rect.height);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
