package com.nishi.stresslog.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp

/** 2時間 x 3レベル(高/中/低) のセル件数 */
data class HourlyLevelCount(val hourBucket: Int, val level: StressLevel, val count: Int)

/** 時間帯(横軸 0-24時, 2時間刻み) x レベル(縦軸 高/中/低) の頻度ヒートマップ */
@Composable
fun TimeOfDayHeatmap(
    counts: List<HourlyLevelCount>,
    modifier: Modifier = Modifier
) {
    val maxCount = (counts.maxOfOrNull { it.count } ?: 1).coerceAtLeast(1)
    val countMap = counts.associateBy { it.hourBucket to it.level }
    val levels = listOf(StressLevel.HIGH, StressLevel.MID, StressLevel.LOW)

    Column(modifier = modifier.fillMaxWidth()) {
        Canvas(modifier = Modifier.fillMaxWidth().height(120.dp)) {
            val w = size.width
            val h = size.height
            val cols = 12
            val rows = levels.size
            val cellW = w / cols
            val cellH = h / rows

            for (col in 0 until cols) {
                for (row in 0 until rows) {
                    val level = levels[row]
                    val count = countMap[col to level]?.count ?: 0
                    val intensity = count / maxCount.toFloat()
                    val base = level.color
                    val cellColor = base.copy(alpha = 0.15f + intensity * 0.75f)
                    drawRect(
                        color = cellColor,
                        topLeft = Offset(col * cellW + 1f, row * cellH + 1f),
                        size = Size(cellW - 2f, cellH - 2f)
                    )
                }
            }
        }
        Canvas(modifier = Modifier.fillMaxWidth().height(18.dp)) {
            val w = size.width
            val labels = listOf("0時", "6時", "12時", "18時", "24時")
            labels.forEachIndexed { index, label ->
                val fraction = index / (labels.size - 1).toFloat()
                val x = fraction * w
                val align = when (index) {
                    0 -> android.graphics.Paint.Align.LEFT
                    labels.size - 1 -> android.graphics.Paint.Align.RIGHT
                    else -> android.graphics.Paint.Align.CENTER
                }
                drawContext.canvas.nativeCanvas.drawText(
                    label, x, size.height * 0.8f,
                    android.graphics.Paint().apply {
                        textAlign = align
                        textSize = 20f
                        color = android.graphics.Color.GRAY
                    }
                )
            }
        }
    }
}
