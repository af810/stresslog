package com.nishi.stresslog.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/** 時系列のストレススコアを折れ線で描く汎用チャート。timestamp は横軸に線形マッピングする */
@Composable
fun StressLineChart(
    points: List<Pair<Long, Int>>,
    modifier: Modifier = Modifier,
    lineColor: Color = MaterialTheme.colorScheme.primary,
    thresholdScore: Int? = null,
    showAxisLabels: Boolean = false
) {
    if (points.isEmpty()) {
        Box(modifier = modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
            Text("データがありません", style = MaterialTheme.typography.bodyMedium)
        }
        return
    }

    val minX = points.first().first.toFloat()
    val maxX = points.last().first.toFloat().let { if (it == minX) minX + 1f else it }

    Canvas(modifier = modifier.fillMaxWidth().height(160.dp)) {
        val w = size.width
        val h = size.height
        val padding = 8f

        fun xFor(t: Long) = padding + (t - minX) / (maxX - minX) * (w - padding * 2)
        fun yFor(score: Int) = h - padding - (score / 100f) * (h - padding * 2)

        // 閾値ライン
        thresholdScore?.let { threshold ->
            drawLine(
                color = Color(0xFFE53935).copy(alpha = 0.5f),
                start = Offset(0f, yFor(threshold)),
                end = Offset(w, yFor(threshold)),
                strokeWidth = 2f,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))
            )
        }

        val path = androidx.compose.ui.graphics.Path()
        points.forEachIndexed { index, (t, score) ->
            val x = xFor(t)
            val y = yFor(score)
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color = lineColor, style = Stroke(width = 5f))

        points.forEach { (t, score) ->
            drawCircle(color = lineColor, radius = 4f, center = Offset(xFor(t), yFor(score)))
        }
    }
}
