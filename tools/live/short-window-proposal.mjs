// Offline duration comparison only, never used to admit live labels or scores.
// A shorter recording agreeing with a longer PPG recording does not establish
// ECG accuracy or psychological stress validity. Thresholds are engineering.
import {analyzePpg,channelFor,LIVE_METHOD} from '../../web/src/domain/prv.ts';
import {motionQuality,heartSensorQuality,wearWindowQuality} from '../../web/src/domain/liveQuality.ts';
const pulse='com.google.wear.sensor.ppg';
const durationReasons=new Set(['解析可能な拍動区間が5分未満です','有効な拍動間隔の合計が5分未満です']);

export function shortWindowProposal(report,minimumSeconds){
  if(![60,120].includes(minimumSeconds))throw Error('Fixed comparison durations only');
  try{
    const samples=report.events.filter(event=>event.sensorStringType===pulse);
    if(!samples.length || report.model!=='Google Pixel Watch')throw Error('Unknown watch or no PPG');
    const channel=channelFor(samples.at(-1).values);
    if(channel===undefined)throw Error('Unknown current PPG layout');
    const end=BigInt(samples.at(-1).sensorTimestampNs);
    let first=samples.length-1;
    while(first>0){
      const delta=BigInt(samples[first].sensorTimestampNs)-BigInt(samples[first-1].sensorTimestampNs);
      if(delta<=0n)throw Error('Nonmonotonic PPG');
      if(delta>1_000_000_000n || channelFor(samples[first-1].values)!==channel)break;
      first--;
    }
    const segmentStart=BigInt(samples[first].sensorTimestampNs);
    const fixedStart=end-BigInt(minimumSeconds+20)*1_000_000_000n;
    const start=segmentStart>fixedStart?segmentStart:fixedStart;
    const sourceSeconds=Number(end-start)/1e9;
    if(sourceSeconds<minimumSeconds+11)return {ready:false,reasons:['Stable current layout is too short'],sourceSeconds};
    const shortReport={...report,events:report.events.filter(event=>BigInt(event.sensorTimestampNs)>=start)};
    const analysis=analyzePpg(shortReport,channel,false,LIVE_METHOD);
    const reasons=analysis.reasons.filter(reason=>!durationReasons.has(reason));
    if(analysis.validIntervalSeconds<minimumSeconds)reasons.push('Not enough retained seconds for this proposal');
    const motion=motionQuality(shortReport);
    reasons.push(motion.reason,heartSensorQuality(shortReport),wearWindowQuality(report,shortReport));
    return {ready:!reasons.some(Boolean),reasons:reasons.filter(Boolean),channel,sourceSeconds,
      validSeconds:analysis.validIntervalSeconds,rmssd:analysis.metrics?.rmssd,
      heartRate:analysis.metrics?.heartRate,motionRms:motion.rms};
  }catch(error){return {ready:false,reasons:[error.message]};}
}
