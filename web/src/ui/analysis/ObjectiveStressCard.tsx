import {useEffect,useMemo,useState} from 'react';
import {extractMultisensorFeatures} from '../../domain/multisensorFeatures';
import {estimateObjectiveStress,objectiveObservation,readObjectiveReferences,type ObjectiveReference} from '../../domain/objectiveStress';
import type {analyzeLiveWindow,LiveWindow} from '../../domain/liveWindow';

export function ObjectiveStressCard({data,analysis,now}:{data:LiveWindow|null;analysis:ReturnType<typeof analyzeLiveWindow>;now:number}){
  const [records,setRecords]=useState<ObjectiveReference[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false,busy=false;const controller=new AbortController();
    async function load(){
      if(busy||document.visibilityState==='hidden')return;busy=true;
      try{const value=await readObjectiveReferences(AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]));
        if(!cancelled){setRecords(value.records);setError(value.error??(value.unreadable?`読み込めない過去の測定が${value.unreadable}件あります。その他の基準で計算します。`:''));}}
      catch{if(!cancelled)setError('PCの個人基準を読み込めません。受信機能が起動しているか確認してください。');}
      finally{busy=false;if(!cancelled)setLoading(false);}
    }
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);
    window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);void load();
    return ()=>{cancelled=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};
  },[]);
  const extracted=useMemo(()=>data?extractMultisensorFeatures(data,Date.now(),analysis):null,[data,analysis]);
  const current=useMemo(()=>data&&extracted?objectiveObservation(data,Date.now(),extracted):null,[data,extracted]);
  const estimate=estimateObjectiveStress(records,current,now);
  const device=data?.model||[...records].sort((a,b)=>a.at-b.at).at(-1)?.device||'Google Pixel Watch';
  const deviceRecords=useMemo(()=>records.filter(row=>row.device===device),[records,device]);
  const last=useMemo(()=>[...deviceRecords].filter(row=>row.at<=Date.now()).sort((a,b)=>a.at-b.at).at(-1),[deviceRecords]);
  const saved=useMemo(()=>last?estimateObjectiveStress(records,last,last.at):null,[records,last]);
  const showingSaved=estimate.value===null&&saved!==null&&saved.value!==null;
  const shown=showingSaved?saved:estimate;
  const measuredAt=showingSaved?last?.at:estimate.value!==null?current?.at:undefined;
  const measurementTime=measuredAt===undefined?null:new Intl.DateTimeFormat('ja-JP',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',
  }).format(measuredAt);
  return <div className="card live-prediction"><div className="live-card-heading"><h3>ストレス推定（生理反応）</h3><span className="live-badge">試作・精度未検証</span></div>
    <p className="live-progress-heading"><strong>{showingSaved?'直近の保存データの推定値':estimate.value!==null?'計測中の推定値':'データを待っています'}</strong></p>
    <p className="live-score">{shown.value===null?'—':Math.round(shown.value)}<small> / 100</small></p>
    {measurementTime&&<p className="live-hint">測定日時：<time dateTime={new Date(measuredAt!).toISOString()}>{measurementTime}</time></p>}
    {showingSaved&&<p role="status">現在の値は取得できていないため、直近の保存データから計算した値を表示しています。時計で計測を開始し、新しいデータがそろうと自動で更新します。</p>}
    {shown.value===null?<p>{current?estimate.reason:'時計で計測を開始すると、直近約2分のデータから自動で計算します。'}</p>:
      <p>似た体動のときの過去の測定と比べた、身体の反応の変化です。{shown.hrvUsed?'この値は心拍・体動・HRV相当の脈波指標を使用しています。':'この値は心拍・体動から計算しています。HRVは未使用です。'}</p>}
    <p className="live-hint">主観の点数や、それを学習したモデルは使いません。0は基準以下の反応を意味し、心理的ストレスがないことを示す値ではありません。高い値ほど基準からの反応が大きい、未検証の参考指標です。</p>
    <div className="live-progress-heading"><span>自動で集めた個人基準</span><strong>{deviceRecords.length}区間</strong></div>
    <p className="live-hint">測定中は基準もPCに自動保存します。体感の入力やファイル設定は不要です。以前の測定波形も、点数を取り除いて基準に使います。</p>
    {shown.value!==null&&!shown.similarActivity&&<p className="live-hint">似た体動の基準がまだ少ないため、この値は特に参考程度に見てください。</p>}
    {shown.value!==null&&shown.referenceCount<3&&<p className="live-hint">個人基準を蓄積中です。基準が増えるにつれて値が変わることがあります。</p>}
    {loading&&<p role="status">時計の個人基準を読み込んでいます…</p>}
    {error&&<p role="alert">{error}</p>}
    {data?.connected&&!extracted?.coreAvailable&&extracted?.reasons.map(reason=><p className="live-hint" key={reason}>{reason}</p>)}
    <details><summary>計算方法と数値の意味</summary>
      <p>加速度の大きさと変化速度から似た体動の過去の区間を最大20件選び、心拍数の中央値からの上昇を計算します。HRV相当の値を取得でき、同じ脈波形式の基準が3件以上ある場合は、ln(RMSSD)の低下も加えます。</p>
      <p>変化を基準のばらつきで割り、0〜100に収めた試作の指標です。計算の重み・変換式は開発上の仮設定で、文献で検証された心理的ストレスの尺度や確率ではありません。</p>
      <p>心拍の上昇は基準のばらつきまたは5 bpm、ln(RMSSD)の低下は基準のばらつきまたは0.2の大きい方で割ります。正方向の変化だけを使い、HRV使用時は両方の平均 z、未使用時は心拍の z から 100 × (1 − exp(−z / 2)) を計算します。</p>
      <p>信号が古い・時計を外している・心拍や体動が欠測している場合は、保存済みの測定値を日時付きで表示します。現在の推定値と区別し、新しいデータがそろったら自動で切り替えます。表示対象の測定と重なる区間や、それ以降の測定は比較基準から除外します。</p>
      <p>運動、呼吸、体調なども影響します。普段から負荷が高い状態も基準に含まれることがあります。この時計の脈波指標PRVと心電図由来HRVとの一致、心理的ストレスとの対応は未検証です。</p>
      {shown.value!==null&&<p>表示中の心拍比較 {shown.referenceCount}区間 / 脈波比較 {shown.prvReferenceCount}区間 / 基準心拍 {shown.referenceHeartRate?.toFixed(1)} bpm / 心拍の変化 {shown.hrZ?.toFixed(2)} / 脈波の変化 {shown.prvZ?.toFixed(2)??'未使用'}</p>}
    </details>
  </div>;
}
