/** Label-free relative physiological activation. This is an engineering index,
 * not a calibrated probability or a validated psychological stress scale.
 * Neither subjective labels nor models fitted to them are accepted here.
 */
import {extractMultisensorFeatures,MULTISENSOR_FEATURE_METHOD} from './multisensorFeatures.ts';
import {median} from './prv.ts';
import type {LiveWindow} from './liveWindow.ts';
export const OBJECTIVE_METHOD='objective-relative-activation-v1';
export type SensorFeatures=NonNullable<ReturnType<typeof extractMultisensorFeatures>['features']>;
export interface ObjectiveReference {
  id:string;device:string;featureMethod:string;at:number;sessionId:string;
  startNs:string;endNs:string;features:SensorFeatures;
}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export function parseObjectiveReference(value:unknown):ObjectiveReference|null {
  if(!value||typeof value!=='object')return null;
  const r=value as ObjectiveReference,f=r.features;
  if(typeof r.id!=='string'||!r.id||r.id.length>200||typeof r.device!=='string'||!r.device||
    r.featureMethod!==MULTISENSOR_FEATURE_METHOD||!finite(r.at)||r.at<0||typeof r.sessionId!=='string'||!r.sessionId||
    typeof r.startNs!=='string'||typeof r.endNs!=='string'||!/^\d+$/.test(r.startNs)||!/^\d+$/.test(r.endNs)||
    BigInt(r.endNs)-BigInt(r.startNs)!==120_000_000_000n||!f||
    !finite(f.heartRateMedian)||f.heartRateMedian<30||f.heartRateMedian>200||
    !finite(f.heartRateIqr)||f.heartRateIqr<0||f.heartRateIqr>170||
    !finite(f.activityEnmoMeanMg)||f.activityEnmoMeanMg<0||
    !finite(f.activityJerkMean)||f.activityJerkMean<0||typeof f.prvAvailable!=='boolean')return null;
  if(f.prvAvailable&&(!finite(f.lnRmssd)||![5,6].includes(f.prvChannel!)))return null;
  // Whitelist fields so ratings and other legacy metadata never enter storage.
  return {id:r.id,device:r.device,featureMethod:r.featureMethod,at:r.at,sessionId:r.sessionId,startNs:r.startNs,endNs:r.endNs,
    features:{heartRateMedian:f.heartRateMedian,heartRateIqr:f.heartRateIqr,activityEnmoMeanMg:f.activityEnmoMeanMg,
      activityJerkMean:f.activityJerkMean,prvAvailable:f.prvAvailable,lnRmssd:f.prvAvailable?f.lnRmssd:null,prvChannel:f.prvAvailable?f.prvChannel:null}};
}
export function objectiveObservation(data:LiveWindow,now:number,extracted=extractMultisensorFeatures(data,now)):ObjectiveReference|null {
  if(!extracted.coreAvailable||!extracted.features||!('windowStartNs' in extracted)||!data.sessionId||data.lastReceivedAt===null)return null;
  return parseObjectiveReference({id:`live:${data.sessionId}:${extracted.windowEndNs}`,device:data.model,
    featureMethod:MULTISENSOR_FEATURE_METHOD,at:data.lastReceivedAt-(data.ppgLagMs??0),sessionId:data.sessionId,
    startNs:extracted.windowStartNs,endNs:extracted.windowEndNs,features:extracted.features});
}
const robustScale=(values:number[],floor:number)=>Math.max(floor,1.4826*median(values.map(x=>Math.abs(x-median(values)))));
export function estimateObjectiveStress(raw:unknown[],current:ObjectiveReference|null,now=Date.now()){
  const blocked=(reason:string)=>({method:OBJECTIVE_METHOD,value:null as number|null,reason,hrvUsed:false,referenceCount:0,
    prvReferenceCount:0,similarActivity:false,hrZ:null as number|null,prvZ:null as number|null,referenceHeartRate:null as number|null});
  const observation=parseObjectiveReference(current);
  if(!observation||Math.abs(now-observation.at)>15000)return blocked('時計から新しい心拍・体動・装着情報を待っています');
  const candidates:ObjectiveReference[]=[],ids=new Set<string>();
  for(const item of raw){
    const r=parseObjectiveReference(item);
    if(!r||ids.has(r.id)||r.device!==observation.device||r.at>observation.at-120000||r.at<observation.at-30*86400000)continue;
    if(r.sessionId===observation.sessionId&&BigInt(r.endNs)>BigInt(observation.startNs))continue;
    ids.add(r.id);candidates.push(r);
  }
  if(!candidates.length)return blocked('個人の基準を自動で作成しています。計測を続けてください');
  const motion=(r:ObjectiveReference)=>[Math.log1p(r.features.activityEnmoMeanMg),Math.log1p(r.features.activityJerkMean)];
  const activity=motion(observation),referenceMotion=candidates.map(motion);
  const scales=[0,1].map(j=>robustScale(referenceMotion.map(x=>x[j]),Math.log(2)));
  const distance=(r:ObjectiveReference)=>Math.hypot(...motion(r).map((value,j)=>(value-activity[j])/scales[j]));
  const ordered=candidates.sort((a,b)=>distance(a)-distance(b)||b.at-a.at);
  // Select matched activity first; when sparse, show an explicit limited estimate.
  const similar=ordered.filter(r=>distance(r)<=2);
  const neighborCount=Math.min(20,Math.max(3,Math.ceil(Math.sqrt(candidates.length))));
  const neighbors=(similar.length?similar:ordered).slice(0,neighborCount);
  const heart=neighbors.map(r=>r.features.heartRateMedian),referenceHeartRate=median(heart);
  const hrZ=Math.max(0,(observation.features.heartRateMedian-referenceHeartRate)/robustScale(heart,5));
  // PRV has its own same-layout, activity-matched cohort. Unavailable PRV in a
  // closer HR reference must not hide usable earlier PRV references elsewhere.
  const prv=observation.features.prvAvailable?ordered.filter(r=>r.features.prvAvailable&&r.features.prvChannel===observation.features.prvChannel&&distance(r)<=2).slice(0,20):[];
  const prvZ=prv.length>=3?Math.max(0,(median(prv.map(r=>r.features.lnRmssd!))-observation.features.lnRmssd!)/robustScale(prv.map(r=>r.features.lnRmssd!),.2)):null;
  const z=prvZ===null?hrZ:(hrZ+prvZ)/2;
  const value=100*(1-Math.exp(-Math.min(z,20)/2));
  if(!Number.isFinite(value))return blocked('生理指標の計算結果を確認できません');
  return {method:OBJECTIVE_METHOD,value,reason:null,hrvUsed:prvZ!==null,referenceCount:neighbors.length,
    prvReferenceCount:prv.length,similarActivity:similar.length>=3,hrZ,prvZ,referenceHeartRate};
}
export async function readObjectiveReferences(signal?:AbortSignal):Promise<{records:ObjectiveReference[];unreadable:number;error:string|null}> {
  const response=await fetch('/live-api/objective-references',{signal,cache:'no-store'});
  if(!response.ok)throw Error('時計の個人基準を読み込めません');
  const data=await response.json();
  if(data?.schemaVersion!==1||!Array.isArray(data.records)||!Number.isSafeInteger(data.unreadable)||data.unreadable<0||
    !(data.error===null||typeof data.error==='string'))throw Error('個人基準の形式を確認できません');
  const records=data.records.map(parseObjectiveReference);
  if(records.some((r:ObjectiveReference|null)=>r===null))throw Error('個人基準の測定値を確認できません');
  return {records:records as ObjectiveReference[],unreadable:data.unreadable,error:data.error};
}
