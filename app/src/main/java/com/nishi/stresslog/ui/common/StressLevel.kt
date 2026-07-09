package com.nishi.stresslog.ui.common

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

/** アプリ全体で統一するストレスの3段階レベル */
enum class StressLevel(val label: String, val color: Color) {
    LOW("低", Color(0xFF4CAF50)),
    MID("中", Color(0xFFFFA726)),
    HIGH("高", Color(0xFFE53935));

    companion object {
        fun of(score: Int): StressLevel = when {
            score < 40 -> LOW
            score < 70 -> MID
            else -> HIGH
        }
    }
}

private val HEATMAP_LOW = Color(0xFFFFF5F5)
private val HEATMAP_HIGH = Color(0xFFC62828)

/** 0.0(データなし/低)〜1.0(高)の強さを白→赤の濃淡に変換する（カレンダー/ヒートマップ共通） */
fun heatColor(intensity: Float): Color = lerp(HEATMAP_LOW, HEATMAP_HIGH, intensity.coerceIn(0f, 1f))
