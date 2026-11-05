# StressLog ストレス反応推定の計算方法・根拠・検証状況

作成日: 2026-11-06。対象モデル: **`wesad-population-rf60-v1`**。
対象実装: 本リポジトリのWeb版・PC受信機。通常の時計実行版はv0.5.2。

## 1. 結論と位置付け

現在のアプリは、直近60秒の心拍数と体動、品質が足りる場合は脈波由来の変動指標を使い、
WESADの実験条件で学習したRandom Forestの出力を0–100へ換算する。
利用者本人の事前の安静計測、個人基準、体感入力は要求しない。

これは、公開データと既存の信号処理手法を参考に**本プロジェクトで構築した研究用モデル**である。
単一の論文の完成済み計算式をそのまま移植したものではなく、原著の成績を再現したとも主張しない。
「80点だから心理的ストレスが80%」「本人のストレス強度が80」という意味ではない。
人・機器・運動・日常環境の違いに対する性能は別途検証が必要。

## 2. 根拠と実装の対応

| 要素 | 根拠・参照 | この実装での扱い |
|---|---|---|
| 学習用データとストレス課題ラベル | SchmidtらのWESAD [1] | 15人、baseline/amusement対TSST stress。質問票を入力にしない |
| ECGからの参照拍動 | NeuroKit2 [2] | 学習用胸部ECGを`neurokit`方式で処理。自動アーチファクト補正なし |
| PPG拍動検出 | Elgendiら [3] | 0.5–8 Hz、二乗、２種類の移動平均。追加の極性選択・不応期・品質条件あり |
| RMSSD・SDNN・pNN50 | HRVの標準的指標 [4] | PPGの場合はPRVとして計算。ECG由来HRVとの同一性は未保証 |
| 分類器 | Random Forest [5] | scikit-learnで学習し、各決定木をJSONへ出力、TypeScriptで計算 |
| 0–100への換算 | 本プロジェクトの表示仕様 | 分類器の正クラス出力×100。医学的なカットオフではない |
| 品質閾値・モデル切替 | 本プロジェクトの工学上の設計 | 論文でPixel Watch向けに有効性が保証された条件ではない |

## 3. データの取得と解析区間

時計から心拍数、PPG、３軸加速度、装着情報を受信する。PPGは約100 Hz、加速度は約25 Hz、送信間隔は約6秒。
PPGセンサーの識別子・データ配列形式は実機で観察したものを扱っており、公開された全機種共通の仕様ではない。
時計の時刻とセンサー時刻を確認し、PPGと加速度の両方がある最新の共通終端から60秒を切り出す。

学習・時計で共通の特徴量計算を行うため、PPGを100 Hz（6,000点）、加速度を25 Hz（1,500点）へ線形補間する。
元のサンプル間隔に上限を設け、大きな欠測を埋めた連続データとして扱わない。
学習側ではWESADの手首BVP 64 Hz、ACC 32 Hzを使い、ACCの1/64 g単位をm/s²へ換算する。

実装: [`populationFeatures.ts`](../web/src/domain/populationFeatures.ts)。

## 4. 特徴量の計算式

### 4.1 心拍数

時計のネイティブ心拍が使える場合は、60秒内の有効な心拍数の中央値を使う。

$$
H=\operatorname{median}(h_1,\ldots,h_m)\quad[\mathrm{bpm}]
$$

有効値は30–200 bpm、センサーaccuracyが正、10イベント以上などの条件を満たすもの。
ネイティブ心拍が使えない場合、品質条件を満たした脈拍間隔から得た瞬時脈拍数の中央値を候補とする。

$$
H_{\mathrm{pulse}}=\operatorname{median}_i\left(\frac{60000}{I_i}\right)
$$

$I_i$ はミリ秒単位の有効脈拍間隔。心拍数のばらつきを、HRVや拍動間隔の代わりに使わない。

### 4.2 体動の大きさ

加速度を $\boldsymbol a_k=(a_{x,k},a_{y,k},a_{z,k})$、$g=9.80665\ \mathrm{m/s^2}$ とする。
重力の大きさを差し引き、負の値を0としたベクトル強度の平均を用いる。

$$
E=\frac{1000}{N}\sum_{k=1}^{N}\max\left(0,\frac{\|\boldsymbol a_k\|}{g}-1\right)\quad[\mathrm{mg}]
$$

隣り合う加速度の差から、動きの変化量の平均も計算する。$f_s=25\ \mathrm{Hz}$。

$$
J=\frac{f_s}{N-1}\sum_{k=2}^{N}\|\boldsymbol a_k-\boldsymbol a_{k-1}\|\quad[\mathrm{m/s^3}]
$$

モデルへの入力は、コードで定めた単位の数値について $\ln(1+E)$ と $\ln(1+J)$。
この変換と特徴の組合せは本プロジェクトの仕様であり、ストレスを直接測定する公式ではない。
体動は分類器への入力だが、現在の分類器が運動と精神的ストレスを十分に分離できる証明にはならない。

実装: [`liveQuality.ts`](../web/src/domain/liveQuality.ts) の`enmoMg`、`populationFeatures.ts`。

### 4.3 脈波からの拍動検出

Elgendiらの手法 [3] を参考に、PPGの0.5–8 Hz帯域を前後方向にフィルター処理する。
帯域通過後の波形を $y[n]$ とし、正の部分の二乗を作る。

$$
z[n]=(\max(y[n],0))^2
$$

約111 msと667 msの中心移動平均を用い、次の条件を満たす区間を候補にする。

$$
MA_{111}[n]>MA_{667}[n]+0.02\,\overline z
$$

十分な幅がある候補区間内のピークを選ぶ。100 Hzでは移動平均幅を奇数のサンプル数へ丸める。
加えて本実装は、波形の両極性を試して除外間隔の割合が少ない側を選び、ピーク間300 ms未満を抑制する。
フィルター端の影響を避けるため、先頭10秒と末尾1秒を拍動解析から外す。
反射パディング、初期条件、極性選択、不応期の処理を含め、原著と完全に同一の実装とは称さない。

実装: [`elgendi.ts`](../web/src/domain/elgendi.ts)、`populationFeatures.ts`の`pulseFeatures`。

### 4.4 拍動間隔の除外

ピーク時刻 $t_i$ から $I_i=1000(t_{i+1}-t_i)$ msを得る。
300–2,000 msの範囲、かつ前後最大5間隔ずつを含む局所中央値 $M_i$ の20%以内を有効とする。

$$
300\le I_i\le2000,\qquad |I_i-M_i|\le0.2M_i
$$

除外区間をつなぎ直してRMSSDを作らない。
これらは本プロジェクトの品質条件であり、あらゆる被験者の正常・異常を判定する診断基準ではない。

### 4.5 RMSSD・SDNN・pNN50

有効な間隔の集合を $V$、元データで隣接し両方とも有効な間隔対を $A$ とする。

$$
\overline I=\frac{1}{|V|}\sum_{i\in V}I_i
$$

$$
RMSSD=\sqrt{\frac{1}{|A|}\sum_{i\in A}(I_{i+1}-I_i)^2}
$$

$$
SDNN=\sqrt{\frac{1}{|V|-1}\sum_{i\in V}(I_i-\overline I)^2}
$$

$$
pNN50=100\frac{\#\{i\in A:|I_{i+1}-I_i|>50\ \mathrm{ms}\}}{|A|}
$$

モデルには $\ln(RMSSD)$、$\ln(SDNN)$、$pNN50$ を渡す。
ECGの正常拍間隔に適用するHRV指標 [4] と同じ数式だが、時計のPPGへ適用した値は**PRV**である。
脈波伝播、体動、センサー処理の影響があるため、ECG由来HRVと同じ値・精度とは言えない [6]。
本モデルはLF/HF、呼吸由来指標、EDA、皮膚温を入力にしていない。

実装: [`prv.ts`](../web/src/domain/prv.ts) の`intervalMetrics`。

## 5. 品質条件とモデルの切替

| 対象 | 主な条件 |
|---|---|
| 現在値 | 装着確認、新鮮な受信、受信時刻・PPG遅延おおむね15秒以内、系列エラーなし |
| 時刻 | 時計ずれ60秒以内、PPGと加速度の終端差2秒以内 |
| 加速度 | ３軸、補間元のサンプル間隔500 ms以内、60秒窓を覆う |
| PPG補間 | 認識可能で同一のチャンネル形式、サンプル間隔50 ms以内。失敗しても有効なネイティブ心拍があれば下位モデルを使える |
| ネイティブ心拍 | accuracy > 0、30–200 bpm、10点以上、窓内心拍イベントの80%以上有効、30秒以上を覆い終端15秒以内 |
| PRV | 有効間隔合計40秒以上、有効な隣接差20組以上、除外5%以下、ゼロでないRMSSD/SDNN、波形段差なし |
| PRVと心拍の整合 | ネイティブ心拍がある場合、脈波の脈拍数が得られ、差が8 bpm以内 |

PRVが適格なら６特徴の`heartMotionPrv`、不適格なら３特徴の`heartMotion`を使う。
心拍・体動等の必須入力が足りない場合は新しい現在値を作らない。
通信停止・時計を外した場合に、以前の点数を現在の状態として表示し続けない。
閾値は全体としてPixel Watchでの科学的妥当性を検証済みとは言えず、変更時にはモデルとの整合を確認する。

## 6. 0–100への変換

特徴ベクトルを $\boldsymbol x$、100本の決定木の葉に保存された正クラス出力を $p_b(\boldsymbol x)$ とする。
scikit-learnの`predict_proba`に対応する各木の重み付きクラス比率を平均する。

$$
S(\boldsymbol x)=100\times\frac{1}{100}\sum_{b=1}^{100}p_b(\boldsymbol x)
$$

各木では、指定された特徴量が学習済み閾値以下かどうかで枝をたどる。
Pythonの学習時と同じfloat32入力の分岐となるよう、TypeScriptで`Math.fround`を使う。
重みと閾値は学習済みJSONに保存されており、単一の「HRVが低いほど何点」という直線式ではない。

出力の意味は「学習した実験条件のストレス側に寄った分類器出力」であり、
心理的ストレスの絶対的強度や、日常生活でストレスを感じている校正済み確率ではない。
論文から万人共通の通知閾値70や80が得られたという根拠もない。

実装: [`populationStress.ts`](../web/src/domain/populationStress.ts)、[`wesad-v1.json`](../web/src/domain/models/wesad-v1.json)。

## 7. 学習データと学習条件

WESAD [1] の15人（S2–S17、S1/S12なし）を使用。
正クラスを2（TSST stress）、負クラスを1（baseline）と3（amusement）とし、他ラベルは使わない。
質問票回答や利用者本人の体感を教師ラベルとして読み込まず、実験プロトコルの条件ラベルを使う。
これは完全に客観的な心理状態の正解を得たという意味ではない。

各条件ブロックの最初・最後2秒を避け、重ならない60秒窓を530作る。
参照心拍が確認できない4窓を除いた526窓を基本モデルへ使い、変動指標の条件も通る469窓を拡張モデルへ使う。

**重要な機器差:** 学習の心拍・HRVは胸部ECG（700 Hz）をNeuroKit2 [2] で処理して得る。
体動は手首ACC。時計の推定時はネイティブ心拍とPPG由来PRVへ置き換わる。
手首BVPだけを選別するとストレス区間が多く失われたため、手首PPGだけで学習したモデルは採用しなかった。
その選択は転用誤差をなくすものではなく、現在の主要な制約である。

Random Forestの固定条件 [5]:

| 条件 | 値 |
|---|---|
| 木の数 | 100 |
| 分割基準 | entropy |
| 最大深さ | 5 |
| 最小分割サンプル数 | 20 |
| 最小葉サンプル数 | 5 |
| 特徴量選択 | sqrt |
| seed | 20261106 |
| 個人基準による正規化 | なし |

被験者とその中の各クラスの寄与を重み付けで均等化する。
全窓数 $N$、人数 $G$、人 $g$ のクラス数 $C_g$、その人・クラスの窓数 $n_{g,c}$ のとき、
サンプル重みは $w_{g,c}=N/(G C_g n_{g,c})$。
クラス重みと実験条件の比率は日常生活の発生率と異なり、出力の確率解釈には注意が必要。

再学習手順は[モデルカード](../tools/population/MODEL_CARD.md)。原データはこのGitHubに含めない。

## 8. 評価方法と結果

15人のうち1人を評価用に外し、残り14人で学習するLOSOを15回行う。
評価対象の本人を学習へ含めず、本人の事前基準も計算に使わない。パラメーターは固定。
最終配布モデルは15人全体で学習する。

本プロジェクトの評価集計（原著の数値ではない）:

| 項目 | 心拍・体動 | 心拍・体動・HRV |
|---|---:|---:|
| 評価対象窓 | 526 | 469 |
| ストレス窓 | 154 | 130 |
| 人数 | 15 | 15 |
| ROC-AUC | 0.9045 | 0.8649 |
| Balanced accuracy（0.5で二値化） | 0.8119 | 0.7900 |
| Macro F1 | 0.7779 | 0.7595 |

対象窓が異なるため、列の比較だけでHRV追加の有効性を判断しない。
窓は同じ人・同じ実験ブロック内で相関し、526人を評価した意味ではない。
実験室の15人の結果をPixel Watchの普段の生活へ一般化できる保証はない。
手首BVPへの転用評価では使えたストレス窓が基本モデル24窓、PRVモデル7窓と少なく、
そこから得た高い数値を普遍的な精度の証明にしない。

集計の原本: [`evaluation.json`](../tools/population/artifacts/evaluation.json)。
PythonとTypeScriptの64例の出力照合: [`parity-fixtures.json`](../tools/population/artifacts/parity-fixtures.json)。
出力一致は実装整合の確認であり、ストレス推定の妥当性の証明ではない。

## 9. 実機確認と未検証事項

元PCでは、使用者による7分計測で受信・数値更新・PRV不適格時のモデル切替・自動停止・停止後の日時付き表示を確認した。
終了後の時計操作も正常と確認された。個人の点数・生波形・画像はこの報告書に含めない。

未検証なのは、心理的ストレスへの感度・特異度、日常運動中の誤検出、
脈波間隔とECG間隔の一致、年齢・疾病・服薬等の影響、長期の電池持ちである。
時計のv0.5.3/4で操作不能が発生した問題も未解決。通常は確認済みv0.5.2 APKを使う。

## 10. 旧方式との区別

`objectiveStress.ts`は、活動が似た本人の過去データに対して心拍上昇とlnRMSSD低下を比較する旧方式。
中央値絶対偏差による尺度 $\max(f,1.4826\,MAD)$ を用い、正方向の標準化差 $z$ を
$100(1-\exp(-\min(z,20)/2))$ へ換算するコードが残る。
この換算は本プロジェクトの試作表示式であり、引用論文で検証された普遍的ストレス公式ではない。
事前データが必要になるため、現在の既定方式では使わない。
体感を用いた`perceptionModel.ts`等、旧モックの`stressCalculator.ts`も現行モデルの計算とは別。

## 11. 将来の常時装着用途に向けた候補（未実装・現在は保留）

目標は、体動に伴う生理変化と区別しながら、強いストレス反応の持続区間を検出すること。
今回の保存では、以下を実装したり通知を追加したりしない。

### 活動と時間経過を組み合わせる

Gjoreskiら [7] は短時間のストレス判定、活動認識、時間をまとめた判定を分けた。
論文は2分ごとの推定を20分単位の最終判定へ組み合わせ、実生活5人・合計55日のデータで評価した。
ただし皮膚電気活動や皮膚温等も含む機器を使っており、PPG・心拍・ACCだけの本アプリへその成績を移せない。
より短い検出時間へ変える場合も独自の変更として検証が必要。

### ストレスと運動を含むデータで学習・評価する

Hongnら [8] のデータにはストレス課題と有酸素・無酸素運動、手首BVP・ACC等がある。
現在の時計で利用できる特徴へ絞り、本人・セッションを分けて学習と評価を行う候補になる。
公開論文の高い精度だけを採用理由とせず、個人正規化・データ分割・機器差を確認する。

Aydoğanら [9] は、安静対ストレスで学習したモデルでも、独立した運動区間を高率にストレスと誤認することを報告した。
運動のデータを加えれば解決する証拠ではなく、運動時の誤検出を独立に測る必要性を示す資料として扱う。

将来は窓ごとの正答率だけでなく、誤検出回数/日、ストレス区間の見逃し、検出遅れ、
有効な推定を出せる時間の割合、電池消費を測る必要がある。
本人の入力なしで動く設計でも、開発時の妥当性評価から参照ラベルまで不要になるわけではない。

## 12. 参考文献・一次資料

リンク確認日: 2026-11-06。論文本文をリポジトリへ複製せず、出典へのリンクを示す。

1. Schmidt, P., Reiss, A., Duerichen, R., Marberger, C., & Van Laerhoven, K. (2018). *Introducing WESAD, a Multimodal Dataset for Wearable Stress and Affect Detection*. ICMI 2018. [DOI](https://doi.org/10.1145/3242969.3242985) / [大学公式配布・利用条件](https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html)。学習データ・ラベル・利用条件の根拠。
2. Makowski, D., et al. (2021). *NeuroKit2: A Python toolbox for neurophysiological signal processing*. Behavior Research Methods, 53, 1689–1696. [DOI](https://doi.org/10.3758/s13428-020-01516-y)。学習用ECG処理ツール。使用した版・オプションの有効性は本実装でも別に考慮する。
3. Elgendi, M., Norton, I., Brearley, M., Abbott, D., & Schuurmans, D. (2013). *Systolic Peak Detection in Acceleration Photoplethysmograms Measured from Emergency Responders in Tropical Conditions*. PLOS ONE, 8(10), e76585. [原著](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0076585)。拍動検出の参考。ストレス分類器の検証論文ではない。
4. Task Force of the European Society of Cardiology and the North American Society of Pacing and Electrophysiology (1996). *Heart rate variability: Standards of measurement, physiological interpretation, and clinical use*. Circulation, 93, 1043–1065. [DOI](https://doi.org/10.1161/01.CIR.93.5.1043)。HRV指標の定義。60秒の時計PRVによるストレス判定を保証する資料ではない。
5. Breiman, L. (2001). *Random Forests*. Machine Learning, 45, 5–32. [原著](https://link.springer.com/article/10.1023/A:1010933404324)。分類手法の原典。現在の実装の出力平均はscikit-learnの`predict_proba`に合わせている。
6. Schäfer, A., & Vagedes, J. (2013). *How accurate is pulse rate variability as an estimate of heart rate variability? A review on studies comparing photoplethysmographic technology with an electrocardiogram*. International Journal of Cardiology, 166(1), 15–29. [PubMed](https://pubmed.ncbi.nlm.nih.gov/22809539/)。PRVとHRVの差と測定条件の制約。これはレビューであり、特定の時計の実測精度試験ではない。
7. Gjoreski, M., Luštrek, M., Gams, M., & Gjoreski, H. (2017). *Monitoring stress with a wrist device using context*. Journal of Biomedical Informatics, 73, 159–170. [DOI](https://doi.org/10.1016/j.jbi.2017.08.006) / [著者公開本文](https://martingjoreski.github.io/files/1-s2.0-S1532046417301855-main.pdf)。将来の活動・時間統合方式の候補。
8. Hongn, A., Bosch, F., Prado, L., & Bonomini, P. (2025). *Wearable physiological signals under acute stress and exercise conditions*. Scientific Data, 12, 520. [DOI](https://doi.org/10.1038/s41597-025-04845-9) / [公開データv1.0.1](https://www.physionet.org/content/wearable-device-dataset/1.0.1/)。将来の学習・運動時評価候補。現行モデルの学習には使っていない。
9. Aydoğan, Y., & Villagra Povina, F. (2026). *Stress or arousal? Exercise confounding in wearable stress detection*. Medical Engineering & Physics. [DOI](https://doi.org/10.1088/1873-4030/aea41e) / [PubMed](https://pubmed.ncbi.nlm.nih.gov/42710527/)。運動交絡に関する注意の根拠。今回のアプリを評価した論文ではない。

## 13. 再現用ファイル

- 学習コード: `tools/population/prepare_wesad.py`、`extract-features.mjs`、`train.py`。
- ライブラリ固定: `tools/population/requirements-lock.txt`、`web/package-lock.json`。
- 公式アーカイブ照合: SHA-1 `bae786bf599ef28e42e1c2e18da9b84d685e84e7`、2,249,444,501 bytes。
- 配布モデルSHA-256: `cc9b301992234ea37dfc0de5c57781c0bc543f1feb5d1afdb0ff5671922e2899`。
- 評価集計・出力照合: `tools/population/artifacts/`。
- 環境とテスト: `scripts/Setup.ps1`、`scripts/Verify.ps1`。
- 利用条件: [NOTICE.md](../NOTICE.md)。WESADは公式ページの科学研究・非商用用途等の条件を維持する。
