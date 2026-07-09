package com.nishi.stresslog.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/** 個人のHRV/心拍ベースライン（常に単一行で保持し、逐次更新する） */
@Entity(tableName = "baselines")
data class Baseline(
    @PrimaryKey val id: Int = SINGLETON_ID,
    val meanHrv: Double,
    val stdHrv: Double,
    val meanRestingHr: Double,
    val sampleCount: Int,
    val updatedAt: Long
) {
    companion object {
        const val SINGLETON_ID = 0

        /** サンプルが十分集まるまでの暫定初期値 */
        fun initial(): Baseline = Baseline(
            meanHrv = 45.0,
            stdHrv = 10.0,
            meanRestingHr = 65.0,
            sampleCount = 0,
            updatedAt = 0L
        )
    }
}
