import {populationFeatures,type PopulationFeatures} from '../domain/populationFeatures.ts';
import {median,channelFor} from '../domain/prv.ts';
import type {LiveWindow} from '../domain/liveWindow.ts';
export const COMPARISON_FEATURE_METHOD='wrist120-halves60-history360-v1';
export interface CandidateFeatures {heart:number;heartDelta:number;logEnmo:number;logJerk:number;lagEnmo:number;historyCoverage:number;lnRmssd:number|null;prvAvailable:boolean;quality:number}
export function candidateFeatures(ppg:number[]|null,acc:number[][],heart:number[],history:(number|null)[]):{features:CandidateFeatures;latest:PopulationFeatures}|null{
 if(acc.length!==3000||heart.length<80||ppg!==null&&ppg.length!==12000)return null;
 const halves=[0,1].map(i=>populationFeatures(ppg?.slice(i*6000,(i+1)*6000)??null,acc.slice(i*1500,(i+1)*1500),heart.slice(i*60,(i+1)*60)));
 if(!halves[0]||!halves[1])return null;const [a,b]=halves;
 const available=history.filter((v):v is number=>v!==null&&Number.isFinite(v)),prvAvailable=a.prvAvailable&&b.prvAvailable;
 const logEnmo=Math.log1p((Math.expm1(a.logEnmo)+Math.expm1(b.logEnmo))/2),logJerk=Math.log1p((Math.expm1(a.logJerk)+Math.expm1(b.logJerk))/2);
 return {features:{heart:(a.heartRateMedian+b.heartRateMedian)/2,heartDelta:b.heartRateMedian-a.heartRateMedian,logEnmo,logJerk,lagEnmo:available.length?available.reduce((v,b)=>v+b,0)/available.length:logEnmo,historyCoverage:available.length/4,lnRmssd:prvAvailable?(a.lnRmssd!+b.lnRmssd!)/2:null,prvAvailable,quality:prvAvailable?1:.65},latest:b};
}
export interface CandidateObservation {at:number;sessionId:string;endNs:string;features:CandidateFeatures;latest:PopulationFeatures}
function sample(events:LiveWindow['report']['events'],start:bigint,count:number,hz:number,channels:number[],maxGap:number):number[][]|null{
 const before=start-50_000_000n,end=start+BigInt(count/hz)*1_000_000_000n;
 const rows=events.filter(e=>BigInt(e.sensorTimestampNs)>=before&&BigInt(e.sensorTimestampNs)<=end+50_000_000n);
 if(rows.length<2)return null;const times=rows.map(e=>Number(BigInt(e.sensorTimestampNs)-start)/1e6);
 if(times[0]>1000/hz||times.at(-1)!<(count-1)*1000/hz)return null;
 if(times.some((t,i)=>i>0&&(t<=times[i-1]||t-times[i-1]>maxGap))||rows.some(e=>channels.some(c=>!Number.isFinite(e.values[c]))))return null;
 const out:number[][]=[];let cursor=0;
 for(let i=0;i<count;i++){const t=i*1000/hz;while(cursor+1<rows.length-1&&times[cursor+1]<t)cursor++;const w=Math.max(0,(t-times[cursor])/(times[cursor+1]-times[cursor]));out.push(channels.map(c=>rows[cursor].values[c]+w*(rows[cursor+1].values[c]-rows[cursor].values[c])));}
 return out;
}
export function extractCandidate(data:LiveWindow,now:number):{observation:CandidateObservation|null;reason:string}{
 const none=(reason:string)=>({observation:null,reason});
 if(!data.connected||!data.ppgFresh||data.lastReceivedAt===null||Math.abs(now-data.lastReceivedAt)>15000)return none('新しい時計データを待っています');
 if(data.worn!==true||data.streamErrors||!data.registrations.acceleration||data.clockSkewMs!==null&&Math.abs(data.clockSkewMs)>60000||data.ppgLagMs==null||data.ppgLagMs+Math.abs(now-(data.lastPpgReceivedAt??data.lastReceivedAt))>15000)return none('装着・通信・時刻を確認してください');
 const events=data.report.events,accEvents=events.filter(e=>e.sensorStringType==='android.sensor.accelerometer'),pulseEvents=events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg');
 if(!accEvents.length||!pulseEvents.length)return none('約2分のデータを蓄積しています');
 const accEnd=BigInt(accEvents.at(-1)!.sensorTimestampNs),pulseEnd=BigInt(pulseEvents.at(-1)!.sensorTimestampNs);
 if(Math.abs(Number(accEnd-pulseEnd))>2e9)return none('心拍と体動の同時データを待っています');
 const end=accEnd<pulseEnd?accEnd:pulseEnd,start=end-120_000_000_000n;
 if(events.some(e=>e.sensorStringType==='android.sensor.low_latency_offbody_detect'&&e.values[0]===0&&BigInt(e.sensorTimestampNs)>=start))return none('再装着後の約2分のデータを待っています');
 const acc=sample(accEvents,start,3000,25,[0,1,2],500);if(!acc)return none('連続した約2分の体動データを待っています');
 // Same channel convention as the established watch pipeline; format changes disable PRV.
 const selected=pulseEvents.filter(e=>BigInt(e.sensorTimestampNs)>=start),c=channelFor(selected.at(-1)?.values??[]);
 const pulse=c!==undefined&&selected.every(e=>channelFor(e.values)===c)?sample(pulseEvents,start,12000,100,[c],50)?.map(v=>v[0])??null:null;
 const allHeart=events.filter(e=>e.sensorStringType==='android.sensor.heart_rate'&&BigInt(e.sensorTimestampNs)>=start&&BigInt(e.sensorTimestampNs)<=end);
 const hrEvents=allHeart.filter(e=>e.accuracy!=null&&e.accuracy>0&&e.values[0]>=30&&e.values[0]<=200);
 if(hrEvents.length<.8*allHeart.length)return none('心拍センサーの品質を確認しています');
 // Preserve both halves and reject long native-HR gaps rather than synthesising a heart rate.
 const heart:number[]=[];
 for(let second=0;second<120;second++){const t=start+BigInt(second)*1_000_000_000n;const values=hrEvents.filter(e=>{const n=BigInt(e.sensorTimestampNs);return n>=t&&n<t+1_000_000_000n;}).map(e=>e.values[0]);heart.push(values.length?median(values):NaN);}
 for(let half=0;half<2;half++){
  const positions=heart.slice(half*60,half*60+60).flatMap((v,i)=>Number.isFinite(v)?[i]:[]);
  if(positions.length<30||positions[0]>15||positions.at(-1)!<44||positions.some((p,i)=>i>0&&p-positions[i-1]>15))return none('有効な心拍データを待っています');
 }
 // Native HR arrives about every 1.28 s on this watch. Empty one-second bins are
 // excluded by populationFeatures; they are never filled with an invented BPM.
 const history=[120,180,240,300].map(lag=>{const a=sample(accEvents,end-BigInt(lag+60)*1_000_000_000n,1500,25,[0,1,2],500);return a?Math.log1p(a.reduce((s,v)=>s+Math.max(0,Math.hypot(...v)/9.80665-1)*1000,0)/a.length):null;});
 const result=candidateFeatures(pulse,acc,heart,history);if(!result)return none('信号品質を確認しています');
 const at=data.lastReceivedAt-data.ppgLagMs-Number(pulseEnd-end)/1e6;
 return {observation:{at,sessionId:data.sessionId!,endNs:String(end),...result},reason:''};
}
