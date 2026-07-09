package com.nishi.stresslog.ui.records

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.local.StressMoment
import com.nishi.stresslog.data.local.TriggerType
import com.nishi.stresslog.data.repository.StressRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import javax.inject.Inject

private const val SPARKLINE_WINDOW_MS = 30 * 60 * 1000L

data class MomentWithSparkline(
    val moment: StressMoment,
    val sparklineScores: List<Int>,
    val causeText: String
)

data class RecordsUiState(
    val selectedDateLabel: String = "",
    val items: List<MomentWithSparkline> = emptyList(),
    val loading: Boolean = true,
    val canGoNext: Boolean = false
)

@HiltViewModel
class RecordsViewModel @Inject constructor(
    private val repository: StressRepository
) : ViewModel() {

    private val dateFormat = SimpleDateFormat("yyyy年M月d日(E)", Locale.JAPAN)
    private var selectedDayStart: Long = startOfDay(System.currentTimeMillis())

    private val _uiState = MutableStateFlow(RecordsUiState())
    val uiState: StateFlow<RecordsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun goToPreviousDay() {
        selectedDayStart = shiftDay(selectedDayStart, -1)
        load()
    }

    fun goToNextDay() {
        if (!canGoNext()) return
        selectedDayStart = shiftDay(selectedDayStart, 1)
        load()
    }

    private fun canGoNext(): Boolean = selectedDayStart < startOfDay(System.currentTimeMillis())

    private fun load() {
        _uiState.value = _uiState.value.copy(loading = true)
        viewModelScope.launch {
            val dayEnd = selectedDayStart + 24 * 60 * 60 * 1000L
            val moments = repository.getMomentsInRange(selectedDayStart, dayEnd)
                .sortedByDescending { it.timestamp }
            val dayReadings = repository.getReadingsInRange(
                selectedDayStart - SPARKLINE_WINDOW_MS,
                dayEnd + SPARKLINE_WINDOW_MS
            )

            val items = moments.map { moment ->
                val nearby = dayReadings.filter {
                    it.timestamp in (moment.timestamp - SPARKLINE_WINDOW_MS)..(moment.timestamp + SPARKLINE_WINDOW_MS)
                }.map { it.stressScore }
                MomentWithSparkline(
                    moment = moment,
                    sparklineScores = nearby,
                    causeText = inferCause(moment)
                )
            }

            _uiState.value = RecordsUiState(
                selectedDateLabel = dateFormat.format(java.util.Date(selectedDayStart)),
                items = items,
                loading = false,
                canGoNext = canGoNext()
            )
        }
    }

    private fun inferCause(moment: StressMoment): String {
        if (moment.trigger == TriggerType.MANUAL && !moment.note.isNullOrBlank()) {
            return moment.note
        }
        if (moment.tags.isNotEmpty()) {
            return "「${moment.tags.joinToString("・")}」が影響した可能性があります"
        }
        val hour = Calendar.getInstance().apply { timeInMillis = moment.timestamp }.get(Calendar.HOUR_OF_DAY)
        return when (hour) {
            in 6..8 -> "睡眠不足による負荷の可能性があります"
            in 9..11 -> "午前中の業務負荷による上昇の可能性があります"
            in 12..13 -> "昼の予定によるプレッシャーの可能性があります"
            in 14..17 -> "長時間の作業による負荷の可能性があります"
            in 18..21 -> "夕方の疲労蓄積による可能性があります"
            else -> "生活リズムの乱れによる可能性があります"
        }
    }

    private fun startOfDay(timestamp: Long): Long =
        Calendar.getInstance().apply {
            timeInMillis = timestamp
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

    private fun shiftDay(dayStart: Long, delta: Int): Long =
        Calendar.getInstance().apply {
            timeInMillis = dayStart
            add(Calendar.DAY_OF_YEAR, delta)
        }.timeInMillis
}
