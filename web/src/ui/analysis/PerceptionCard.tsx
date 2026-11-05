import {useEffect,useMemo,useState} from 'react';
import {extractMultisensorFeatures} from '../../domain/multisensorFeatures';
import {readPerceptionRecords,type PerceptionRecord} from '../../domain/perceptionRecord';
import {trainPerceptionPolicy,predictPerceptionPolicy,trainPrototypePerception,predictPrototypePerception} from '../../domain/perceptionModel';
import type {analyzeLiveWindow,LiveWindow} from '../../domain/liveWindow';

export function PerceptionCard({data,analysis,now}:{data:LiveWindow|null;analysis:ReturnType<typeof analyzeLiveWindow>;now:number}){
  const [records,setRecords]=useState<PerceptionRecord[]>([]),[error,setError]=useState('');
  const [loading,setLoading]=useState(true),[unreadable,setUnreadable]=useState(0),[generation,setGeneration]=useState(0);
  const [mode,setMode]=useState<'prototype'|'validated'>(()=>{
    try{return localStorage.getItem('stresslog.live.estimateMode.v1')==='validated'?'validated':'prototype';}catch{return 'prototype';}
  });
  const [showSaved,setShowSaved]=useState(false);
  useEffect(()=>{
    const refresh=()=>setGeneration(value=>value+1);
    window.addEventListener('stresslog-capture-saved',refresh);window.addEventListener('focus',refresh);
    return ()=>{window.removeEventListener('stresslog-capture-saved',refresh);window.removeEventListener('focus',refresh);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();let cancelled=false;
    const timer=setTimeout(()=>controller.abort(),60000);setLoading(true);
    void readPerceptionRecords(controller.signal).then(value=>{
      if(!cancelled){setRecords(value.records);setUnreadable(value.unreadable);setError('');}
    },()=>{if(!cancelled)setError('PCに保存した体感を読み込めません。PCの受信機能を確認してください。');})
      .finally(()=>{clearTimeout(timer);if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;controller.abort();clearTimeout(timer);};
  },[generation]);
  // A restarted receiver has no model until the next watch packet. Keep the
  // recorded device's progress visible while measurements are stopped.
  const recordedDevice=useMemo(()=>[...records].sort((a,b)=>a.recordedAt-b.recordedAt).at(-1)?.model,[records]);
  const device=data?.model||recordedDevice||'Google Pixel Watch';
  const policy=useMemo(()=>trainPerceptionPolicy(records,device),[records,device]);
  const training=policy.training;
  const prototype=useMemo(()=>trainPrototypePerception(records,device),[records,device]);
  // Waveform analysis runs once per new snapshot, not on each one-second clock tick.
  const extracted=useMemo(()=>data?extractMultisensorFeatures(data,Date.now(),analysis):null,[data,analysis]);
  const fresh=!!data?.connected&&!!data.ppgFresh&&data.lastReceivedAt!==null&&Math.abs(now-data.lastReceivedAt)<=15000&&
    data.lastPpgReceivedAt!==null&&Math.abs(now-(data.lastPpgReceivedAt??data.lastReceivedAt))+(data.ppgLagMs??0)<=15000;
  const quality=!!extracted?.coreAvailable&&fresh;
  const features=extracted?.features??null;
  const trial=mode==='prototype';
  const prediction=trial?predictPrototypePerception(prototype,device,features,quality):predictPerceptionPolicy(policy,device,features,quality);
  const counts=trial?prototype:training;
  const prototypeModel=prototype[prediction.route??'context'].model;
  const saved=useMemo(()=>[...records].filter(row=>row.model===device&&row.qualityPassed&&row.subjectiveWindowSeconds===120&&row.features)
    .sort((a,b)=>a.recordedAt-b.recordedAt).at(-1),[records,device]);
  const savedPrediction=saved?predictPrototypePerception(prototype,device,saved.features,saved.qualityPassed):null;
  return <div className="card live-prediction"><div className="live-card-heading"><h3>現在の体感ストレス</h3><span className="live-badge">{trial?'試作・精度未検証':'精度検証モード'}</span></div>
    <label>表示モード <select value={mode} onChange={event=>{
      const next=event.target.value==='validated'?'validated':'prototype';setMode(next);
      try{localStorage.setItem('stresslog.live.estimateMode.v1',next);}catch{/* Keep the selection for this session. */}
    }}><option value="prototype">試作の推定を表示</option><option value="validated">精度検証後に表示</option></select></label>
    <p className="live-score">{prediction.value?.toFixed(1)??'—'}<small> / 10</small></p>
    {prediction.value!==null?<p>直近約2分の{prediction.route==='context'?'心拍と体動':'心拍・体動・脈波の変動'}から、記録した体感をもとに{trial?'試算':'予測'}しています。{prediction.route==='context'?'今回はHRVを使用していません。':''}</p>:
      <p>{trial?(quality?prediction.reason:'時計の計測を開始すると、約2分半で新しい心拍・体動から試作の推定を表示します。'):
        quality?(policy.enabled?prediction.reason:'あなたの体感に合う推定のため、記録と学習後の別の日の検証が必要です。'):'時計から新しい心拍・体動・装着情報がそろうと、推定できるか確認します。'}</p>}
    {trial&&<p className="live-hint">精度の検証前でも数値を出す試作です。実際のストレス感と一致するかはまだ分かりません。</p>}
    {trial&&prototypeModel&&<p className="live-hint">{prototypeModel.count}件の体感記録（{prototypeModel.targetRange[0]}〜{prototypeModel.targetRange[1]} / 10）から学習しています。記録が少ないため、値の変化を十分に学べていません。</p>}
    {trial&&'limited' in prediction&&prediction.limited===true&&<p className="live-hint">今の測定値は学習した範囲を超えています。試作では記録済みの範囲に収めて計算しています。</p>}
    {loading&&<p role="status">PCに保存した体感を確認しています…</p>}
    {error&&<p role="alert">{error} <button className="btn outlined" onClick={()=>setGeneration(value=>value+1)}>もう一度読み込む</button></p>}
    {unreadable>0&&<p role="alert">読み込めない保存記録が{unreadable}件あります。その他の記録は保持しています。</p>}
    <div className="live-progress-heading"><span>{trial?'心拍と体動の試作に使う記録':'心拍と体動の検証に使える記録'}</span><strong>{counts.context.count}件・{counts.context.days}日</strong></div>
    <progress className="live-progress" max={trial?5:30} value={Math.min(trial?5:30,counts.context.count)} aria-label="心拍と体動の学習用記録" />
    {trial?<p className="live-hint">試作は5件から計算します。今の記録を使って始められ、精度の確認は後から進められます。</p>:
      <p className="live-hint">まず30件以上・5日以上を目安に学習候補を作ります。その後も別の日に記録し、予測の精度を検証します。同じ日に回数を増やすだけでは完了しません。</p>}
    <p className="live-hint">HRVを加える学習用記録：脈波形式ごとに{counts.prv5.count}件・{counts.prv6.count}件。現在のHRVと対応する形式の記録がそろうとHRVも使い、それ以外は心拍・体動から計算します。</p>
    {trial&&savedPrediction&&savedPrediction.value!==null&&<>
      <button className="btn outlined" onClick={()=>setShowSaved(value=>!value)}>{showSaved?'保存時の試算を閉じる':'保存済みデータで動作を確認'}</button>
      {showSaved&&<div role="status"><h4>保存した時点の試算</h4>
        <p><strong>{savedPrediction.value.toFixed(1)} / 10</strong> · {new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(saved!.recordedAt)}</p>
        <p className="live-hint">現在の値ではありません。学習にも使った記録での機能確認で、精度の検証結果ではありません。{savedPrediction.route==='context'?'この試算にHRVは使っていません。':''}</p>
      </div>}
    </>}
    {quality&&<p className="live-hint">現在の心拍・体動の入力を確認できています。{features?.prvAvailable?'HRV用の品質条件も通過しています。':'HRVは品質確認のため保留中です。'}</p>}
    {!quality&&data?.connected&&extracted?.reasons.map(reason=><p className="live-hint" key={reason}>{reason}</p>)}
    <details><summary>学習と検証の詳細</summary>
      <p>試作モードは、保存した体感と測定の組5件から個人用の回帰式を作り、検証待ちでも試算を表示します。HRVは品質が良く、同じ脈波形式の学習用記録も5件以上ある場合に使います。精度の確認はこれからです。</p>
      <p>以下の条件は「精度検証後に表示」のモードに適用します。試作モードの点数表示を止める条件ではありません。</p>
      <p>PCに保存された2分間の体感は{records.length}件です。以前の5分方式や異なる時計の記録は混ぜません。記録を読み込むためのファイル設定は不要です。</p>
      {training.context.reasons.map(reason=><p key={reason}>・{reason}</p>)}
      {policy.reasons.map(reason=><p key={reason}>・{reason}</p>)}
      <p>心拍・体動の予測と、HRVを加えた予測を別に検証します。HRVは脈波形式ごとに分け、品質を満たした場合だけ使用します。</p>
      <p>直前までの日だけで学習し、後日の体感との差を確認します。一定値・心拍数だけの方法との比較に加え、HRVを使う場合は同じ記録でHRVなしの方法より改善するか確認します。</p>
      <p>さらに、その時点で検証済みの方法だけを切り替えた場合の値を確認します。学習候補ができた後の別の日に10件・2日以上の予測と、半数以上の表示可能率を確認してから点数を表示します。</p>
      <p>切り替えを含む後日の検証：予測できた{policy.validation.filter(row=>row.predicted!==null).length}件 / 対象{policy.validation.length}件。</p>
      {policy.enabled&&<p>切り替え後の予測誤差は平均{policy.mae!.toFixed(1)}点、誤差の90%点は{policy.error90!.toFixed(1)}点でした。一定値では平均{policy.constantMae!.toFixed(1)}点、心拍のみでは{policy.heartOnlyMae!.toFixed(1)}点でした。今後も誤ることがあります。</p>}
      <p>30件・5日、平均誤差1.5点以内などは暫定の運用条件で、必要な精度を保証する基準ではありません。未経験の測定範囲や装着・信号の品質不足では表示を保留します。</p>
      <p>心拍数のばらつきをHRVとして扱いません。時計の脈波から求める変動はPRVで、心電図由来のHRVとの一致は未確認です。</p>
    </details>
  </div>;
}
