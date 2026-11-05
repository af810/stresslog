import type { GripStrength } from '../data/types';

/**
 * rawAdcの平均値をしきい値で 大/中/小 に分類する。
 * forceKgではなくrawAdcで分類するのは、FSRが未校正の間もこの機能を使えるようにするため。
 */
export function classifyGrip(
  avgRawAdc: number,
  mediumThreshold: number,
  largeThreshold: number,
): GripStrength {
  if (avgRawAdc >= largeThreshold) return 'LARGE';
  if (avgRawAdc >= mediumThreshold) return 'MEDIUM';
  return 'SMALL';
}
