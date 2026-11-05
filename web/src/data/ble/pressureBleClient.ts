/// <reference types="web-bluetooth" />
import {
  DEVICE_NAME,
  LED_CHARACTERISTIC_UUID,
  parsePressureSample,
  PRESSURE_CHARACTERISTIC_UUID,
  PRESSURE_SERVICE_UUID,
  type PressureSample,
} from './pressureBleSpec';

// Android版 data/ble/PressureBleClient.kt の移植。
// Webではスキャンの代わりにブラウザのデバイス選択ダイアログ（chooser）が出るため、
// Scanning は Choosing に読み替えている

export type PressureConnectionState =
  | { status: 'idle' }
  | { status: 'unsupported' }
  | { status: 'choosing' }
  | { status: 'connecting'; deviceName: string | null }
  | { status: 'connected'; deviceName: string | null }
  | { status: 'disconnected' }
  | { status: 'error'; message: string };

const MAX_RECENT_SAMPLES = 100;

interface ClientSnapshot {
  connectionState: PressureConnectionState;
  latestSample: PressureSample | null;
  /** 直近の rawAdc（波形表示用リングバッファ、最大100件） */
  recentRawAdc: number[];
}

let snapshot: ClientSnapshot = {
  connectionState: { status: 'idle' },
  latestSample: null,
  recentRawAdc: [],
};

const listeners = new Set<() => void>();

function emit(partial: Partial<ClientSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  listeners.forEach((l) => l());
}

export function getBleSnapshot(): ClientSnapshot {
  return snapshot;
}

export function subscribeBle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

let device: BluetoothDevice | null = null;
let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
let ledCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

function onCharacteristicValueChanged(event: Event) {
  const target = event.target as BluetoothRemoteGATTCharacteristic;
  const sample = parsePressureSample(target.value ?? undefined);
  if (!sample) return;
  const recent = [...snapshot.recentRawAdc, sample.rawAdc];
  if (recent.length > MAX_RECENT_SAMPLES) recent.splice(0, recent.length - MAX_RECENT_SAMPLES);
  emit({ latestSample: sample, recentRawAdc: recent });
}

function onGattDisconnected() {
  cleanup();
  emit({ connectionState: { status: 'disconnected' } });
}

function cleanup() {
  if (characteristic) {
    characteristic.removeEventListener('characteristicvaluechanged', onCharacteristicValueChanged);
    characteristic = null;
  }
  ledCharacteristic = null;
  if (device) {
    device.removeEventListener('gattserverdisconnected', onGattDisconnected);
  }
}

/** デバイス選択ダイアログを出して接続し、notify購読を開始する */
export async function connectPressureSensor(): Promise<void> {
  if (!bluetoothSupported()) {
    emit({ connectionState: { status: 'unsupported' } });
    return;
  }

  emit({ connectionState: { status: 'choosing' } });
  try {
    const chosen = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: DEVICE_NAME }],
      // 128bitカスタムUUIDはここに列挙しないと getPrimaryService できない
      optionalServices: [PRESSURE_SERVICE_UUID],
    });

    device = chosen;
    emit({ connectionState: { status: 'connecting', deviceName: chosen.name ?? null } });

    chosen.addEventListener('gattserverdisconnected', onGattDisconnected);

    const gatt = await chosen.gatt!.connect();
    const service = await gatt.getPrimaryService(PRESSURE_SERVICE_UUID);
    characteristic = await service.getCharacteristic(PRESSURE_CHARACTERISTIC_UUID);
    characteristic.addEventListener('characteristicvaluechanged', onCharacteristicValueChanged);
    await characteristic.startNotifications();

    try {
      // 開発用の仮想ペリフェラル(Bumble)にはLED Characteristicがないため取得失敗を許容する
      ledCharacteristic = await service.getCharacteristic(LED_CHARACTERISTIC_UUID);
    } catch {
      ledCharacteristic = null;
    }

    emit({
      connectionState: { status: 'connected', deviceName: chosen.name ?? null },
      latestSample: null,
      recentRawAdc: [],
    });
  } catch (e) {
    cleanup();
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      // ユーザーがデバイス選択をキャンセルした場合はエラー扱いにしない
      emit({ connectionState: { status: 'idle' } });
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    emit({ connectionState: { status: 'error', message: `接続に失敗しました: ${message}` } });
  }
}

/**
 * 接続済みの状態で durationMs 間、rawAdc の平均値を採取する（Graspeeを握る動作の強さ判定用）。
 * 接続されていなければ null を返す。1サンプルも受信できなかった場合は 0 を返す。
 */
export function captureGripAverage(durationMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (snapshot.connectionState.status !== 'connected') {
      resolve(null);
      return;
    }
    let sum = 0;
    let count = 0;
    const unsubscribe = subscribeBle(() => {
      const sample = snapshot.latestSample;
      if (sample) {
        sum += sample.rawAdc;
        count += 1;
      }
    });
    setTimeout(() => {
      unsubscribe();
      resolve(count > 0 ? sum / count : 0);
    }, durationMs);
  });
}

/**
 * ストレスLED(GPIO22)の点灯/消灯をESP32に要求する。未接続、またはLED非対応の
 * ペリフェラル（開発用の仮想ペリフェラルなど）に対しては何もしない
 */
export async function setStressLed(on: boolean): Promise<void> {
  if (!ledCharacteristic) return;
  try {
    await ledCharacteristic.writeValue(Uint8Array.of(on ? 1 : 0));
  } catch {
    // BLE切断直後などの書き込み失敗は次回サンプリング時の再送に任せて無視する
  }
}

export function disconnectPressureSensor() {
  const gatt = device?.gatt;
  cleanup();
  if (gatt?.connected) {
    gatt.disconnect(); // gattserverdisconnected は購読解除済みなので自前で状態を更新する
  }
  device = null;
  emit({ connectionState: { status: 'idle' } });
}
