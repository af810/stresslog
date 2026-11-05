# 別のWindows PCで再現する手順

対象: Windows 10/11 x64、初期設定済みの初代Pixel Watch、同じWi-Fi。
時計の工場出荷状態からのセットアップはこの手順に含まない。既に使用できる時計を使う。
通常の計測通信は時計からPCへの直接送信で、Androidスマートフォンの中継は不要。

## 1. 取得とPC側の準備

Git for Windowsを導入する（OpenSSLが証明書生成とテストに必要）。
公式: https://git-scm.com/downloads/win

```powershell
git clone https://github.com/af810/stresslog.git
cd stresslog
powershell -ExecutionPolicy Bypass -File .\scripts\Setup.ps1 -InstallNode
```

GitHubのCode → Download ZIPで展開してもよい。展開したプロジェクト直下で上記最後のコマンドを実行する。
日本語・空白を含むフォルダーにも対応する。Node.js 24.19.0は `.stresslog-local/toolchains/` に配置する。
Node.jsの公式配布チェックサムとZIPのSHA-256を照合してから展開する。
既にNode.js 24.19+とnpmが使えるなら `-InstallNode` は不要。

初回処理: `npm ci` → Webテスト → Webビルド → TLS証明書を一時生成した受信機テスト → APKのSHA-256照合。
テスト用証明書と実機受信用証明書は別ディレクトリ。どちらもGit管理外。
失敗したらその段階で止まる。ネットワーク・ダウンロードが許可される環境で実行する。

## 2. PCアプリ起動

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start.ps1
```

Web: http://localhost:5173/?tab=live

- 初回はローカル証明書・秘密鍵・32バイトの接続トークンを生成。
- 複数のネットワークアダプターがある場合は `-LanAddress 192.168.1.10` のようにPCのWi-Fi側IPv4を指定する。値は各PCで確認。
- Windowsの確認画面が出たら、信頼する自宅等の**プライベートネットワーク**で時計からの受信を許可する。
- 時計から必要なのはPC宛TCP 8787だけ。8788はPC内部専用、5173もlocalhostに限定。
- 時計とPCが同じWi-Fiでも、ゲストWi-Fiの端末間通信禁止があると接続できない。
- 5173/8788を他のアプリや元のStressLogが使っている場合は、そちらを停止してから起動する。

受信確認（秘密情報を含まない状態API）:

```powershell
Invoke-RestMethod http://127.0.0.1:8788/status
```

時計が未接続なら値が出ないのは正常。過去の個人測定はGitHubに入れていないため、最初は最後の値も空。

## 3. 時計を新しいPCへ接続

Android SDK platform-toolsを導入する。Android Studio本体は必須ではない。
公式: https://developer.android.com/tools/releases/platform-tools
`adb.exe` をPATHに追加するか、`ANDROID_HOME` / `ANDROID_SDK_ROOT` をSDKのフォルダーに設定する。

時計:

1. 設定 → システム → デバイス情報等からビルド番号を繰り返しタップして開発者向けオプションを有効にする。
2. 開発者向けオプション → ワイヤレスデバッグをオンにする。
3. 初めてのPCは「ペア設定コードによるペア設定」を開く。
4. **ペア設定用**IP:ポートと、数字のペア設定コードを使ってペアリングする。
5. ワイヤレスデバッグの元画面へ戻り、**接続用**のIP:ポートを確認する。通常、ペア設定用とは別のポート。

初回（値は時計の表示へ置き換える）:

```powershell
adb pair 192.168.1.20:37001
# 時計に表示されたコードを入力
powershell -ExecutionPolicy Bypass -File .\scripts\Configure-Watch.ps1 -DeviceAddress 192.168.1.20:42001 -InstallVerifiedApk
```

`-PairAddress` を指定してスクリプト内で対話ペアリングすることも可能。
すでにv0.5.2が入っている時計の接続設定だけを変える場合:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Configure-Watch.ps1 -DeviceAddress 192.168.1.20:42001
```

- `-InstallVerifiedApk` は同梱v0.5.2だけをインストールする。現在の開発ソースをビルドしない。
- 証明書・トークンはペアリング済みADBで時計のアプリへ設定し、ログへ出力しない。
- ワイヤレスデバッグは再起動等でポートが変わる。次回も現在の表示を使う。リポジトリにIPを固定しない。
- v0.5.3/4が入っている場合、バージョンダウンでインストールが拒否されることがある。署名が違う場合も同様。
- その際は自動アンインストールしない。時計のデータ消失を伴う操作なので、必要な保存と利用者の判断を先に行う。
- 新PCでのソース再ビルドは別のデバッグ署名になる場合がある。同梱APKのインストールなら元の署名を維持できる。

## 4. 実測の開始と終了

時計を装着し、StressLog → 時計で自動計測 → **7分計測して自動停止**を選ぶ。
センサーや通知の権限が出たら許可し、文字盤へ戻る。約1分の有効データが集まると推定を始める。
強い腕固定や体感入力は既定の推定には不要。ただし体動・欠測による品質の限界は残る。

7分後に時計側が止まり、新しい受信がなくなるとWebの現在値は空になり、最後の値を日時付きで表示する。
「連続計測」もあるが、長期の電池持ちと日常精度は未検証。
PCがスリープすると受信できない。時計側で計測を止めると電池の消費を抑えられる。

PCの停止:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Stop.ps1
```

## 5. アドレス変更・証明書期限

証明書は生成時のPCアドレスに対応し、有効期間は365日。
PCアドレスが変わるとスクリプトは明示的に停止する。別のアドレスへ黙って接続し直さない。

時計で計測を止め、PCでStop.ps1を実行してから、`.stresslog-local/live` を
例 `.stresslog-local/live-backup-20261106` に名前変更して保持する（既存の同名先には上書きしない）。
Start.ps1で新しい証明書とトークンを生成し、Configure-Watch.ps1で時計を再設定する。
バックアップには秘密情報と過去の推定情報があるため、GitHubへ入れない。

## 6. 開発・再学習（通常は不要）

Web・受信機の再検証: `scripts/Verify.ps1`。
WESADの再学習にはPython 3.13と `tools/population/requirements-lock.txt` が必要。
原データ取得・チェックサム・コマンドは `tools/population/MODEL_CARD.md`。
同梱モデルを使うだけなら、Pythonや原データをダウンロードしない。

時計の開発ソースを調べる場合はJDK 17、Android SDK platform 35 / build-tools 35.0.0、Gradle Wrapperを使用。
`local.properties` の `sdk.dir` または環境変数でSDKを指定する。これらの個人パスはコミットしない。
**v0.5.4のソースをビルドできても、現状の通常再現用として実機へ配備しない。**
元のv0.5.2のソースと署名鍵はこの保存にはない。詳細はCURRENT_STATUS.md。

## 再現できる範囲

再現する: コード、学習済みモデル、評価集計、テスト、画面、PC通信処理、同梱時計APK。
再現しない: 過去の個人履歴、ブラウザDB、時計のペアリング、元PCの秘密情報、同梱APKの元ソースからの完全再ビルド。
別の物理PCでの実機接続は、移行先で最後に確認する必要がある。
