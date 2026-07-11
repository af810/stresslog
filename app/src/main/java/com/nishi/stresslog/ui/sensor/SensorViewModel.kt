package com.nishi.stresslog.ui.sensor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nishi.stresslog.data.ble.PressureBleClient
import com.nishi.stresslog.data.ble.PressureConnectionState
import com.nishi.stresslog.data.ble.PressureSample
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.scan
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

private const val MAX_HISTORY = 100

data class SensorUiState(
    val connectionState: PressureConnectionState = PressureConnectionState.Idle,
    val latestSample: PressureSample? = null,
    val recentRawAdc: List<Int> = emptyList()
)

@HiltViewModel
class SensorViewModel @Inject constructor(
    private val pressureBleClient: PressureBleClient
) : ViewModel() {

    private val recentSamples = pressureBleClient.samples
        .scan(emptyList<PressureSample>()) { acc, sample -> (acc + sample).takeLast(MAX_HISTORY) }

    val uiState: StateFlow<SensorUiState> = combine(
        pressureBleClient.connectionState,
        recentSamples
    ) { connectionState, recent ->
        SensorUiState(
            connectionState = connectionState,
            latestSample = recent.lastOrNull(),
            recentRawAdc = recent.map { it.rawAdc }
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SensorUiState())

    fun startScan() = pressureBleClient.startScan()

    fun disconnect() = pressureBleClient.disconnect()

    override fun onCleared() {
        pressureBleClient.disconnect()
    }
}
