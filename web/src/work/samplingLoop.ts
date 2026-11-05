import { setStressLed } from '../data/ble/pressureBleClient';
import { MOCK_SOURCE_ID } from '../data/mockStressDataSource';
import { getSettings, subscribeSettings } from '../data/settings';
import {
  getLastAutoMomentTime,
  recordAutoMoment,
  sampleOnce,
} from '../data/stressRepository';
import { db } from '../data/db';
import { suggest } from '../domain/suggestionEngine';
import { notifyStressAlert } from './notifier';

// Android版 work/StressSamplingWorker.kt + WorkScheduler.kt の移植。
// Webではタブが開いている間だけ setInterval でサンプリングする（閉じている間は停止する制約あり）

let timerId: number | null = null;
let running = false;

/** 1回サンプリングし、閾値超過なら自動モーメント記録+通知（Workerの doWork 相当） */
export async function runSamplingTick(): Promise<void> {
  const settings = getSettings();
  const { reading } = await sampleOnce();
  // Synthetic values must never trigger physical stress alerts.
  if (reading.source === MOCK_SOURCE_ID) return;

  const stressExceeded = reading.stressScore >= settings.stressThreshold;
  // 握るとファーム側で自動消灯するため、ここでは閾値超過中は常に点灯要求を送り続ける
  void setStressLed(stressExceeded);

  if (stressExceeded) {
    const lastAuto = await getLastAutoMomentTime();
    const cooldownMs = settings.notificationCooldownMinutes * 60_000;
    const cooledDown = lastAuto === null || reading.timestamp - lastAuto >= cooldownMs;

    if (cooledDown) {
      const suggestion = suggest(reading.stressScore, reading.timestamp);
      await recordAutoMoment(reading, suggestion);
      if (settings.notificationsEnabled) {
        notifyStressAlert(reading.stressScore, suggestion);
      }
    }
  }
}

function schedule() {
  if (timerId !== null) {
    clearInterval(timerId);
  }
  const intervalMs = getSettings().samplingIntervalMinutes * 60_000;
  timerId = window.setInterval(() => {
    void runSamplingTick();
  }, intervalMs);
}

async function catchUpIfStale() {
  // タブ復帰時: 最後のreadingから設定間隔以上経っていれば即1回サンプリングする
  const intervalMs = getSettings().samplingIntervalMinutes * 60_000;
  const latest = await db.stressReadings.orderBy('timestamp').last();
  if (!latest || Date.now() - latest.timestamp >= intervalMs) {
    await runSamplingTick();
  }
}

/** アプリ起動時に一度だけ呼ぶ。設定変更でタイマーを自動で張り直す */
export function startSamplingLoop() {
  if (running) return;
  running = true;

  schedule();
  void catchUpIfStale();

  subscribeSettings(schedule);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void catchUpIfStale();
    }
  });
}
