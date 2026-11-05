import {describe,it,expect} from 'vitest';
import {analyzeRestingLivePpg} from '../liveAnalysis';
import type {ProbeReport} from '../prv';

function report(movementSecond:number):ProbeReport {
  const events:ProbeReport['events']=Array.from({length:36000},(_,i)=>({
    sensorStringType:'com.google.wear.sensor.ppg',
    sensorTimestampNs:String(BigInt(i)*10_000_000n),
    values:[-10,100,-10,100,-10,1000+100*Math.sin(2*Math.PI*(i/100+.02*Math.sin(i/200))),...Array(10).fill(0)],
  }));
  for(let i=0;i<9000;i++)events.push({
    sensorStringType:'android.sensor.accelerometer',
    sensorTimestampNs:String(BigInt(i)*40_000_000n),
    values:[i===movementSecond*25?30:0,0,9.8],
  });
  for(let i=0;i<360;i++)events.push({
    sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(BigInt(i)*1_000_000_000n),
    values:[60],accuracy:3,
  });
  return {model:'Google Pixel Watch',startedAtEpochMs:0,reason:'completed_test',events};
}

describe('continuous resting tail selection',()=>{
  it('recovers five quiet minutes after earlier movement without lowering the motion limit',()=>{
    const analysis=analyzeRestingLivePpg(report(20));
    expect(analysis.trimmedForMotion).toBe(true);
    expect(analysis.motion.reason).toBeNull();
    expect(analysis.result.reasons).toEqual([]);
    expect(analysis.result.validIntervalSeconds).toBeGreaterThanOrEqual(300);
    expect(analysis.result.sourceSeconds).toBeLessThan(350);
  });
  it('holds if recent movement leaves too little continuous resting data',()=>{
    const analysis=analyzeRestingLivePpg(report(180));
    expect(analysis.trimmedForMotion).toBe(false);
    expect(analysis.motion.reason).not.toBeNull();
  });
  it('keeps the original window if it is already quiet',()=>{
    const analysis=analyzeRestingLivePpg(report(-1));
    expect(analysis.trimmedForMotion).toBe(false);
    expect(analysis.motion.reason).toBeNull();
    expect(analysis.result.sourceSeconds).toBeCloseTo(359.99);
  });
  it('does not treat missing acceleration as a resting segment',()=>{
    const original=report(20);
    original.events=original.events.filter(event=>event.sensorStringType!=='android.sensor.accelerometer' ||
      BigInt(event.sensorTimestampNs)<200_000_000_000n);
    const analysis=analyzeRestingLivePpg(original);
    expect(analysis.trimmedForMotion).toBe(false);
    expect(analysis.motion.reason).not.toBeNull();
  });
  it('keeps pulse quality requirements when movement can be excluded',()=>{
    const original=report(20);
    original.events=original.events.map(event=>event.sensorStringType==='com.google.wear.sensor.ppg' &&
      BigInt(event.sensorTimestampNs)>120_000_000_000n?
      {...event,values:[...event.values.slice(0,5),1000,...event.values.slice(6)]}:event);
    const analysis=analyzeRestingLivePpg(original);
    expect(analysis.trimmedForMotion).toBe(false);
    expect(analysis.result.reasons.length).toBeGreaterThan(0);
  });
});
