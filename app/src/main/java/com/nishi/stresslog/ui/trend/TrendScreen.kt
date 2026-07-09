package com.nishi.stresslog.ui.trend

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nishi.stresslog.ui.common.StressBarChart
import com.nishi.stresslog.ui.common.StressLineChart

private val PERIODS = listOf(
    TrendPeriod.DAY to "日",
    TrendPeriod.WEEK to "週",
    TrendPeriod.MONTH to "月"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrendScreen(viewModel: TrendViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("推移") }) }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)
        ) {
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                PERIODS.forEachIndexed { index, (period, label) ->
                    SegmentedButton(
                        selected = state.period == period,
                        onClick = { viewModel.selectPeriod(period) },
                        shape = SegmentedButtonDefaults.itemShape(index = index, count = PERIODS.size)
                    ) {
                        Text(label)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    when (state.period) {
                        TrendPeriod.DAY -> {
                            Text("本日のストレス推移", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(8.dp))
                            StressLineChart(
                                points = state.dayReadings.map { it.timestamp to it.stressScore }
                            )
                        }
                        TrendPeriod.WEEK -> {
                            Text("過去7日間（平均・最大）", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(8.dp))
                            StressBarChart(entries = state.dailyAggregates)
                        }
                        TrendPeriod.MONTH -> {
                            Text("過去30日間（平均・最大）", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(8.dp))
                            StressBarChart(entries = state.dailyAggregates)
                        }
                    }
                }
            }
        }
    }
}
