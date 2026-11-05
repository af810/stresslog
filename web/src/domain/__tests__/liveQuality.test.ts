import {describe,it,expect} from 'vitest';
import {bandpassPpg} from '../ppgFilter';
import {motionQuality,heartSensorQuality,wearWindowQuality,enmoMg} from '../liveQuality';
import {analyzePpg,LIVE_METHOD,type ProbeReport} from '../prv';
describe('live measurement quality',()=>{
  it('holds a window that overlaps a removal even after the watch is worn again',()=>{
    const ppg=(seconds:number)=>({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(seconds)*1_000_000_000n),values:[1]});
    const wear=(seconds:number,state:number)=>({...ppg(seconds),sensorStringType:'android.sensor.low_latency_offbody_detect',values:[state]});
    const analysis={model:'watch',reason:'completed_test',startedAtEpochMs:0,events:[ppg(30),ppg(360)]};
    const history={...analysis,events:[wear(5,1),wear(20,0),...analysis.events.slice(0,1),wear(45,1),...analysis.events.slice(1)]};
    expect(wearWindowQuality(history,analysis)).toContain('時計を外していた');
    expect(wearWindowQuality({...analysis,events:[wear(5,1),wear(20,0),wear(25,1),...analysis.events]},analysis)).toBeNull();
    expect(wearWindowQuality({...analysis,events:[analysis.events[0],wear(45,1),analysis.events[1]]},analysis)).not.toBeNull();
    expect(wearWindowQuality(analysis,analysis)).toBeNull();
  });
  it('separates constant gravity orientation from norm acceleration without claiming activity validity',()=>{
    const g=9.80665,rotation=Array.from({length:1000},(_,i)=>[g*Math.sin(i/100),0,g*Math.cos(i/100)]);
    expect(enmoMg(rotation)).toBeCloseTo(0,10);
    expect(enmoMg([[0,0,g*1.1],[0,0,g*.9]])).toBeCloseTo(50,8);
    expect(enmoMg([])).toBeNull();expect(enmoMg([[NaN,0,g]])).toBeNull();
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed',events:rotation.map((values,i)=>({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(BigInt(i)*40000000n),values}))};
    const q=motionQuality(r);expect(q.enmoMaxMg).toBeCloseTo(0,8);
    expect(q.reason).not.toBeNull(); // This diagnostic does not silently relax admission gates.
  });
  it('suppresses a large constant offset without introducing non-finite output',()=>{
    const fs=100,x=Array.from({length:3000},(_,i)=>100000+200*Math.sin(2*Math.PI*i/fs));
    const y=bandpassPpg(x,fs);expect(y.every(Number.isFinite)).toBe(true);expect(Math.max(...y.slice(1000,2000))).toBeLessThan(300);
  });
  it('detects known synthetic pulses despite slow baseline drift',()=>{
    const report:ProbeReport={model:'synthetic',startedAtEpochMs:1700000000000,reason:'completed_60_seconds',events:
      Array.from({length:6000},(_,i)=>({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(100000000000n+BigInt(i)*10000000n),values:[10000+1000*Math.sin(i/100*.1)+100*Math.sin(2*Math.PI*i/100)]}))};
    const r=analyzePpg(report,0,false,LIVE_METHOD);expect(r.metrics!.heartRate).toBeCloseTo(60,0);expect(r.peaks.length).toBeGreaterThan(45);expect(r.peaks.length).toBeLessThan(52);
    expect(r.reasons).toContain('解析可能な拍動区間が5分未満です');
  });
  it('requires acceleration and rejects movement anywhere in the rolling window',()=>{
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed',events:[]};expect(motionQuality(r).reason).not.toBeNull();
    r.events=Array.from({length:1000},(_,i)=>({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(BigInt(i)*40000000n),values:[0,0,9.8]}));
    expect(motionQuality(r).reason).toBeNull();
    r.events[300].values[0]=30;expect(motionQuality(r).reason).not.toBeNull();
  });
  it('does not interpret missing motion samples as stillness',()=>{
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed',events:
      Array.from({length:400},(_,i)=>({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(BigInt(i)*40000000n),values:[0,0,9.8]}))};
    r.events.splice(100,30);expect(motionQuality(r).reason).toContain('欠落');
  });
  it('keeps detecting the same movement as the polling endpoint moves across a block boundary',()=>{
    const events=Array.from({length:1126},(_,i)=>({
      sensorStringType:'android.sensor.accelerometer',
      sensorTimestampNs:String(BigInt(i)*40_000_000n),
      values:[i===624||i===626?5:0,0,9.8],
    }));
    const report:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed',events};
    expect(motionQuality({...report,events:events.slice(0,1001)}).reason).toContain('加速度変化');
    expect(motionQuality(report).reason).toContain('加速度変化');
  });
  it('checks motion over the entire PPG analysis window, including its oldest portion',()=>{
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed',events:
      Array.from({length:9001},(_,i)=>({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(BigInt(i)*40000000n),values:[0,0,9.8]}))};
    r.events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:'0',values:[1]},
      {sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:'360000000000',values:[2]});
    expect(motionQuality(r).reason).toBeNull();
    r.events[500].values[0]=30; // 20 seconds: outside the old latest-300-second motion check.
    expect(motionQuality(r).reason).toContain('加速度変化');
    r.events[500].values[0]=0;
    r.events.splice(0,500);expect(motionQuality(r).reason).toContain('全体');
  });
  it('requires the latest heart-rate report to have contact and usable accuracy',()=>{
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed',events:[{sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:'1',values:[65],accuracy:3}]};
    expect(heartSensorQuality(r)).toBeNull();r.events.push({...r.events[0],sensorTimestampNs:'2',values:[0],accuracy:-1});
    expect(heartSensorQuality(r)).not.toBeNull();
  });
  it('does not use an old heart-rate contact reading to approve current PPG',()=>{
    const r:ProbeReport={model:'synthetic',startedAtEpochMs:0,reason:'completed',events:[
      {sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:'0',values:[65],accuracy:3},
      {sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:'20000000000',values:[1]}]};
    expect(heartSensorQuality(r)).toContain('更新されていません');
  });
});
