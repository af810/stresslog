import {describe,it,expect} from 'vitest';
import {trainPerception,predictPerception,trainPerceptionPolicy,predictPerceptionPolicy} from '../perceptionModel';
import {MULTISENSOR_FEATURE_METHOD} from '../multisensorFeatures';
import {SHORT_LIVE_METHOD} from '../prv';
import type {PerceptionRecord} from '../perceptionRecord';
const device='synthetic-watch',start=Date.parse('2026-01-01T12:00:00+09:00'),now=start+10*86400000;
function records(prv=false):PerceptionRecord[]{
  return Array.from({length:30},(_,i)=>{
    const level=i%6,at=start+Math.floor(i/6)*86400000+level*180000;
    return {captureId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,model:device,
      featureMethod:MULTISENSOR_FEATURE_METHOD,prvMethod:SHORT_LIVE_METHOD,recordedAt:at+1000,windowEndEpochMs:at,
      subjectiveWindowSeconds:120,score:1+level*1.3,qualityPassed:true,reasons:[],
      features:{heartRateMedian:70,heartRateIqr:2,activityEnmoMeanMg:prv?0:Math.expm1(level*.3),activityJerkMean:prv?0:Math.expm1(level*.2),
        lnRmssd:prv?4.7-level*.2:null,prvAvailable:prv,prvChannel:prv?5:null}};
  });
}
describe('context and optional PRV models',()=>{
  it('can learn a synthetic context relationship without inventing missing HRV',()=>{
    const rows=records(),report=trainPerception(rows,device,'context',now);
    expect(report.reasons).toEqual([]);expect(report.model).not.toBeNull();expect(report.validation).toHaveLength(18);
    expect(report.model!.mae).toBeLessThan(.5);expect(report.model!.heartOnlyMae-report.model!.mae).toBeGreaterThan(.1);
    expect(predictPerception(report.model,device,rows[3].features,true).value).toBeCloseTo(rows[3].score,0);
    expect(trainPerception(rows,device,'prv5',now).count).toBe(0);
  });
  it('requires a PRV increment and keeps different PPG layouts separate',()=>{
    const rows=records(true),report=trainPerception(rows,device,'prv5',now);
    expect(report.reasons).toEqual([]);expect(report.model!.contextMae!-report.model!.mae).toBeGreaterThan(.1);
    expect(trainPerception(rows,device,'prv6',now).count).toBe(0);
    const noIncrement=records().map(r=>({...r,features:{...r.features!,lnRmssd:4,prvAvailable:true,prvChannel:5}}));
    expect(trainPerception(noIncrement,device,'prv5',now).reasons).toContain('HRVを加えた場合の改善を確認できていません');
  });
  it('cannot release from same-day, constant-rating or heart-only explanatory data',()=>{
    expect(trainPerception(records().slice(0,6),device,'context',now).model).toBeNull();
    expect(trainPerception(records().map(r=>({...r,score:3})),device,'context',now).model).toBeNull();
    const hrOnly=records().map((r,i)=>({...r,features:{...r.features!,heartRateMedian:60+i%6*4,activityEnmoMeanMg:0,activityJerkMean:0}}));
    expect(trainPerception(hrOnly,device,'context',now).reasons).toContain('心拍数だけの場合より改善を確認できていません');
  });
  it('prevents later labels and feature scaling from leaking into earlier-day predictions',()=>{
    const rows=records(),first=trainPerception(rows,device,'context',now).validation;
    const changed=rows.map((r,i)=>i<18?r:{...r,score:10-r.score,features:{...r.features!,activityEnmoMeanMg:10000}});
    const second=trainPerception(changed,device,'context',now).validation;
    expect(first.slice(0,6).map(r=>r.predicted)).toEqual(second.slice(0,6).map(r=>r.predicted));
    expect(first.every(r=>r.trainedThrough<r.at)).toBe(true);
  });
  it('rejects incompatible, stale, future, unreliable and duplicate records',()=>{
    const r=records()[0];
    const bad=[{...r,qualityPassed:false},{...r,reasons:['offbody']},{...r,model:'other'},
      {...r,featureMethod:'old'},{...r,subjectiveWindowSeconds:300},{...r,recordedAt:r.recordedAt+20000},
      {...r,recordedAt:now+1,windowEndEpochMs:now},{...r,features:{...r.features!,heartRateMedian:NaN}}];
    expect(trainPerception(bad,device,'context',now).count).toBe(0);
    expect(trainPerception([r,r,{...r,recordedAt:r.recordedAt+180000,windowEndEpochMs:r.windowEndEpochMs!+180000}],device,'context',now).count).toBe(1);
    const neighbor={...records()[1],recordedAt:r.recordedAt+60000,windowEndEpochMs:r.windowEndEpochMs!+60000};
    expect(trainPerception([r,neighbor],device,'context',now).count).toBe(1);
  });
  it('abstains on missing PRV, bad contact and measurements outside prior support',()=>{
    const rows=records(true),model=trainPerception(rows,device,'prv5',now).model;
    expect(predictPerception(model,device,rows[2].features,false).value).toBeNull();
    expect(predictPerception(model,'other',rows[2].features,true).value).toBeNull();
    expect(predictPerception(model,device,records()[2].features,true).value).toBeNull();
    expect(predictPerception(model,device,{...rows[2].features!,lnRmssd:8},true).value).toBeNull();
  });
  it('includes out-of-support windows as abstentions in later-day validation',()=>{
    const rows=records().map((r,i)=>i<12?r:{...r,features:{...r.features!,heartRateMedian:100+Math.floor(i/6)*10}});
    const report=trainPerception(rows,device,'context',now);
    expect(report.validation).toHaveLength(18);expect(report.validation.every(r=>r.predicted===null)).toBe(true);
    expect(report.model).toBeNull();expect(report.reasons.join(' ')).toContain('半数以上');
  });
});

function policyRecords():PerceptionRecord[]{
  return Array.from({length:42},(_,i)=>{
    const day=Math.floor(i/6),level=i%6,base=records(true)[level];
    const at=start+day*86400000+level*180000,prv=day<5||level%2===0,variation=level%2?1:-1;
    return {...base,captureId:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,recordedAt:at+1000,windowEndEpochMs:at,
      score:1.5+level*.9+variation*.6,
      features:{...base.features!,activityEnmoMeanMg:Math.expm1(level*.3),activityJerkMean:Math.expm1(level*.2),
        lnRmssd:prv?4+variation*.2:null,prvAvailable:prv,prvChannel:prv?5:null}};
  });
}
describe('actual route selection needs its own later-day validation',()=>{
  it('does not display when candidates qualify but no later deployment days exist',()=>{
    const data=policyRecords().slice(0,30),policy=trainPerceptionPolicy(data,device,now);
    expect(policy.training.context.model).not.toBeNull();expect(policy.validation).toEqual([]);
    expect(policy.enabled).toBe(false);
    expect(predictPerceptionPolicy(policy,device,data[2].features,true).value).toBeNull();
  });
  it('replays exactly the live switching rule on days after model qualification',()=>{
    const data=policyRecords(),policy=trainPerceptionPolicy(data,device,now);
    expect(policy.reasons).toEqual([]);expect(policy.enabled).toBe(true);expect(policy.validation).toHaveLength(12);
    expect(policy.validation.every(r=>r.trainedThrough<r.at)).toBe(true);
    expect(new Set(policy.validation.map(r=>r.route))).toEqual(new Set(['context','prv5']));
    expect(predictPerceptionPolicy(policy,device,data[31].features,true).route).toBe('context');
    expect(predictPerceptionPolicy(policy,device,data[30].features,true).route).toBe('prv5');
    expect(predictPerceptionPolicy(policy,device,data[30].features,false).value).toBeNull();
    expect(predictPerceptionPolicy(policy,'other',data[30].features,true).value).toBeNull();
  });
  it('does not let the next evaluation day change earlier deployed choices or predictions',()=>{
    const data=policyRecords(),first=trainPerceptionPolicy(data,device,now);
    const changed=data.map((r,i)=>i<36?r:{...r,score:10-r.score,features:{...r.features!,activityEnmoMeanMg:10000}});
    const second=trainPerceptionPolicy(changed,device,now);
    expect(second.validation.slice(0,6).map(r=>[r.route,r.predicted])).toEqual(first.validation.slice(0,6).map(r=>[r.route,r.predicted]));
    expect(second.enabled).toBe(false);
  });
  it('keeps late-night reports out of training until their ratings were recorded',()=>{
    const midnight=Date.parse('2026-01-06T00:00:00+09:00');
    const row={...records()[0],windowEndEpochMs:midnight-1000,recordedAt:midnight+1000};
    expect(trainPerception([row],device,'context',midnight-1).count).toBe(0);
    expect(trainPerception([row],device,'context',midnight+2000).days).toBe(1);
  });
});
