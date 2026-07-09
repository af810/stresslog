package com.nishi.stresslog.ui.analysis

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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import com.nishi.stresslog.domain.FactorRank
import com.nishi.stresslog.ui.common.CalendarHeatmap
import com.nishi.stresslog.ui.common.StressLevel
import com.nishi.stresslog.ui.common.StressLineChart
import com.nishi.stresslog.ui.common.TimeOfDayHeatmap

private val PERIODS = listOf(
    AnalysisPeriod.DAY to "日",
    AnalysisPeriod.WEEK to "週",
    AnalysisPeriod.MONTH to "月"
)

private val RANK_COLORS = mapOf(1 to StressLevel.HIGH.color, 2 to StressLevel.MID.color, 3 to StressLevel.LOW.color)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalysisScreen(viewModel: AnalysisViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    Scaffold { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
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
            }

            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    if (state.period == AnalysisPeriod.MONTH) "月間の傾向" else "ストレスレベルの推移",
                                    style = MaterialTheme.typography.titleSmall
                                )
                                Text(
                                    state.periodLabel,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.outline
                                )
                            }
                            if (state.periodAverage != null) {
                                Surface(
                                    color = state.averageLevel.color.copy(alpha = 0.15f),
                                    contentColor = state.averageLevel.color,
                                    shape = MaterialTheme.shapes.medium
                                ) {
                                    Column(
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text("期間平均", style = MaterialTheme.typography.labelSmall)
                                        Text(
                                            "${state.periodAverage} /100",
                                            style = MaterialTheme.typography.titleLarge,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))

                        if (state.period == AnalysisPeriod.MONTH) {
                            CalendarHeatmap(cells = state.calendarCells)
                        } else {
                            StressLineChart(points = state.linePoints, colorPointsByLevel = true)
                        }
                    }
                }
            }

            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("時間帯別の傾向", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(8.dp))
                        TimeOfDayHeatmap(counts = state.hourlyLevelCounts)
                    }
                }
            }

            if (state.factorRanks.isNotEmpty()) {
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text("よくあるストレス要因（推定）", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(8.dp))
                            state.factorRanks.forEach { rank ->
                                FactorRow(rank)
                                Spacer(Modifier.height(6.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FactorRow(rank: FactorRank) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(
                color = (RANK_COLORS[rank.rank] ?: StressLevel.LOW.color).copy(alpha = 0.2f),
                contentColor = RANK_COLORS[rank.rank] ?: StressLevel.LOW.color,
                shape = MaterialTheme.shapes.small
            ) {
                Text(
                    "${rank.rank}位",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                )
            }
            Spacer(Modifier.height(0.dp))
            Text(rank.tag, modifier = Modifier.padding(start = 10.dp))
        }
        Text("(${rank.count}回)", color = MaterialTheme.colorScheme.outline)
    }
}
