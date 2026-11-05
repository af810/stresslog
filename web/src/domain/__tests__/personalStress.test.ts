import {describe,it,expect} from 'vitest';
import {trainPersonalStress,predictPersonalStress,MIN_SEPARATION_MS} from '../personalStress';
import {SHORT_LIVE_METHOD} from '../prv';
const key='synthetic:method:rest',method='synthetic-method';
const start=Date.parse('2026-01-01T00:00:00+09:00'),now=start+10*86400000;
function records() {
  return Array.from({length:30},(_,i)=>{
    const day=Math.floor(i/6),level=i%6,target=1+level*1.4;
    const at=start+day*86400000+level*600000;
    const lnRmssd=4.7-level*.18,heartRate=60;
    return {key,method,recordedAt:at+1000,sensorWindowEnd:at,sensorWindowStart:at-349000,
      subjectiveStress0to10:target,qualityPassed:true,reasons:[] as string[],metrics:{lnRmssd,heartRate,rmssd:Math.exp(lnRmssd)}};
  });
}
describe('individual stress model and chronological validation',()=>{
  it('keeps the short protocol separate and rejects overlapping short observations',()=>{
    const shortKey='synthetic:short120:rest';
    const initial=records()[0];
    const row={...initial,key:shortKey,method:SHORT_LIVE_METHOD,subjectiveWindowSeconds:120,
      sensorWindowStart:initial.sensorWindowEnd-129000};
    const move=(milliseconds:number)=>({...row,recordedAt:row.recordedAt+milliseconds,
      sensorWindowStart:row.sensorWindowStart+milliseconds,sensorWindowEnd:row.sensorWindowEnd+milliseconds});
    expect(trainPersonalStress([row,move(60000),move(150000)],shortKey,SHORT_LIVE_METHOD,now).count).toBe(2);
    expect(trainPersonalStress([row],shortKey,method,now).count).toBe(0);
    expect(trainPersonalStress([{...row,subjectiveWindowSeconds:300}],shortKey,SHORT_LIVE_METHOD,now).count).toBe(0);
    expect(trainPersonalStress([{...initial,key:shortKey,method:SHORT_LIVE_METHOD,subjectiveWindowSeconds:120}],shortKey,SHORT_LIVE_METHOD,now).count).toBe(0);
  });
  it('requires later-day prediction validation for the short protocol too',()=>{
    const shortKey='synthetic:short120:rest';
    const rows=records().map(row=>({...row,key:shortKey,method:SHORT_LIVE_METHOD,subjectiveWindowSeconds:120,
      sensorWindowStart:row.sensorWindowEnd-129000}));
    expect(trainPersonalStress(rows.slice(0,6),shortKey,SHORT_LIVE_METHOD,now).model).toBeNull();
    const training=trainPersonalStress(rows,shortKey,SHORT_LIVE_METHOD,now);
    expect(training.model).not.toBeNull();expect(training.validation).toHaveLength(18);
    expect(training.validation.every(row=>row.trainedThrough<row.at)).toBe(true);
  });
  it('requires enough independent days and different reported feelings',()=>{
    expect(trainPersonalStress([],key,method,now).model).toBeNull();
    const same=records().map(r=>({...r,subjectiveStress0to10:3}));
    const t=trainPersonalStress(same,key,method,now);expect(t.model).toBeNull();expect(t.reasons.join(' ')).toContain('違い');
  });
  it('learns a known synthetic relationship and beats a constant-only comparator on later days',()=>{
    const t=trainPersonalStress(records(),key,method,now);expect(t.reasons).toEqual([]);expect(t.model).not.toBeNull();
    expect(t.model!.mae).toBeLessThan(.5);expect(t.model!.mae).toBeLessThan(t.model!.constantMae*.8);
    expect(t.model!.pulseOnlyMae-t.model!.mae).toBeGreaterThan(.1);
    expect(t.validation.length).toBe(18);expect(t.validation.every(r=>r.trainedThrough<r.at)).toBe(true);
    const x=records()[3].metrics,p=predictPersonalStress(t.model,key,x,true);expect(p.value).toBeCloseTo(5.2,0);
  });
  it('holds when pulse explains the relationship and PRV adds no benefit',()=>{
    const data=records().map((row,i)=>({...row,metrics:{lnRmssd:4,rmssd:Math.exp(4),heartRate:55+i%6*4}}));
    const result=trainPersonalStress(data,key,method,now);
    expect(result.model).toBeNull();
    expect(result.reasons).toContain('脈波の変動を加えたときの予測改善を確認できていません');
  });
  it('counts held-out measurements outside prior support as abstentions',()=>{
    const data=records().map((row,i)=>i<24?row:{...row,metrics:{...row.metrics,heartRate:80}});
    const result=trainPersonalStress(data,key,method,now);
    expect(result.validation).toHaveLength(18);
    expect(result.validation.slice(-6).every(row=>row.predicted===null && row.holdReason)).toBe(true);
    expect(result.validation.filter(row=>row.predicted!==null)).toHaveLength(12);
    expect(result.model?.mae).toBeLessThan(.5);
  });
  it('does not leak labels from a held-out or future day into a prediction',()=>{
    const data=records(),first=trainPersonalStress(data,key,method,now).validation;
    const changed=data.map((r,i)=>i>=12?{...r,subjectiveStress0to10:10-r.subjectiveStress0to10}:r);
    const second=trainPersonalStress(changed,key,method,now).validation;
    expect(second.slice(0,6).map(r=>r.predicted)).toEqual(first.slice(0,6).map(r=>r.predicted));
    const futureFeatures=data.map((r,i)=>i>=24?{...r,metrics:{lnRmssd:6,rmssd:Math.exp(6),heartRate:180}}:r);
    expect(trainPersonalStress(futureFeatures,key,method,now).validation.slice(0,6).map(r=>r.predicted)).toEqual(first.slice(0,6).map(r=>r.predicted));
  });
  it('holds a model that is accurate on its displayed subset but abstains on most validation windows',()=>{
    const data=records();
    const extra=Array.from({length:24},(_,i)=>{
      const row=data[i%6];
      const at=start+5*86400000+i*600000;
      return {...row,recordedAt:at+1000,sensorWindowEnd:at,sensorWindowStart:at-349000,
        metrics:{...row.metrics,heartRate:80}};
    });
    const result=trainPersonalStress([...data,...extra],key,method,now);
    expect(result.validation.filter(row=>row.predicted!==null)).toHaveLength(18);
    expect(result.model).toBeNull();
    expect(result.reasons.join(' ')).toContain('半数以上');
  });
  it('excludes bad signals, incompatible methods/devices, stale labels and future observations',()=>{
    const r=records(),bad=[{...r[0],qualityPassed:false},{...r[0],method:'old'},
      {...r[0],key:'other watch'},{...r[0],recordedAt:r[0].sensorWindowEnd+16000},
      {...r[0],sensorWindowStart:r[0].sensorWindowEnd-200000},
      {...r[0],metrics:{...r[0].metrics,lnRmssd:NaN}},
      {...r[0],recordedAt:now+1,sensorWindowEnd:now+1,sensorWindowStart:now-349000}];
    expect(trainPersonalStress(bad,key,method,now).count).toBe(0);
  });
  it('does not count overlapping windows or rapid repeated labels as independent evidence',()=>{
    const r=records()[0];
    const duplicates=Array.from({length:30},(_,i)=>({...r,recordedAt:r.recordedAt+i*1000,sensorWindowStart:r.sensorWindowStart+i*1000,sensorWindowEnd:r.sensorWindowEnd+i*1000}));
    expect(trainPersonalStress(duplicates,key,method,now).count).toBe(1);
    const next={...r,recordedAt:r.recordedAt+MIN_SEPARATION_MS,sensorWindowStart:r.sensorWindowStart+MIN_SEPARATION_MS,sensorWindowEnd:r.sensorWindowEnd+MIN_SEPARATION_MS};
    expect(trainPersonalStress([r,next],key,method,now).count).toBe(2);
  });
  it('refuses a relationship which does not generalize to later days',()=>{
    const r=records().map((v,i)=>Math.floor(i/6)%2?{...v,subjectiveStress0to10:10-v.subjectiveStress0to10}:v);
    expect(trainPersonalStress(r,key,method,now).model).toBeNull();
  });
  it('never predicts from a bad current measurement, another protocol, or outside the training range',()=>{
    const m=trainPersonalStress(records(),key,method,now).model!;
    expect(predictPersonalStress(m,key,records()[3].metrics,false).value).toBeNull();
    expect(predictPersonalStress(m,'other',records()[3].metrics,true).value).toBeNull();
    expect(predictPersonalStress(m,key,{lnRmssd:6,heartRate:150},true).value).toBeNull();
    expect(predictPersonalStress({...m,targetRange:[0,1]},key,records()[3].metrics,true).value).toBeNull();
  });
});
