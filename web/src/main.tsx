import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { startSamplingLoop } from './work/samplingLoop';

// IndexedDB がブラウザ都合で消されないよう永続化を要求する（拒否されても動作は同じ）
if (navigator.storage?.persist) {
  void navigator.storage.persist();
}

// タブが開いている間の定期サンプリング（WorkManager 相当）
startSamplingLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
