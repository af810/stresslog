// Android版 data/ble/PressureBleSpec.kt の移植。
// 仕様の唯一の正: docs/BLE_PRESSURE.md（UUIDは Web Bluetooth の要求どおり小文字）

export const PRESSURE_SERVICE_UUID = 'f1a70001-8b2c-4e5d-9a6f-0c3b7d2e5a10';
export const PRESSURE_CHARACTERISTIC_UUID = 'f1a70002-8b2c-4e5d-9a6f-0c3b7d2e5a10';
/** ストレスLED(GPIO22)制御。1バイト書き込み: 0x01=点灯要求, 0x00=消灯要求 */
export const LED_CHARACTERISTIC_UUID = 'f1a70003-8b2c-4e5d-9a6f-0c3b7d2e5a10';
export const DEVICE_NAME = 'StressLog-PS';

export interface PressureSample {
  timestamp: number;
  rawAdc: number;
  /** 未校正のときは null（ファーム側は NaN を送ってくる） */
  forceKg: number | null;
}

/** [uint16 rawAdc LE][float32 forceKg LE] の6バイトを解析する。不正な長さは null */
export function parsePressureSample(view: DataView | undefined): PressureSample | null {
  if (!view || view.byteLength < 6) return null;
  const rawAdc = view.getUint16(0, true);
  const forceKg = view.getFloat32(2, true);
  return {
    timestamp: Date.now(),
    rawAdc,
    forceKg: Number.isNaN(forceKg) ? null : forceKg,
  };
}
