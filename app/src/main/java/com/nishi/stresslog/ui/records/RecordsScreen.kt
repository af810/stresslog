package com.nishi.stresslog.ui.records

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nishi.stresslog.data.local.TriggerType
import com.nishi.stresslog.ui.common.Sparkline
import com.nishi.stresslog.ui.common.StressLevel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val timeFormat = SimpleDateFormat("HH:mm", Locale.JAPAN)

@Composable
fun RecordsScreen(
    onOpenMoment: (Long) -> Unit,
    viewModel: RecordsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                IconButton(onClick = { viewModel.goToPreviousDay() }) {
                    Icon(Icons.Filled.ChevronLeft, contentDescription = "前の日")
                }
                Text(state.selectedDateLabel, style = MaterialTheme.typography.titleMedium)
                IconButton(onClick = { viewModel.goToNextDay() }, enabled = state.canGoNext) {
                    Icon(Icons.Filled.ChevronRight, contentDescription = "次の日")
                }
            }

            if (!state.loading && state.items.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("この日の記録はありません", color = MaterialTheme.colorScheme.outline)
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(state.items, key = { it.moment.id }) { item ->
                    RecordCard(item = item, onClick = { onOpenMoment(item.moment.id) })
                }
            }
        }
    }
}

@Composable
private fun RecordCard(item: MomentWithSparkline, onClick: () -> Unit) {
    val moment = item.moment
    val level = StressLevel.of(moment.stressScore)

    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                timeFormat.format(Date(moment.timestamp)),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.width(52.dp)
            )
            Spacer(Modifier.width(8.dp))

            Surface(
                color = level.color.copy(alpha = 0.15f),
                contentColor = level.color,
                shape = MaterialTheme.shapes.small
            ) {
                Text(
                    level.label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
            Spacer(Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (moment.trigger == TriggerType.AUTO) "心拍変動の上昇を検知" else "手動で記録",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    item.causeText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                    maxLines = 2
                )
            }

            Spacer(Modifier.width(8.dp))
            if (item.sparklineScores.size >= 2) {
                Sparkline(scores = item.sparklineScores, level = level)
            }
        }
    }
}
