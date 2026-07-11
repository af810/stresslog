package com.nishi.stresslog.ui.sensor

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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

private const val ADC_MAX = 4095f

/** 圧力センサーの直近rawAdc値を折れ線で描く。0〜4095に固定スケールなので瞬間の押下強度が視覚的に安定する */
@Composable
fun PressureWaveform(
    values: List<Int>,
    modifier: Modifier = Modifier
) {
    if (values.size < 2) {
        Box(modifier = modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
            Text("受信待ち…", style = MaterialTheme.typography.bodyMedium)
        }
        return
    }

    val lineColor = MaterialTheme.colorScheme.primary

    Canvas(modifier = modifier.fillMaxWidth().height(160.dp)) {
        val w = size.width
        val h = size.height
        val padding = 8f

        fun xFor(index: Int) = padding + index / (values.size - 1).toFloat() * (w - padding * 2)
        fun yFor(value: Int) = h - padding - (value / ADC_MAX) * (h - padding * 2)

        val path = Path()
        values.forEachIndexed { index, value ->
            val x = xFor(index)
            val y = yFor(value)
            if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color = lineColor, style = Stroke(width = 5f))

        val last = values.lastIndex
        drawCircle(color = lineColor, radius = 7f, center = Offset(xFor(last), yFor(values[last])))
    }
}
