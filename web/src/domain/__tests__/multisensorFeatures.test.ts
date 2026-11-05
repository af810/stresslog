import {describe,it,expect} from 'vitest';
import {extractMultisensorFeatures} from '../multisensorFeatures';
import type {LiveWindow} from '../liveWindow';

const now=Date.parse('2026-11-05T20:00:00+09:00');
function capture(quietPpg=false):LiveWindow{
  const events:LiveWindow['report']['events']=[];
  for(let i=0;i<14000;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10_000_000n),
    values:quietPpg?[-10,100,-10,100,-10,1000+100*Math.sin(2*Math.PI*(i/100+.02*Math.sin(i/200))),...Array(10).fill(0)]:[1,2]});
  for(let i=0;i<3500;i++)events.push({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(BigInt(i)*40_000_000n),
    values:[quietPpg?0:i%2?1:-1,0,9.80665]});
  for(let i=0;i<140;i++)events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(BigInt(i)*1_000_000_000n),values:[60],accuracy:3});
  return {connected:true,ppgFresh:true,worn:true,lastReceivedAt:now-500,lastPpgReceivedAt:now-500,ppgLagMs:50,
    windowSeconds:139.99,sampleCount:14000,droppedEvents:0,batteryPercent:60,model:'Google Pixel Watch',sessionId:'synthetic-test',
    clockSkewMs:0,streamErrors:0,registrations:{ppg:true,heartRate:true,acceleration:true},
    report:{model:'Google Pixel Watch',startedAtEpochMs:now-140000,reason:'completed_test',events}};
}
describe('research HR and motion features, with optional strictly gated PRV',()=>{
  it('keeps moving HR/acceleration observations without inventing unavailable PRV',()=>{
    const result=extractMultisensorFeatures(capture(),now);
    expect(result.coreAvailable).toBe(true);
    expect(result.features!.heartRateMedian).toBe(60);
    expect(result.features!.activityJerkMean).toBeGreaterThan(0);
    expect(result.features!.lnRmssd).toBeNull();expect(result.features!.prvAvailable).toBe(false);
    expect(result.prvReasons.length).toBeGreaterThan(0);
  });
  it('only includes PRV when the existing strict protocol passes',()=>{
    const result=extractMultisensorFeatures(capture(true),now);
    expect(result.coreAvailable).toBe(true);expect(result.features!.prvAvailable).toBe(true);
    expect(result.features!.lnRmssd).not.toBeNull();expect(result.prvReasons).toEqual([]);
  });
  it('blocks an unworn watch even if heart and motion events are present',()=>{
    for(const worn of [false,null])expect(extractMultisensorFeatures({...capture(),worn},now).coreAvailable).toBe(false);
  });
  it('does not treat putting the watch back on as continuous contact for the prior two minutes',()=>{
    const data=capture();data.report.events.push(
      {sensorStringType:'android.sensor.low_latency_offbody_detect',sensorTimestampNs:'50000000000',values:[0]},
      {sensorStringType:'android.sensor.low_latency_offbody_detect',sensorTimestampNs:'100000000000',values:[1]});
    expect(extractMultisensorFeatures(data,now).coreAvailable).toBe(false);
  });
  it('does not mistake fresh optical data for fresh stopped HR and motion sensors',()=>{
    const data=capture();data.report.events=data.report.events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg' || BigInt(e.sensorTimestampNs)<100_000_000_000n);
    expect(extractMultisensorFeatures(data,now).coreAvailable).toBe(false);
  });
  it('holds missing motion data, stale or unreliable HR, and queue delays',()=>{
    const missing=capture();missing.report.events=missing.report.events.filter(e=>e.sensorStringType!=='android.sensor.accelerometer' ||
      BigInt(e.sensorTimestampNs)<80_000_000_000n || BigInt(e.sensorTimestampNs)>81_000_000_000n);
    expect(extractMultisensorFeatures(missing,now).coreAvailable).toBe(false);
    const unreliable=capture();unreliable.report.events=unreliable.report.events.map(e=>e.sensorStringType==='android.sensor.heart_rate'?{...e,accuracy:0}:e);
    expect(extractMultisensorFeatures(unreliable,now).coreAvailable).toBe(false);
    expect(extractMultisensorFeatures({...capture(),ppgLagMs:20000},now).coreAvailable).toBe(false);
    expect(extractMultisensorFeatures({...capture(),connected:false},now).coreAvailable).toBe(false);
  });
  it('fails closed on malformed sensor timestamps rather than repairing them',()=>{
    const data=capture();data.report.events[0].sensorTimestampNs='invalid';
    const result=extractMultisensorFeatures(data,now);expect(result.coreAvailable).toBe(false);
  });
});
