import type { Baseline } from '../data/types';

// domain/StressCalculator.kt の移植。定数・式を一致させる
const MIN_STD = 3.0;
const HR_SCALE = 15.0;
const HRV_WEIGHT = 0.7;
const HR_WEIGHT = 0.3;
const CENTER = 50.0;
const SPREAD = 20.0;

/**
 * HRV/心拍を、個人ベースラインからの逸脱として 0-100 のストレス指数に変換する。
 * 絶対値ではなく「その人の平常時からどれだけ外れているか」で評価する設計。
 */
export function calculateStressScore(
  hrvRmssd: number,
  heartRate: number,
  baseline: Baseline,
): number {
  const stdHrv = baseline.stdHrv < MIN_STD ? MIN_STD : baseline.stdHrv;

  // HRV が下がるほどストレス方向なので符号を反転
  const zHrv = (baseline.meanHrv - hrvRmssd) / stdHrv;

  // 心拍の逸脱（15bpmを目安スケールとして正規化）
  const zHr = (heartRate - baseline.meanRestingHr) / HR_SCALE;

  const raw = HRV_WEIGHT * zHrv + HR_WEIGHT * zHr;
  const score = CENTER + raw * SPREAD;

  // Kotlin roundToInt と同じ「0.5は正の無限大方向へ丸め」= Math.round
  return Math.min(100, Math.max(0, Math.round(score)));
}
