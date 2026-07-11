package com.nishi.stresslog.data.ble

/** 圧力センサーから受信した1サンプル */
data class PressureSample(
    val timestamp: Long,
    val rawAdc: Int,
    val forceKg: Float?
)

/** 圧力センサーBLEデバイスとの接続状態 */
sealed interface PressureConnectionState {
    data object Idle : PressureConnectionState
    data object Scanning : PressureConnectionState
    data object Connecting : PressureConnectionState
    data class Connected(val deviceName: String?) : PressureConnectionState
    data object Disconnected : PressureConnectionState
    data class Error(val message: String) : PressureConnectionState
}
