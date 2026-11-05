import {analyzeLayoutTransition,SHORT_LIVE_METHOD,parseProbe,type ProbeReport} from './prv.ts';
import {analyzeShortRestingLivePpg} from './liveAnalysis.ts';
import {heartSensorQuality,wearWindowQuality,QUALITY_METHOD,ACTIVITY_METRIC} from './liveQuality.ts';

export interface LiveWindow {
  connected:boolean;ppgFresh:boolean;lastReceivedAt:number|null;windowSeconds:number;
  sampleCount:number;droppedEvents:number;batteryPercent:number|null;model:string;sessionId:string|null;
  clockSkewMs:number|null;registrations:{ppg:boolean;heartRate:boolean;acceleration:boolean};report:ProbeReport;
  streamErrors:number;worn:boolean|null;lastPpgReceivedAt?:number|null;ppgLagMs?:number|null;
}

export async function readLiveWindow(signal?:AbortSignal):Promise<LiveWindow> {
  const response=await fetch('/live-api/window',{signal,cache:'no-store'});
  if(!response.ok)throw Error('PC受信機能が起動していません。StressLogを開く起動ファイルを実行してください');
  return parseLiveWindow(await response.json());
}

function parseLiveWindow(raw:unknown):LiveWindow {
  const value=raw as LiveWindow;
  if(!value || typeof value.connected!=='boolean' || typeof value.ppgFresh!=='boolean' ||
    typeof value.model!=='string' || !Number.isFinite(value.sampleCount) ||
    !(value.lastReceivedAt===null || Number.isFinite(value.lastReceivedAt)) ||
    !Number.isFinite(value.streamErrors) || !value.registrations ||
    typeof value.registrations.acceleration!=='boolean' || !value.report)throw Error('受信状態を確認できません');
  return value;
}

export function analyzeLiveWindow(data:LiveWindow|null) {
  if(!data || !data.connected || !data.ppgFresh || data.worn===false || data.sampleCount<100)return null;
  let report:ProbeReport|undefined;
  try {
    report=parseProbe(data.report);
    const {result,motion,trimmedForMotion}=analyzeShortRestingLivePpg(report);
    return {result,motion,trimmedForMotion,heart:heartSensorQuality(result.windowReport),
      wear:wearWindowQuality(data.report,result.windowReport),error:null,transition:null};
  } catch(error) {
    let transition:ReturnType<typeof analyzeLayoutTransition>=null;
    const message=error instanceof Error?error.message:String(error);
    if(report && message.includes('形式が切り替わった')){
      try{transition=analyzeLayoutTransition(report);}catch{ /* No usable diagnostic window. */ }
    }
    return {result:null,motion:null,trimmedForMotion:false,heart:null,wear:null,error:message,transition};
  }
}

export function liveWindowReasons(data:LiveWindow|null,analysis:ReturnType<typeof analyzeLiveWindow>,now:number) {
  const reasons=[...(analysis?.result?.reasons||[])];
  const age=data?.lastReceivedAt==null?Infinity:Math.abs(now-data.lastReceivedAt);
  const ppgAt=data?.lastPpgReceivedAt===undefined?data?.lastReceivedAt:data.lastPpgReceivedAt;
  const pulseAge=ppgAt==null?Infinity:Math.abs(now-ppgAt)+(data?.ppgLagMs??0);
  if(age>15000 || pulseAge>15000 || !data?.connected || !data.ppgFresh)reasons.push('時計の最新データを待っています');
  if(!analysis?.result)reasons.push('拍動解析に必要なデータを蓄積中です');
  if(analysis?.error)reasons.push(analysis.error);
  if(analysis?.motion?.reason)reasons.push(analysis.motion.reason);
  if(analysis?.heart)reasons.push(analysis.heart);
  if(analysis?.wear)reasons.push(analysis.wear);
  if(data?.connected && !data.registrations.acceleration)reasons.push('体動センサーが接続されていません');
  if(data?.streamErrors)reasons.push('時計の時刻系列に異常があります。計測を再起動してください');
  if(age<=15000 && data?.worn===false)reasons.push('時計が装着されていません');
  if(data?.clockSkewMs!=null && Math.abs(data.clockSkewMs)>60000)reasons.push('時計とPCの日時がずれています');
  return [...new Set(reasons)];
}

/** The receiver freezes and archives the window with the self-report before
 * returning it for analysis. Retrying the same ID returns the original pair. */
export async function captureLiveLabel(score:number,signal?:AbortSignal,captureId:string=crypto.randomUUID()) {
  if(!Number.isFinite(score) || score<0 || score>10)throw Error('体感を0〜10で選択してください');
  const response=await fetch('/live-api/capture',{method:'POST',signal,cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({captureId,subjectiveStress0to10:score,subjectiveWindowSeconds:120})});
  if(!response.ok)throw Error('測定と体感をPCへ保存できませんでした');
  const saved=await response.json() as {schemaVersion:number;captureId:string;capturedAt:number;subjectiveStress0to10:number;subjectiveWindowSeconds:number;window:unknown};
  if(!saved || saved.schemaVersion!==1 || saved.captureId!==captureId || saved.subjectiveStress0to10!==score ||
    saved.subjectiveWindowSeconds!==120 || !Number.isSafeInteger(saved.capturedAt) || saved.capturedAt<0)throw Error('保存結果を確認できません');
  const data=parseLiveWindow(saved.window);
  const analysis=analyzeLiveWindow(data);
  const recordedAt=saved.capturedAt;
  const reasons=liveWindowReasons(data,analysis,recordedAt);
  const result=analysis?.result;
  const key=`${data.model}:${SHORT_LIVE_METHOD}:ch${result?.channel??'unknown'}:seated-live:${QUALITY_METHOD}`;
  const label={captureId:saved.captureId,recordedAt,subjectiveStress0to10:score,method:SHORT_LIVE_METHOD,key,qualityMethod:QUALITY_METHOD,
    subjectiveWindowSeconds:120,
    activityMetric:ACTIVITY_METRIC,activityEnmoMaxMg:analysis?.motion?.enmoMaxMg??null,
    sessionId:data.sessionId,metrics:result?.metrics??null,motionRms:analysis?.motion?.rms??null,
    sensorWindowStart:data.lastReceivedAt!=null&&result?data.lastReceivedAt-result.sourceSeconds*1000+10000:null,
    sensorWindowEnd:data.lastReceivedAt,
    qualityPassed:reasons.length===0 && result?.metrics?.lnRmssd!=null,reasons};
  return {data,label};
}
