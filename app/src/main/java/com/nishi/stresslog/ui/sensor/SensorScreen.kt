package com.nishi.stresslog.ui.sensor

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.nishi.stresslog.data.ble.PressureConnectionState
import java.util.Locale

private fun requiredBlePermissions(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

private fun hasBlePermissions(context: Context, permissions: Array<String>): Boolean =
    permissions.all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SensorScreen(
    viewModel: SensorViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val permissions = remember { requiredBlePermissions() }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        if (results.values.all { it }) viewModel.startScan()
    }

    Scaffold(topBar = { TopAppBar(title = { Text("センサー") }) }) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            ConnectionStatusRow(uiState.connectionState)

            Card {
                Column(Modifier.padding(16.dp)) {
                    Text("圧力値", style = MaterialTheme.typography.titleSmall)
                    val sample = uiState.latestSample
                    Text(
                        text = sample?.rawAdc?.toString() ?: "--",
                        style = MaterialTheme.typography.displayMedium
                    )
                    Text(
                        text = sample?.forceKg?.let { String.format(Locale.JAPAN, "%.2f kg", it) }
                            ?: "未校正",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }

            Card {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        "波形（直近${uiState.recentRawAdc.size}件）",
                        style = MaterialTheme.typography.titleSmall
                    )
                    PressureWaveform(values = uiState.recentRawAdc)
                }
            }

            val isBusy = uiState.connectionState is PressureConnectionState.Scanning ||
                uiState.connectionState is PressureConnectionState.Connecting
            val isConnected = uiState.connectionState is PressureConnectionState.Connected

            Button(
                onClick = {
                    when {
                        isConnected -> viewModel.disconnect()
                        hasBlePermissions(context, permissions) -> viewModel.startScan()
                        else -> permissionLauncher.launch(permissions)
                    }
                },
                enabled = !isBusy,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isConnected) "切断" else "デバイスをスキャン")
            }
        }
    }
}

@Composable
private fun ConnectionStatusRow(state: PressureConnectionState) {
    val (color, label) = when (state) {
        is PressureConnectionState.Idle -> MaterialTheme.colorScheme.outline to "未接続"
        is PressureConnectionState.Scanning -> Color(0xFFFFA726) to "スキャン中…"
        is PressureConnectionState.Connecting -> Color(0xFFFFA726) to "接続中…"
        is PressureConnectionState.Connected ->
            Color(0xFF4CAF50) to "接続済み（${state.deviceName ?: "デバイス"}）"
        is PressureConnectionState.Disconnected -> MaterialTheme.colorScheme.outline to "切断されました"
        is PressureConnectionState.Error -> Color(0xFFE53935) to state.message
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Canvas(modifier = Modifier.size(12.dp)) {
            drawCircle(color = color)
        }
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}
