package com.nishi.stresslog.ui.trend

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.local.DailyStressAggregate
import com.nishi.stresslog.data.local.StressReading
import com.nishi.stresslog.data.repository.StressRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

enum class TrendPeriod { DAY, WEEK, MONTH }

data class TrendUiState(
    val period: TrendPeriod = TrendPeriod.DAY,
    val dayReadings: List<StressReading> = emptyList(),
    val dailyAggregates: List<DailyStressAggregate> = emptyList(),
    val loading: Boolean = true
)

@HiltViewModel
class TrendViewModel @Inject constructor(
    private val repository: StressRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TrendUiState())
    val uiState: StateFlow<TrendUiState> = _uiState.asStateFlow()

    init {
        selectPeriod(TrendPeriod.DAY)
    }

    fun selectPeriod(period: TrendPeriod) {
        _uiState.value = _uiState.value.copy(period = period, loading = true)
        viewModelScope.launch {
            when (period) {
                TrendPeriod.DAY -> {
                    val readings = repository.getReadingsInRange(startOfToday(), Long.MAX_VALUE)
                    _uiState.value = _uiState.value.copy(dayReadings = readings, loading = false)
                }
                TrendPeriod.WEEK -> {
                    val aggregates = repository.getDailyAggregates(daysAgo(7), Long.MAX_VALUE)
                    _uiState.value = _uiState.value.copy(dailyAggregates = aggregates, loading = false)
                }
                TrendPeriod.MONTH -> {
                    val aggregates = repository.getDailyAggregates(daysAgo(30), Long.MAX_VALUE)
                    _uiState.value = _uiState.value.copy(dailyAggregates = aggregates, loading = false)
                }
            }
        }
    }

    private fun startOfToday(): Long =
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    private fun daysAgo(days: Int): Long =
        Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, -days)
        }.timeInMillis
}
