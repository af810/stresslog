package com.nishi.stresslog.ui.moments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.repository.StressRepository
import com.nishi.stresslog.domain.ContextAnalyzer
import com.nishi.stresslog.domain.StressInsight
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject
import com.nishi.stresslog.data.local.StressMoment

data class MomentsUiState(
    val moments: List<StressMoment> = emptyList(),
    val insights: List<StressInsight> = emptyList()
)

@HiltViewModel
class MomentsViewModel @Inject constructor(
    repository: StressRepository,
    contextAnalyzer: ContextAnalyzer
) : ViewModel() {

    val uiState: StateFlow<MomentsUiState> = repository.observeMoments()
        .map { moments ->
            MomentsUiState(
                moments = moments,
                insights = contextAnalyzer.analyze(moments)
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), MomentsUiState())
}
