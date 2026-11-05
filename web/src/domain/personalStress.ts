/** Experimental within-person prediction of self-reported stress, not a clinical scale.
 * Features: ln(PRV RMSSD), pulse rate. Motion/contact/PPG quality are exclusion gates.
 * Fixed ridge regression with forward-by-day validation; no random window splitting.
 * Requirements below are engineering release criteria, not validated sample-size rules.
 */
import {SHORT_LIVE_METHOD} from './prv.ts';
export const PERSONAL_MODEL_VERSION='personal-ridge-v4';
export const MIN_LABELS=30,MIN_DAYS=5,MIN_SEPARATION_MS=370000;
export interface Features {lnRmssd:number;heartRate:number}
interface Label extends Features {at:number;day:string;target:number}
export interface Fit {
  center:number[];scale:number[];weights:number[];intercept:number;
  ranges:[number,number][];points:number[][];
}
export interface ValidationRow {day:string;at:number;trainedThrough:number;actual:number;predicted:number|null;holdReason:string|null;constant:number;pulseOnly:number}
export interface PersonalModel {version:string;key:string;fit:Fit;targetRange:[number,number];mae:number;constantMae:number;pulseOnlyMae:number;error90:number;count:number;days:number}
export interface TrainingReport {count:number;days:number;range:number;reasons:string[];validation:ValidationRow[];model:PersonalModel|null}
const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v:number)=>Math.min(10,Math.max(0,v));
const dayOf=(at:number)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(at);

function labelsFor(raw:unknown[],key:string,method:string,now:number):Label[] {
  const minimumDuration=method===SHORT_LIVE_METHOD?120000:300000;
  const maximumDuration=method===SHORT_LIVE_METHOD?140000:360000;
  const separation=method===SHORT_LIVE_METHOD?150000:MIN_SEPARATION_MS;
  const candidates:Label[]=[];
  for(const value of raw) {
    if(!value||typeof value!=='object')continue;
    const r=value as Record<string,unknown>,m=r.metrics as Record<string,unknown>|null;
    if(r.key!==key||r.method!==method||r.qualityPassed!==true||!m||!Array.isArray(r.reasons)||r.reasons.length)continue;
    if(!finite(r.recordedAt)||!finite(r.sensorWindowEnd)||!finite(r.sensorWindowStart)||!finite(r.subjectiveStress0to10)||
      !finite(m.lnRmssd)||!finite(m.heartRate)||!finite(m.rmssd))continue;
    const duration=r.sensorWindowEnd-r.sensorWindowStart;
    if(r.recordedAt<0||r.recordedAt>now||Math.abs(r.recordedAt-r.sensorWindowEnd)>15000||duration<minimumDuration||duration>maximumDuration)continue;
    if(method===SHORT_LIVE_METHOD && r.subjectiveWindowSeconds!==120)continue;
    if(r.subjectiveStress0to10<0||r.subjectiveStress0to10>10||m.rmssd<=0||m.heartRate<30||m.heartRate>200||
      Math.abs(Math.log(m.rmssd)-m.lnRmssd)>1e-6)continue;
    candidates.push({at:r.sensorWindowEnd,day:dayOf(r.sensorWindowEnd),target:r.subjectiveStress0to10,lnRmssd:m.lnRmssd,heartRate:m.heartRate});
  }
  candidates.sort((a,b)=>a.at-b.at);
  const kept:Label[]=[];
  for(const row of candidates)if(!kept.length||row.at-kept[kept.length-1].at>=separation)kept.push(row);
  return kept;
}

const RIDGE_PENALTY = 2; // Fixed before collecting training outcomes.

function fitPulseOnly(rows: Label[]) {
  const center = mean(rows.map(row => row.heartRate));
  const scale = Math.sqrt(mean(rows.map(row => (row.heartRate - center) ** 2))) || 1;
  const intercept = mean(rows.map(row => row.target));
  let covariance = 0;
  let variance = 0;
  for (const row of rows) {
    const pulse = (row.heartRate - center) / scale;
    covariance += pulse * (row.target - intercept);
    variance += pulse ** 2;
  }
  const weight = covariance / (variance + RIDGE_PENALTY);
  return (heartRate: number) => clamp(intercept + weight * (heartRate - center) / scale);
}

function fit(rows:Label[]):Fit {
  const x=rows.map(r=>[r.lnRmssd,r.heartRate]),y=rows.map(r=>r.target);
  const center=[0,1].map(j=>mean(x.map(v=>v[j])));
  const scale=[0,1].map(j=>Math.sqrt(mean(x.map(v=>(v[j]-center[j])**2)))||1);
  const z=x.map(v=>v.map((p,j)=>(p-center[j])/scale[j]));
  const intercept=mean(y),lambda=RIDGE_PENALTY;
  const aa=lambda+z.reduce((s,v)=>s+v[0]**2,0),bb=z.reduce((s,v)=>s+v[0]*v[1],0),cc=lambda+z.reduce((s,v)=>s+v[1]**2,0);
  const u=z.reduce((s,v,i)=>s+v[0]*(y[i]-intercept),0),v=z.reduce((s,p,i)=>s+p[1]*(y[i]-intercept),0);
  const determinant=aa*cc-bb*bb;
  return {center,scale,weights:[(cc*u-bb*v)/determinant,(aa*v-bb*u)/determinant],intercept,
    ranges:[0,1].map(j=>[Math.min(...x.map(v=>v[j])),Math.max(...x.map(v=>v[j]))]) as [number,number][],points:z};
}
function evaluate(model:Fit,features:Features) {
  const x=[features.lnRmssd,features.heartRate];
  return clamp(model.intercept+x.reduce((s,v,j)=>s+(v-model.center[j])/model.scale[j]*model.weights[j],0));
}

export function trainPersonalStress(raw:unknown[],key:string,method:string,now=Date.now()):TrainingReport {
  const rows=labelsFor(raw,key,method,now),days=[...new Set(rows.map(r=>r.day))].sort();
  const targets=rows.map(r=>r.target),range=targets.length?Math.max(...targets)-Math.min(...targets):0;
  const reasons:string[]=[],validation:ValidationRow[]=[];
  if(rows.length<MIN_LABELS)reasons.push(`品質を満たす重複しない体感記録が${MIN_LABELS}件必要です（現在${rows.length}件）`);
  if(days.length<MIN_DAYS)reasons.push(`異なる${MIN_DAYS}日以上の記録が必要です（現在${days.length}日）`);
  if(range<3)reasons.push('体感の違いがまだ小さく、対応を学習できません');
  // Every prediction is made only from earlier calendar days; preprocessing is
  // fitted again within each fold. Held-out labels never set scales/coefficients.
  for(const day of days) {
    const past=rows.filter(r=>r.day<day),current=rows.filter(r=>r.day===day);
    if(past.length<12||new Set(past.map(r=>r.day)).size<2)continue;
    const model=fit(past),pulseOnly=fitPulseOnly(past),trainedThrough=Math.max(...past.map(r=>r.at));
    const earlierTargets = past.map(row => row.target);
    const targetRange: [number, number] = [Math.min(...earlierTargets), Math.max(...earlierTargets)];
    for (const row of current) {
      const prediction = predictInRange(model, targetRange, row);
      validation.push({day,at:row.at,trainedThrough,actual:row.target,predicted:prediction.value,holdReason:prediction.reason,
        constant:model.intercept,pulseOnly:pulseOnly(row.heartRate)});
    }
  }
  const displayed = validation.filter((row): row is ValidationRow & { predicted: number } => row.predicted !== null);
  const validatedDays=[...new Set(displayed.map(r=>r.day))];
  if(displayed.length<10||validatedDays.length<2)reasons.push('後日の記録で予測を表示できた回数が不足しています');
  // An accurate result on a small subset cannot establish everyday availability.
  // Half of the eligible held-out windows is a provisional engineering minimum.
  if(validation.length && displayed.length*2<validation.length)
    reasons.push('後日の検証で、品質を満たした記録の半数以上に予測を表示できませんでした');
  const errors=displayed.map(r=>Math.abs(r.predicted-r.actual)),constantErrors=displayed.map(r=>Math.abs(r.constant-r.actual));
  const mae=errors.length?mean(errors):Infinity,constantMae=constantErrors.length?mean(constantErrors):Infinity;
  const pulseOnlyMae=displayed.length?mean(displayed.map(r=>Math.abs(r.pulseOnly-r.actual))):Infinity;
  if(displayed.length>=10&&validatedDays.length>=2) {
    if(mae>1.5)reasons.push('後日の体感との差が大きいため、予測を表示できません');
    if(!(mae<constantMae*.8))reasons.push('一定の値を出す方法より十分に良い精度を確認できていません');
    if(pulseOnlyMae-mae<0.1)reasons.push('脈波の変動を加えたときの予測改善を確認できていません');
    if(validatedDays.some(day=>{const d=displayed.filter(r=>r.day===day);return mean(d.map(r=>Math.abs(r.predicted-r.actual)))>=mean(d.map(r=>Math.abs(r.constant-r.actual)));}))
      reasons.push('検証日の間で精度が安定していません');
  }
  const sorted=[...errors].sort((a,b)=>a-b),error90=sorted.length?sorted[Math.ceil(sorted.length*.9)-1]:Infinity;
  const model:PersonalModel|null=reasons.length?null:{version:PERSONAL_MODEL_VERSION,key,fit:fit(rows),targetRange:[Math.min(...targets),Math.max(...targets)],mae,constantMae,pulseOnlyMae,error90,count:rows.length,days:days.length};
  return {count:rows.length,days:days.length,range,reasons,validation,model};
}

export function predictPersonalStress(model:PersonalModel|null,key:string,features:Features|null,qualityPassed:boolean) {
  if(!qualityPassed||!features)return {value:null,reason:'現在の測定品質を確認できません'};
  if(!model||model.version!==PERSONAL_MODEL_VERSION||model.key!==key)return {value:null,reason:'個人の予測は準備中です'};
  return predictInRange(model.fit, model.targetRange, features);
}

function predictInRange(fit: Fit, targetRange: [number, number], features: Features) {
  const x=[features.lnRmssd,features.heartRate];
  if(x.some((v,j)=>!Number.isFinite(v)||v<fit.ranges[j][0]||v>fit.ranges[j][1]))
    return {value:null,reason:'学習済みの測定範囲から外れているため予測を保留します'};
  const z=x.map((v,j)=>(v-fit.center[j])/fit.scale[j]);
  const nearest=Math.min(...fit.points.map(p=>Math.hypot(z[0]-p[0],z[1]-p[1])));
  if(nearest>1.5)return {value:null,reason:'これまでと異なる脈波・心拍の組み合わせのため予測を保留します'};
  const value=evaluate(fit,features);
  if(value<targetRange[0]||value>targetRange[1])return {value:null,reason:'まだ記録されていない体感の範囲に入るため予測を保留します'};
  return {value,reason:null};
}
