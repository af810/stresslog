/** Shared WESAD/Pixel Watch feature protocol. No personal baseline or labels.
 * 60 s windows; 100 Hz PPG / 25 Hz acceleration, linear interpolation.
 * Elgendi 2013 pulse detector; time-domain PRV is optional, never replaced by BPM spread.
 * Quality thresholds are engineering choices evaluated with the exported model.
 */
import {elgendiBandpass,elgendiPeaks} from './elgendi.ts';
import {channelFor,intervalMetrics,median,parseProbe,type ProbeEvent} from './prv.ts';
import {enmoMg} from './liveQuality.ts';
import type {LiveWindow} from './liveWindow.ts';

export const POPULATION_FEATURE_METHOD='wesad-wrist60-elgendi100-acc25-v1';
export const BASE_FEATURES=['heartRateMedian','logEnmo','logJerk'] as const;
export const PRV_FEATURES=[...BASE_FEATURES,'lnRmssd','lnSdnn','pnn50'] as const;
export interface PopulationFeatures {
  heartRateMedian:number;logEnmo:number;logJerk:number;
  lnRmssd:number|null;lnSdnn:number|null;pnn50:number|null;
  prvAvailable:boolean;heartSource:'native'|'pulse'|'reference';pulseRejectedFraction:number|null;
  variabilitySource:'prv'|'ecg'|null;
}
export interface PopulationObservation {
  featureMethod:typeof POPULATION_FEATURE_METHOD;at:number;device:string;sessionId:string;
  startNs:string;endNs:string;features:PopulationFeatures;
}
function pulseFeatures(ppg:number[],inverted:boolean){
  const wave=elgendiBandpass(inverted?ppg.map(v=>-v):ppg,100);
  // Label-blind polarity selection and 300 ms refractory suppression are
  // explicit additions to Elgendi's event-block detector for wrist PPG.
  const candidates=elgendiPeaks(wave,100).filter(i=>i>=1000&&i<=5899);
  const peaks=candidates.sort((a,b)=>wave[b]-wave[a]).reduce<number[]>((kept,i)=>{
    if(kept.every(k=>Math.abs(k-i)>=30))kept.push(i);return kept;
  },[]).sort((a,b)=>a-b);
  const intervals=peaks.slice(1).map((p,i)=>(p-peaks[i])*10);
  const valid=intervals.map((v,i)=>{const reference=median(intervals.slice(Math.max(0,i-5),i+6));
    return v>=300&&v<=2000&&Math.abs(v-reference)<=.2*reference;});
  const clean=intervals.filter((_,i)=>valid[i]);
  return {metrics:intervalMetrics(intervals,valid),rejected:intervals.length?1-clean.length/intervals.length:1,
    validMs:clean.reduce((s,v)=>s+v,0),heart:clean.length>=20?median(clean.map(v=>60000/v)):null};
}
export function populationFeatures(ppg:number[]|null,acceleration:number[][],nativeHeart:number[]=[],heartSource:'native'|'reference'='native'):PopulationFeatures|null {
  if(acceleration.length!==1500||acceleration.some(row=>row.length!==3))return null;
  const enmo=enmoMg(acceleration);
  if(enmo===null)return null;
  let jerk=0;
  for(let i=1;i<acceleration.length;i++)jerk+=Math.hypot(...acceleration[i].map((v,j)=>v-acceleration[i-1][j]))*25;
  jerk/=acceleration.length-1;
  let pulseHeart:number|null=null,metrics:ReturnType<typeof intervalMetrics>=null,rejected:number|null=null,prvAvailable=false;
  if(ppg?.length===6000&&ppg.every(Number.isFinite)&&Math.max(...ppg)>Math.min(...ppg)){
    const pulse=[pulseFeatures(ppg,false),pulseFeatures(ppg,true)].sort((a,b)=>a.rejected-b.rejected||b.validMs-a.validMs)[0];
    rejected=pulse.rejected;
    if(rejected<=.2)pulseHeart=pulse.heart;
    metrics=pulse.metrics;
    const differences=ppg.slice(1).map((v,i)=>Math.abs(v-ppg[i])).sort((a,b)=>a-b);
    const jumpThreshold=12*differences[Math.floor(.95*differences.length)];
    let step=false;
    for(let i=200;i<ppg.length-200;i++)if(Math.abs(ppg[i]-ppg[i-1])>jumpThreshold){
      const shift=median(ppg.slice(i,i+200))-median(ppg.slice(i-200,i));
      if(Math.sign(shift)===Math.sign(ppg[i]-ppg[i-1])&&Math.abs(shift)>=.75*Math.abs(ppg[i]-ppg[i-1])){step=true;break;}
    }
    prvAvailable=!step&&rejected<=.05&&pulse.validMs>=40000&&
      metrics!==null&&metrics.pairCount>=20&&metrics.lnRmssd!==null&&metrics.sdnn>0;
  }
  const validHeart=nativeHeart.filter(v=>Number.isFinite(v)&&v>=30&&v<=200);
  const native=validHeart.length>=10?median(validHeart):null;
  const heart=native??pulseHeart;
  if(heart===null||heart<30||heart>200||!Number.isFinite(jerk))return null;
  if(native!==null&&(pulseHeart===null||Math.abs(native-pulseHeart)>8))prvAvailable=false;
  return {heartRateMedian:heart,logEnmo:Math.log1p(enmo),logJerk:Math.log1p(jerk),
    lnRmssd:prvAvailable?metrics!.lnRmssd:null,lnSdnn:prvAvailable?Math.log(metrics!.sdnn):null,
    pnn50:prvAvailable?metrics!.pnn50:null,prvAvailable,heartSource:native===null?'pulse':heartSource,pulseRejectedFraction:rejected,
    variabilitySource:prvAvailable?'prv':null};
}

function uniform(events:ProbeEvent[],start:bigint,hz:number,channels:number[],maxGapMs:number):number[][]|null {
  if(events.length<2)return null;
  const times=events.map(e=>Number(BigInt(e.sensorTimestampNs)-start)/1e6),duration=60000;
  if(times[0]>500||times.at(-1)!<duration-1000/hz)return null;
  for(let i=0;i<events.length;i++){
    if(channels.some(c=>!Number.isFinite(events[i].values[c])))return null;
    if(i&&(times[i]<=times[i-1]||times[i]-times[i-1]>maxGapMs))return null;
  }
  const result:number[][]=[];let cursor=0;
  for(let i=0;i<60*hz;i++){
    const time=i*1000/hz;
    while(cursor+1<times.length-1&&times[cursor+1]<time)cursor++;
    if(time<times[0]){
      // At most half a sample of boundary rounding; never invent missing history.
      if(times[0]-time>1000/hz)return null;
      result.push(channels.map(c=>events[0].values[c]));continue;
    }
    const fraction=(time-times[cursor])/(times[cursor+1]-times[cursor]);
    result.push(channels.map(c=>events[cursor].values[c]+fraction*(events[cursor+1].values[c]-events[cursor].values[c])));
  }
  return result;
}

export function extractPopulationObservation(data:LiveWindow,now:number,historical=false):{observation:PopulationObservation|null;reason:string|null}{
  const blocked=(reason:string)=>({observation:null,reason});
  if(data.lastReceivedAt===null||!data.sessionId)return blocked('時計で計測を開始してください');
  if(!historical&&(!data.connected||!data.ppgFresh||Math.abs(now-data.lastReceivedAt)>15000))return blocked('時計から新しいデータを待っています');
  if(data.worn!==true)return blocked('時計の装着を確認してください');
  if(data.streamErrors||data.clockSkewMs!==null&&Math.abs(data.clockSkewMs)>60000)return blocked('時計の時刻系列を確認できません');
  if(!data.registrations.acceleration)return blocked('体動センサーの接続を確認してください');
  if(!historical&&(data.ppgLagMs===null||(data.ppgLagMs??0)+Math.abs(now-(data.lastPpgReceivedAt??data.lastReceivedAt))>15000))return blocked('受信データの遅延を確認しています');
  let report;try{report=parseProbe(data.report);}catch{return blocked('計測データの形式を確認できません');}
  const allAcc=report.events.filter(e=>e.sensorStringType==='android.sensor.accelerometer');
  const allPpg=report.events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg');
  if(!allAcc.length||!allPpg.length)return blocked('心拍・体動データを蓄積しています（約1分）');
  if(Math.abs(Number(BigInt(allAcc.at(-1)!.sensorTimestampNs)-BigInt(allPpg.at(-1)!.sensorTimestampNs)))>2_000_000_000)
    return blocked('心拍・脈波と体動の新しいデータを待っています');
  const end=BigInt(allAcc.at(-1)!.sensorTimestampNs)<BigInt(allPpg.at(-1)!.sensorTimestampNs)?BigInt(allAcc.at(-1)!.sensorTimestampNs):BigInt(allPpg.at(-1)!.sensorTimestampNs);
  const start=end-60_000_000_000n;
  if(start<0n)return blocked('心拍・体動データを蓄積しています（約1分）');
  for(const event of report.events)if(event.sensorStringType==='android.sensor.low_latency_offbody_detect'&&event.values[0]===0&&BigInt(event.sensorTimestampNs)>=start&&BigInt(event.sensorTimestampNs)<=end)
    return blocked('時計を着け直した後の約1分を蓄積しています');
  const select=(events:ProbeEvent[])=>events.filter(e=>BigInt(e.sensorTimestampNs)>=start-50_000_000n&&BigInt(e.sensorTimestampNs)<=end+50_000_000n);
  const acc=uniform(select(allAcc),start,25,[0,1,2],500);
  if(!acc)return blocked('直近約1分の体動データを蓄積しています');
  const pulses=select(allPpg),channel=pulses.length?channelFor(pulses.at(-1)!.values):undefined;
  const ppg=channel!==undefined&&pulses.every(e=>channelFor(e.values)===channel)?uniform(pulses,start,100,[channel],50)?.map(row=>row[0])??null:null;
  const hr=report.events.filter(e=>e.sensorStringType==='android.sensor.heart_rate'&&BigInt(e.sensorTimestampNs)>=start&&BigInt(e.sensorTimestampNs)<=end);
  const valid=hr.filter(e=>e.accuracy!=null&&e.accuracy>0&&e.values[0]>=30&&e.values[0]<=200);
  const usable=valid.length>=10&&valid.length>=.8*hr.length&&end-BigInt(valid.at(-1)!.sensorTimestampNs)<=15_000_000_000n&&BigInt(valid.at(-1)!.sensorTimestampNs)-BigInt(valid[0].sensorTimestampNs)>=30_000_000_000n;
  const features=populationFeatures(ppg,acc,usable?valid.map(e=>e.values[0]):[]);
  if(!features)return blocked('有効な心拍または脈波データを待っています');
  const at=data.lastReceivedAt-(data.ppgLagMs??0)-Number(BigInt(allPpg.at(-1)!.sensorTimestampNs)-end)/1e6;
  return {observation:{featureMethod:POPULATION_FEATURE_METHOD,at,device:data.model,sessionId:data.sessionId,startNs:String(start),endNs:String(end),features},reason:null};
}
