import artifact from './models/wesad-v1.json' with {type:'json'};
import {BASE_FEATURES,PRV_FEATURES,POPULATION_FEATURE_METHOD,type PopulationFeatures,type PopulationObservation} from './populationFeatures.ts';
interface Tree {left:number[];right:number[];feature:number[];threshold:number[];probability:number[]}
interface Head {features:string[];trees:Tree[];minimum:number[];maximum:number[];trainingWindows:number;trainingSubjects:number}
type HeadName='heartMotion'|'heartMotionPrv';
interface Model {schemaVersion:number;id:string;featureMethod:string;heads:Record<HeadName,Head>}
const model=artifact as unknown as Model;
if(model.schemaVersion!==1||model.featureMethod!==POPULATION_FEATURE_METHOD)throw Error('汎用モデルの形式が一致しません');
export const POPULATION_MODEL_INFO={id:model.id,dataset:artifact.dataset,paperDoi:artifact.paperDoi,
  datasetDoi:artifact.datasetDoi,source:artifact.source,windowSeconds:artifact.windowSeconds,
  personalBaseline:false,subjectiveInputs:false,trainingCardiacSource:artifact.trainingCardiacSource,
  license:artifact.license,validation:artifact.validation};
export interface PopulationPrediction {
  modelId:string;value:number;hrvUsed:boolean;head:HeadName;outsideTrainingRange:string[];
}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function validPopulationFeatures(raw:unknown):PopulationFeatures|null {
  if(!raw||typeof raw!=='object')return null;
  const f=raw as PopulationFeatures;
  if(!BASE_FEATURES.every(key=>finite(f[key]))||f.heartRateMedian<30||f.heartRateMedian>200||f.logEnmo<0||f.logJerk<0||
    typeof f.prvAvailable!=='boolean'||!['native','pulse','reference'].includes(f.heartSource)||
    !(f.pulseRejectedFraction===null||finite(f.pulseRejectedFraction)&&f.pulseRejectedFraction>=0&&f.pulseRejectedFraction<=1))return null;
  if(f.prvAvailable&&(!PRV_FEATURES.every(key=>finite(f[key]))||f.pnn50!<0||f.pnn50!>100||!['prv','ecg'].includes(f.variabilitySource!)))return null;
  return {heartRateMedian:f.heartRateMedian,logEnmo:f.logEnmo,logJerk:f.logJerk,lnRmssd:f.prvAvailable?f.lnRmssd:null,
    lnSdnn:f.prvAvailable?f.lnSdnn:null,pnn50:f.prvAvailable?f.pnn50:null,prvAvailable:f.prvAvailable,
    heartSource:f.heartSource,pulseRejectedFraction:f.pulseRejectedFraction,variabilitySource:f.prvAvailable?f.variabilitySource:null};
}
export function predictPopulationStress(raw:unknown):PopulationPrediction|null {
  const features=validPopulationFeatures(raw);if(!features)return null;
  const name:HeadName=features.prvAvailable?'heartMotionPrv':'heartMotion',head=model.heads[name];
  const x=head.features.map(key=>Math.fround(features[key as keyof PopulationFeatures] as number));
  if(x.some(v=>!Number.isFinite(v)))return null;
  let sum=0;
  for(const tree of head.trees){
    let node=0,depth=0;
    while(tree.left[node]!==-1){
      if(++depth>20)throw Error('汎用モデルの決定木を確認してください');
      node=x[tree.feature[node]]<=tree.threshold[node]?tree.left[node]:tree.right[node];
    }
    sum+=tree.probability[node];
  }
  const value=100*sum/head.trees.length;
  return finite(value)&&value>=0&&value<=100?{modelId:model.id,value,hrvUsed:features.prvAvailable,head:name,
    outsideTrainingRange:head.features.filter((_,i)=>x[i]<head.minimum[i]||x[i]>head.maximum[i])}:null;
}
export function parsePopulationObservation(raw:unknown):PopulationObservation|null {
  if(!raw||typeof raw!=='object')return null;
  const r=raw as PopulationObservation,features=validPopulationFeatures(r.features);
  if(!features||features.heartSource==='reference'||features.variabilitySource==='ecg'||r.featureMethod!==POPULATION_FEATURE_METHOD||
    !finite(r.at)||r.at<0||typeof r.device!=='string'||!r.device||r.device.length>120||typeof r.sessionId!=='string'||!r.sessionId||r.sessionId.length>120||
    typeof r.startNs!=='string'||typeof r.endNs!=='string'||!/^\d{1,24}$/.test(r.startNs)||!/^\d{1,24}$/.test(r.endNs)||BigInt(r.endNs)-BigInt(r.startNs)!==60_000_000_000n)return null;
  return {featureMethod:POPULATION_FEATURE_METHOD,at:r.at,device:r.device,sessionId:r.sessionId,startNs:r.startNs,endNs:r.endNs,features};
}
export interface PopulationRecord {observation:PopulationObservation;prediction:PopulationPrediction;source:'live'|'historical'}
export interface PopulationSnapshot {
  schemaVersion:1;model:typeof POPULATION_MODEL_INFO;current:PopulationRecord|null;last:PopulationRecord|null;
  reason:string|null;error:string|null;
}
export async function readPopulationSnapshot(signal?:AbortSignal):Promise<PopulationSnapshot>{
  const response=await fetch('/live-api/population-estimate',{cache:'no-store',signal});
  if(!response.ok)throw Error('汎用モデルの推定結果を読み込めません');
  const data=await response.json() as PopulationSnapshot;
  if(data.schemaVersion!==1||data.model?.id!==model.id)throw Error('PC受信機とWebの汎用モデルが一致しません');
  for(const record of [data.current,data.last])if(record){
    const observation=parsePopulationObservation(record.observation),prediction=observation?predictPopulationStress(observation.features):null;
    if(!prediction||record.prediction?.modelId!==model.id||!finite(record.prediction.value)||Math.abs(record.prediction.value-prediction.value)>1e-8||!['live','historical'].includes(record.source))throw Error('推定結果の測定情報を確認できません');
  }
  return data;
}
