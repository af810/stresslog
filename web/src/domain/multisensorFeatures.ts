/** Research feature extraction, not a fitted or displayed stress estimate.
 * Motion is recorded as context rather than declaring every moving window
 * psychologically unobservable. Valid native HR/contact and complete motion
 * data are still mandatory. PRV remains absent when its strict gates fail.
 * A later model must be validated against self-reports on subsequent days.
 */
import {analyzeLiveWindow,liveWindowReasons,type LiveWindow} from './liveWindow.ts';
import {enmoMg} from './liveQuality.ts';
import {median,parseProbe} from './prv.ts';

export const MULTISENSOR_FEATURE_METHOD='perception-features-hr-motion-optional-prv-v1';

export function extractMultisensorFeatures(data:LiveWindow,now:number,prvAnalysis?:ReturnType<typeof analyzeLiveWindow>){
  const reasons:string[]=[];
  if(!data.connected || !data.ppgFresh || data.lastReceivedAt===null || Math.abs(now-data.lastReceivedAt)>15000)
    reasons.push('新しい受信データが不足しています');
  // Until telemetry has an independent latest-HR/acceleration lag, keep the
  // existing fresh-PPG check as a queue-age guard. No duty-cycling assumption.
  const pulseAt=data.lastPpgReceivedAt===undefined?data.lastReceivedAt:data.lastPpgReceivedAt;
  if(pulseAt===null || Math.abs(now-pulseAt)+(data.ppgLagMs??0)>15000)reasons.push('受信データの遅延を確認できません');
  if(data.worn!==true)reasons.push('時計の装着を確認できません');
  if(data.streamErrors || data.clockSkewMs!==null && Math.abs(data.clockSkewMs)>60000)
    reasons.push('時計の時刻系列を確認できません');
  if(!data.registrations.heartRate || !data.registrations.acceleration)reasons.push('心拍または加速度が接続されていません');
  const blocked=(messages:string[])=>({method:MULTISENSOR_FEATURE_METHOD,coreAvailable:false,reasons:[...new Set(messages)],features:null,prvReasons:[] as string[]});
  if(reasons.length)return blocked(reasons);
  let report;
  try{report=parseProbe(data.report);}catch{return blocked(['計測データの形式が不正です']);}
  const acceleration=report.events.filter(e=>e.sensorStringType==='android.sensor.accelerometer');
  const heart=report.events.filter(e=>e.sensorStringType==='android.sensor.heart_rate');
  const pulses=report.events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg');
  const ends=[acceleration.at(-1),heart.at(-1),pulses.at(-1)].filter(Boolean).map(e=>BigInt(e!.sensorTimestampNs));
  if(!ends.length)return {method:MULTISENSOR_FEATURE_METHOD,coreAvailable:false,reasons:[...reasons,'計測データがありません'],features:null,prvReasons:[] as string[]};
  const end=ends.reduce((a,b)=>a>b?a:b),start=end-120_000_000_000n;
  let historicalWorn:boolean|undefined;
  let previousWearTime:bigint|undefined;
  for(const event of report.events){
    if(event.sensorStringType!=='android.sensor.low_latency_offbody_detect')continue;
    const value=event.values[0];if(value!==0 && value!==1)continue;
    const time=BigInt(event.sensorTimestampNs);
    if(previousWearTime!==undefined && time<=previousWearTime){reasons.push('装着検出の時刻が不正です');break;}
    previousWearTime=time;
    if(time>end)break;
    if(time>=start && (value===0 || historicalWorn===false))reasons.push('直近2分に時計を外した区間が含まれています');
    historicalWorn=value===1;
  }
  if(historicalWorn===false)reasons.push('解析時点の装着状態を確認できません');
  const acc=acceleration.filter(e=>BigInt(e.sensorTimestampNs)>=start && BigInt(e.sensorTimestampNs)<=end);
  const hr=heart.filter(e=>BigInt(e.sensorTimestampNs)>=start && BigInt(e.sensorTimestampNs)<=end);
  let jerkSum=0,jerkCount=0;
  if(acc.length<100 || BigInt(acc[0].sensorTimestampNs)-start>500_000_000n ||
    end-BigInt(acc.at(-1)!.sensorTimestampNs)>500_000_000n)reasons.push('直近2分の加速度がそろっていません');
  for(let i=0;i<acc.length;i++){
    if(acc[i].values.length<3 || acc[i].values.slice(0,3).some(v=>!Number.isFinite(v))){reasons.push('加速度に無効な値があります');break;}
    if(i){
      const dt=Number(BigInt(acc[i].sensorTimestampNs)-BigInt(acc[i-1].sensorTimestampNs))/1e9;
      if(dt<=0 || dt>.5){reasons.push('加速度に欠測または時刻異常があります');break;}
      jerkSum+=Math.hypot(...acc[i].values.slice(0,3).map((v,c)=>v-acc[i-1].values[c]))/dt;jerkCount++;
    }
  }
  const last=hr.at(-1);
  const validHr=hr.filter(e=>Number.isFinite(e.values[0]) && e.values[0]>=30 && e.values[0]<=200 && e.accuracy!=null && e.accuracy>0);
  if(!last || !validHr.includes(last) || end-BigInt(last.sensorTimestampNs)>15_000_000_000n || validHr.length<10 || validHr.length<.8*hr.length)
    reasons.push('有効で新しい心拍数が不足しています');
  if(validHr.length && BigInt(validHr.at(-1)!.sensorTimestampNs)-BigInt(validHr[0].sensorTimestampNs)<60_000_000_000n)
    reasons.push('心拍数の記録時間が不足しています');
  for(let i=1;i<hr.length;i++)if(BigInt(hr[i].sensorTimestampNs)<=BigInt(hr[i-1].sensorTimestampNs)){reasons.push('心拍数の時刻が不正です');break;}
  const unique=[...new Set(reasons)];
  if(unique.length)return {method:MULTISENSOR_FEATURE_METHOD,coreAvailable:false,reasons:unique,features:null,prvReasons:[] as string[]};
  const heartValues=validHr.map(e=>e.values[0]).sort((a,b)=>a-b);
  const activityEnmoMeanMg=enmoMg(acc.map(e=>e.values));
  if(activityEnmoMeanMg===null || !Number.isFinite(activityEnmoMeanMg) || !Number.isFinite(jerkSum))return blocked(['体動の特徴量を計算できません']);
  const analysis=prvAnalysis===undefined?analyzeLiveWindow(data):prvAnalysis,prvReasons=liveWindowReasons(data,analysis,now);
  const lnRmssd=!prvReasons.length?analysis?.result?.metrics?.lnRmssd??null:null;
  return {method:MULTISENSOR_FEATURE_METHOD,coreAvailable:true,reasons:[],
    windowStartNs:String(start),windowEndNs:String(end),prvReasons,
    // Native BPM spread is a contextual feature, never a substitute for IBI HRV.
    features:{heartRateMedian:median(heartValues),heartRateIqr:heartValues[Math.floor((heartValues.length-1)*.75)]-heartValues[Math.floor((heartValues.length-1)*.25)],
      activityEnmoMeanMg,activityJerkMean:jerkCount?jerkSum/jerkCount:0,lnRmssd,
      prvAvailable:lnRmssd!==null,prvChannel:lnRmssd!==null?analysis?.result?.channel??null:null}};
}
