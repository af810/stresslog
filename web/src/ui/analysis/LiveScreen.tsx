import { useEffect, useMemo, useRef, useState } from 'react';
import { compareBaseline, SHORT_LIVE_METHOD, SHORT_MIN_VALID_SECONDS, type BaselineEntry } from '../../domain/prv';
import { QUALITY_METHOD } from '../../domain/liveQuality';
import { analyzeLiveWindow, liveWindowReasons, readLiveWindow, type LiveWindow } from '../../domain/liveWindow';
import {PopulationStressCard} from './PopulationStressCard';
import {OBJECTIVE_METHOD,readObjectiveReferences} from '../../domain/objectiveStress';
const BASE='stresslog.live.baseline.v3', LABELS='stresslog.live.labels.v1';
function readBaseline():BaselineEntry[] {
  try { const v=JSON.parse(localStorage.getItem(BASE)||'[]');return Array.isArray(v)?v.filter(e=>e && typeof e.id==='string' && typeof e.key==='string' && typeof e.day==='string' && Number.isFinite(e.lnRmssd)):[]; }catch{return [];}
}
function readLabels():unknown[] {
  try {const v=JSON.parse(localStorage.getItem(LABELS)||'[]');return Array.isArray(v)?v:[];}catch{return [];}
}
export function LiveScreen() {
  const [data,setData]=useState<LiveWindow|null>(null),[error,setError]=useState(''),[baseline,setBaseline]=useState(readBaseline);
  const [calibrating,setCalibrating]=useState(false),[calibrationStart,setCalibrationStart]=useState(0);
  const [showResearch,setShowResearch]=useState(false);
  const [labels]=useState(readLabels);
  const [now,setNow]=useState(Date.now());
  const readSequence=useRef(0),appliedSequence=useRef(0);
  function applyWindow(value:LiveWindow,sequence:number) {
    if(sequence<appliedSequence.current)return;
    appliedSequence.current=sequence;
    setData(value);setError('');setNow(Date.now());
  }
  useEffect(()=>{
    let cancelled=false,polling=false;let timer:ReturnType<typeof setTimeout>;let controller:AbortController;
    async function poll() {
      if(cancelled || polling)return;
      polling=true;
      const sequence=++readSequence.current;
      controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
      try {
        const v=await readLiveWindow(controller.signal);
        if(!cancelled)applyWindow(v,sequence);
      }catch(e){if(!cancelled && sequence>=appliedSequence.current){appliedSequence.current=sequence;setError(String(e));setData(null);}}
      finally {clearTimeout(timeout);polling=false;if(!cancelled)timer=setTimeout(poll,5000);}
    }
    function resume() {
      if(document.visibilityState!=='visible')return;
      setNow(Date.now());clearTimeout(timer);void poll();
    }
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    void poll();
    const clock=setInterval(()=>{setNow(Date.now());},1000);
    return ()=>{
      cancelled=true;controller?.abort();clearTimeout(timer);clearInterval(clock);
      document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);
    };
  },[calibrating]);
  const computation=useMemo(()=>showResearch||calibrating?analyzeLiveWindow(data):null,[data,showResearch,calibrating]);
  const result=computation?.result;
  const age=data?.lastReceivedAt==null?Infinity:(now-data.lastReceivedAt)/1000;
  let lastReceivedText='—';
  if(Number.isFinite(age))lastReceivedText=`${Math.max(0,age).toFixed(0)}秒前`;
  if(Number.isFinite(age) && age>=60)lastReceivedText=`${Math.floor(age/60)}分前`;
  if(Number.isFinite(age) && age>=3600)lastReceivedText=`${Math.floor(age/3600)}時間前`;
  const reasons=liveWindowReasons(data,computation,now);
  const ready=reasons.length===0 && result?.metrics?.lnRmssd!=null;
  const day=new Date(now).toLocaleDateString('sv-SE');
  const keyPrefix=`${data?.model||'Google Pixel Watch'}:${SHORT_LIVE_METHOD}:ch`;
  const keySuffix=`:seated-live:${QUALITY_METHOD}`;
  const key=result?`${keyPrefix}${result.channel}${keySuffix}`:`${keyPrefix}unknown${keySuffix}`;
  const id=`${data?.sessionId}:${data?.lastReceivedAt}`;
  const comparison=ready?compareBaseline(result!.metrics!.lnRmssd!,key,id,baseline,day):null;
  useEffect(()=>{
    // Explicitly initiated resting calibration, not an automatic declaration that
    // every low-motion period represents a psychologically unstressed baseline.
    if(!calibrating || !ready || !data?.lastReceivedAt || data.lastReceivedAt-calibrationStart<150000)return;
    const next=[...baseline.filter(e=>!(e.day===day && e.key===key)),{id,day,key,lnRmssd:result!.metrics!.lnRmssd!}];
    try {localStorage.setItem(BASE,JSON.stringify(next));setBaseline(next);setCalibrating(false);}
    catch {setError('安静基準を保存できません。ブラウザの容量を確認してください');setCalibrating(false);}
  },[calibrating,ready,data,calibrationStart,baseline,day,key,id,result]);
  async function exportCalibration() {
    let recovered;
    try{recovered=await readObjectiveReferences(AbortSignal.timeout(60000));}
    catch{setError('PC側の個人基準を読み込めず、書き出せませんでした。受信機能を確認してください');return;}
    const payload={createdAt:Date.now(),method:OBJECTIVE_METHOD,...recovered};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='stresslog-objective-baseline.json';link.click();URL.revokeObjectURL(url);
  }
  function exportLegacy(){
    const url=URL.createObjectURL(new Blob([JSON.stringify({createdAt:Date.now(),baseline,labels:readLabels()},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='stresslog-legacy-subjective-records.json';link.click();URL.revokeObjectURL(url);
  }
  return <div className="screen live-screen"><header className="live-heading"><p className="live-eyebrow">StressLog · Pixel Watch</p><h2>時計から自動計測</h2><p>時計の客観データだけから、ストレスに関連する身体の反応を試算します。</p></header>
    <div className="card connection-card"><div className="live-card-heading"><h3>時計の状態</h3>
      <span className={data?.connected && age<15?'live-badge live-badge-good':'live-badge'}>{data?.connected && age<15?'接続中':'接続待ち'}</span></div>
      {error && <p role="alert">{error}</p>}
      <dl className="live-stats">
        <div><dt>{data?.connected && age<15?'時計の電池':'最終受信時の電池'}</dt><dd>{data?.batteryPercent??'—'}<small> %</small></dd></div>
        <div><dt>計測データ</dt><dd>{data?.windowSeconds.toFixed(0)??0}<small> 秒</small></dd></div>
        <div><dt>最新の受信</dt><dd className="live-received">{lastReceivedText}</dd></div>
      </dl>
      <p className="live-hint">連続計測は電池を消費します。短時間だけ確認するときは、時計の「7分計測して自動停止」も使えます（時計アプリ v0.5.0以降）。</p>
      <details open={!data?.connected}><summary>接続と計測の手順</summary>
      <p>最初の1回だけPCの「時計の自動計測を設定」を実行し、時計で連続計測または7分計測を開始します。旧版では「自動計測を開始」を押します。</p>
      <p>PCと時計を同じWi-Fiにつなぎ、PCを起動したまま使います。汎用モデルの初回推定は約1分から1分30秒が目安です。個人基準や体感入力は不要です。欠測がある場合は追加の計測を待ちます。</p>
      <p>{data?.model||'時計未接続'} / PPG {data?.sampleCount??0}件 / 送信側の破棄 {data?.droppedEvents??0}件</p>
      </details>
      {data?.connected && data.worn==null && <p>装着検出の情報は届いていません。時計を手首に着け、脈波・心拍・体動の品質条件を確認します。</p>}
    </div>
    <PopulationStressCard now={now} />
    <details className="card" onToggle={event=>setShowResearch(event.currentTarget.open)}><summary>脈波の参考情報（開発用）</summary><h3>HRV用の脈波指標（研究用）</h3>
      {!ready?<><p>HRV指標は品質確認のため保留しています</p>{[...new Set(reasons)].map(r=><p key={r}>・{r}</p>)}</>:
        comparison?.z!=null?<><p style={{fontSize:28}}>個人基準からの低下 z = {comparison.z.toFixed(2)}</p><p>PRVの低下方向を正として表示します。心理的ストレスの確率ではありません。運動・睡眠・呼吸・体調なども影響します。</p></>:<p>品質条件は通過しました。個人の安静基準が不足しているため、負荷の比較は準備中です。</p>}
      {age<=15 && data?.worn!==false && !data?.streamErrors && computation?.transition && <p>形式切り替え前後の参考RMSSD {computation.transition.rmssd.toFixed(1)} ms（有効な拍動間隔の合計 {Math.floor(computation.transition.validIntervalSeconds)}秒）。推定と学習は、安定した形式のデータを待っています。</p>}
      <p>参考PRV RMSSD {result?.metrics?.rmssd.toFixed(1)??'—'} ms / 推定脈拍 {result?.metrics?.heartRate.toFixed(0)??'—'} bpm</p>
      {result&&<p>品質条件を満たす拍動間隔の合計 {Math.floor(result.validIntervalSeconds)}秒 / 最低{SHORT_MIN_VALID_SECONDS}秒</p>}
      {computation?.trimmedForMotion && <p className="live-hint">腕の動きがあった区間より後の、連続した安静データを使っています。</p>}
      <progress className="live-progress" max={SHORT_MIN_VALID_SECONDS} value={Math.min(SHORT_MIN_VALID_SECONDS,result?.validIntervalSeconds??0)} aria-label="品質条件を満たす拍動間隔の進捗" />
      <details><summary>測定の詳細と計算の根拠</summary>
      <p>間隔除外 {result?`${(result.rejectedFraction*100).toFixed(1)}%`:'—'} / 解析区間の体動RMS最大 {computation?.motion?.rms?.toFixed(2)??'—'} m/s²</p>
      {computation?.motion?.reason && computation.motion.peakEndAgoSeconds!=null &&
        <p>加速度の変化が最も大きかった15秒間は、解析終了の約{Math.round(computation.motion.peakEndAgoSeconds+15)}〜{Math.round(computation.motion.peakEndAgoSeconds)}秒前です。</p>}
      <p>体動は直近約2分の解析区間で判定します。今は静かでも、手首の向きが変わった区間が残っている間は保留になることがあります。</p>
      <p>2分方式は検証中です。保存データで待ち時間を減らせる見込みはありましたが、この時計での心電図との一致や体感の予測精度は未確認です。</p>
      <p>PPGのPRVをECG由来HRVと区別しています。検出器・個人推定精度は未検証で、数値が高いだけで「ストレスが強い」とは断定しません。</p>
      <p>脈波の拍動検出は<a href="https://doi.org/10.1371/journal.pone.0076585" target="_blank" rel="noreferrer">Elgendiら（2013）の方法</a>に基づきます。この時計での拍動時刻・ストレス推定の精度は確認中です。</p>
      </details>
    </details>
    <details className="card"><summary>個人内比較（任意・汎用推定には不要）</summary><h3>安静時の脈波を比較する（任意）</h3><p>この機能は汎用モデルとは別の開発用比較です。普段の安静時から脈波がどれだけ変わったかも比較できます。5分休んでから開始し、同じ時間帯・姿勢・自然な呼吸で、穏やかな状態の基準を7日以上集めます。7日は運用上の暫定設定です。</p>
      <button className="btn outlined" disabled={calibrating || !data?.connected} onClick={()=>{setCalibrationStart(now);setCalibrating(true);}}>安静基準の取得を開始</button>
      {calibrating && <><p>取得中 {Math.floor((now-calibrationStart)/1000)}秒 / 最低150秒。品質条件を満たすと自動保存します。</p><button onClick={()=>setCalibrating(false)}>基準の取得を中止</button></>}
      <p>保存済み {baseline.filter(e=>e.key===key).length}日 / 今回の比較に使える過去基準 {comparison?.days??0}日</p>
    </details>
    <div className="card"><h3>測定データの保存</h3><p>直近の推定値をこのPCに保存します。保存データを利用者の学習や個人基準には使いません。主観の入力は不要です。外部サービスへ自動送信しません。</p>
      <details><summary>以前の個人基準（汎用モデルでは使用しません）</summary><button className="btn outlined" onClick={exportCalibration}>以前の個人基準を書き出す</button></details>
      <details><summary>以前の体感記録（現在の推定には使用しません）</summary><p>以前の体感記録{labels.length}件と原波形は保持しています。今の数値の計算には使用しません。</p><button className="btn outlined" onClick={exportLegacy}>以前の体感記録を書き出す</button></details>
    </div>
  </div>;
}
