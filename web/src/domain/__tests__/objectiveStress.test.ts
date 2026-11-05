import {describe,it,expect} from 'vitest';
import {estimateObjectiveStress,parseObjectiveReference,type ObjectiveReference} from '../objectiveStress';
import {MULTISENSOR_FEATURE_METHOD} from '../multisensorFeatures';
const now=Date.parse('2026-11-05T22:00:00+09:00');
function record(i=0,hr=70,activity=0):ObjectiveReference{return {id:`test-${i}`,device:'synthetic',featureMethod:MULTISENSOR_FEATURE_METHOD,
 at:now-600000-i*180000,sessionId:`session-${i}`,startNs:'0',endNs:'120000000000',
 features:{heartRateMedian:hr,heartRateIqr:2,activityEnmoMeanMg:activity,activityJerkMean:activity,prvAvailable:false,lnRmssd:null,prvChannel:null}};}
const current=(hr=70,activity=0)=>({...record(100,hr,activity),at:now});
describe('label-free relative physiological index',()=>{
  it('computes without any subjective rating or fitted model, with increase only relative to baseline',()=>{
    const refs=[record(0),record(1),record(2)];
    expect(estimateObjectiveStress(refs,current(70),now).value).toBe(0);
    const raised=estimateObjectiveStress(refs,current(80),now);
    expect(raised.value).toBeGreaterThan(60);expect(raised.value).toBeLessThan(100);expect(raised.hrvUsed).toBe(false);
    const changed=refs.map(r=>({...r,score:10,subjectiveStress0to10:10,qualityPassed:false,model:{weights:[9999]}}));
    expect(estimateObjectiveStress(changed,current(80),now)).toEqual(raised);
    expect(Object.keys(parseObjectiveReference(changed[0])!)).not.toContain('score');
  });
  it('uses the nearest activity context instead of treating ordinary active HR as a resting rise',()=>{
    const refs=[record(0,70),record(1,70),record(2,70),record(3,100,200),record(4,100,200),record(5,100,200)];
    const result=estimateObjectiveStress(refs,current(100,200),now);
    expect(result.referenceHeartRate).toBe(100);expect(result.value).toBe(0);
  });
  it('only adds PRV with three references of the same layout and an available current measurement',()=>{
    const refs=[0,1,2].map(i=>({...record(i),features:{...record(i).features,prvAvailable:true,lnRmssd:4,prvChannel:5}}));
    const pulse={...current(),features:{...current().features,prvAvailable:true,lnRmssd:3,prvChannel:5}};
    const result=estimateObjectiveStress(refs,pulse,now);
    expect(result.hrvUsed).toBe(true);expect(result.value).toBeGreaterThan(70);
    expect(estimateObjectiveStress(refs,{...pulse,features:{...pulse.features,prvChannel:6}},now).hrvUsed).toBe(false);
    expect(estimateObjectiveStress(refs.slice(0,2),pulse,now).hrvUsed).toBe(false);
    expect(estimateObjectiveStress(refs,current(),now).hrvUsed).toBe(false);
  });
  it('does not lose usable PRV references when the nearest HR references have no PRV',()=>{
    const plain=[0,1,2].map(i=>record(i));
    const pulse=[3,4,5].map(i=>({...record(i,70,.1),features:{...record(i,70,.1).features,prvAvailable:true,lnRmssd:4,prvChannel:5}}));
    const observation={...current(),features:{...current().features,prvAvailable:true,lnRmssd:3,prvChannel:5}};
    const result=estimateObjectiveStress([...plain,...pulse],observation,now);
    expect(result.referenceCount).toBe(3);expect(result.prvReferenceCount).toBe(3);
    expect(result.hrvUsed).toBe(true);expect(result.value).toBeGreaterThan(70);
  });
  it('does not use self, overlapping, future, old, duplicated, other-device or invalid references',()=>{
    const c={...current(80),sessionId:'overlap',startNs:'200000000000',endNs:'320000000000'};
    const overlapping={...record(0),sessionId:'overlap',startNs:'100000000000',endNs:'220000000000'};
    const bad=[c,overlapping,{...record(1),at:now+1000},{...record(2),at:now-31*86400000},
      {...record(3),device:'other'},{...record(4),features:{...record(4).features,heartRateMedian:NaN}}];
    expect(estimateObjectiveStress(bad,c,now).value).toBeNull();
    expect(estimateObjectiveStress([record(0),record(0)],c,now).referenceCount).toBe(1);
  });
  it('never shows a past observation as current and does not invent a baseline',()=>{
    expect(estimateObjectiveStress([],current(),now).value).toBeNull();
    expect(estimateObjectiveStress([record(0)],null,now).value).toBeNull();
    expect(estimateObjectiveStress([record(0)],{...current(),at:now-16000},now).value).toBeNull();
  });
});
