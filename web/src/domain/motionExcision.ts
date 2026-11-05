/** Offline candidate until validated; not wired into live admission or learning.
 * Keep the existing 15 s overlapping RMS >0.35 m/s² windows and pad by 5 s.
 * Exclude every intersecting IBI; never concatenate IBI series across exclusions.
 * Require >=300 retained seconds plus all original waveform/HR/contact gates.
 * Padding and thresholds are engineering hypotheses, not diagnostic standards.
 */
import {intervalMetrics,type analyzeLivePpg} from './prv.ts';
import type {motionQuality} from './liveQuality.ts';

export const MOTION_EXCISION_PROPOSAL='motion-excision-pad5s-v1';

export function motionExcisionCandidate(result:ReturnType<typeof analyzeLivePpg>,motion:ReturnType<typeof motionQuality>,blockSeconds:5|15=15) {
  if(!motion.reason || !motion.motionRanges.length)return null;
  const pulses=result.windowReport.events.filter(event=>event.sensorStringType==='com.google.wear.sensor.ppg');
  const origin=BigInt(pulses[0].sensorTimestampNs);
  const ranges=motion.motionRanges.map(range=>({startMs:Number(BigInt(range.startNs)-origin)/1e6-5000,
    endMs:Number(BigInt(range.endNs)-origin)/1e6+5000}));
  const motionExcluded=result.intervals.map((_,i)=>{
    const start=result.times[result.peaks[i]],end=result.times[result.peaks[i+1]];
    return ranges.some(range=>start<=range.endMs && end>=range.startMs);
  });
  const valid=result.localValid.map((kept,i)=>kept && !motionExcluded[i]);
  const metrics=intervalMetrics(result.intervals,valid);
  const validIntervalSeconds=result.intervals.reduce((sum,interval,i)=>sum+(valid[i]?interval:0),0)/1000;
  const excludedSeconds=result.intervals.reduce((sum,interval,i)=>sum+(motionExcluded[i]?interval:0),0)/1000;
  const reasons=[...result.reasons];
  if(validIntervalSeconds<300)reasons.push('体動を除いた有効な拍動間隔の合計が5分未満です');
  if(!metrics || metrics.lnRmssd===null)reasons.push('体動を除いた連続間隔が不足しています');
  if(metrics && (result.referenceHr===null || Math.abs(metrics.heartRate-result.referenceHr)>5))
    reasons.push('体動を除いた脈拍数と時計の心拍数が一致していません');
  return {proposal:MOTION_EXCISION_PROPOSAL,blockSeconds,accepted:reasons.length===0,reasons:[...new Set(reasons)],
    metrics,validIntervalSeconds,excludedSeconds,excludedIntervalCount:motionExcluded.filter(Boolean).length,
    localValid:valid,ranges};
}
