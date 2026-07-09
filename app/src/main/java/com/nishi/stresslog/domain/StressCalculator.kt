package com.nishi.stresslog.domain

import com.nishi.stresslog.data.local.Baseline
import javax.inject.Inject
import kotlin.math.roundToInt

/**
 * HRV/心拍を、個人ベースラインからの逸脱として 0-100 のストレス指数に変換する。
 * 絶対値ではなく「その人の平常時からどれだけ外れているか」で評価する設計。
 */
class StressCalculator @Inject constructor() {

    fun calculate(hrvRmssd: Double, heartRate: Int, baseline: Baseline): Int {
        // ベースラインがまだ十分でない（学習中）場合も、初期値ベースで暫定算出する
        val stdHrv = if (baseline.stdHrv < MIN_STD) MIN_STD else baseline.stdHrv

        // HRV が下がるほどストレス方向なので符号を反転
        val zHrv = (baseline.meanHrv - hrvRmssd) / stdHrv

        // 心拍の逸脱（15bpmを目安スケールとして正規化）
        val zHr = (heartRate - baseline.meanRestingHr) / HR_SCALE

        val raw = HRV_WEIGHT * zHrv + HR_WEIGHT * zHr
        val score = CENTER + raw * SPREAD

        return score.roundToInt().coerceIn(0, 100)
    }

    companion object {
        private const val MIN_STD = 3.0
        private const val HR_SCALE = 15.0
        private const val HRV_WEIGHT = 0.7
        private const val HR_WEIGHT = 0.3
        private const val CENTER = 50.0
        private const val SPREAD = 20.0
    }
}
