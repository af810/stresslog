import {useEffect,useState} from 'react';
import {readPopulationSnapshot,POPULATION_MODEL_INFO,type PopulationSnapshot} from '../../domain/populationStress';

export function PopulationStressCard({now}:{now:number}){
  const [snapshot,setSnapshot]=useState<PopulationSnapshot|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false,busy=false;const controller=new AbortController();
    async function load(){
      if(busy)return;busy=true;
      try{
        const result=await readPopulationSnapshot(AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]));
        if(!cancelled){setSnapshot(result);setError('');}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'推定結果を読み込めません');}
      finally{busy=false;}
    }
    const timer=setInterval(()=>{void load();},5000);
    window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);void load();
    return()=>{cancelled=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};
  },[]);
  const live=snapshot?.current&&Math.abs(now-snapshot.current.observation.at)<=15000&&!error?snapshot.current:null;
  const shown=live??snapshot?.last??null;
  const time=shown?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(shown.observation.at):null;
  return <div className="card live-prediction">
    <div className="live-card-heading"><h3>ストレス推定</h3><span className="live-badge">汎用モデル・精度未検証</span></div>
    <p className="live-hint">個人の事前データ・体感入力・基準づくりは不要です。</p>
    <p className="live-progress-heading"><strong>{live?'計測中の推定値':shown?'直近の保存データによる推定値':'モデル準備完了・計測待ち'}</strong></p>
    <p className="live-score">{shown?Math.round(shown.prediction.value):'—'}<small> / 100</small></p>
    {shown&&time&&<p className="live-hint">測定日時：<time dateTime={new Date(shown.observation.at).toISOString()}>{time}</time> · 約1分のデータ</p>}
    {!live&&<p role="status">{shown?'現在の値ではありません。時計の計測を再開すると、新しいデータで自動更新します。':snapshot?.reason??'時計で計測を開始すると、約1分のデータから推定します。'}</p>}
    {shown&&<p>{shown.prediction.hrvUsed?'心拍・体動・脈波由来のHRV相当指標（PRV）を使用。':'心拍・体動を使用。脈波変動の品質条件を満たさない場合も、このモデルで推定を続けます。'}</p>}
    <p className="live-hint">数値は、研究の「ストレス課題中」に似た信号かを表すモデルの出力です。心理的ストレスの強さや、現実のストレスの発生確率ではありません。</p>
    {!live&&snapshot?.reason&&shown&&<p className="live-hint">{snapshot.reason}</p>}
    {shown?.prediction.outsideTrainingRange.length!==0&&shown&&<p className="live-hint">一部の値が学習データの範囲外です。今回の推定は特に不確かです。</p>}
    {error&&<p role="alert">{error}</p>}
    {snapshot?.error&&<p role="alert">{snapshot.error}</p>}
    <details><summary>モデルの根拠と限界</summary>
      <p>WESADの15人分の公開実験データから学習したランダムフォレストを使います。正解ラベルは実験条件（ストレス課題と、安静・娯楽）で、質問票の点数は使っていません。利用者本人の履歴で学習・補正しません。</p>
      <p>約60秒の心拍中央値と体動を入力します。脈波の条件がそろえばln(RMSSD)・ln(SDNN)・pNN50も使う別モデルへ切り替えます。体動は入力の一つで、安静だけを必須にはしません。</p>
      <p>学習時の心拍・HRVは同時記録された心電図から、体動は手首の加速度から算出しました。時計では心拍センサーと脈波を使用します。心電図と脈波、研究機器とPixel Watchの違いによる影響は未検証です。</p>
      <p>15人を1人ずつ学習から外す評価を実施しています。学習時の心電図でのAUCは心拍・体動モデル {POPULATION_MODEL_INFO.validation.heartMotion.auc.toFixed(3)}、変動指標を加えたモデル {POPULATION_MODEL_INFO.validation.heartMotionPrv.auc.toFixed(3)}。この利用者や日常生活での精度を示すものではありません。</p>
      <p>運動、発熱、カフェイン、睡眠不足などによる反応と心理的ストレスは、これらの信号だけでは区別しきれません。研究参加者も15人と少なく、幅広い人への一般化は未検証です。</p>
      <p><a href="https://doi.org/10.1145/3242969.3242985" target="_blank" rel="noreferrer">WESAD原著論文</a> · <a href="https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html" target="_blank" rel="noreferrer">データセットと利用条件</a> · <a href="https://doi.org/10.1371/journal.pone.0076585" target="_blank" rel="noreferrer">脈波検出の参考文献</a></p>
      <p>モデル {POPULATION_MODEL_INFO.id}。データセットの条件に従い、科学研究・非商用用途で利用してください。</p>
    </details>
  </div>;
}
