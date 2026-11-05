import { useState } from 'react';
import {
  setGripThresholds,
  setNotificationsEnabled,
  setSamplingInterval,
  setThreshold,
  useSettings,
} from '../../data/settings';
import {
  notificationPermission,
  requestNotificationPermission,
} from '../../work/notifier';
import { runSamplingTick } from '../../work/samplingLoop';

const INTERVAL_MIN = 1;
const INTERVAL_MAX = 120;

export function SettingsScreen() {
  const settings = useSettings();
  const [permission, setPermission] = useState(notificationPermission());
  const [sampling, setSampling] = useState(false);

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      setPermission(notificationPermission());
      setNotificationsEnabled(granted);
    } else {
      setNotificationsEnabled(false);
    }
  };

  const sampleNow = async () => {
    setSampling(true);
    try {
      await runSamplingTick();
    } finally {
      setSampling(false);
    }
  };

  const applyInterval = (minutes: number) => {
    if (!Number.isFinite(minutes)) return;
    const clamped = Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, Math.round(minutes)));
    setSamplingInterval(clamped);
  };

  return (
    <div className="screen settings">
      <h2 className="section-title">設定</h2>

      <div className="card">
        <div className="card-title">通知の閾値: {settings.stressThreshold}</div>
        <div className="muted">この値を超えるとストレスアラートが通知されます</div>
        <input
          type="range"
          min={30}
          max={95}
          step={5}
          value={settings.stressThreshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="slider"
        />
      </div>

      <div className="card">
        <div className="card-title">サンプリング間隔: {settings.samplingIntervalMinutes}分</div>
        <input
          type="range"
          min={INTERVAL_MIN}
          max={INTERVAL_MAX}
          step={1}
          value={settings.samplingIntervalMinutes}
          onChange={(e) => applyInterval(Number(e.target.value))}
          className="slider"
        />
        <div style={{ height: 8 }} />
        <input
          className="text-field"
          type="number"
          min={INTERVAL_MIN}
          max={INTERVAL_MAX}
          step={1}
          value={settings.samplingIntervalMinutes}
          onChange={(e) => applyInterval(Number(e.target.value))}
        />
      </div>

      <div className="card">
        <div className="row-between">
          <div>
            <div className="card-title">通知</div>
            <div className="muted">閾値を超えたときにブラウザ通知でお知らせします</div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) => void toggleNotifications(e.target.checked)}
            />
            <span className="switch-track" />
          </label>
        </div>
        {settings.notificationsEnabled && permission === 'denied' && (
          <div className="warn-text">
            ブラウザの通知許可がブロックされています。アドレスバーのサイト設定から許可してください。
          </div>
        )}
        {permission === 'unsupported' && (
          <div className="warn-text">このブラウザは通知に対応していません。</div>
        )}
      </div>

      <div className="card">
        <div className="card-title">握り強さのしきい値（rawAdc）</div>
        <div className="muted">
          Graspeeを握った強さの判定ライン。FSRセンサーは個体差があるため、実測しながら調整してください。
        </div>
        <div style={{ height: 8 }} />
        <label className="muted" htmlFor="grip-medium">
          小 → 中: {settings.gripThresholdMedium}
        </label>
        <input
          id="grip-medium"
          type="range"
          min={0}
          max={4095}
          step={50}
          value={settings.gripThresholdMedium}
          onChange={(e) =>
            setGripThresholds(Number(e.target.value), settings.gripThresholdLarge)
          }
          className="slider"
        />
        <div style={{ height: 8 }} />
        <label className="muted" htmlFor="grip-large">
          中 → 大: {settings.gripThresholdLarge}
        </label>
        <input
          id="grip-large"
          type="range"
          min={0}
          max={4095}
          step={50}
          value={settings.gripThresholdLarge}
          onChange={(e) =>
            setGripThresholds(settings.gripThresholdMedium, Number(e.target.value))
          }
          className="slider"
        />
      </div>

      <div className="card">
        <div className="card-title">動作確認</div>
        <div className="muted">今すぐ1回サンプリングして記録します（開発用）</div>
        <div style={{ height: 8 }} />
        <button className="btn outlined" onClick={() => void sampleNow()} disabled={sampling}>
          {sampling ? '取得中…' : '今すぐサンプル'}
        </button>
      </div>

      <p className="muted footnote">
        データ源: モック（開発用）。データはこのブラウザ内（IndexedDB）にのみ保存されます。
        タブを閉じている間はサンプリングが停止します（Webの仕様）。
      </p>
    </div>
  );
}
