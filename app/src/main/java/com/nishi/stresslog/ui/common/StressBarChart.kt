package com.nishi.stresslog.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp
import com.nishi.stresslog.data.local.DailyStressAggregate
import com.nishi.stresslog.ui.theme.stressScoreColor
import java.text.SimpleDateFormat
import java.util.Locale

/** 日別の平均(バー)・最大(点)ストレススコアを表示する週/月グラフ */
@Composable
fun StressBarChart(
    entries: List<DailyStressAggregate>,
    modifier: Modifier = Modifier
) {
    if (entries.isEmpty()) {
        Box(modifier = modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
            Text("データがありません", style = MaterialTheme.typography.bodyMedium)
        }
        return
    }

    val dateFormat = remember { SimpleDateFormat("M/d", Locale.JAPAN) }

    Column(modifier = modifier.fillMaxWidth()) {
        Canvas(modifier = Modifier.fillMaxWidth().height(180.dp)) {
            val w = size.width
            val h = size.height
            val padding = 8f
            val slot = (w - padding * 2) / entries.size
            val barWidth = slot * 0.5f

            fun yFor(score: Double) = h - padding - (score / 100f).toFloat() * (h - padding * 2)

            entries.forEachIndexed { index, entry ->
                val centerX = padding + slot * index + slot / 2
                val barTop = yFor(entry.avgScore)
                val color = stressScoreColor(entry.avgScore.toInt())

                drawRect(
                    color = color,
                    topLeft = Offset(centerX - barWidth / 2, barTop),
                    size = androidx.compose.ui.geometry.Size(barWidth, h - padding - barTop)
                )
                drawCircle(
                    color = Color(0xFFE53935),
                    radius = 5f,
                    center = Offset(centerX, yFor(entry.maxScore.toDouble()))
                )
            }
        }
        Canvas(modifier = Modifier.fillMaxWidth().height(20.dp)) {
            val w = size.width
            val padding = 8f
            val slot = (w - padding * 2) / entries.size
            entries.forEachIndexed { index, entry ->
                val centerX = padding + slot * index + slot / 2
                drawContext.canvas.nativeCanvas.drawText(
                    dateFormat.format(java.util.Date(entry.dayStart)),
                    centerX,
                    size.height * 0.8f,
                    android.graphics.Paint().apply {
                        textAlign = android.graphics.Paint.Align.CENTER
                        textSize = 24f
                        color = android.graphics.Color.GRAY
                    }
                )
            }
        }
    }
}
