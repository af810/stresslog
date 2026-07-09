package com.nishi.stresslog.ui.advice

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nishi.stresslog.data.local.StressMoment
import com.nishi.stresslog.ui.theme.stressScoreColor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val dateFormat = SimpleDateFormat("M/d(E) HH:mm", Locale.JAPAN)

@Composable
fun AdviceScreen(viewModel: AdviceViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Scaffold { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text("傾向とアドバイス", style = MaterialTheme.typography.titleMedium)
            }
            items(state.insights) { insight ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
                ) {
                    Row(Modifier.padding(16.dp)) {
                        Icon(Icons.Filled.SmartToy, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                        Spacer(Modifier.height(0.dp))
                        Text(insight.message, modifier = Modifier.padding(start = 12.dp))
                    }
                }
            }

            if (state.history.isNotEmpty()) {
                item {
                    Spacer(Modifier.height(8.dp))
                    Text("過去に提案した解消法", style = MaterialTheme.typography.titleMedium)
                }
                items(state.history, key = { it.id }) { moment ->
                    HistoryRow(moment)
                }
            }
        }
    }
}

@Composable
private fun HistoryRow(moment: StressMoment) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row {
                Text(
                    dateFormat.format(Date(moment.timestamp)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
                Spacer(Modifier.height(0.dp))
                Text(
                    "  スコア ${moment.stressScore}",
                    style = MaterialTheme.typography.bodySmall,
                    color = stressScoreColor(moment.stressScore)
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(moment.appliedSuggestion ?: "")
        }
    }
}
