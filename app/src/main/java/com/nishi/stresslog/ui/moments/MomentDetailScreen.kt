package com.nishi.stresslog.ui.moments

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nishi.stresslog.ui.common.StressLineChart
import com.nishi.stresslog.ui.theme.stressScoreColor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val QUICK_TAGS = listOf("仕事", "会議", "移動", "家庭", "人間関係", "睡眠不足", "その他")
private val dateFormat = SimpleDateFormat("yyyy/M/d(E) HH:mm", Locale.JAPAN)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MomentDetailScreen(
    onBack: () -> Unit,
    viewModel: MomentDetailViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("記録の詳細") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "戻る")
                    }
                }
            )
        }
    ) { padding ->
        val moment = state.moment
        if (moment == null) {
            Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                Text(if (state.loading) "読み込み中…" else "記録が見つかりませんでした")
            }
            return@Scaffold
        }

        var note by remember(moment.id) { mutableStateOf(moment.note ?: "") }
        var tags by remember(moment.id) { mutableStateOf(moment.tags.toSet()) }

        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)
        ) {
            Text(dateFormat.format(Date(moment.timestamp)), style = MaterialTheme.typography.titleMedium)
            Text(
                "ストレススコア: ${moment.stressScore}",
                style = MaterialTheme.typography.titleLarge,
                color = stressScoreColor(moment.stressScore)
            )

            Spacer(Modifier.height(16.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("前後±30分の推移", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(8.dp))
                    StressLineChart(
                        points = state.surroundingReadings.map { it.timestamp to it.stressScore }
                    )
                }
            }

            if (!moment.appliedSuggestion.isNullOrBlank()) {
                Spacer(Modifier.height(16.dp))
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("提案した解消法", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(4.dp))
                        Text(moment.appliedSuggestion)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("状況タグ", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QUICK_TAGS.forEach { tag ->
                    val selected = tag in tags
                    FilterChip(
                        selected = selected,
                        onClick = { tags = if (selected) tags - tag else tags + tag },
                        label = { Text(tag) }
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text("メモ（何があったか）") },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { viewModel.updateNoteAndTags(note, tags.toList()) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("保存")
            }
        }
    }
}
