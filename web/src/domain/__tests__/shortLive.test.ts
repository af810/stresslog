import {describe,it,expect} from 'vitest';
import {analyzeLivePpg,analyzeShortLivePpg,SHORT_LIVE_METHOD,LIVE_METHOD,type ProbeReport} from '../prv';
import {analyzeShortRestingLivePpg} from '../liveAnalysis';

function recording(seconds=360):ProbeReport{
  const events:ProbeReport['events']=[];
  for(let i=0;i<seconds*100;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',
    sensorTimestampNs:String(BigInt(i)*10_000_000n),
    values:[-10,100,-10,100,-10,1000+100*Math.sin(2*Math.PI*(i/100+.02*Math.sin(i/200))),...Array(10).fill(0)]});
  for(let i=0;i<seconds*25;i++)events.push({sensorStringType:'android.sensor.accelerometer',
    sensorTimestampNs:String(BigInt(i)*40_000_000n),values:[0,0,9.8]});
  for(let i=0;i<seconds;i++)events.push({sensorStringType:'android.sensor.heart_rate',
    sensorTimestampNs:String(BigInt(i)*1_000_000_000n),values:[60],accuracy:3});
  return {model:'Google Pixel Watch',startedAtEpochMs:0,reason:'completed_synthetic',events};
}
function layoutSwitch(report:ProbeReport,second:number){
  return {...report,events:report.events.map(event=>event.sensorStringType==='com.google.wear.sensor.ppg' &&
    BigInt(event.sensorTimestampNs)>=BigInt(second)*1_000_000_000n?
    {...event,values:[-10,100,-10,100,100,-10,event.values[5],...Array(9).fill(0)]}:event)};
}
describe('separate two-minute live PRV protocol',()=>{
  it('analyzes a fixed latest interval without changing the original five-minute protocol',()=>{
    const report=recording(150),short=analyzeShortLivePpg(report),long=analyzeLivePpg(report);
    expect(short.method).toBe(SHORT_LIVE_METHOD);expect(long.method).toBe(LIVE_METHOD);
    expect(short.sourceSeconds).toBeLessThanOrEqual(140);
    expect(short.validIntervalSeconds).toBeGreaterThanOrEqual(120);
    expect(short.reasons).toEqual([]);expect(short.metrics!.heartRate).toBeCloseTo(60,0);
    expect(long.reasons).toContain('解析可能な拍動区間が5分未満です');
  });
  it('does not admit less than two valid minutes',()=>{
    const short=analyzeShortLivePpg(recording(130));
    expect(short.validIntervalSeconds).toBeLessThan(120);
    expect(short.reasons).toContain('解析可能な拍動区間が2分未満です');
  });
  it('uses only the latest stable layout after two minutes and never combines layouts',()=>{
    const report=layoutSwitch(recording(240),100);
    expect(()=>analyzeLivePpg(report)).toThrow('形式が切り替わった');
    const short=analyzeShortLivePpg(report);
    expect(short.channel).toBe(6);expect(short.reasons).toEqual([]);
    expect(short.windowReport.events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg').every(e=>e.values[6]>0)).toBe(true);
  });
  it('still waits when the latest layout or post-gap segment is too short',()=>{
    expect(()=>analyzeShortLivePpg(layoutSwitch(recording(360),300))).toThrow('形式が切り替わった');
    const report=recording();
    report.events=report.events.filter(event=>event.sensorStringType!=='com.google.wear.sensor.ppg' ||
      BigInt(event.sensorTimestampNs)<249_000_000_000n || BigInt(event.sensorTimestampNs)>251_000_000_000n);
    expect(()=>analyzeShortLivePpg(report)).toThrow('脈波が途切れた');
  });
  it('excludes older movement from the shorter protocol while holding recent movement',()=>{
    const make=(second:number)=>{
      const report=recording();
      report.events=report.events.map(event=>event.sensorStringType==='android.sensor.accelerometer' &&
        event.sensorTimestampNs===String(BigInt(second)*1_000_000_000n)?{...event,values:[30,0,9.8]}:event);
      return analyzeShortRestingLivePpg(report);
    };
    expect(make(180).motion.reason).toBeNull();
    expect(make(300).motion.reason).not.toBeNull();
  });
  it('keeps missing-data, level-shift and unknown-payload guards',()=>{
    const missing=recording();missing.events=missing.events.filter(event=>event.sensorStringType!=='com.google.wear.sensor.ppg' ||
      BigInt(event.sensorTimestampNs)<300_000_000_000n || BigInt(event.sensorTimestampNs)>300_100_000_000n);
    expect(analyzeShortLivePpg(missing).reasons).toContain('サンプル時刻に欠測候補があります');
    const step=recording();step.events=step.events.map(event=>event.sensorStringType==='com.google.wear.sensor.ppg' &&
      BigInt(event.sensorTimestampNs)>300_000_000_000n?{...event,values:[...event.values.slice(0,5),event.values[5]+10000,...event.values.slice(6)]}:event);
    expect(analyzeShortLivePpg(step).reasons).toContain('脈波の基準値が急変したため、安定したデータを待っています');
    const unknown=recording();unknown.events=unknown.events.map(event=>event.sensorStringType==='com.google.wear.sensor.ppg'?{...event,values:[1,2]}:event);
    expect(()=>analyzeShortLivePpg(unknown)).toThrow('形式を確認できません');
  });
});
