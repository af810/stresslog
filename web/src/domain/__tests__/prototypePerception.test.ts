import {describe,it,expect} from 'vitest';
import {trainPrototypePerception,predictPrototypePerception,trainPerceptionPolicy} from '../perceptionModel';
import {MULTISENSOR_FEATURE_METHOD} from '../multisensorFeatures';
import {SHORT_LIVE_METHOD} from '../prv';
import type {PerceptionRecord} from '../perceptionRecord';
const device='synthetic-prototype',at=Date.parse('2026-11-05T12:00:00+09:00'),now=at+86400000;
function records(prv=false):PerceptionRecord[]{return Array.from({length:5},(_,i)=>({
  captureId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,model:device,
  featureMethod:MULTISENSOR_FEATURE_METHOD,prvMethod:SHORT_LIVE_METHOD,recordedAt:at+i*180000,
  windowEndEpochMs:at+i*180000,subjectiveWindowSeconds:120,score:2+i,qualityPassed:true,reasons:[],
  features:{heartRateMedian:65+i*3,heartRateIqr:2,activityEnmoMeanMg:i*2,activityJerkMean:1+i,
    prvAvailable:prv,lnRmssd:prv?4.8-i*.2:null,prvChannel:prv?5:null}}));}
describe('explicit unvalidated prototype',()=>{
  it('outputs from five real-shaped paired records while the accuracy-gated mode still holds',()=>{
    const data=records(),training=trainPrototypePerception(data,device,now);
    const low=predictPrototypePerception(training,device,data[0].features,true),high=predictPrototypePerception(training,device,data[4].features,true);
    expect(low.value).not.toBeNull();expect(high.value!).toBeGreaterThan(low.value!);expect(high.route).toBe('context');
    expect(trainPerceptionPolicy(data,device,now).enabled).toBe(false);
  });
  it('uses PRV only when both the measurement and a matching-layout prototype are available',()=>{
    const data=records(true),training=trainPrototypePerception(data,device,now);
    expect(predictPrototypePerception(training,device,data[2].features,true).route).toBe('prv5');
    expect(predictPrototypePerception(training,device,{...data[2].features!,prvAvailable:false,lnRmssd:null,prvChannel:null},true).route).toBe('context');
    expect(predictPrototypePerception(training,device,{...data[2].features!,prvChannel:6},true).route).toBe('context');
    const withoutPrv=trainPrototypePerception(records(),device,now);
    expect(predictPrototypePerception(withoutPrv,device,data[2].features,true).route).toBe('context');
  });
  it('bounds unfamiliar inputs and marks them rather than claiming the range is validated',()=>{
    const data=records(),training=trainPrototypePerception(data,device,now);
    const result=predictPrototypePerception(training,device,{...data[4].features!,heartRateMedian:190,activityEnmoMeanMg:1000},true);
    expect(result.limited).toBe(true);expect(result.value).toBeGreaterThanOrEqual(0);expect(result.value).toBeLessThanOrEqual(10);
  });
  it('still refuses disconnected, unworn, stale or invalid measurements and another device',()=>{
    const data=records(),training=trainPrototypePerception(data,device,now);
    expect(predictPrototypePerception(training,device,data[2].features,false).value).toBeNull();
    expect(predictPrototypePerception(training,'other',data[2].features,true).value).toBeNull();
    expect(predictPrototypePerception(training,device,{...data[2].features!,heartRateMedian:NaN},true).value).toBeNull();
    expect(predictPrototypePerception(training,device,null,true).value).toBeNull();
  });
  it('does not generate samples or infer a score from an empty or incompatible history',()=>{
    const data=records();
    for(const input of [[],data.slice(0,4),data.map(row=>({...row,subjectiveWindowSeconds:300})),data.map(row=>({...row,qualityPassed:false}))]){
      expect(predictPrototypePerception(trainPrototypePerception(input,device,now),device,data[2].features,true).value).toBeNull();
    }
  });
});
