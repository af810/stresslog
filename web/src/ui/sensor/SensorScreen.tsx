import { useSyncExternalStore } from 'react';
import {
  bluetoothSupported,
  connectPressureSensor,
  disconnectPressureSensor,
  getBleSnapshot,
  subscribeBle,
  type PressureConnectionState,
} from '../../data/ble/pressureBleClient';
import { PressureWaveform } from './PressureWaveform';

function statusView(state: PressureConnectionState): { color: string; label: string } {
  switch (state.status) {
    case 'idle':
      return { color: '#79747e', label: '未接続' };
    case 'unsupported':
      return { color: '#E53935', label: 'このブラウザはWeb Bluetooth非対応です' };
    case 'choosing':
      return { color: '#FFA726', label: 'デバイス選択中…' };
    case 'connecting':
      return { color: '#FFA726', label: '接続中…' };
    case 'connected':
      return { color: '#4CAF50', label: `接続済み（${state.deviceName ?? 'デバイス'}）` };
    case 'disconnected':
      return { color: '#79747e', label: '切断されました' };
    case 'error':
      return { color: '#E53935', label: state.message };
  }
}

export function SensorScreen() {
  const snapshot = useSyncExternalStore(subscribeBle, getBleSnapshot);
  const { connectionState, latestSample, recentRawAdc } = snapshot;

  const supported = bluetoothSupported();
  const isBusy =
    connectionState.status === 'choosing' || connectionState.status === 'connecting';
  const isConnected = connectionState.status === 'connected';
  const status = statusView(connectionState);

  return (
    <div className="screen sensor">
      <h2 className="section-title">センサー</h2>

      {!supported && (
        <div className="card warn-card">
          このブラウザは Web Bluetooth に対応していません。
          デスクトップ版の Chrome または Edge をご利用ください（Firefox / Safari は非対応）。
        </div>
      )}

      <div className="status-row">
        <span className="status-dot" style={{ background: status.color }} />
        <span>{status.label}</span>
      </div>

      <div className="card">
        <div className="card-title">圧力値</div>
        <div className="pressure-value">{latestSample ? latestSample.rawAdc : '--'}</div>
        <div className="muted">
          {latestSample?.forceKg != null ? `${latestSample.forceKg.toFixed(2)} kg` : '未校正'}
        </div>
      </div>

      <div className="card waveform-card">
        <div className="card-title">波形（直近{recentRawAdc.length}件）</div>
        <PressureWaveform values={recentRawAdc} />
      </div>

      <button
        className="btn full"
        disabled={isBusy || !supported}
        onClick={() => {
          if (isConnected) disconnectPressureSensor();
          else void connectPressureSensor();
        }}
      >
        {isConnected ? '切断' : 'デバイスに接続'}
      </button>

      <p className="muted footnote">
        「デバイスに接続」を押すとブラウザのデバイス選択ダイアログが開きます。
        ESP32（StressLog-PS）の電源が入っていることを確認してください。
      </p>
    </div>
  );
}
