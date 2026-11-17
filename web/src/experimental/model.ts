import model from './residual-model-v1.json' with {type:'json'};
import type {CandidateFeatures} from './features.ts';
export const CANDIDATE_MODEL_INFO={id:model.id,windowSeconds:model.windowSeconds,updateSeconds:model.updateSeconds,validation:model.validation,datasetDoi:model.datasetDoi,personalBaseline:false,subjectiveInputs:false};
interface Tree {left:number[];right:number[];feature:number[];threshold:number[];value:number[]|number[][]}
function leaf(tree:Tree,x:number[]){let n=0,d=0;while(tree.left[n]!==-1){if(++d>20)throw Error('Invalid candidate tree');n=Math.fround(x[tree.feature[n]])<=tree.threshold[n]?tree.left[n]:tree.right[n];}return tree.value[n];}
function regression(trees:Tree[],x:number[]){return trees.length?trees.reduce((sum,t)=>sum+(leaf(t,x) as number),0)/trees.length:null;}
export function predictCandidate(f:CandidateFeatures){
 const a=[f.logEnmo,f.logJerk,f.lagEnmo,f.historyCoverage];
 if(![f.heart,f.heartDelta,...a,f.quality].every(Number.isFinite)||f.heart<30||f.heart>200||f.prvAvailable&&(!Number.isFinite(f.lnRmssd)||f.lnRmssd===null))return null;
 const predictedHeart=regression(model.heartTrees,a)!,predictedPrv=regression(model.prvTrees,a),hasPrv=f.prvAvailable&&predictedPrv!==null;
 const heartResidual=f.heart-predictedHeart,prvResidual=hasPrv?predictedPrv!-f.lnRmssd!:0;
 const x=[heartResidual,f.heartDelta,prvResidual,Number(hasPrv),...a],p=[0,0,0];
 for(const t of model.classifierTrees){const v=leaf(t,x) as number[];for(let c=0;c<3;c++)p[c]+=v[c]/model.classifierTrees.length;}
 return {value:p[1]*100,exerciseOutput:p[2],predictedHeart,heartResidual,predictedPrv,prvResidual:hasPrv?prvResidual:null,prvUsed:hasPrv};
}
export interface TemporalState {sessionId:string;endNs:string;at:number;value:number;highSeconds:number;lowSeconds:number;confirmed:boolean}
export class CandidateTemporal {
 state:TemporalState|null=null;
 reset(){this.state=null;}
 update(sessionId:string,endNs:string,at:number,raw:number,quality:number){
  if(!Number.isFinite(raw)||raw<0||raw>100||!Number.isFinite(quality)||quality<=0||quality>1||!Number.isFinite(at))throw Error('Invalid temporal input');
  let previous=this.state;
  if(previous?.sessionId===sessionId&&BigInt(endNs)<=BigInt(previous.endNs))return null;
  if(previous&&(previous.sessionId!==sessionId||at<=previous.at||at-previous.at>45000))previous=null;
  const dt=previous?(at-previous.at)/1000:0,alpha=1-Math.exp(-dt/model.smoothingSeconds),value=previous?quality*alpha*raw+(1-quality*alpha)*previous.value:raw;
  const highSeconds=value>=model.highThreshold?(previous?.highSeconds??0)+dt:0;
  const lowSeconds=value<model.lowThreshold?(previous?.lowSeconds??0)+dt:0;
  let confirmed=previous?.confirmed??false;
  if(highSeconds>=model.confirmationSeconds)confirmed=true;
  if(lowSeconds>=model.releaseSeconds)confirmed=false;
  this.state={sessionId,endNs,at,value,highSeconds,lowSeconds,confirmed};
  return {...this.state,status:confirmed?'sustained':highSeconds>0||value>=model.highThreshold?'candidate':'ordinary'};
 }
}
