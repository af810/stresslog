/** Offline candidate only. Never imported by the app or used to label users.
 * Tests fixed 5 s acceleration blocks (>0.35 m/s² vector RMS), with 2 s
 * padding. Keeps existing IBI exclusions, requires >=300 retained seconds.
 * Those are engineering hypotheses, not validated clinical thresholds.
 * Public wrist source: https://doi.org/10.13026/C2PQ1X
 * Timing notes: https://doi.org/10.3390/data2010001, section 4.
 */
import fs from 'node:fs';
import path from 'node:path';
import {analyzePpg,intervalMetrics,LIVE_METHOD,median} from '../../web/src/domain/prv.ts';

const directory=path.resolve(import.meta.dirname,'../../pc-local/live-validation/physionet-wrist-1.0.0');
const records=fs.readdirSync(directory).filter(name=>name.endsWith('.hea')).map(name=>name.slice(0,-4)).sort();
if(records.length!==19)throw Error('Expected the complete 19-record reference');

function readRecord(record){
  const lines=fs.readFileSync(path.join(directory,record+'.hea'),'utf8').trim().split(/\r?\n/);
  const [,count,rate,length]=lines[0].split(/\s+/);
  if(+count!==15 || +rate!==256)throw Error('Unexpected WFDB format');
  const metadata=lines.slice(1,16).map(line=>{
    const parts=line.split(/\s+/),scale=parts[2].match(/^([\d.]+)\((-?\d+)\)\/(.*)$/);
    if(parts[1]!=='16' || !scale)throw Error('Unsupported encoding');
    return {gain:+scale[1],baseline:+scale[2],unit:scale[3],name:parts.at(-1)};
  });
  const signal=fs.readFileSync(path.join(directory,record+'.dat'));
  if(signal.length!==+length*30)throw Error('Wrong WFDB byte count');
  const index=name=>{const i=metadata.findIndex(channel=>channel.name===name);if(i<0)throw Error(`Missing ${name}`);return i;};
  const ppg=index('wrist_ppg'),time=index('sample_times_for_all_signals_apart_from_ecg');
  const accel=['x','y','z'].map(axis=>index('wrist_low_noise_accelerometer_'+axis));
  const physical=(row,column)=>{
    const digital=signal.readInt16LE(row*30+column*2);
    return digital===-32768?null:(digital-metadata[column].baseline)/metadata[column].gain;
  };
  const rows=[];let previous,offset=0,origin;
  for(let i=0;i<+length;i++){
    const wrapped=physical(i,time),value=physical(i,ppg),acc=accel.map(column=>physical(i,column));
    if(wrapped===null || value===null || acc.some(v=>v===null))continue;
    if(previous!==undefined && wrapped-previous < -30)offset+=60;
    const absolute=wrapped+offset;
    if(origin===undefined)origin=absolute;
    const t=(absolute-origin)*1000;
    if(rows.length && t<=rows.at(-1).t)throw Error('Non-monotonic source clock');
    rows.push({t,value,acc});previous=wrapped;
  }
  // ECG is sampled on its own 256 Hz clock; no calibration is fitted to PRV.
  const annotation=fs.readFileSync(path.join(directory,record+'.atr'));
  const beats=[];let sample=0;
  for(let offset=0;offset<annotation.length;offset+=2){
    const word=annotation.readUInt16LE(offset);if(!word)break;
    const type=word>>>10,delta=word&1023;
    if(type===59){sample+=annotation.readInt16LE(offset+2)*65536+annotation.readUInt16LE(offset+4);offset+=4;}
    else if(type===63)offset+=delta+(delta%2);
    else if(type<59){sample+=delta;if(type===1)beats.push(sample*1000/256);
      else if(type!==22 && !(type===0 && !sample && !beats.length))throw Error(`Unhandled ECG annotation ${type}`);}
  }
  return {record,rows,beats,nominalSeconds:(+length-1)/256,elapsedSeconds:rows.at(-1).t/1000};
}

function maskRanges(rows,end){
  const masks=[];
  for(let start=10000;start<end-1000;start+=5000){
    const block=rows.filter(row=>row.t>=start && row.t<Math.min(start+5000,end-1000));
    if(block.length<100){masks.push([start-2000,start+7000]);continue;}
    const center=[0,1,2].map(c=>block.reduce((sum,row)=>sum+row.acc[c],0)/block.length);
    const rms=Math.sqrt(block.reduce((sum,row)=>sum+row.acc.reduce((s,v,c)=>s+(v-center[c])**2,0),0)/block.length);
    if(rms>.35)masks.push([start-2000,Math.min(start+5000,end-1000)+2000]);
  }
  for(let i=1;i<rows.length;i++)if(rows[i].t-rows[i-1].t>25)
    masks.push([rows[i-1].t-2000,rows[i].t+2000]);
  return masks;
}
const intersects=(a,b,masks)=>masks.some(([start,end])=>a<=end && b>=start);
function retainedMetrics(times,valid,masks){
  const intervals=times.slice(1).map((time,i)=>time-times[i]);
  const keep=intervals.map((_,i)=>(valid?.[i]??true) && !intersects(times[i],times[i+1],masks));
  return {seconds:intervals.reduce((sum,value,i)=>sum+(keep[i]?value:0),0)/1000,
    metrics:intervalMetrics(intervals,keep)};
}
const result=[];
for(const record of records){
  const data=readRecord(record),end=Math.min(360000,data.rows.at(-1).t);
  const rows=data.rows.filter(row=>row.t<=end),events=[];let cursor=0;
  // Uniform 100 Hz for the filter, retaining holes rather than fabricating data
  // over source gaps. The detector also independently flags these gaps.
  for(let t=0;t<=rows.at(-1).t;t+=10){
    while(cursor+1<rows.length-1 && rows[cursor+1].t<t)cursor++;
    const a=rows[cursor],b=rows[cursor+1];
    if(b.t-a.t>25)continue;
    const fraction=(t-a.t)/(b.t-a.t);
    events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(Math.round(t*1e6))),
      values:[a.value+fraction*(b.value-a.value)]});
  }
  const masks=maskRanges(rows,end);
  const ecgTimes=data.beats.filter(time=>time>=10000 && time<=end-1000);
  const ecg=retainedMetrics(ecgTimes,null,[]),maskedEcg=retainedMetrics(ecgTimes,null,masks);
  const polarities=[false,true].map(inverted=>{
    const analysis=analyzePpg({model:'Public wrist '+record,startedAtEpochMs:0,reason:'completed_public_reference',events},0,inverted,LIVE_METHOD);
    const times=analysis.peaks.map(peak=>analysis.times[peak]);
    const masked=retainedMetrics(times,analysis.localValid,masks);
    const reasons=analysis.reasons.filter(reason=>!['解析可能な拍動区間が5分未満です','有効な拍動間隔の合計が5分未満です',
      '時計の心拍数との整合を確認できません','サンプル時刻に欠測候補があります'].includes(reason));
    const error=masked.metrics && maskedEcg.metrics?masked.metrics.rmssd-maskedEcg.metrics.rmssd:null;
    return {inverted,unmaskedPrv:analysis.metrics,maskedPrv:masked,maskedEcg,maskedRmssdErrorMs:error,
      waveformReasons:reasons,candidateHas300Seconds:masked.seconds>=300 && !reasons.length};
  });
  result.push({record,subject:record.split('_')[0],windowSeconds:end/1000,elapsedSeconds:data.elapsedSeconds,
    nominalSeconds:data.nominalSeconds,masks:masks.length,ecg,polarities});
}
const output={createdAt:new Date().toISOString(),source:'https://doi.org/10.13026/C2PQ1X',
  scope:'Offline motion-excision candidate only. Separate wearable and ECG clocks; time stamps are unwrapped and NaN padding excluded. Fixed 5 s acceleration blocks, 2 s padding, first up to 360 s. Both polarities reported; no ECG-based polarity selection. Watch heart-rate gate is not evaluated. Not a validation of Pixel Watch, psychological stress, or daily availability.',
  applicationChanged:false,results:result};
fs.writeFileSync(path.join(directory,'motion-masking-audit.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({records:result.length,subjects:new Set(result.map(row=>row.subject)).size,
  longEnough:result.filter(row=>row.windowSeconds>=311).length,
  candidates:result.flatMap(row=>row.polarities.filter(p=>p.candidateHas300Seconds).map(p=>({record:row.record,inverted:p.inverted,
    retainedSeconds:p.maskedPrv.seconds,prvRmssd:p.maskedPrv.metrics.rmssd,ecgRmssd:p.maskedEcg.metrics?.rmssd,errorMs:p.maskedRmssdErrorMs}))),
  output:path.join(directory,'motion-masking-audit.json')}));
