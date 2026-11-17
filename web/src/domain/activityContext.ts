import model from './models/physical-context-v1.json' with {type:'json'};
import type {PopulationFeatures,PopulationObservation} from './populationFeatures.ts';
export const ACTIVITY_CONTEXT_METHOD='activity-context-rf60-recovery120-v1';
export const ACTIVITY_CONTEXT_INFO={id:model.id,method:ACTIVITY_CONTEXT_METHOD,source:'https://physionet.org/content/wearable-device-dataset/1.0.1/',validation:model.validation,recoverySeconds:model.recoverySeconds};
export type ActivityStatus='eligible'|'movement'|'recovery'|'legacy_unfiltered';
export interface ActivityAssessment {method:typeof ACTIVITY_CONTEXT_METHOD;status:ActivityStatus;stressScore:number|null;bodyResponseScore:number;exerciseOutput:number;largeMotion:boolean;reason:string|null}
export interface ActivityMemory {device:string;lastActivityAt:number}
export function predictPhysicalContext(features:PopulationFeatures):number[]{
  const x=model.head.features.map(key=>Math.fround(features[key as keyof PopulationFeatures] as number));
  if(x.some(v=>!Number.isFinite(v)))throw Error('Invalid context features');
  const result=[0,0,0];
  for(const tree of model.head.trees){
    let node=0,depth=0;while(tree.left[node]!==-1){if(++depth>20)throw Error('Invalid context tree');node=x[tree.feature[node]]<=tree.threshold[node]?tree.left[node]:tree.right[node];}
    for(let c=0;c<3;c++)result[c]+=tree.probability[node][c];
  }
  return result.map(p=>p/model.head.trees.length);
}
export class ActivityContext {
  memory:ActivityMemory|null=null;
  assess(observation:PopulationObservation,value:number):ActivityAssessment {
    const f=observation.features,exerciseOutput=predictPhysicalContext(f)[2];
    const largeMotion=f.logEnmo>model.largeMotionLimits.logEnmo||f.logJerk>model.largeMotionLimits.logJerk;
    if(this.memory&&(this.memory.device!==observation.device||this.memory.lastActivityAt>observation.at))this.memory=null;
    let status:ActivityStatus='eligible';
    if(largeMotion||exerciseOutput>=model.exerciseThreshold){status='movement';this.memory={device:observation.device,lastActivityAt:observation.at};}
    else if(this.memory&&observation.at-this.memory.lastActivityAt<model.recoverySeconds*1000)status='recovery';
    const reason=status==='movement'?'運動・体動の影響があるため、心理的ストレスとは区別できません。':status==='recovery'?'運動・体動の後の回復区間を確認しています。':null;
    return {method:ACTIVITY_CONTEXT_METHOD,status,stressScore:status==='eligible'?value:null,bodyResponseScore:value,exerciseOutput,largeMotion,reason};
  }
}
