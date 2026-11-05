// Explicit self-report captures only; no continuous disk recording.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip),decompress=promisify(gunzip);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export class CaptureError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
export function validateCaptureRequest(value){
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    typeof value.captureId!=='string' || !UUID.test(value.captureId) || typeof value.subjectiveStress0to10!=='number' ||
    !Number.isFinite(value.subjectiveStress0to10) || value.subjectiveStress0to10<0 || value.subjectiveStress0to10>10 ||
    Object.keys(value).some(key=>!['captureId','subjectiveStress0to10','subjectiveWindowSeconds'].includes(key)))
    throw new CaptureError(400,'Invalid capture request');
  const subjectiveWindowSeconds=value.subjectiveWindowSeconds===undefined?300:value.subjectiveWindowSeconds;
  if(![120,300].includes(subjectiveWindowSeconds))throw new CaptureError(400,'Invalid subjective time window');
  return {...value,subjectiveWindowSeconds};
}

export class CaptureStore {
  pending=new Map();
  summaries=new Map();
  listing=null;
  constructor(directory){this.directory=path.resolve(directory);}
  async capture(request,windowFactory){
    request=validateCaptureRequest(request);
    const {captureId,subjectiveStress0to10,subjectiveWindowSeconds}=request;
    let job=this.pending.get(captureId);
    if(!job){
      job=this.save(request,windowFactory);
      this.pending.set(captureId,job);
    }
    try{
      const saved=await job;
      if(saved.subjectiveStress0to10!==subjectiveStress0to10)throw new CaptureError(409,'Capture ID already used for a different score');
      if(saved.subjectiveWindowSeconds!==subjectiveWindowSeconds)throw new CaptureError(409,'Capture ID already used for a different subjective time window');
      return saved;
    }finally{if(this.pending.get(captureId)===job)this.pending.delete(captureId);}
  }
  async read(target,request){
    const data=JSON.parse((await decompress(await fs.readFile(target),{maxOutputLength:32*1024*1024})).toString('utf8'));
    if(data.schemaVersion!==1 || data.captureId!==request.captureId || !Number.isSafeInteger(data.capturedAt) || !data.window?.report)
      throw Error('Invalid archived capture');
    if(data.subjectiveStress0to10!==request.subjectiveStress0to10)throw new CaptureError(409,'Capture ID already used for a different score');
    const subjectiveWindowSeconds=data.subjectiveWindowSeconds===undefined?300:data.subjectiveWindowSeconds;
    if(![120,300].includes(subjectiveWindowSeconds))throw Error('Invalid archived subjective time window');
    if(subjectiveWindowSeconds!==request.subjectiveWindowSeconds)throw new CaptureError(409,'Capture ID already used for a different subjective time window');
    data.subjectiveWindowSeconds=subjectiveWindowSeconds;
    return data;
  }
  async save(request,windowFactory){
    await fs.mkdir(this.directory,{recursive:true});
    const target=path.join(this.directory,request.captureId+'.json.gz');
    try{return await this.read(target,request);}catch(error){if(error.code!=='ENOENT')throw error;}
    const capturedAt=Date.now();
    const data={schemaVersion:1,...request,capturedAt,window:windowFactory(capturedAt)};
    const bytes=await compress(Buffer.from(JSON.stringify(data),'utf8'));
    const temporary=path.join(this.directory,`.${request.captureId}.${randomUUID()}.tmp`);
    try{
      await fs.writeFile(temporary,bytes,{flag:'wx',mode:0o600});
      // Atomic publication without replacing an existing capture. A crash can
      // leave a temporary file but never a partially written .json.gz record.
      try{await fs.link(temporary,target);}
      catch(error){if(error.code==='EEXIST')return await this.read(target,request);throw error;}
      return data;
    }finally{await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  async listSummaries(project){
    if(this.listing)return this.listing;
    this.listing=this.buildSummaries(project);
    try{return await this.listing;}finally{this.listing=null;}
  }
  async buildSummaries(project){
    let names;
    try{names=await fs.readdir(this.directory);}catch(error){if(error.code==='ENOENT')return {records:[],unreadable:0};throw error;}
    const records=[];let unreadable=0;
    for(const name of names.filter(name=>name.endsWith('.json.gz')&&UUID.test(name.slice(0,-8)))){
      try{
        const target=path.join(this.directory,name),stat=await fs.stat(target);
        let cached=this.summaries.get(name);
        if(!cached||cached.modified!==stat.mtimeMs||cached.size!==stat.size){
          const data=JSON.parse((await decompress(await fs.readFile(target),{maxOutputLength:32*1024*1024})).toString('utf8'));
          const request=validateCaptureRequest({captureId:data.captureId,subjectiveStress0to10:data.subjectiveStress0to10,
            subjectiveWindowSeconds:data.subjectiveWindowSeconds});
          if(data.schemaVersion!==1||request.captureId!==name.slice(0,-8)||!Number.isSafeInteger(data.capturedAt)||data.capturedAt<0||!data.window?.report)
            throw Error('Invalid archived capture');
          const value=await project({...data,subjectiveWindowSeconds:request.subjectiveWindowSeconds});
          cached={modified:stat.mtimeMs,size:stat.size,value};this.summaries.set(name,cached);
        }
        if(cached.value!==null)records.push(cached.value);
      }catch{unreadable++;}
      // Yield between archives so telemetry is not starved during first recovery.
      await new Promise(resolve=>setImmediate(resolve));
    }
    for(const name of this.summaries.keys())if(!names.includes(name))this.summaries.delete(name);
    return {records,unreadable};
  }
  async finish(){await Promise.allSettled([...this.pending.values(),this.listing]);}
}
