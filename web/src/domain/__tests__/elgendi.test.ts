import {describe,it,expect} from 'vitest';
import {elgendiCoefficients,elgendiBandpass,elgendiPeaks} from '../elgendi';
import {analyzeLivePpg,analyzePpg,ELGENDI_METHOD,BANDPASS_METHOD,LIVE_METHOD,type ProbeReport} from '../prv';

describe('published-method experimental detector',()=>{
  it('does not count a long pulse dropout toward five minutes of valid intervals',()=>{
    const events:ProbeReport['events']=Array.from({length:34000},(_,i)=>({
      sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10000000n),
      values:[i>=14000 && i<18500 ? 1000 : 1000+100*Math.sin(2*Math.PI*i/100)],
    }));
    const result=analyzePpg({model:'synthetic',startedAtEpochMs:0,reason:'completed_test',events},0,false,LIVE_METHOD);
    expect(result.usableSeconds).toBeGreaterThan(300);
    expect(result.rejectedFraction).toBeLessThan(.05);
    expect(result.validIntervalSeconds).toBeLessThan(300);
    expect(result.reasons).toContain('有効な拍動間隔の合計が5分未満です');
  });
  it('selects the observed stable Pixel Watch layout and holds across a layout change',()=>{
    const events:ProbeReport['events']=Array.from({length:6000},(_,i)=>({
      sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10000000n),
      values:[-10,100,-10,100,-10,1000+100*Math.sin(2*Math.PI*i/100),...Array(10).fill(0)],
    }));
    const report={model:'Google Pixel Watch',startedAtEpochMs:0,reason:'completed_60_seconds',events};
    const first=analyzeLivePpg(report);
    const shifted=events.map(e=>({...e,values:[-10,100,-10,100,100,-10,e.values[5],...Array(9).fill(0)]}));
    const second=analyzeLivePpg({...report,events:shifted});
    expect([first.channel,second.channel]).toEqual([5,6]);
    expect(first.peaks).toEqual(second.peaks);
    expect(()=>analyzeLivePpg({...report,events:[...events.slice(0,3000),...shifted.slice(3000)]})).toThrow('形式が切り替わった');
    const stable = Array.from({length:32000},(_,i)=>({
      ...shifted[i % shifted.length], sensorTimestampNs:String(BigInt(i+3000)*10000000n),
    }));
    const oldMotion = {...events[0], sensorStringType:'android.sensor.accelerometer', values:[0,0,9.8]};
    const recovered=analyzeLivePpg({...report,events:[oldMotion,...events.slice(0,3000),...stable]});
    expect(recovered.channel).toBe(6);
    expect(recovered.sourceSeconds).toBeCloseTo(319.99);
    expect(recovered.windowReport.events).toHaveLength(stable.length);
    expect(recovered.usableSeconds).toBeGreaterThan(300);
  });
  it('uses only the latest continuous pulse data after a connection gap',()=>{
    const pulse=(i:number)=>({
      sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10_000_000n),
      values:[-10,100,-10,100,-10,1000+100*Math.sin(2*Math.PI*i/100),...Array(10).fill(0)],
    });
    const before=Array.from({length:1000},(_,i)=>pulse(i));
    const after=Array.from({length:32000},(_,i)=>pulse(i+3000));
    const report={model:'Google Pixel Watch',startedAtEpochMs:0,reason:'completed_test',events:[...before,...after]};
    expect(()=>analyzeLivePpg({...report,events:report.events.slice(0,-1000)})).toThrow('再開後の連続データ');
    const result=analyzeLivePpg(report);
    expect(result.windowReport.events[0]).toBe(after[0]);
    expect(result.validIntervalSeconds).toBeGreaterThan(300);
    expect(result.reasons).not.toContain('サンプル時刻に欠測候補があります');
  });
  it('matches the SciPy 2nd-order Butterworth bandpass transfer function',()=>{
    const expectedA=[1,-3.322060478319159,4.166097483950384,-2.3578340875161743,.5139818942196757];
    const expectedB=[.04125353724172032,0,-.08250707448344063,0,.04125353724172032];
    const {a,b}=elgendiCoefficients(100);
    a.forEach((v,i)=>expect(v).toBeCloseTo(expectedA[i],12));b.forEach((v,i)=>expect(v).toBeCloseTo(expectedB[i],12));
    expect(()=>elgendiCoefficients(10)).toThrow();
  });
  it('recovers known systolic pulse times with diastolic humps and slow drift',()=>{
    const fs=100;
    const raw=Array.from({length:6000},(_,i)=>{
      const t=i/fs,phase=t%1;
      return 50000+1000*Math.sin(.15*t)+200*Math.exp(-(((phase-.2)/.06)**2))+60*Math.exp(-(((phase-.48)/.09)**2));
    });
    const wave=elgendiBandpass(raw,fs),peaks=elgendiPeaks(wave,fs).filter(i=>i>1000&&i<5800);
    expect(wave.every(Number.isFinite)).toBe(true);expect(peaks).toHaveLength(48);
    peaks.forEach((p,i)=>expect(p/fs).toBeCloseTo(10+i+.2,1));
  });
  it('keeps quality gates and method identity when used for diagnostic comparison',()=>{
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed_60_seconds',events:
      Array.from({length:6000},(_,i)=>({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10000000n),values:[10000+100*Math.sin(2*Math.PI*i/100)]}))};
    const a=analyzePpg(r,0,false,ELGENDI_METHOD);
    expect(a.method).toBe(ELGENDI_METHOD);expect(a.metrics!.heartRate).toBeCloseTo(60,0);
    expect(analyzePpg(r,0,false,LIVE_METHOD).peaks).toEqual(a.peaks);
    expect(analyzePpg(r,0,false,BANDPASS_METHOD).method).toBe(BANDPASS_METHOD);
    expect(a.reasons).toContain('解析可能な拍動区間が5分未満です');
    expect(()=>analyzePpg(r,0,false,'unknown')).toThrow('未対応');
  });
  it('flags a persistent level step and holds the live window',()=>{
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed_60_seconds',events:
      Array.from({length:6000},(_,i)=>({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10000000n),values:[100*Math.sin(2*Math.PI*i/100)+(i<3000?0:100000)]}))};
    const a=analyzePpg(r,0,false,LIVE_METHOD);
    expect(a.levelChangeCount).toBe(1);
    expect(a.reasons.join(' ')).toContain('基準値が急変');
  });
});
