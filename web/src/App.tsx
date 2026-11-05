import { useState, type ReactElement } from 'react';
import { TAB_LABELS, type TabRoute } from './strings';
import { AdviceScreen } from './ui/advice/AdviceScreen';
import { AnalysisScreen } from './ui/analysis/AnalysisScreen';
import { HomeScreen } from './ui/home/HomeScreen';
import { MomentDetailScreen } from './ui/moments/MomentDetailScreen';
import { RecordsScreen } from './ui/records/RecordsScreen';
import { SensorScreen } from './ui/sensor/SensorScreen';
import { SettingsScreen } from './ui/settings/SettingsScreen';
import { PrvScreen } from './ui/analysis/PrvScreen';
import { LiveScreen } from './ui/analysis/LiveScreen';

const TAB_ORDER: TabRoute[] = ['live', 'hrv', 'home', 'records', 'analysis', 'advice', 'settings', 'sensor'];

const TAB_ICONS: Record<TabRoute, ReactElement> = {
  live: <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M5 11h4l2-5 3 12 2-5h3v2h-2l-4 7-3-11-1 2H5z"/></svg>,
  hrv: <svg viewBox="0 0 24 24"><path d="M2 12h5l3-8 4 16 3-8h5v2h-4l-5 10-4-15-1 5H2z"/></svg>,
  home: (
    <svg viewBox="0 0 24 24">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  ),
  records: (
    <svg viewBox="0 0 24 24">
      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
    </svg>
  ),
  analysis: (
    <svg viewBox="0 0 24 24">
      <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
    </svg>
  ),
  advice: (
    <svg viewBox="0 0 24 24">
      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  ),
  sensor: (
    <svg viewBox="0 0 24 24">
      <path d="M7.76 16.24C6.67 15.16 6 13.66 6 12s.67-3.16 1.76-4.24l1.42 1.42C8.45 9.9 8 10.9 8 12c0 1.1.45 2.1 1.17 2.83l-1.41 1.41zm8.48 0C17.33 15.16 18 13.66 18 12s-.67-3.16-1.76-4.24l-1.42 1.42C15.55 9.9 16 10.9 16 12c0 1.1-.45 2.1-1.17 2.83l1.41 1.41zM12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm8 2c0 2.21-.9 4.21-2.35 5.65l1.42 1.42C20.88 17.26 22 14.76 22 12s-1.12-5.26-2.93-7.07l-1.42 1.42C19.1 7.79 20 9.79 20 12zM6.35 6.35 4.93 4.93C3.12 6.74 2 9.24 2 12s1.12 5.26 2.93 7.07l1.42-1.42C4.9 16.21 4 14.21 4 12s.9-4.21 2.35-5.65z" />
    </svg>
  ),
};

function initialTab(): TabRoute {
  // "?tab=analysis" のように初期タブを指定できる（ブックマーク・動作確認用）
  const param = new URLSearchParams(window.location.search).get('tab');
  return param !== null && param in TAB_LABELS ? (param as TabRoute) : 'live';
}

export default function App() {
  const [tab, setTab] = useState<TabRoute>(initialTab);
  const [openMomentId, setOpenMomentId] = useState<number | null>(null);

  return (
    <div className="app">
      <div className="app-content">
        {tab !== 'hrv' && tab !== 'live' && <div style={{padding:12,background:'#fff2cf'}}>旧画面の0〜100点はモックによるデモ値です。実測解析は「自動計測」「実測PRV」を開いてください。</div>}
        {tab === 'live' && <LiveScreen />}
        {tab === 'hrv' && <PrvScreen />}
        {tab === 'home' && <HomeScreen />}
        {tab === 'records' && <RecordsScreen onOpenMoment={setOpenMomentId} />}
        {tab === 'analysis' && <AnalysisScreen />}
        {tab === 'advice' && <AdviceScreen />}
        {tab === 'settings' && <SettingsScreen />}
        {tab === 'sensor' && <SensorScreen />}
      </div>

      <nav className="bottom-nav">
        <div className="nav-brand">StressLog</div>
        {TAB_ORDER.map((route) => (
          <button
            key={route}
            className={`nav-item${tab === route ? ' selected' : ''}`}
            onClick={() => setTab(route)}
          >
            {TAB_ICONS[route]}
            <span>{TAB_LABELS[route]}</span>
          </button>
        ))}
      </nav>

      {openMomentId !== null && (
        <MomentDetailScreen momentId={openMomentId} onBack={() => setOpenMomentId(null)} />
      )}
    </div>
  );
}
