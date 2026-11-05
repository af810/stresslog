import type { Baseline } from '../data/types';

// domain/BaselineTracker.kt の移植。DAO依存を外して純関数化し、永続化は repository 側で行う

function adaptiveAlpha(sampleCount: number): number {
  if (sampleCount < 20) return 0.2;
  if (sampleCount < 100) return 0.05;
  return 0.02;
}

/**
 * 個人のHRV/心拍ベースラインを指数移動平均でオンライン更新する。
 * 体調・季節変化に追従しつつ、単発の外れ値に過敏に反応しないようにする。
 */
export function updateBaseline(
  current: Baseline,
  hrvRmssd: number,
  heartRate: number,
  now: number = Date.now(),
): Baseline {
  // サンプル数が少ないうちは学習を速く（アルファを大きく）、
  // 十分溜まったら安定させる（アルファを小さく）
  const alpha = adaptiveAlpha(current.sampleCount);

  const newMean = current.meanHrv + alpha * (hrvRmssd - current.meanHrv);
  const diff = hrvRmssd - newMean;
  const newVariance = (1 - alpha) * (current.stdHrv * current.stdHrv + alpha * diff * diff);
  const sqrtStd = Math.sqrt(newVariance);
  const newStd = Number.isFinite(sqrtStd) && sqrtStd > 0 ? sqrtStd : current.stdHrv;

  const newMeanHr = current.meanRestingHr + alpha * (heartRate - current.meanRestingHr);

  return {
    ...current,
    meanHrv: newMean,
    stdHrv: newStd,
    meanRestingHr: newMeanHr,
    sampleCount: current.sampleCount + 1,
    updatedAt: now,
  };
}
