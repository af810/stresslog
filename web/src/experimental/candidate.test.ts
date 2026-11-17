import {describe,it,expect} from 'vitest';
import fixtures from '../../../tools/population/comparison-artifacts/parity.json';
import {predictCandidate,CandidateTemporal} from './model';
import {extractCandidate,candidateFeatures,type CandidateFeatures} from './features';
import type {LiveWindow} from '../domain/liveWindow';
function window(now:number):LiveWindow{
 const origin=1_000_000_000n,events:LiveWindow['report']['events']=[];
 for(let i=0;i<=13000;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(origin+BigInt(i)*10_000_000n),values:[0]});
 for(let i=0;i<=3250;i++)events.push({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(origin+BigInt(i)*40_000_000n),values:[0,0,9.80665]});
 for(let i=0;i<=130;i++)events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(origin+BigInt(i)*1_000_000_000n),values:[70],accuracy:3});
 events.sort((a,b)=>Number(BigInt(a.sensorTimestampNs)-BigInt(b.sensorTimestampNs)));
 return {connected:true,ppgFresh:true,worn:true,sessionId:'synthetic-session',model:'synthetic',lastReceivedAt:now,lastPpgReceivedAt:now,ppgLagMs:0,clockSkewMs:0,registrations:{ppg:true,heartRate:true,acceleration:true},streamErrors:0,windowSeconds:130,sampleCount:13001,droppedEvents:0,batteryPercent:80,report:{model:'synthetic',reason:'completed_test',startedAtEpochMs:now-130000,events}};
}
export {window as comparisonTestWindow};
describe('separate candidate model',()=>{
 it('matches Python physical predictions and classifier outputs for 32 public research fixtures',()=>{expect(fixtures).toHaveLength(32);for(const f of fixtures){const p=predictCandidate(f.features as CandidateFeatures)!;expect(p.value).toBeCloseTo(f.expected,10);expect(p.predictedHeart).toBeCloseTo(f.predictedHeart,10);if(f.predictedPrv!==null)expect(p.predictedPrv).toBeCloseTo(f.predictedPrv,10);}});
 it('requires two observed minutes and does not turn stale, off-body, missing-HR or interrupted data into a candidate',()=>{
  const now=Date.now(),w=window(now),r=extractCandidate(w,now);expect(r.observation?.features.heart).toBe(70);expect(r.observation?.features.prvAvailable).toBe(false);
  expect(extractCandidate(w,now+16000).observation).toBeNull();expect(extractCandidate({...w,worn:false},now).observation).toBeNull();
  for(const type of ['android.sensor.accelerometer','android.sensor.heart_rate'])expect(extractCandidate({...w,report:{...w.report,events:w.report.events.filter(e=>e.sensorStringType!==type||BigInt(e.sensorTimestampNs)<30_000_000_000n)}},now).observation).toBeNull();
  expect(extractCandidate({...w,report:{...w.report,events:w.report.events.filter(e=>BigInt(e.sensorTimestampNs)>60_000_000_000n)}},now).observation).toBeNull();
 });
 it('never invents PRV for flat or unusable PPG',()=>{const r=candidateFeatures(Array(12000).fill(0),Array.from({length:3000},()=>[0,0,9.80665]),Array(120).fill(70),[null,null,null,null])!;expect(r.features.lnRmssd).toBeNull();expect(r.features.prvAvailable).toBe(false);expect(predictCandidate({...r.features,prvAvailable:true,lnRmssd:null})).toBeNull();});
 it('accepts the observed 1.276-second HR cadence without filling empty seconds or requiring a reading at each boundary',()=>{
  const now=Date.now(),w=window(now);w.report.events=w.report.events.filter(e=>e.sensorStringType!=='android.sensor.heart_rate');
  for(let i=0;i<102;i++)w.report.events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(1_000_000_000n+BigInt(i)*1_276_000_000n),values:[71],accuracy:3});
  w.report.events.sort((a,b)=>Number(BigInt(a.sensorTimestampNs)-BigInt(b.sensorTimestampNs)));
  expect(extractCandidate(w,now).observation?.features.heart).toBe(71);
 });
 it('suppresses an isolated spike but confirms sustained input using new elapsed time, never duplicate windows',()=>{
  const t=new CandidateTemporal();t.update('s','100',0,10,1);const spike=t.update('s','200',30000,95,1)!;expect(spike.value).toBeLessThan(40);expect(spike.status).toBe('ordinary');expect(t.update('s','200',60000,95,1)).toBeNull();
  const strong=new CandidateTemporal();expect(strong.update('s','100',0,90,1)!.status).toBe('candidate');for(let i=1;i<=3;i++)strong.update('s',String(100+i),i*30000,90,1);expect(strong.state?.confirmed).toBe(true);
  expect(strong.update('s','500',300000,90,1)!.status).toBe('candidate');expect(strong.state?.highSeconds).toBe(0);
 });
 it('resets temporal evidence on a new session and cannot confirm from a long gap',()=>{const t=new CandidateTemporal();t.update('a','1',0,90,1);t.update('a','2',30000,90,1);expect(t.update('b','3',60000,90,1)!.highSeconds).toBe(0);t.reset();expect(t.state).toBeNull();});
});
