/** Experimental personal EMA prediction, not a universal HRV-to-stress formula.
 * Fixed ridge, training-only preprocessing, chronological day folds, matched
 * comparators. The release rules are provisional engineering criteria.
 */
import {MULTISENSOR_FEATURE_METHOD} from './multisensorFeatures.ts';
import {SHORT_LIVE_METHOD} from './prv.ts';
import type {PerceptionFeatures,PerceptionRecord} from './perceptionRecord.ts';
export const PERCEPTION_MODEL_VERSION='perception-context-ridge-v1';
export type PerceptionRoute='context'|'prv5'|'prv6';
interface Row {at:number;day:string;target:number;x:number[];features:PerceptionFeatures}
interface Fit {center:number[];scale:number[];weights:number[];intercept:number;ranges:[number,number][];points:number[][]}
export interface PerceptionValidation {day:string;at:number;trainedThrough:number;actual:number;predicted:number|null;constant:number;heartOnly:number;context:number|null}
export interface PerceptionModel {version:string;device:string;route:PerceptionRoute;fit:Fit;targetRange:[number,number];mae:number;constantMae:number;heartOnlyMae:number;contextMae:number|null;error90:number}
export interface PerceptionTraining {route:PerceptionRoute;count:number;days:number;range:number;reasons:string[];validation:PerceptionValidation[];model:PerceptionModel|null}
const mean=(x:number[])=>x.reduce((a,b)=>a+b,0)/x.length;
const clamp=(x:number)=>Math.max(0,Math.min(10,x));
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const dayOf=(at:number)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(at);
function vector(features:PerceptionFeatures,route:PerceptionRoute):number[]|null {
  if(!finite(features.heartRateMedian)||features.heartRateMedian<30||features.heartRateMedian>200||
    !finite(features.heartRateIqr)||features.heartRateIqr<0||features.heartRateIqr>170||
    !finite(features.activityEnmoMeanMg)||features.activityEnmoMeanMg<0||
    !finite(features.activityJerkMean)||features.activityJerkMean<0)return null;
  const core=[features.heartRateMedian,features.heartRateIqr,Math.log1p(features.activityEnmoMeanMg),Math.log1p(features.activityJerkMean)];
  if(route==='context')return core;
  if(!features.prvAvailable||!finite(features.lnRmssd)||features.prvChannel!==Number(route.slice(3)))return null;
  return [...core,features.lnRmssd];
}
function rowsFor(records:unknown[],device:string,route:PerceptionRoute,now:number):Row[] {
  const candidates:Row[]=[],seen=new Set<string>();
  for(const record of records){
    if(!record||typeof record!=='object')continue;
    const r=record as PerceptionRecord;
    if(r.model!==device||r.featureMethod!==MULTISENSOR_FEATURE_METHOD||r.prvMethod!==SHORT_LIVE_METHOD||
      r.subjectiveWindowSeconds!==120||r.qualityPassed!==true||!Array.isArray(r.reasons)||r.reasons.length||!r.features||
      typeof r.captureId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.captureId)||
      !finite(r.recordedAt)||r.recordedAt<0||r.recordedAt>now||!finite(r.windowEndEpochMs)||r.windowEndEpochMs<0||
      Math.abs(r.recordedAt-r.windowEndEpochMs)>15000||!finite(r.score)||r.score<0||r.score>10)continue;
    const x=vector(r.features,route);
    if(x&&!seen.has(r.captureId)){seen.add(r.captureId);candidates.push({at:r.windowEndEpochMs,day:dayOf(r.recordedAt),target:r.score,x,features:r.features});}
  }
  candidates.sort((a,b)=>a.at-b.at);
  const rows:Row[]=[];
  for(const row of candidates)if(!rows.length||row.at-rows.at(-1)!.at>=150000)rows.push(row);
  return rows;
}
function fit(rows:Row[],dimensions=rows[0].x.length):Fit {
  const indices=Array.from({length:dimensions},(_,i)=>i);
  const center=indices.map(j=>mean(rows.map(r=>r.x[j])));
  const scale=indices.map(j=>Math.sqrt(mean(rows.map(r=>(r.x[j]-center[j])**2)))||1);
  const z=rows.map(r=>indices.map(j=>(r.x[j]-center[j])/scale[j])),intercept=mean(rows.map(r=>r.target));
  const a=indices.map(i=>indices.map(j=>z.reduce((s,x)=>s+x[i]*x[j],0)+(i===j?2:0)));
  const b=indices.map(j=>z.reduce((s,x,i)=>s+x[j]*(rows[i].target-intercept),0));
  // Positive definite X'X + 2I: Cholesky avoids an explicit inverse.
  const l=indices.map(()=>Array(dimensions).fill(0) as number[]);
  for(let i=0;i<dimensions;i++)for(let j=0;j<=i;j++){
    let value=a[i][j];for(let k=0;k<j;k++)value-=l[i][k]*l[j][k];
    l[i][j]=i===j?Math.sqrt(value):value/l[j][j];
  }
  const y=Array(dimensions).fill(0) as number[],weights=[...y];
  for(let i=0;i<dimensions;i++){let value=b[i];for(let k=0;k<i;k++)value-=l[i][k]*y[k];y[i]=value/l[i][i];}
  for(let i=dimensions-1;i>=0;i--){let value=y[i];for(let k=i+1;k<dimensions;k++)value-=l[k][i]*weights[k];weights[i]=value/l[i][i];}
  return {center,scale,weights,intercept,points:z,ranges:indices.map(j=>[Math.min(...rows.map(r=>r.x[j])),Math.max(...rows.map(r=>r.x[j]))])};
}
function evaluate(model:Fit,x:number[]){return clamp(model.intercept+model.weights.reduce((s,w,j)=>s+w*(x[j]-model.center[j])/model.scale[j],0));}
function supported(model:Fit,targetRange:[number,number],x:number[]):number|null {
  if(x.some((v,j)=>!finite(v)||v<model.ranges[j][0]||v>model.ranges[j][1]))return null;
  const z=x.map((v,j)=>(v-model.center[j])/model.scale[j]);
  if(Math.min(...model.points.map(point=>Math.hypot(...z.map((v,j)=>v-point[j]))))>2)return null;
  const value=evaluate(model,x);return value<targetRange[0]||value>targetRange[1]?null:value;
}
export function trainPerception(records:unknown[],device:string,route:PerceptionRoute,now=Date.now()):PerceptionTraining {
  const rows=rowsFor(records,device,route,now),days=[...new Set(rows.map(r=>r.day))].sort();
  const targets=rows.map(r=>r.target),range=targets.length?Math.max(...targets)-Math.min(...targets):0;
  const reasons:string[]=[],validation:PerceptionValidation[]=[];
  if(rows.length<30)reasons.push(`対応する体感記録が30件必要です（現在${rows.length}件）`);
  if(days.length<5)reasons.push(`異なる5日以上の記録が必要です（現在${days.length}日）`);
  if(range<3)reasons.push('体感の違いがまだ小さく、対応を学習できません');
  for(const day of days){
    const past=rows.filter(r=>r.day<day);if(past.length<12||new Set(past.map(r=>r.day)).size<2)continue;
    const model=fit(past),heart=fit(past,1),context=route==='context'?null:fit(past,4);
    const targetRange:[number,number]=[Math.min(...past.map(r=>r.target)),Math.max(...past.map(r=>r.target))];
    const trainedThrough=Math.max(...past.map(r=>r.at));
    for(const row of rows.filter(r=>r.day===day))validation.push({day,at:row.at,trainedThrough,actual:row.target,
      predicted:supported(model,targetRange,row.x),constant:model.intercept,heartOnly:evaluate(heart,row.x),
      context:context?supported(context,targetRange,row.x.slice(0,4)):null});
  }
  const shown=validation.filter((r):r is PerceptionValidation&{predicted:number}=>r.predicted!==null);
  const validationDays=[...new Set(shown.map(r=>r.day))];
  if(shown.length<10||validationDays.length<2)reasons.push('別の日の記録による検証が不足しています');
  if(validation.length&&shown.length*2<validation.length)reasons.push('別の日の検証で半数以上に予測を表示できませんでした');
  const errors=shown.map(r=>Math.abs(r.actual-r.predicted)),mae=errors.length?mean(errors):Infinity;
  const constantMae=shown.length?mean(shown.map(r=>Math.abs(r.actual-r.constant))):Infinity;
  const heartOnlyMae=shown.length?mean(shown.map(r=>Math.abs(r.actual-r.heartOnly))):Infinity;
  // Matched windows and matched training rows isolate the PRV increment.
  const matched=shown.filter((r):r is typeof r&{context:number}=>r.context!==null);
  const contextMae=matched.length?mean(matched.map(r=>Math.abs(r.actual-r.context))):null;
  if(shown.length>=10&&validationDays.length>=2){
    if(mae>1.5)reasons.push('別の日の体感との誤差が大きいため保留しています');
    if(!(mae<constantMae*.8))reasons.push('一定値より十分よく予測できることを確認できていません');
    if(route==='context'&&heartOnlyMae-mae<.1)reasons.push('心拍数だけの場合より改善を確認できていません');
    if(route!=='context'&&(matched.length<10||new Set(matched.map(r=>r.day)).size<2||matched.length*2<shown.length||
      mean(matched.map(r=>Math.abs(r.actual-r.context)))-mean(matched.map(r=>Math.abs(r.actual-r.predicted)))<.1))
      reasons.push('HRVを加えた場合の改善を確認できていません');
    if(validationDays.some(day=>{const d=shown.filter(r=>r.day===day);return mean(d.map(r=>Math.abs(r.actual-r.predicted)))>=mean(d.map(r=>Math.abs(r.actual-r.constant)));}))
      reasons.push('検証した日によって精度が安定していません');
  }
  const sorted=[...errors].sort((a,b)=>a-b);
  return {route,count:rows.length,days:days.length,range,reasons,validation,
    model:reasons.length?null:{version:PERCEPTION_MODEL_VERSION,device,route,fit:fit(rows),targetRange:[Math.min(...targets),Math.max(...targets)],
      mae,constantMae,heartOnlyMae,contextMae,error90:sorted[Math.ceil(sorted.length*.9)-1]}};
}
export function predictPerception(model:PerceptionModel|null,device:string,features:PerceptionFeatures|null,qualityPassed:boolean){
  if(!features||!qualityPassed)return {value:null,reason:'現在の心拍・体動・装着状態を確認できません'};
  if(!model||model.version!==PERCEPTION_MODEL_VERSION||model.device!==device)return {value:null,reason:'体感との対応を検証中です'};
  const x=vector(features,model.route),value=x?supported(model.fit,model.targetRange,x):null;
  return {value,reason:value===null?'検証できた測定範囲から外れているため保留します':null};
}

export const PERCEPTION_POLICY_VERSION='perception-switch-forward-v1';
type Routes=Record<PerceptionRoute,PerceptionTraining>;
export interface PolicyValidation {
  day:string;at:number;trainedThrough:number;actual:number;predicted:number|null;
  route:PerceptionRoute|null;constant:number;heartOnly:number;
}
export interface PerceptionPolicy {
  version:string;device:string;training:Routes;enabled:boolean;reasons:string[];validation:PolicyValidation[];
  mae:number|null;constantMae:number|null;heartOnlyMae:number|null;error90:number|null;
}
function routesFor(records:unknown[],device:string,now:number):Routes {
  return {context:trainPerception(records,device,'context',now),prv5:trainPerception(records,device,'prv5',now),prv6:trainPerception(records,device,'prv6',now)};
}
/** One selection function for both later-day replay and live display. */
function selectRoute(training:Routes,device:string,features:PerceptionFeatures|null,quality:boolean){
  const augmented=features?.prvChannel===6?training.prv6:training.prv5;
  const prv=predictPerception(augmented.model,device,features,quality);
  if(prv.value!==null)return {...prv,route:augmented.route};
  const core=predictPerception(training.context.model,device,features,quality);
  return {...core,route:core.value===null?null:'context' as PerceptionRoute};
}
/** Outer forward validation includes model qualification and route selection.
 * Five days/30 rows permit a candidate, never automatic score release. Each
 * replayed day uses only models that could have qualified before that day.
 */
export function trainPerceptionPolicy(records:unknown[],device:string,now=Date.now()):PerceptionPolicy {
  const training=routesFor(records,device,now),rows=rowsFor(records,device,'context',now);
  const days=[...new Set(rows.map(r=>r.day))].sort(),validation:PolicyValidation[]=[];
  for(const day of days){
    const past=rows.filter(r=>r.day<day);
    if(past.length<30||new Set(past.map(r=>r.day)).size<5)continue;
    const cutoff=Date.parse(`${day}T00:00:00+09:00`)-1;
    const before=routesFor(records,device,cutoff),heart=fit(past,1);
    // Even the simple comparators see only earlier days' labels.
    const constant=mean(past.map(r=>r.target)),trainedThrough=Math.max(...past.map(r=>r.at));
    for(const row of rows.filter(r=>r.day===day)){
      const prediction=selectRoute(before,device,row.features,true);
      validation.push({day,at:row.at,trainedThrough,actual:row.target,predicted:prediction.value,route:prediction.route,
        constant,heartOnly:evaluate(heart,row.x)});
    }
  }
  const shown=validation.filter((r):r is PolicyValidation&{predicted:number}=>r.predicted!==null);
  const shownDays=[...new Set(shown.map(r=>r.day))],reasons:string[]=[];
  if(!Object.values(training).some(route=>route.model))reasons.push('体感との対応を学習する記録が不足しているか、候補の精度を確認できていません');
  if(shown.length<10||shownDays.length<2)reasons.push('学習後の別の日に、切り替えを含む予測を10件・2日以上検証する必要があります');
  if(validation.length&&shown.length*2<validation.length)reasons.push('実際の切り替えを含む検証で、半数以上に予測を表示できませんでした');
  const errors=shown.map(r=>Math.abs(r.actual-r.predicted));
  const mae=shown.length?mean(errors):null,constantMae=shown.length?mean(shown.map(r=>Math.abs(r.actual-r.constant))):null;
  const heartOnlyMae=shown.length?mean(shown.map(r=>Math.abs(r.actual-r.heartOnly))):null;
  if(shown.length>=10&&shownDays.length>=2){
    if(mae!>1.5)reasons.push('切り替え後の予測と体感の差が大きいため保留します');
    if(!(mae!<constantMae!*.8))reasons.push('切り替え後の予測が一定値より十分よいことを確認できていません');
    if(heartOnlyMae!-mae!<.1)reasons.push('切り替え後の予測が心拍数だけの場合よりよいことを確認できていません');
    if(shownDays.some(day=>{const d=shown.filter(r=>r.day===day);return mean(d.map(r=>Math.abs(r.actual-r.predicted)))>=mean(d.map(r=>Math.abs(r.actual-r.constant)));}))
      reasons.push('切り替え後の精度が検証日によって安定していません');
  }
  const sorted=[...errors].sort((a,b)=>a-b),error90=sorted.length?sorted[Math.ceil(sorted.length*.9)-1]:null;
  return {version:PERCEPTION_POLICY_VERSION,device,training,enabled:reasons.length===0,reasons,validation,mae,constantMae,heartOnlyMae,error90};
}
export function predictPerceptionPolicy(policy:PerceptionPolicy,device:string,features:PerceptionFeatures|null,quality:boolean){
  if(!quality||!features)return {value:null,route:null,reason:'現在の心拍・体動・装着状態を確認できません'};
  if(policy.version!==PERCEPTION_POLICY_VERSION||policy.device!==device||!policy.enabled)
    return {value:null,route:null,reason:'学習後の別の日の予測精度を検証中です'};
  return selectRoute(policy.training,device,features,quality);
}

/** Explicitly requested prototype: numerically usable before accuracy studies.
 * Fits the real paired self-reports; never invents a universal HRV stress scale.
 * This model is separate from, and cannot qualify as, a validated policy.
 */
export const PROTOTYPE_MODEL_VERSION='perception-prototype-ridge-v1';
export interface PrototypeModel {version:string;device:string;route:PerceptionRoute;fit:Fit;count:number;days:number;targetRange:[number,number]}
export interface PrototypeRoute {count:number;days:number;model:PrototypeModel|null}
export interface PrototypeTraining {version:string;device:string;context:PrototypeRoute;prv5:PrototypeRoute;prv6:PrototypeRoute}
export function trainPrototypePerception(records:unknown[],device:string,now=Date.now()):PrototypeTraining {
  function train(route:PerceptionRoute):PrototypeRoute {
    const rows=rowsFor(records,device,route,now),days=new Set(rows.map(row=>row.day)).size;
    const targets=rows.map(row=>row.target);
    return {count:rows.length,days,model:rows.length<5?null:{version:PROTOTYPE_MODEL_VERSION,device,route,
      fit:fit(rows),count:rows.length,days,targetRange:[Math.min(...targets),Math.max(...targets)]}};
  }
  return {version:PROTOTYPE_MODEL_VERSION,device,context:train('context'),prv5:train('prv5'),prv6:train('prv6')};
}
export function predictPrototypePerception(training:PrototypeTraining,device:string,features:PerceptionFeatures|null,quality:boolean){
  const blocked=(reason:string)=>({value:null as number|null,route:null as PerceptionRoute|null,reason,limited:false});
  if(!quality||!features)return blocked('時計から新しい心拍・体動・装着情報がそろうと推定します');
  if(training.version!==PROTOTYPE_MODEL_VERSION||training.device!==device)return blocked('この時計の試作用モデルを準備できません');
  const augmented=features.prvChannel===6?training.prv6.model:training.prv5.model;
  const model=features.prvAvailable&&augmented&&vector(features,augmented.route)?augmented:training.context.model;
  if(!model)return blocked(`試作には体感と測定の組が5件必要です（現在${training.context.count}件）`);
  if(model.version!==PROTOTYPE_MODEL_VERSION||model.device!==device)return blocked('この時計の試作用モデルを準備できません');
  const x=vector(features,model.route);if(!x)return blocked('推定に使える測定値が不足しています');
  // Keep unknown inputs within the observed feature ranges instead of allowing
  // arbitrary extrapolation from five records. Disclose this limitation in UI.
  const bounded=x.map((value,j)=>Math.max(model.fit.ranges[j][0],Math.min(model.fit.ranges[j][1],value)));
  const value=evaluate(model.fit,bounded);
  if(!Number.isFinite(value))return blocked('試作の計算結果を確認できません');
  return {value,route:model.route,reason:null,limited:bounded.some((value,j)=>value!==x[j])};
}
