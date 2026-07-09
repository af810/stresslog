package com.nishi.stresslog.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.local.StressReading
import com.nishi.stresslog.data.repository.StressRepository
import com.nishi.stresslog.domain.ContextAnalyzer
import com.nishi.stresslog.domain.SuggestionEngine
import com.nishi.stresslog.ui.common.StressLevel
import com.nishi.stresslog.ui.common.TimelineDot
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

data class HomeUiState(
    val currentScore: Int? = null,
    val lastUpdated: Long? = null,
    val level: StressLevel = StressLevel.LOW,
    val stateMessage: String = "",
    val suggestion: String = "",
    val todayDots: List<TimelineDot> = emptyList(),
    val todayEventCount: Int = 0,
    val latestInsight: String? = null
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: StressRepository,
    private val suggestionEngine: SuggestionEngine,
    private val contextAnalyzer: ContextAnalyzer
) : ViewModel() {

    val uiState: StateFlow<HomeUiState> = combine(
        repository.observeLatestReading(),
        repository.observeMoments()
    ) { latest, moments ->
        val score = latest?.stressScore
        val level = StressLevel.of(score ?: 0)
        val todayStart = startOfToday()
        val todayMoments = moments.filter { it.timestamp >= todayStart }

        HomeUiState(
            currentScore = score,
            lastUpdated = latest?.timestamp,
            level = level,
            stateMessage = stateMessageFor(level),
            suggestion = if (score != null) suggestionEngine.suggest(score, latest!!.timestamp) else "",
            todayDots = todayMoments.map {
                TimelineDot(hourFractionOf(it.timestamp), StressLevel.of(it.stressScore))
            },
            todayEventCount = todayMoments.size,
            latestInsight = contextAnalyzer.analyze(moments).firstOrNull()?.message
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HomeUiState())

    fun recordManualMoment(note: String?, tags: List<String>) {
        viewModelScope.launch {
            val score = uiState.value.currentScore ?: 50
            repository.recordManualMoment(score, note?.ifBlank { null }, tags, currentHr = null)
        }
    }

    private fun stateMessageFor(level: StressLevel): String = when (level) {
        StressLevel.LOW -> "落ち着いています"
        StressLevel.MID -> "やや落ち着いています"
        StressLevel.HIGH -> "ストレスが高まっています"
    }

    private fun startOfToday(): Long =
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    private fun hourFractionOf(timestamp: Long): Float {
        val cal = Calendar.getInstance().apply { timeInMillis = timestamp }
        return cal.get(Calendar.HOUR_OF_DAY) + cal.get(Calendar.MINUTE) / 60f
    }
}
