package com.nishi.stresslog.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp

data class TimelineDot(val hourFraction: Float, val level: StressLevel)

/** 0時〜24時の横軸上に、その日の反応をレベル色のドットで表示する（ホーム画面の「今日の記録」用） */
@Composable
fun DotTimeline(
    dots: List<TimelineDot>,
    modifier: Modifier = Modifier
) {
    val axisColor = MaterialTheme.colorScheme.outlineVariant

    Column(modifier = modifier.fillMaxWidth()) {
        Canvas(modifier = Modifier.fillMaxWidth().height(70.dp)) {
            val w = size.width
            val lineY = size.height * 0.35f
            val padding = 8f

            drawLine(
                color = axisColor,
                start = Offset(padding, lineY),
                end = Offset(w - padding, lineY),
                strokeWidth = 3f
            )

            dots.forEach { dot ->
                val x = padding + (dot.hourFraction / 24f).coerceIn(0f, 1f) * (w - padding * 2)
                drawCircle(color = dot.level.color, radius = 12f, center = Offset(x, lineY))
            }
        }
        Canvas(modifier = Modifier.fillMaxWidth().height(20.dp)) {
            val w = size.width
            val padding = 8f
            val labels = listOf("0時", "6時", "12時", "18時", "24時")
            labels.forEachIndexed { index, label ->
                val fraction = index / (labels.size - 1).toFloat()
                val x = padding + fraction * (w - padding * 2)
                val align = when (index) {
                    0 -> android.graphics.Paint.Align.LEFT
                    labels.size - 1 -> android.graphics.Paint.Align.RIGHT
                    else -> android.graphics.Paint.Align.CENTER
                }
                drawContext.canvas.nativeCanvas.drawText(
                    label, x, size.height * 0.8f,
                    android.graphics.Paint().apply {
                        textAlign = align
                        textSize = 22f
                        color = android.graphics.Color.GRAY
                    }
                )
            }
        }
    }
}
