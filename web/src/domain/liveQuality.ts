import type { ProbeReport } from './prv';
export const QUALITY_METHOD='resting-quality-v4';
export const ACTIVITY_METRIC='enmo-g980665-v1';
export interface MotionRange {startNs:string;endNs:string}
const unavailable=(reason:string)=>({rms:null,enmoMaxMg:null,peakEndAgoSeconds:null,lastMotionEndNs:null as string|null,motionRanges:[] as MotionRange[],reason});
/** ENMO = mean(max(||a|| / g - 1, 0)) * 1000; diagnostic only.
 * van Hees et al. 2013, doi:10.1371/journal.pone.0061691.
 * No Pixel Watch activity or stress threshold has been validated here. */
export function enmoMg(values:number[][]) {
  if(!values.length||values.some(v=>v.length<3||v.slice(0,3).some(x=>!Number.isFinite(x))))return null;
  return values.reduce((s,v)=>s+Math.max(0,Math.hypot(v[0],v[1],v[2])/9.80665-1)*1000,0)/values.length;
}
export function motionQuality(report: ProbeReport,blockSeconds:5|15=15) {
  const all=report.events.filter(e=>e.sensorStringType==='android.sensor.accelerometer' && e.values.length>=3);
  if(all.length<100)return unavailable('体動データが不足しています');
  const end=BigInt(all[all.length-1].sensorTimestampNs);
  const ppg=report.events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg');
  if(ppg.length && Math.abs(Number(BigInt(ppg[ppg.length-1].sensorTimestampNs)-end))>2_000_000_000)
    return unavailable('体動データの時刻が脈波と一致していません');
  // Match the PPG interval used by analyzePpg (10 s/1 s edge exclusions).
  // Checking only the latest 300 s can miss movement still present in its ~349 s window.
  const start=ppg.length>1?BigInt(ppg[0].sensorTimestampNs)+10_000_000_000n:BigInt(all[0].sensorTimestampNs);
  const analysisEnd=ppg.length>1?BigInt(ppg[ppg.length-1].sensorTimestampNs)-1_000_000_000n:end;
  const recent=all.filter(e=>BigInt(e.sensorTimestampNs)>=start && BigInt(e.sensorTimestampNs)<=analysisEnd);
  if(recent.length<100)return unavailable('体動の確認中です');
  const span=Number(BigInt(recent[recent.length-1].sensorTimestampNs)-BigInt(recent[0].sensorTimestampNs))/1e9;
  if(span<10)return unavailable('体動の確認中です');
  if(BigInt(recent[0].sensorTimestampNs)-start>500_000_000n || analysisEnd-BigInt(recent[recent.length-1].sensorTimestampNs)>500_000_000n)
    return unavailable('解析区間全体の体動データがそろっていません');
  for(let i=1;i<recent.length;i++) {
    const delta=Number(BigInt(recent[i].sensorTimestampNs)-BigInt(recent[i-1].sensorTimestampNs))/1e6;
    if(delta<=0 || delta>500)return unavailable('体動データに欠落または時刻異常があります');
  }
  // Overlap blocks on the sensor's clock so a poll cannot split
  // the same brief movement differently. Include both edges of the PPG window.
  const second=1_000_000_000n, duration=BigInt(blockSeconds)*second;
  const times=recent.map(event=>BigInt(event.sensorTimestampNs));
  const lastStart=analysisEnd-duration;
  const starts=[start];
  for(let t=(start/second+1n)*second;t<lastStart;t+=second)starts.push(t);
  if(lastStart>start)starts.push(lastStart);
  // Prefix sums evaluate overlapping blocks without rescanning each sample.
  // Centering first keeps the variance subtraction stable near constant gravity.
  const origin=recent[0].values;
  const sums=Array.from({length:3},()=>new Float64Array(recent.length+1));
  const squared=new Float64Array(recent.length+1);
  const enmoSums=new Float64Array(recent.length+1);
  for(let i=0;i<recent.length;i++){
    const values=recent[i].values;
    const enmo=enmoMg([values]);
    if(enmo===null)return unavailable('体動データに無効な値があります');
    let magnitude=0;
    for(let c=0;c<3;c++){
      const value=values[c]-origin[c];
      sums[c][i+1]=sums[c][i]+value;
      magnitude+=value*value;
    }
    squared[i+1]=squared[i]+magnitude;
    enmoSums[i+1]=enmoSums[i]+enmo;
  }
  let first=0,last=0,rms=-Infinity,enmoMaxMg=0,peakEndAgoSeconds=0;
  let lastMotionEndNs:string|null=null;
  const motionRanges:MotionRange[]=[];
  for(const blockStart of starts) {
    const blockEnd=blockStart+duration<analysisEnd?blockStart+duration:analysisEnd;
    while(first<times.length && times[first]<blockStart)first++;
    while(last<times.length && times[last]<=blockEnd)last++;
    const count=last-first;
    if(count<100)continue;
    enmoMaxMg=Math.max(enmoMaxMg,(enmoSums[last]-enmoSums[first])/count);
    const meanSquared=sums.reduce((total,sum)=>total+((sum[last]-sum[first])/count)**2,0);
    const blockRms=Math.sqrt(Math.max(0,(squared[last]-squared[first])/count-meanSquared));
    if(blockRms>.35){
      lastMotionEndNs=String(blockEnd);
      const previous=motionRanges[motionRanges.length-1];
      if(previous && BigInt(previous.endNs)>=blockStart)previous.endNs=String(blockEnd);
      else motionRanges.push({startNs:String(blockStart),endNs:String(blockEnd)});
    }
    if(blockRms>rms){
      rms=blockRms;
      peakEndAgoSeconds=Number(analysisEnd-blockEnd)/1e9;
    }
  }
  if(!Number.isFinite(rms))return unavailable('体動データが不足しています');
  return {rms,enmoMaxMg,peakEndAgoSeconds,lastMotionEndNs,motionRanges,reason:rms>.35?'解析区間の加速度変化が安静時の判定基準を超えています':null};
}
export function heartSensorQuality(report: ProbeReport): string|null {
  const rows=report.events.filter(e=>e.sensorStringType==='android.sensor.heart_rate');
  const last=rows[rows.length-1];
  if(!last || !Number.isFinite(last.values[0]) || last.values[0]<=0)return '時計の心拍センサーが有効な値を報告していません';
  const ppg=report.events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg');
  if(ppg.length && Math.abs(Number(BigInt(ppg[ppg.length-1].sensorTimestampNs)-BigInt(last.sensorTimestampNs)))>15_000_000_000)
    return '時計の心拍データが更新されていません';
  // TYPE_HEART_RATE reports NO_CONTACT=-1, UNRELIABLE=0, then accuracy 1..3.
  if(last.accuracy==null || last.accuracy<=0)return '時計の心拍センサーが未接触・精度不明です';
  return null;
}

export function wearWindowQuality(report: ProbeReport, analysisReport: ProbeReport): string | null {
  const pulses = analysisReport.events.filter(event => event.sensorStringType === 'com.google.wear.sensor.ppg');
  if (!pulses.length) return null;
  const start = BigInt(pulses[0].sensorTimestampNs) + 10_000_000_000n;
  const end = BigInt(pulses[pulses.length - 1].sensorTimestampNs) - 1_000_000_000n;
  if (end <= start) return null;
  const reason = '解析区間に時計を外していた可能性のある時間が含まれています';
  let worn: boolean | undefined;
  for (const event of report.events) {
    if (event.sensorStringType !== 'android.sensor.low_latency_offbody_detect') continue;
    const value = event.values[0];
    if (value !== 0 && value !== 1) continue;
    const time = BigInt(event.sensorTimestampNs);
    if (time > end) break;
    if (time > start && (worn !== true || value === 0)) return reason;
    if (time === start && value === 0) return reason;
    worn = value === 1;
  }
  return worn === false ? reason : null;
}
