import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {extractPopulationObservation} from '../../web/src/domain/populationFeatures.ts';
import {parsePopulationObservation,predictPopulationStress,POPULATION_MODEL_INFO} from '../../web/src/domain/populationStress.ts';
import {DailyHistory} from './daily-history.mjs';
import {ActivityContext,ACTIVITY_CONTEXT_METHOD} from '../../web/src/domain/activityContext.ts';

/** Latest result only. This is not a baseline, training set or personal model. */
export class PopulationStore {
  last=null;current=null;reason='時計で計測を開始してください';error=null;key=null;job=null;lastSavedAt=0;
  constructor(directory=null){this.directory=directory?path.resolve(directory):null;this.context=new ActivityContext();this.history=new DailyHistory(this.directory?path.join(this.directory,'daily-context-v2'):null);this.ready=this.initialize();}
  async initialize(){
    if(!this.directory)return;
    try{
      const saved=JSON.parse(await fs.readFile(path.join(this.directory,'last-observation-context-v2.json'),'utf8'));
      const observation=parsePopulationObservation(saved.observation);
      if(saved.schemaVersion!==1||!observation||!['live','historical'].includes(saved.source)||observation.at>Date.now()+15000)throw Error('Invalid saved observation');
      const prediction=predictPopulationStress(observation.features);
      if(!prediction)throw Error('Invalid saved features');
      const memory=saved.activityMemory;
      if(memory&&typeof memory.device==='string'&&Number.isFinite(memory.lastActivityAt)&&memory.lastActivityAt>=0&&memory.lastActivityAt<=observation.at)this.context.memory=memory;
      this.last={observation,prediction,source:saved.source,assessment:saved.source==='live'?this.context.assess(observation,prediction.value):this.historicalAssessment(observation,prediction.value)};
    }catch(error){if(error.code!=='ENOENT')this.error='前回の推定値を読み込めません。保存ファイルは保持しています。';}
  }
  async save(now=Date.now()){
    if(!this.directory||!this.last||this.error)return;
    await fs.mkdir(this.directory,{recursive:true});
    const temporary=path.join(this.directory,`.last-${randomUUID()}.tmp`);
    try{
      await fs.writeFile(temporary,JSON.stringify({schemaVersion:1,modelId:POPULATION_MODEL_INFO.id,
        observation:this.last.observation,source:this.last.source,activityMemory:this.context.memory}),{flag:'wx',mode:0o600});
      await fs.rename(temporary,path.join(this.directory,'last-observation-context-v2.json'));
      this.lastSavedAt=now;
    }finally{await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  async observe(window,now=Date.now()){
    await this.ready;
    if(this.job)await this.job;
    if(!window.connected||!window.ppgFresh||window.lastReceivedAt===null||Math.abs(now-window.lastReceivedAt)>15000){
      this.current=null;this.reason='時計で計測を開始すると、約1分のデータから更新します';return;
    }
    const key=[window.sessionId,window.lastReceivedAt,window.worn,window.streamErrors,window.clockSkewMs,
      window.registrations.acceleration,window.registrations.heartRate].join(':');
    if(key===this.key)return;
    this.key=key;
    this.job=(async()=>{
      const {observation,reason}=extractPopulationObservation(window,now);
      this.reason=reason;this.current=null;
      if(!observation)return;
      const prediction=predictPopulationStress(observation.features);
      if(!prediction){this.reason='心拍・体動の値を確認しています';return;}
      this.current={observation,prediction,source:'live',assessment:this.context.assess(observation,prediction.value)};
      await this.history.record(this.current);
      if(!this.last||observation.at>=this.last.observation.at)this.last=this.current;
      if(now-this.lastSavedAt>=30000)await this.save(now);
    })();
    try{await this.job;}catch{this.error='推定結果の保存に失敗しました。現在の値は表示できます。';}finally{this.job=null;}
  }
  async snapshot(window,now=Date.now()){
    await this.observe(window,now);
    const current=this.current&&window.worn===true&&Math.abs(now-this.current.observation.at)<=15000?this.current:null;
    return {schemaVersion:1,model:POPULATION_MODEL_INFO,contextMethod:ACTIVITY_CONTEXT_METHOD,current,last:this.last,reason:current?null:this.reason,error:this.error};
  }
  async importHistorical(raw){
    await this.ready;
    if(this.last||this.error)return false;
    const observation=parsePopulationObservation(raw);
    if(!observation||observation.at>Date.now())return false;
    const prediction=predictPopulationStress(observation.features);if(!prediction)return false;
    this.last={observation,prediction,source:'historical',assessment:this.historicalAssessment(observation,prediction.value)};await this.save();return true;
  }
  historicalAssessment(observation,value){return {...new ActivityContext().assess(observation,value),status:'legacy_unfiltered',stressScore:null,reason:'過去データのため、運動後の状態を確認できません。'};}
  async finish(){await this.ready;await this.job;await this.history.writes;await this.save();}
}
