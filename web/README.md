# StressLog Web

現在の主画面は **http://localhost:5173/?tab=live**（自動計測）です。
初代Pixel Watch → PC受信機 → 汎用モデル → Web表示の経路で動きます。

このフォルダーは本リポジトリに統合しました。別リポジトリを取得する必要はありません。
受信機は `../tools/live/`、学習・評価・テストの参照ファイルは `../tools/population/` にあります。
**`web/` だけを切り離すと、受信機・モデル一致テストを再現できません。**

リポジトリ直下から:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Setup.ps1 -InstallNode
powershell -ExecutionPolicy Bypass -File .\scripts\Start.ps1
```

手動開発（Node.js 24.19+）:

```powershell
cd web
npm ci
npm test
npm run build
npm run dev -- --host localhost --port 5173 --strictPort
```

最後のコマンドだけではPC受信機は起動しません。ライブ計測にはルートの起動スクリプトを使ってください。
`/live-api` はViteから `127.0.0.1:8788` へ転送します。`dist/` の静的配信だけではライブ受信は動きません。

旧ホーム・記録・分析・設定等にはモックデータや個人基準方式の画面が残ります。
既定の実測推定は `PopulationStressCard.tsx` と `populationStress.ts` です。
モック値から通知・実機LEDを動作させない保護があります。新しい通知連携は追加していません。

- [セットアップ](../docs/SETUP.md)
- [現状・未解決事項](../docs/CURRENT_STATUS.md)
- [計算式・引用元の報告書](../docs/STRESS_ESTIMATION_REPORT.md)
- [モデルカード](../tools/population/MODEL_CARD.md)
- [既存のBLE仕様](../docs/BLE_PRESSURE.md)

IndexedDBとlocalStorageはブラウザ・プロファイル単位です。以前の個人履歴はGitHubから復元されません。
