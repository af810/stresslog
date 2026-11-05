import {describe,it,expect} from 'vitest';
import parityFixtures from '../../../tools/population/artifacts/parity-fixtures.json' with {type:'json'};
import {extractPopulationObservation,populationFeatures,type PopulationFeatures} from './populationFeatures';
import {predictPopulationStress,parsePopulationObservation,POPULATION_MODEL_INFO} from './populationStress';
import type {LiveWindow} from './liveWindow';

export function testWindow(now:number):LiveWindow {
  const events:LiveWindow['report']['events']=[];
  const origin=1_000_000_000n;
  for(let i=0;i<=7100;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(origin+BigInt(i)*10_000_000n),values:[0]});
  for(let i=0;i<=1775;i++)events.push({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(origin+BigInt(i)*40_000_000n),values:[0,0,9.80665]});
  for(let i=0;i<=71;i++)events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(origin+BigInt(i)*1_000_000_000n),values:[80],accuracy:3});
  return {connected:true,ppgFresh:true,worn:true,lastReceivedAt:now,lastPpgReceivedAt:now,ppgLagMs:0,windowSeconds:71,
    sampleCount:7101,droppedEvents:0,batteryPercent:75,model:'test-watch',sessionId:'test-session',clockSkewMs:0,
    registrations:{ppg:true,heartRate:true,acceleration:true},streamErrors:0,
    report:{model:'test-watch',startedAtEpochMs:now-71000,reason:'completed_test',events}};
}

describe('population model',()=>{
  it('matches all independently exported scikit-learn predictions with float32 tree inputs',()=>{
    const fixtures=parityFixtures as unknown as {features:PopulationFeatures;expected:number;head:string}[];
    expect(fixtures.length).toBe(64);
    for(const row of fixtures){const result=predictPopulationStress(row.features)!;
      expect(result.head).toBe(row.head);expect(result.value/100).toBeCloseTo(row.expected,12);}
  });
  it('predicts a first session without any personal observations or usable PRV',()=>{
    const now=Date.now(),result=extractPopulationObservation(testWindow(now),now);
    expect(result.reason).toBeNull();expect(result.observation?.features.prvAvailable).toBe(false);
    const estimate=predictPopulationStress(result.observation!.features)!;
    expect(estimate.value).toBeGreaterThanOrEqual(0);expect(estimate.value).toBeLessThanOrEqual(100);
    expect(estimate.head).toBe('heartMotion');expect(POPULATION_MODEL_INFO.personalBaseline).toBe(false);
    expect(predictPopulationStress({...result.observation!.features,subjectiveStress:0,baseline:[10,20]})).toEqual(
      predictPopulationStress({...result.observation!.features,subjectiveStress:10,baseline:[]}));
  });
  it('does not promote stale, off-body or mismatched sensor clocks to a current value',()=>{
    const now=Date.now(),window=testWindow(now);
    expect(extractPopulationObservation({...window,connected:false},now).observation).toBeNull();
    expect(extractPopulationObservation(window,now+16000).observation).toBeNull();
    expect(extractPopulationObservation({...window,worn:false},now).observation).toBeNull();
    const stalled={...window,report:{...window.report,events:window.report.events.filter(e=>e.sensorStringType!=='android.sensor.accelerometer'||BigInt(e.sensorTimestampNs)<40_000_000_000n)}};
    expect(extractPopulationObservation(stalled,now).observation).toBeNull();
    expect(extractPopulationObservation({...window,streamErrors:1},now).observation).toBeNull();
    const offBody={...window,report:{...window.report,events:[...window.report.events,{sensorStringType:'android.sensor.low_latency_offbody_detect',sensorTimestampNs:'70000000000',values:[0]}]}};
    expect(extractPopulationObservation(offBody,now).observation).toBeNull();
  });
  it('rejects an incomplete first window and invalid cached features',()=>{
    const now=Date.now(),window=testWindow(now);
    const short={...window,report:{...window.report,events:window.report.events.filter(e=>BigInt(e.sensorTimestampNs)>50_000_000_000n)}};
    expect(extractPopulationObservation(short,now).observation).toBeNull();
    const observation=extractPopulationObservation(window,now).observation!;
    expect(parsePopulationObservation(observation)).toEqual(observation);
    expect(parsePopulationObservation({...observation,features:{...observation.features,heartSource:'reference'}})).toBeNull();
    expect(predictPopulationStress({...observation.features,heartRateMedian:NaN})).toBeNull();
    expect(predictPopulationStress({...observation.features,prvAvailable:true,lnRmssd:null})).toBeNull();
  });
  it('shares a label-blind 60-second pulse pipeline across training and watch data',()=>{
    const acceleration=Array.from({length:1500},()=>[0,0,9.80665]);
    const ppg=Array.from({length:6000},(_,i)=>Math.sin(2*Math.PI*1.2*i/100));
    const positive=populationFeatures(ppg,acceleration),negative=populationFeatures(ppg.map(v=>-v),acceleration);
    expect(positive?.heartRateMedian).toBeGreaterThan(65);expect(positive?.heartRateMedian).toBeLessThan(80);
    expect(positive?.heartRateMedian).toBeCloseTo(negative!.heartRateMedian,8);
    expect(populationFeatures(null,acceleration,Array(30).fill(85))?.heartRateMedian).toBe(85);
  });
});
