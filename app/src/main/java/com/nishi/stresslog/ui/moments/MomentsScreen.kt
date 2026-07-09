package com.nishi.stresslog.ui.moments

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nishi.stresslog.data.local.StressMoment
import com.nishi.stresslog.data.local.TriggerType
import com.nishi.stresslog.ui.theme.stressScoreColor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val dateFormat = SimpleDateFormat("M/d(E) HH:mm", Locale.JAPAN)

@androidx.compose.material3.ExperimentalMaterial3Api
@Composable
fun MomentsScreen(
    onOpenMoment: (Long) -> Unit,
    viewModel: MomentsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("ストレスの瞬間") }) }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (state.insights.isNotEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text("傾向とアドバイス", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(8.dp))
                            state.insights.forEach { insight ->
                                Text("・${insight.message}", modifier = Modifier.padding(vertical = 2.dp))
                            }
                        }
                    }
                }
            }

            if (state.moments.isEmpty()) {
                item {
                    Text(
                        "まだ記録がありません。ダッシュボードから「今ストレスを感じた」で記録できます。",
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }

            items(state.moments, key = { it.id }) { moment ->
                MomentRow(moment = moment, onClick = { onOpenMoment(moment.id) })
            }
        }
    }
}

@Composable
private fun MomentRow(moment: StressMoment, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(48.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "${moment.stressScore}",
                    color = stressScoreColor(moment.stressScore),
                    style = MaterialTheme.typography.titleLarge
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(dateFormat.format(Date(moment.timestamp)), style = MaterialTheme.typography.bodyMedium)
                if (moment.tags.isNotEmpty()) {
                    Text(moment.tags.joinToString("・"), style = MaterialTheme.typography.bodySmall)
                }
                if (!moment.note.isNullOrBlank()) {
                    Text(moment.note, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
            Icon(
                imageVector = if (moment.trigger == TriggerType.AUTO) Icons.Filled.Notifications else Icons.Filled.Person,
                contentDescription = if (moment.trigger == TriggerType.AUTO) "自動検知" else "手動記録",
                tint = MaterialTheme.colorScheme.outline
            )
        }
    }
}
