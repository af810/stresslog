package com.nishi.stresslog.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nishi.stresslog.ui.common.StressGauge
import com.nishi.stresslog.ui.common.StressLineChart
import com.nishi.stresslog.ui.common.stressStateLabel
import com.nishi.stresslog.ui.theme.stressScoreColor

private val QUICK_TAGS = listOf("仕事", "会議", "移動", "家庭", "人間関係", "睡眠不足", "その他")

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DashboardScreen(
    onOpenSettings: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    var showRecordDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("StressLog") },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Settings, contentDescription = "設定")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
                ) {
                    val score = state.currentScore
                    if (score != null) {
                        StressGauge(score = score)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = stressStateLabel(score),
                            style = MaterialTheme.typography.titleMedium,
                            color = stressScoreColor(score)
                        )
                    } else {
                        Text("データを取得中です…（学習中）", textAlign = TextAlign.Center)
                    }
                }
            }

            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("直近24時間", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(8.dp))
                        StressLineChart(
                            points = state.recentReadings.map { it.timestamp to it.stressScore },
                            thresholdScore = state.threshold
                        )
                    }
                }
            }

            if (state.suggestion.isNotBlank()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text("おすすめの解消法", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(4.dp))
                            Text(state.suggestion)
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = { showRecordDialog = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("今ストレスを感じた")
                    }
                }
            }

            item {
                OutlinedButton(onClick = { viewModel.sampleNow() }, modifier = Modifier.fillMaxWidth()) {
                    Text("今すぐ計測（デバッグ用）")
                }
            }
        }
    }

    if (showRecordDialog) {
        ManualMomentDialog(
            onDismiss = { showRecordDialog = false },
            onSave = { note, tags ->
                viewModel.recordManualMoment(note, tags)
                showRecordDialog = false
            }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ManualMomentDialog(
    onDismiss: () -> Unit,
    onSave: (note: String, tags: List<String>) -> Unit
) {
    var note by remember { mutableStateOf("") }
    val selectedTags = remember { mutableStateOf(setOf<String>()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("ストレスの瞬間を記録") },
        text = {
            Column {
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("何があったか（任意）") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    QUICK_TAGS.forEach { tag ->
                        val selected = tag in selectedTags.value
                        FilterChip(
                            selected = selected,
                            onClick = {
                                selectedTags.value = if (selected) {
                                    selectedTags.value - tag
                                } else {
                                    selectedTags.value + tag
                                }
                            },
                            label = { Text(tag) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(note, selectedTags.value.toList()) }) {
                Text("保存")
            }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) {
                Text("キャンセル")
            }
        }
    )
}
