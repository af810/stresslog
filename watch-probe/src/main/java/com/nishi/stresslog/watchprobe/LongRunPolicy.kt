package com.nishi.stresslog.watchprobe

internal object LongRunPolicy {
    const val DEFAULT_STOP_PERCENT = 20
    fun threshold(raw: Int) = if (raw in listOf(10, 20, 30)) raw else DEFAULT_STOP_PERCENT
    fun lowBattery(percent: Int, stopPercent: Int) = percent in 0..100 && percent <= threshold(stopPercent)
    fun retryDelay(previous: Long) = (previous * 2).coerceIn(6000L, 60000L)
}
