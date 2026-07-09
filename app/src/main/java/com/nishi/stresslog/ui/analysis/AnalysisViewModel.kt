package com.nishi.stresslog.ui.analysis

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.repository.StressRepository
import com.nishi.stresslog.domain.ContextAnalyzer
import com.nishi.stresslog.domain.FactorRank
import com.nishi.stresslog.ui.common.CalendarDayCell
import com.nishi.stresslog.ui.common.HourlyLevelCount
import com.nishi.stresslog.ui.common.StressLevel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import javax.inject.Inject

enum class AnalysisPeriod { DAY, WEEK, MONTH }

data class AnalysisUiState(
    val period: AnalysisPeriod = AnalysisPeriod.WEEK,
    val periodLabel: String = "",
    val periodAverage: Int? = null,
    val averageLevel: StressLevel = StressLevel.LOW,
    val linePoints: List<Pair<Long, Int>> = emptyList(),
    val calendarCells: List<CalendarDayCell> = emptyList(),
    val hourlyLevelCounts: List<HourlyLevelCount> = emptyList(),
    val factorRanks: List<FactorRank> = emptyList(),
    val loading: Boolean = true
)

@HiltViewModel
class AnalysisViewModel @Inject constructor(
    private val repository: StressRepository,
    private val contextAnalyzer: ContextAnalyzer
) : ViewModel() {

    private val shortDate = SimpleDateFormat("M/d(E)", Locale.JAPAN)
    private val _uiState = MutableStateFlow(AnalysisUiState())
    val uiState: StateFlow<AnalysisUiState> = _uiState.asStateFlow()

    init {
        selectPeriod(AnalysisPeriod.WEEK)
    }

    fun selectPeriod(period: AnalysisPeriod) {
        _uiState.value = _uiState.value.copy(period = period, loading = true)
        viewModelScope.launch {
            val now = System.currentTimeMillis()
            val from = when (period) {
                AnalysisPeriod.DAY -> startOfToday()
                AnalysisPeriod.WEEK -> daysAgo(7)
                AnalysisPeriod.MONTH -> daysAgo(30)
            }

            val readings = repository.getReadingsInRange(from, Long.MAX_VALUE)
            val moments = repository.getMomentsInRange(from, Long.MAX_VALUE)
            val hourlyLevelCounts = buildHourlyLevelCounts(readings.map { it.timestamp to it.stressScore })
            val factorRanks = contextAnalyzer.rankFactors(moments)

            val periodAvg = if (readings.isNotEmpty()) readings.map { it.stressScore }.average().toInt() else null
            val avgLevel = StressLevel.of(periodAvg ?: 0)

            val linePoints: List<Pair<Long, Int>>
            val calendarCells: List<CalendarDayCell>
            val periodLabel: String

            when (period) {
                AnalysisPeriod.DAY -> {
                    linePoints = readings.map { it.timestamp to it.stressScore }
                    calendarCells = emptyList()
                    periodLabel = "本日"
                }
                AnalysisPeriod.WEEK -> {
                    val aggregates = repository.getDailyAggregates(from, Long.MAX_VALUE)
                    linePoints = aggregates.map { it.dayStart to it.avgScore.toInt() }
                    calendarCells = emptyList()
                    periodLabel = "${shortDate.format(java.util.Date(from))} 〜 ${shortDate.format(java.util.Date(now))}"
                }
                AnalysisPeriod.MONTH -> {
                    val aggregates = repository.getDailyAggregates(from, Long.MAX_VALUE)
                    val byDay = aggregates.associateBy { it.dayStart }
                    linePoints = emptyList()
                    calendarCells = buildMonthCells(from, now, byDay)
                    periodLabel = "過去30日間"
                }
            }

            _uiState.value = AnalysisUiState(
                period = period,
                periodLabel = periodLabel,
                periodAverage = periodAvg,
                averageLevel = avgLevel,
                linePoints = linePoints,
                calendarCells = calendarCells,
                hourlyLevelCounts = hourlyLevelCounts,
                factorRanks = factorRanks,
                loading = false
            )
        }
    }

    private fun buildHourlyLevelCounts(scoresByTime: List<Pair<Long, Int>>): List<HourlyLevelCount> {
        val counts = mutableMapOf<Pair<Int, StressLevel>, Int>()
        scoresByTime.forEach { (timestamp, score) ->
            val hour = Calendar.getInstance().apply { timeInMillis = timestamp }.get(Calendar.HOUR_OF_DAY)
            val bucket = hour / 2
            val level = StressLevel.of(score)
            val key = bucket to level
            counts[key] = (counts[key] ?: 0) + 1
        }
        return counts.map { (key, count) -> HourlyLevelCount(key.first, key.second, count) }
    }

    private fun buildMonthCells(
        from: Long,
        to: Long,
        byDay: Map<Long, com.nishi.stresslog.data.local.DailyStressAggregate>
    ): List<CalendarDayCell> {
        val cells = mutableListOf<CalendarDayCell>()
        val cal = Calendar.getInstance().apply {
            timeInMillis = from
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        val endCal = Calendar.getInstance().apply { timeInMillis = to }
        while (!cal.after(endCal)) {
            val dayStart = cal.timeInMillis
            // dayStart は SQLite 側の (timestamp/86400000)*86400000 (UTC丸め) と厳密には一致しないため、
            // 近傍のキーを許容範囲で探す
            val match = byDay.entries.find { kotlin.math.abs(it.key - dayStart) < 26 * 60 * 60 * 1000L }
            cells.add(
                CalendarDayCell(
                    dayOfMonth = cal.get(Calendar.DAY_OF_MONTH),
                    dayStart = dayStart,
                    avgScore = match?.value?.avgScore
                )
            )
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }
        return cells
    }

    private fun startOfToday(): Long =
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    private fun daysAgo(days: Int): Long =
        Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -days) }.timeInMillis
}
