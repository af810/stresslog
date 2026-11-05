import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {objectiveObservation,parseObjectiveReference} from '../../web/src/domain/objectiveStress.ts';
const decompress=promisify(gunzip);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json\.gz$/;
export class ObjectiveStore {
  records=[];unreadable=0;error=null;job=null;lastAttempt=0;
  constructor(directory,captureDirectory=path.join(directory,'captures')){this.directory=path.resolve(directory);this.captureDirectory=path.resolve(captureDirectory);this.file=path.join(this.directory,'objective-reference-v1.json');this.ready=this.initialize();}
  async initialize(){
    try{
      let saved;
      try{saved=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      if(saved){
        if(saved.schemaVersion!==1||!Array.isArray(saved.records)||saved.records.length>5000)throw Error('Invalid reference file');
        const records=saved.records.map(parseObjectiveReference);
        if(records.some(r=>!r))throw Error('Invalid reference record');
        this.records=records;await this.importSeed();return;
      }
      let names=[];
      try{names=await fs.readdir(this.captureDirectory);}catch(error){if(error.code!=='ENOENT')throw error;}
      for(const name of names.filter(name=>UUID.test(name))){
        try{
          const capture=JSON.parse((await decompress(await fs.readFile(path.join(this.captureDirectory,name)),{maxOutputLength:32*1024*1024})).toString('utf8'));
          // Only the watch window and acquisition time are consulted. Ratings,
          // subjective time windows, and fitted legacy models are never read.
          if(!Number.isSafeInteger(capture.capturedAt)||capture.capturedAt<0)throw Error('Invalid acquisition time');
          const r=objectiveObservation(capture.window,capture.capturedAt);
          if(r)this.keep({...r,id:`archive:${name.slice(0,-8)}`});
        }catch{this.unreadable++;}
        await new Promise(resolve=>setImmediate(resolve));
      }
      await this.importSeed();
      if(this.records.length)await this.save();
    }catch{this.error='個人基準を読み書きできません。元の記録は保持しています。';}
  }
  async importSeed(){
    let seed;
    try{seed=JSON.parse(await fs.readFile(path.join(this.directory,'historical-reference-seed-v1.json'),'utf8'));}
    catch(error){if(error.code==='ENOENT')return;throw error;}
    if(seed.schemaVersion!==1||seed.kind!=='historical-sensor-only'||!Array.isArray(seed.records)||seed.records.length>5000)
      throw Error('Invalid historical sensor reference seed');
    const parsed=seed.records.map(parseObjectiveReference);
    if(parsed.some(r=>!r))throw Error('Invalid historical sensor reference');
    let changed=false;
    for(const record of parsed.sort((a,b)=>a.at-b.at))if(this.keep(record))changed=true;
    if(changed)await this.save();
  }
  keep(record){
    const r=parseObjectiveReference(record);if(!r)return false;
    if(this.records.some(old=>old.id===r.id||old.device===r.device&&(
      Math.abs(old.at-r.at)<150000||old.sessionId===r.sessionId&&BigInt(old.endNs)>BigInt(r.startNs)&&BigInt(r.endNs)>BigInt(old.startNs))))return false;
    this.records.push(r);this.records.sort((a,b)=>a.at-b.at);this.records=this.records.slice(-5000);return true;
  }
  async save(){
    await fs.mkdir(this.directory,{recursive:true});
    const temporary=path.join(this.directory,`.objective-${randomUUID()}.tmp`);
    try{await fs.writeFile(temporary,JSON.stringify({schemaVersion:1,records:this.records}),{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);}
    finally{await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  async observe(window,now=Date.now()){
    await this.ready;
    if(this.error||this.job||!window.connected||now-this.lastAttempt<30000)return;
    if(this.records.some(r=>r.device===window.model&&now-r.at>=0&&now-r.at<150000))return;
    this.lastAttempt=now;
    this.job=(async()=>{
      const record=objectiveObservation(window,now);
      if(record&&this.keep(record))await this.save();
    })();
    try{await this.job;}catch{this.error='新しい個人基準を保存できません。保存済みの基準は保持しています。';}finally{this.job=null;}
  }
  async snapshot(){await this.ready;return {schemaVersion:1,records:this.records,unreadable:this.unreadable,error:this.error};}
  async finish(){await this.ready;await this.job;}
}
