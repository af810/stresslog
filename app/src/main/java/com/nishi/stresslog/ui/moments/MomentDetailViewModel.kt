package com.nishi.stresslog.ui.moments

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.local.StressMoment
import com.nishi.stresslog.data.local.StressReading
import com.nishi.stresslog.data.repository.StressRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val SURROUNDING_WINDOW_MS = 30 * 60 * 1000L

data class MomentDetailUiState(
    val moment: StressMoment? = null,
    val surroundingReadings: List<StressReading> = emptyList(),
    val loading: Boolean = true
)

@HiltViewModel
class MomentDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: StressRepository
) : ViewModel() {

    private val momentId: Long = checkNotNull(savedStateHandle["momentId"])

    private val _uiState = MutableStateFlow(MomentDetailUiState())
    val uiState: StateFlow<MomentDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            val moment = repository.getMoment(momentId)
            val readings = if (moment != null) {
                repository.getReadingsInRange(
                    moment.timestamp - SURROUNDING_WINDOW_MS,
                    moment.timestamp + SURROUNDING_WINDOW_MS
                )
            } else emptyList()
            _uiState.value = MomentDetailUiState(moment = moment, surroundingReadings = readings, loading = false)
        }
    }

    fun updateNoteAndTags(note: String, tags: List<String>) {
        val current = _uiState.value.moment ?: return
        val updated = current.copy(note = note.ifBlank { null }, tags = tags)
        viewModelScope.launch {
            repository.updateMoment(updated)
            _uiState.value = _uiState.value.copy(moment = updated)
        }
    }
}
