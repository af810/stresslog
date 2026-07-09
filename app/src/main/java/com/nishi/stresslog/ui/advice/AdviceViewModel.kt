package com.nishi.stresslog.ui.advice

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.local.StressMoment
import com.nishi.stresslog.data.repository.StressRepository
import com.nishi.stresslog.domain.ContextAnalyzer
import com.nishi.stresslog.domain.StressInsight
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class AdviceUiState(
    val insights: List<StressInsight> = emptyList(),
    val history: List<StressMoment> = emptyList()
)

@HiltViewModel
class AdviceViewModel @Inject constructor(
    repository: StressRepository,
    contextAnalyzer: ContextAnalyzer
) : ViewModel() {

    val uiState: StateFlow<AdviceUiState> = repository.observeMoments()
        .map { moments ->
            AdviceUiState(
                insights = contextAnalyzer.analyze(moments),
                history = moments.filter { !it.appliedSuggestion.isNullOrBlank() }
                    .sortedByDescending { it.timestamp }
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), AdviceUiState())
}
