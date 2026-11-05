# StressLog — Pixel Watch / PC Web

初代Pixel Watchの心拍・脈波・加速度をWi-FiでWindows PCへ送り、ブラウザでストレス反応の推定スコアを見る研究用アプリです。
**2026-11-06の開発状態を、１つのリポジトリから引き継げる構成**にしています。
利用時の体感入力・使用者の事前の基準登録は不要です。スマートフォンを中継しません。

> 0–100はWESADで学習した分類器の未校正の出力です。心理的ストレスの絶対量や診断結果ではありません。
> 初代Pixel Watchの日常生活での精度・一日中の電池持ちは未検証です。

## 最初に読むファイル

| ファイル | 内容 |
|---|---|
| [HANDOFF.md](HANDOFF.md) | 新しいAI・開発者への引き継ぎ入口 |
| [docs/SETUP.md](docs/SETUP.md) | GitHubから取得してWindowsで再現する手順 |
| [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) | できていること・未解決事項・次の作業 |
| [docs/STRESS_ESTIMATION_REPORT.md](docs/STRESS_ESTIMATION_REPORT.md) | 計算式・引用論文・学習と評価の報告書 |
| [tools/population/MODEL_CARD.md](tools/population/MODEL_CARD.md) | 現行モデルの詳細と再学習方法 |
| [AGENTS.md](AGENTS.md) | AI向けの作業ルール |
| [NOTICE.md](NOTICE.md) | モデル・データ・第三者ソフトウェアの扱い |

## 最短の起動方法（Windows）

GitHubの **Code → Download ZIP** から展開するか、次を実行します。

```powershell
git clone https://github.com/af810/stresslog.git
cd stresslog
powershell -ExecutionPolicy Bypass -File .\scripts\Setup.ps1 -InstallNode
powershell -ExecutionPolicy Bypass -File .\scripts\Start.ps1
```

- Git for Windows（証明書生成用OpenSSLを含む）が必要です。
- `-InstallNode` はNode.js 24.19.0をフォルダー内へ取得し、公式SHA-256を照合します。管理者権限での全体インストールはしません。
- 初回セットアップは依存関係の導入、Webテスト・ビルド、受信機テスト、同梱APK照合まで行います。
- 開く画面は **http://localhost:5173/?tab=live** です。
- 時計をつながなくてもWebの起動とテストができます。実測値には時計の接続と新しい計測が必要です。
- 時計の接続にはAndroid SDK platform-toolsのADBを使います。詳しくは [セットアップ手順](docs/SETUP.md)。

## 全体構成

```text
Pixel Watch 1（確認済みAPK v0.5.2）
  └─ HTTPS + 接続トークン / Wi-Fi / TCP 8787
       └─ tools/live/bridge.mjs（PC受信・特徴量抽出・推定）
            └─ 127.0.0.1:8788（PC内だけのAPI）
                 └─ Vite / localhost:5173 → Webの「自動計測」
```

```text
web/                     React / TypeScript / Vite、推定器と学習済みモデル
tools/live/              PC受信機とテスト、過去の研究用解析ツール
tools/population/        WESADの前処理・学習・評価結果・モデルカード
releases/watch/          実機確認済みのv0.5.2 APK（通常の再現はこちら）
watch-probe/             時計アプリのv0.5.4開発ソース（通常は配備しない）
scripts/                 PCに依存しない初回設定・起動・停止・時計接続
docs/                    引き継ぎ資料・計算報告書・既存設計資料
app/                     旧Androidスマートフォン版
firmware/esp32_pressure/  既存の圧力センサー用ファームウェア
archive_dev_scripts/     旧開発用ツール（PC固定パスあり、通常は使わない）
.stresslog-local/        起動後に生成。秘密情報・測定・ログ等、Git管理外
```

Web・PC受信機・モデルを含むので、別の `stresslog-web` リポジトリの取得は不要です。
個人の計測履歴、ブラウザDB、接続トークン、秘密鍵、研究データの原本は同梱しません。
新しい環境の最初の画面では、過去の推定値は表示されません。

## 動作確認

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Verify.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\Stop.ps1
```

停止スクリプトは、このフォルダーの起動スクリプトが開始したPCプロセスだけを対象にします。
時計の計測は時計側で停止してください。
この保存構成での確認結果は [REPRODUCTION_CHECK.json](docs/REPRODUCTION_CHECK.json)。
別の物理PCでの時計接続までは未確認です。

## 時計ソースの注意

現在の時計ソースv0.5.4と、動作確認済みAPK v0.5.2は一致しません。
v0.5.3/4の省電力変更後に時計が操作不能になったため、実機はv0.5.2へ戻しました。原因は未確定です。
通常は同梱v0.5.2 APKを使い、未解決のv0.5.4を自動配備しません。
詳細は [CURRENT_STATUS.md](docs/CURRENT_STATUS.md) を参照してください。
