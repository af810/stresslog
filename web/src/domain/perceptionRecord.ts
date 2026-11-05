import {extractMultisensorFeatures,MULTISENSOR_FEATURE_METHOD} from './multisensorFeatures.ts';
import type {LiveWindow} from './liveWindow.ts';
import {SHORT_LIVE_METHOD} from './prv.ts';

export type PerceptionFeatures=NonNullable<ReturnType<typeof extractMultisensorFeatures>['features']>;
export interface PerceptionRecord {
  captureId:string;model:string;featureMethod:string;prvMethod:string;
  recordedAt:number;windowEndEpochMs:number|null;subjectiveWindowSeconds:number;score:number;
  qualityPassed:boolean;reasons:string[];features:PerceptionFeatures|null;
}
export async function readPerceptionRecords(signal?:AbortSignal):Promise<{records:PerceptionRecord[];unreadable:number}> {
  const response=await fetch('/live-api/perception-records',{signal,cache:'no-store'});
  if(!response.ok)throw Error('PCに保存した体感記録を読み込めません');
  const data=await response.json();
  if(data?.schemaVersion!==1||!Array.isArray(data.records)||!Number.isSafeInteger(data.unreadable)||data.unreadable<0)
    throw Error('体感記録の形式を確認できません');
  return data;
}
/** Rebuild only from the immutable, paired archive. Never supply a missing rating. */
export function perceptionRecord(capture:{captureId:string;capturedAt:number;subjectiveWindowSeconds:number;subjectiveStress0to10:number;window:LiveWindow}):PerceptionRecord {
  const {window}=capture;
  const extracted=extractMultisensorFeatures(window,capture.capturedAt);
  return {captureId:capture.captureId,model:window.model,featureMethod:MULTISENSOR_FEATURE_METHOD,prvMethod:SHORT_LIVE_METHOD,
    recordedAt:capture.capturedAt,windowEndEpochMs:window.lastReceivedAt===null?null:window.lastReceivedAt-(window.ppgLagMs??0),
    subjectiveWindowSeconds:capture.subjectiveWindowSeconds,score:capture.subjectiveStress0to10,
    qualityPassed:extracted.coreAvailable,reasons:extracted.reasons,features:extracted.features};
}
