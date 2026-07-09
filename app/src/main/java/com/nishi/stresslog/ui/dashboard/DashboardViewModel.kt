package com.nishi.stresslog.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.local.StressReading
import com.nishi.stresslog.data.repository.SettingsRepository
import com.nishi.stresslog.data.repository.StressRepository
import com.nishi.stresslog.domain.SuggestionEngine
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val currentScore: Int? = null,
    val recentReadings: List<StressReading> = emptyList(),
    val suggestion: String = "",
    val threshold: Int = 70,
    val isRecording: Boolean = false
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val repository: StressRepository,
    private val settingsRepository: SettingsRepository,
    private val suggestionEngine: SuggestionEngine
) : ViewModel() {

    private val windowStart = System.currentTimeMillis() - 24 * 60 * 60 * 1000L

    private val latest = repository.observeLatestReading()
    private val recent = repository.observeReadingsInRange(windowStart, Long.MAX_VALUE)

    val uiState: StateFlow<DashboardUiState> = combine(
        latest, recent, settingsRepository.settings
    ) { latestReading, readings, settings ->
        val score = latestReading?.stressScore
        val trendRising = isRecentlyRising(readings)
        DashboardUiState(
            currentScore = score,
            recentReadings = readings,
            suggestion = if (score != null) suggestionEngine.suggest(score, latestReading!!.timestamp, trendRising) else "",
            threshold = settings.stressThreshold
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DashboardUiState())

    private var manualSaving = false

    fun sampleNow() {
        viewModelScope.launch {
            repository.sampleOnce()
        }
    }

    fun recordManualMoment(note: String?, tags: List<String>) {
        if (manualSaving) return
        manualSaving = true
        viewModelScope.launch {
            val score = uiState.value.currentScore ?: 50
            repository.recordManualMoment(score, note?.ifBlank { null }, tags, currentHr = null)
            manualSaving = false
        }
    }

    private fun isRecentlyRising(readings: List<StressReading>): Boolean {
        if (readings.size < 4) return false
        val recentAvg = readings.takeLast(3).map { it.stressScore }.average()
        val earlierAvg = readings.dropLast(3).takeLast(3).map { it.stressScore }.average()
        return recentAvg - earlierAvg > 10
    }
}
