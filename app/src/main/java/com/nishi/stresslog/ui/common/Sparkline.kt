package com.nishi.stresslog.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** 記録カードに添える小さな波形。前後±30分程度のスコア推移をレベル色の線で描く */
@Composable
fun Sparkline(
    scores: List<Int>,
    level: StressLevel,
    modifier: Modifier = Modifier,
    width: Dp = 64.dp,
    height: Dp = 36.dp
) {
    Box(modifier = modifier.size(width, height)) {
        if (scores.size < 2) return@Box
        Canvas(modifier = Modifier.size(width, height)) {
            val w = size.width
            val h = size.height
            val padding = 3f
            val minScore = scores.min().toFloat()
            val maxScore = scores.max().toFloat().let { if (it == minScore) minScore + 1f else it }

            fun xFor(i: Int) = padding + i / (scores.size - 1).toFloat() * (w - padding * 2)
            fun yFor(v: Int) = h - padding - ((v - minScore) / (maxScore - minScore)) * (h - padding * 2)

            val path = androidx.compose.ui.graphics.Path()
            scores.forEachIndexed { i, v ->
                val x = xFor(i)
                val y = yFor(v)
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, color = level.color, style = Stroke(width = 3.5f))
        }
    }
}
