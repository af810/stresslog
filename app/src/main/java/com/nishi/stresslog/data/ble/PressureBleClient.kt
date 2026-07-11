package com.nishi.stresslog.data.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 圧力センサー(ESP32 + FSR、docs/BLE_PRESSURE.md準拠)のBLEスキャン・接続・notify購読を担う。
 * BLE権限(BLUETOOTH_SCAN/CONNECT)の実行時チェック・要求はUI層(SensorScreen)の責務とし、
 * ここでは権限がすでに許可されている前提で呼ばれる。
 */
@Singleton
class PressureBleClient @Inject constructor(
    @ApplicationContext private val context: Context,
    private val bluetoothAdapter: BluetoothAdapter?
) {
    private val _connectionState = MutableStateFlow<PressureConnectionState>(PressureConnectionState.Idle)
    val connectionState: StateFlow<PressureConnectionState> = _connectionState.asStateFlow()

    private val _samples = MutableSharedFlow<PressureSample>(
        replay = 1,
        extraBufferCapacity = 8
    )
    val samples: SharedFlow<PressureSample> = _samples.asSharedFlow()

    private var gatt: BluetoothGatt? = null

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            stopScan()
            connect(result)
        }

        override fun onScanFailed(errorCode: Int) {
            _connectionState.value = PressureConnectionState.Error("スキャン失敗 (code=$errorCode)")
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(bluetoothGatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    _connectionState.value = PressureConnectionState.Connected(bluetoothGatt.device.name)
                    bluetoothGatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    _connectionState.value = PressureConnectionState.Disconnected
                    bluetoothGatt.close()
                    gatt = null
                }
            }
        }

        override fun onServicesDiscovered(bluetoothGatt: BluetoothGatt, status: Int) {
            val characteristic = bluetoothGatt
                .getService(PressureBleSpec.SERVICE_UUID)
                ?.getCharacteristic(PressureBleSpec.CHARACTERISTIC_UUID)

            if (characteristic == null) {
                _connectionState.value = PressureConnectionState.Error("圧力センサーの特性が見つかりません")
                return
            }
            enableNotification(bluetoothGatt, characteristic)
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicChanged(
            bluetoothGatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            PressureBleSpec.parse(characteristic.value)?.let { sample ->
                _samples.tryEmit(sample)
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun startScan() {
        val adapter = bluetoothAdapter
        if (adapter == null || !adapter.isEnabled) {
            _connectionState.value = PressureConnectionState.Error("Bluetoothが無効です")
            return
        }

        _connectionState.value = PressureConnectionState.Scanning
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(PressureBleSpec.SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        adapter.bluetoothLeScanner?.startScan(listOf(filter), settings, scanCallback)
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
    }

    @SuppressLint("MissingPermission")
    private fun connect(result: ScanResult) {
        stopScan()
        _connectionState.value = PressureConnectionState.Connecting
        gatt = result.device.connectGatt(context, false, gattCallback)
    }

    @SuppressLint("MissingPermission")
    private fun enableNotification(bluetoothGatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
        bluetoothGatt.setCharacteristicNotification(characteristic, true)
        val descriptor = characteristic.getDescriptor(PressureBleSpec.CCCD_UUID) ?: return
        @Suppress("DEPRECATION")
        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        @Suppress("DEPRECATION")
        bluetoothGatt.writeDescriptor(descriptor)
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        stopScan()
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        _connectionState.value = PressureConnectionState.Idle
    }
}
