package com.nishi.stresslog.data.ble

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/**
 * 圧力センサーBLEの仕様。UUID・バイトフォーマットの唯一の定義場所。
 * 変更する場合は docs/BLE_PRESSURE.md および
 * tools/ble/fake_pressure_peripheral.py, firmware/esp32_pressure/esp32_pressure.ino
 * も同時に更新すること。
 */
object PressureBleSpec {
    val SERVICE_UUID: UUID = UUID.fromString("f1a70001-8b2c-4e5d-9a6f-0c3b7d2e5a10")
    val CHARACTERISTIC_UUID: UUID = UUID.fromString("f1a70002-8b2c-4e5d-9a6f-0c3b7d2e5a10")
    val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    const val DEVICE_NAME = "StressLog-PS"

    /** [rawAdc: uint16 LE][forceKg: float32 LE] の6バイト。壊れた値はnullを返す */
    fun parse(value: ByteArray?): PressureSample? {
        if (value == null || value.size < 6) return null
        val buffer = ByteBuffer.wrap(value).order(ByteOrder.LITTLE_ENDIAN)
        val rawAdc = buffer.short.toInt() and 0xFFFF
        val forceKg = buffer.float
        return PressureSample(
            timestamp = System.currentTimeMillis(),
            rawAdc = rawAdc,
            forceKg = if (forceKg.isNaN()) null else forceKg
        )
    }
}
