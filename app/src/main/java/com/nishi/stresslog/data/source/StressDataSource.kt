package com.nishi.stresslog.data.source

/** ウェアラブルから得られる生データ1点分（HRVと心拍） */
data class HealthSample(
    val timestamp: Long,
    val hrvRmssd: Double,
    val heartRate: Int
)

/**
 * ストレス算出の元になる生体データの取得口。
 * 実機導入時は HealthConnectStressDataSource を実装して差し替える。
 */
interface StressDataSource {
    val sourceId: String
    suspend fun readLatestSample(): HealthSample
}
