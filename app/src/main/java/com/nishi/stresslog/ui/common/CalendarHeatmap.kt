package com.nishi.stresslog.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.util.Calendar

data class CalendarDayCell(
    val dayOfMonth: Int,
    val dayStart: Long,
    val avgScore: Double?
)

/** 月間カレンダーを日平均スコアの赤の濃淡で塗るヒートマップ */
@Composable
fun CalendarHeatmap(
    cells: List<CalendarDayCell>,
    modifier: Modifier = Modifier,
    onDayClick: (Long) -> Unit = {}
) {
    if (cells.isEmpty()) return
    val firstDow = Calendar.getInstance().apply { timeInMillis = cells.first().dayStart }
        .get(Calendar.DAY_OF_WEEK) - 1 // 0=日曜

    val weeks = mutableListOf<MutableList<CalendarDayCell?>>()
    var currentWeek = MutableList<CalendarDayCell?>(7) { null }
    repeat(firstDow) { currentWeek[it] = null }
    var col = firstDow
    for (cell in cells) {
        currentWeek[col] = cell
        col++
        if (col == 7) {
            weeks.add(currentWeek)
            currentWeek = MutableList(7) { null }
            col = 0
        }
    }
    if (col != 0) weeks.add(currentWeek)

    Column(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth()) {
            listOf("日", "月", "火", "水", "木", "金", "土").forEach { label ->
                Text(
                    label,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }
        weeks.forEach { week ->
            Row(modifier = Modifier.fillMaxWidth()) {
                week.forEach { cell ->
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .padding(2.dp)
                    ) {
                        if (cell != null) {
                            val intensity = cell.avgScore?.let { (it / 100.0).toFloat() } ?: 0f
                            val bg = if (cell.avgScore != null) heatColor(intensity) else Color.Transparent
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(1f)
                                    .background(bg, RoundedCornerShape(6.dp))
                                    .clickable { onDayClick(cell.dayStart) },
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                Text(
                                    "${cell.dayOfMonth}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (intensity > 0.5f) Color.White else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
