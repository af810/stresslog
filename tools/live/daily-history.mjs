import fs from 'node:fs/promises';
import path from 'node:path';
import {POPULATION_MODEL_INFO} from '../../web/src/domain/populationStress.ts';
import {ACTIVITY_CONTEXT_METHOD} from '../../web/src/domain/activityContext.ts';
export const dayKey=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const valid=p=>p&&Number.isFinite(p.at)&&p.at>=0&&Number.isFinite(p.value)&&p.value>=0&&p.value<=100&&typeof p.hrvUsed==='boolean'&&typeof p.outsideTrainingRange==='boolean'&&typeof p.sessionId==='string'&&p.sessionId.length<=120&&typeof p.endNs==='string'&&/^\d{1,24}$/.test(p.endNs)&&p.modelId===POPULATION_MODEL_INFO.id;
const validContext=p=>p.contextMethod===ACTIVITY_CONTEXT_METHOD&&['eligible','movement','recovery'].includes(p.activityState)&&
  (p.activityState==='eligible'?p.stressValue===p.value:p.stressValue===null)&&Number.isFinite(p.exerciseOutput)&&p.exerciseOutput>=0&&p.exerciseOutput<=1;
const csvHeader='time_jst,stress_score,body_response_score,activity_state,exercise_model_output,prv_used,outside_training_range\r\n';
export const csvRow=p=>`${new Date(p.at+9*3600000).toISOString().replace('Z','+09:00')},${p.stressValue??''},${p.value},${p.activityState},${p.exerciseOutput??''},${p.hrvUsed},${p.outsideTrainingRange}\r\n`;
/** 15 s sampled estimates, append-only daily files. Never saves raw waveforms. */
export class DailyHistory{
  constructor(directory=null,legacy=false){this.directory=directory;this.legacy=legacy;this.days=new Map();this.error=null;this.writes=Promise.resolve();}
  async load(day){
    if(this.days.has(day))return this.days.get(day);
    const data={day,points:[],csvReady:false};
    if(this.directory)try{
      const file=path.join(this.directory,`${day}.jsonl`),stat=await fs.stat(file);if(stat.size>6000000)throw Error('History too large');
      const text=await fs.readFile(file,'utf8');
      if(text&&!text.endsWith('\n'))throw Error('Incomplete history row');
      for(const line of text.split('\n').filter(Boolean)){
        let p=JSON.parse(line);if(!valid(p)||!this.legacy&&!validContext(p)||dayKey(p.at)!==day||data.points.length>=7000||data.points.at(-1)&&p.at<=data.points.at(-1).at)throw Error('Invalid history');
        if(this.legacy)p={...p,stressValue:null,activityState:'legacy_unfiltered',exerciseOutput:null,contextMethod:'legacy_unfiltered'};
        data.points.push(p);
      }
    }catch(error){if(error.code!=='ENOENT'){this.error='時系列の保存ファイルを読み込めません。既存ファイルを保持しています。';return null;}}
    this.days.set(day,data);
    if(this.days.size>3)this.days.delete(this.days.keys().next().value);
    return data;
  }
  async record(record){
    const task=this.writes.then(async()=>{
      if(this.error||record.source!=='live'||this.legacy)return;
      const {observation:o,prediction:p}=record,day=dayKey(o.at),data=await this.load(day);
      if(!data)return;const previous=data.points.at(-1);
      if(previous&&(o.at<=previous.at||o.sessionId===previous.sessionId&&(o.endNs===previous.endNs||o.at-previous.at<15000)))return;
      const a=record.assessment;
      const point={modelId:POPULATION_MODEL_INFO.id,at:o.at,value:p.value,hrvUsed:p.hrvUsed,outsideTrainingRange:p.outsideTrainingRange.length>0,sessionId:o.sessionId,endNs:o.endNs,
        contextMethod:a?.method,stressValue:a?.stressScore,activityState:a?.status,exerciseOutput:a?.exerciseOutput};
      if(!valid(point)||!validContext(point)||data.points.length>=7000)throw Error('Invalid score or daily limit exceeded');
      if(this.directory){await fs.mkdir(this.directory,{recursive:true});await fs.appendFile(path.join(this.directory,`${day}.jsonl`),JSON.stringify(point)+'\n',{mode:0o600});}
      data.points.push(point);
      if(this.directory){
        const csvFile=path.join(this.directory,`${day}.csv`);
        // The journal is authoritative. Rebuild its CSV projection after each receiver restart.
        if(!data.csvReady){await fs.writeFile(csvFile,'\uFEFF'+csvHeader+data.points.map(csvRow).join(''),{mode:0o600});data.csvReady=true;}
        else await fs.appendFile(csvFile,csvRow(point));
      }
    });
    this.writes=task.catch(()=>{this.error='時系列の保存に失敗しました。空き容量などを確認してください。';});await this.writes;
  }
  async snapshot(now=Date.now(),requestedDay=dayKey(now)){
    await this.writes;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(requestedDay))throw Error('Invalid day');
    const selected=await this.load(requestedDay),days=[];
    if(this.directory)try{
      const files=(await fs.readdir(this.directory)).filter(n=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().reverse().slice(0,30);
      for(const file of files)days.push(file.slice(0,10));
    }catch(e){if(e.code!=='ENOENT')this.error='過去の時系列を読み込めません。';}
    if(!days.includes(dayKey(now)))days.unshift(dayKey(now));
    return {schemaVersion:2,contextMethod:this.legacy?'legacy_unfiltered':ACTIVITY_CONTEXT_METHOD,modelId:POPULATION_MODEL_INFO.id,timeZone:'Asia/Tokyo',sampleIntervalSeconds:15,windowSeconds:60,day:requestedDay,points:selected?.points??[],days,error:this.error};
  }
}
