package com.nishi.stresslog.data.source

import java.util.Calendar
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random

/**
 * 開発・デモ用のダミーデータ源。実機ウェアラブルなしで全機能を試せるように、
 * 日内リズム（朝穏やか→日中変動→夕方に高まりやすい）＋ノイズ＋時々の
 * 一過性ストレススパイクでそれらしい波形を作る。
 */
@Singleton
class MockStressDataSource @Inject constructor() : StressDataSource {

    override val sourceId: String = "mock"

    // 一過性スパイクの残り継続時間（連続で呼ばれてもしばらく高値が続くようにする）
    private var spikeRemaining = 0
    private var spikeIntensity = 0.0

    override suspend fun readLatestSample(): HealthSample {
        val now = System.currentTimeMillis()
        val hourOfDay = hourOfDayFraction(now)

        // 日内リズム: 0.0(平穏)〜1.0(高ストレス方向)のベース係数
        // 朝(6-9時)やや上昇、午後(13-18時)に高まりやすい、深夜は低い
        val baseLoad = dailyRhythm(hourOfDay)

        // ランダムに一過性スパイクを発生させる（約5%の確率で新規発生）
        if (spikeRemaining <= 0 && Random.nextDouble() < 0.05) {
            spikeRemaining = Random.nextInt(1, 4) // 数サンプル分持続
            spikeIntensity = Random.nextDouble(0.3, 0.7)
        }
        val spikeLoad = if (spikeRemaining > 0) {
            spikeRemaining -= 1
            spikeIntensity
        } else 0.0

        val load = min(1.0, baseLoad + spikeLoad)

        // load が高いほど HRV は下がり、心拍は上がる
        val hrv = (55.0 - load * 30.0 + Random.nextDouble(-4.0, 4.0)).coerceIn(10.0, 80.0)
        val hr = (62 + load * 35 + Random.nextDouble(-5.0, 5.0)).toInt().coerceIn(45, 150)

        return HealthSample(
            timestamp = now,
            hrvRmssd = hrv,
            heartRate = hr
        )
    }

    private fun hourOfDayFraction(epochMillis: Long): Double {
        val cal = Calendar.getInstance().apply { timeInMillis = epochMillis }
        val hour = cal.get(Calendar.HOUR_OF_DAY)
        val minute = cal.get(Calendar.MINUTE)
        return hour + minute / 60.0
    }

    private fun dailyRhythm(hour: Double): Double {
        // 深夜(0-5時)は低い、日中にかけて緩やかに上昇し、13-18時あたりにピーク、夜は下降
        val peakShift = hour - 15.0 // 15時をピークにする
        val gaussianLike = kotlin.math.exp(-(peakShift * peakShift) / (2 * 6.0 * 6.0))
        val nightDamp = if (hour < 5 || hour > 23) 0.05 else 1.0
        val base = 0.15 + 0.35 * gaussianLike
        return max(0.0, base * nightDamp)
    }
}
