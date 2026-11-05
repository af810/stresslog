import {analyzeLivePpg,analyzeShortLivePpg,type ProbeReport} from './prv.ts';
import {motionQuality} from './liveQuality.ts';

export function analyzeShortRestingLivePpg(report:ProbeReport){
  const result=analyzeShortLivePpg(report);
  return {result,motion:motionQuality(result.windowReport),trimmedForMotion:false};
}

/** Try the newest 315 seconds when earlier movement blocks the larger window.
 * The detector still requires 300 valid seconds and every existing quality gate.
 * This fixed duration leaves 15 seconds for filter edges and beat boundaries.
 * Selection never depends on the resulting RMSSD or a reported stress label.
 */
export function analyzeRestingLivePpg(report:ProbeReport) {
  const result=analyzeLivePpg(report);
  const motion=motionQuality(result.windowReport);
  const original={result,motion,trimmedForMotion:false};
  if(!motion.lastMotionEndNs)return original;
  const pulses=result.windowReport.events.filter(event=>event.sensorStringType==='com.google.wear.sensor.ppg');
  const end=BigInt(pulses[pulses.length-1].sensorTimestampNs);
  const start=end-315_000_000_000n;
  if(start<=BigInt(pulses[0].sensorTimestampNs))return original;
  const tail=analyzeLivePpg({...result.windowReport,
    events:result.windowReport.events.filter(event=>BigInt(event.sensorTimestampNs)>=start)});
  const tailMotion=motionQuality(tail.windowReport);
  if(tail.reasons.length || tailMotion.reason || tail.validIntervalSeconds<300)return original;
  return {result:tail,motion:tailMotion,trimmedForMotion:true};
}
