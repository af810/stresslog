import { describe, expect, it } from 'vitest';
import { analyzePpg, compareBaseline, intervalMetrics, parseProbe, type ProbeReport } from '../prv';
function signal(seconds=30): ProbeReport {
  return {model:'test',startedAtEpochMs:1700000000000,reason:`completed_${seconds}_seconds`,events:
    Array.from({length:seconds*100},(_,i)=>({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:(100000000000000n+BigInt(i)*10000000n).toString(),values:[100+Math.sin(i/100*Math.PI*2)]}))};
}
describe('PRV scientific metrics and fail-closed gates',()=>{
  it('uses RMSSD and sample SDNN definitions',()=>{
    const m=intervalMetrics([1000,1100,1000])!;
    expect(m.rmssd).toBeCloseTo(100);expect(m.sdnn).toBeCloseTo(57.7350269);
    expect(m.lnRmssd).toBeCloseTo(Math.log(100));expect(m.pnn50).toBe(100);
  });
  it('never bridges an excluded interval when computing successive differences',()=>{
    expect(intervalMetrics([1000,2000,1300,1250],[true,false,true,true])!.rmssd).toBe(50);
    expect(intervalMetrics([1000,2000,1300],[true,false,true])).toBeNull();
  });
  it('does not take logarithm of zero',()=>expect(intervalMetrics([1000,1000,1000])!.lnRmssd).toBeNull());
  it('rejects BPM-only reports instead of constructing fake intervals',()=>expect(()=>analyzePpg({...signal(),events:signal().events.map(e=>({...e,sensorStringType:'android.sensor.heart_rate'}))},0)).toThrow());
  it('detects known synthetic pulses but refuses a short recording',()=>{
    const r=analyzePpg(signal(),0);expect(r.metrics!.heartRate).toBeCloseTo(60,0);
    expect(r.reasons).toContain('解析可能な拍動区間が5分未満です');
  });
  it('rejects duplicate timestamps',()=>{const r=signal();r.events[10].sensorTimestampNs=r.events[9].sensorTimestampNs;expect(()=>analyzePpg(r,0)).toThrow('重複');});
  it('flags a timestamp gap',()=>{const r=signal();r.events.splice(1100,5);expect(analyzePpg(r,0).gapCount).toBe(1);});
  it('rejects malformed JSON values',()=>expect(()=>parseProbe({...signal(),events:[{sensorTimestampNs:'1',sensorStringType:'x',values:[null]}]})).toThrow());
  it('excludes current measurement and incompatible protocols from baseline',()=>{
    const entries=Array.from({length:7},(_,i)=>({id:String(i),day:String(i),key:'k',lnRmssd:3+i/10}));
    expect(compareBaseline(3,'k','0',entries).z).toBeNull();expect(compareBaseline(3,'other','x',entries).days).toBe(0);
    expect(compareBaseline(3,'k','new',entries).z).toBeGreaterThan(0);
  });
  it('requires distinct baseline days and handles zero variance',()=>{
    const sameDay=Array.from({length:10},(_,i)=>({id:String(i),day:'2026-01-01',key:'k',lnRmssd:3}));
    expect(compareBaseline(3,'k','new',sameDay).days).toBe(1);
    expect(compareBaseline(3,'k','new',sameDay.map((e,i)=>({...e,day:String(i)}))).z).toBeNull();
  });
  it('excludes same-day and future baseline entries',()=>{
    const e=[{id:'old',day:'2026-01-01',key:'k',lnRmssd:3},{id:'future',day:'2026-02-01',key:'k',lnRmssd:4}];
    expect(compareBaseline(3,'k','new',e,'2026-01-02').days).toBe(1);
  });
});
