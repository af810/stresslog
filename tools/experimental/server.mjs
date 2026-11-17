import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {extractCandidate} from '../../web/src/experimental/features.ts';
import {predictCandidate,CandidateTemporal,CANDIDATE_MODEL_INFO} from '../../web/src/experimental/model.ts';
import {ACTIVITY_CONTEXT_METHOD} from '../../web/src/domain/activityContext.ts';

export const dayKey=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export const CSV_HEADER='time_jst,current_at_jst,current_stress,current_body,current_state,candidate_raw,candidate_smoothed,candidate_state,heart_bpm,predicted_heart_bpm,heart_residual_bpm,prv_lnrmssd,prv_used,log_enmo,log_jerk,lag_log_enmo,history_coverage,quality_weight\r\n';
const iso=at=>at===null?'':new Date(at+9*3600000).toISOString().replace('Z','+09:00');
export const csvRow=r=>[iso(r.at),iso(r.original?.at??null),r.original?.stress??'',r.original?.body??'',r.original?.status??'',r.candidate?.raw??'',r.candidate?.value??'',r.candidate?.status??'unavailable',r.features?.heart??'',r.candidate?.predictedHeart??'',r.candidate?.heartResidual??'',r.features?.lnRmssd??'',r.candidate?.prvUsed??false,r.features?.logEnmo??'',r.features?.logJerk??'',r.features?.lagEnmo??'',r.features?.historyCoverage??'',r.features?.quality??''].join(',')+'\r\n';
const scoreValid=v=>Number.isFinite(v)&&v>=0&&v<=100;
const recordValid=r=>r&&r.schemaVersion===1&&r.modelId===CANDIDATE_MODEL_INFO.id&&Number.isFinite(r.at)&&r.at>=0&&typeof r.sessionId==='string'&&r.sessionId.length<=120&&
 (r.original===null||r.original&&Number.isFinite(r.original.at)&&(r.original.stress===null||scoreValid(r.original.stress))&&scoreValid(r.original.body)&&['eligible','movement','recovery'].includes(r.original.status))&&
 (r.candidate===null||r.candidate&&scoreValid(r.candidate.value)&&scoreValid(r.candidate.raw)&&['ordinary','candidate','sustained'].includes(r.candidate.status)&&typeof r.candidate.prvUsed==='boolean'&&Number.isFinite(r.candidate.predictedHeart)&&Number.isFinite(r.candidate.heartResidual))&&
 (r.features===null||r.features&&['heart','heartDelta','logEnmo','logJerk','lagEnmo','historyCoverage','quality'].every(k=>Number.isFinite(r.features[k]))&&(r.features.lnRmssd===null||Number.isFinite(r.features.lnRmssd)));
export class ComparisonStore {
 constructor(directory=null){this.directory=directory;this.temporal=new CandidateTemporal();this.current=null;this.last=null;this.reason='約2分の時計データを待っています';this.source=null;this.error=null;this.days=new Map();this.writes=Promise.resolve();this.lastRecordedAt=null;}
 async load(day){
  if(this.days.has(day))return this.days.get(day);const data={points:[],csvReady:false};
  if(this.directory)try{
   const file=path.join(this.directory,day+'.jsonl');if((await fs.stat(file)).size>12000000)throw Error('History too large');
   const text=await fs.readFile(file,'utf8');if(text&&!text.endsWith('\n'))throw Error('Incomplete history');
   for(const line of text.split('\n').filter(Boolean)){const r=JSON.parse(line);if(!recordValid(r)||dayKey(r.at)!==day||data.points.length>=7000||data.points.at(-1)&&r.at<=data.points.at(-1).at)throw Error('Invalid comparison history');data.points.push(r);}
  }catch(e){if(e.code!=='ENOENT'){this.error='比較記録を読み込めません。既存ファイルを保持しています。';return null;}}
  this.days.set(day,data);if(this.days.size>3)this.days.delete(this.days.keys().next().value);return data;
 }
 async append(row){
  const task=this.writes.then(async()=>{
   if(this.error)return;const day=dayKey(row.at),data=await this.load(day);if(!data)return;
   if(!recordValid(row))throw Error('Invalid comparison record');
   const prev=data.points.at(-1);if(prev&&row.at<=prev.at)return;
   if(data.points.length>=7000)throw Error('Daily limit');
   if(this.directory){await fs.mkdir(this.directory,{recursive:true});await fs.appendFile(path.join(this.directory,day+'.jsonl'),JSON.stringify(row)+'\n',{mode:0o600});}
   data.points.push(row);
   if(this.directory){const file=path.join(this.directory,day+'.csv');if(data.csvReady)await fs.appendFile(file,csvRow(row));else{await fs.writeFile(file,'\uFEFF'+CSV_HEADER+data.points.map(csvRow).join(''),{mode:0o600});data.csvReady=true;}}
  });
  this.writes=task.catch(()=>{this.error='比較記録の保存に失敗しました。';});await this.writes;
 }
 async observe(window,original,now=Date.now()){
  this.source={connected:window.connected&&window.ppgFresh,worn:window.worn,batteryPercent:window.batteryPercent,at:window.lastReceivedAt};
  const raw=original?.contextMethod===ACTIVITY_CONTEXT_METHOD?original.current:null;
  const reference=raw&&Math.abs(now-raw.observation.at)<=15000?{at:raw.observation.at,stress:raw.assessment.stressScore,body:raw.prediction.value,status:raw.assessment.status,features:raw.observation.features}:null;
  if(!window.connected||!window.ppgFresh){this.current=null;this.temporal.reset();this.reason='時計の計測・接続を待っています';return;}
  const extracted=extractCandidate(window,now),o=extracted.observation;this.reason=extracted.reason;
  const prev=this.temporal.state;
  if(o&&prev?.sessionId===o.sessionId&&BigInt(o.endNs)>BigInt(prev.endNs)&&o.at>prev.at&&o.at-prev.at<30000){
   if(this.current)this.current={...this.current,original:reference};return;
  }
  let candidate=null;
  if(o){const p=predictCandidate(o.features);if(p){const t=this.temporal.update(o.sessionId,o.endNs,o.at,p.value,o.features.quality);if(t)candidate={...p,raw:p.value,value:t.value,status:t.status,highSeconds:t.highSeconds};else return;}}
  else this.temporal.reset();
  const row={schemaVersion:1,modelId:CANDIDATE_MODEL_INFO.id,at:o?.at??reference?.at??now,sessionId:window.sessionId??'',candidate,features:o?.features??null,original:reference,reason:this.reason};
  this.current=row;if(candidate)this.last=row;
  if(this.lastRecordedAt===null||row.at-this.lastRecordedAt>=30000){await this.append(row);this.lastRecordedAt=row.at;}
 }
 snapshot(now=Date.now()){
  const current=this.current&&this.source?.connected&&this.source.worn===true&&this.source.at!==null&&Math.abs(now-this.source.at)<=15000&&Math.abs(now-this.current.at)<=45000?this.current:null;
  return {service:'stresslog-comparison-v1',model:CANDIDATE_MODEL_INFO,current,last:this.last,reason:this.reason,source:this.source,error:this.error};
 }
 async history(day=dayKey(Date.now())){
  await this.writes;if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid day');const data=await this.load(day);let days=[dayKey(Date.now())];
  if(this.directory)try{days=[...new Set([...days,...(await fs.readdir(this.directory)).filter(n=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).map(n=>n.slice(0,10))])].sort().reverse();}catch(e){if(e.code!=='ENOENT')this.error='比較履歴の日付を読み込めません。';}
  return {schemaVersion:1,modelId:CANDIDATE_MODEL_INFO.id,day,days,points:data?.points??[],error:this.error};
 }
}
export function createComparisonServer({directory=null,sourceBase='http://127.0.0.1:8788',port=8786,pollMs=10000,loadSource=null}={}){
 const store=new ComparisonStore(directory);let timer,busy=false;
 const read=async route=>{const response=await fetch(sourceBase+route,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Source unavailable');const text=await response.text();if(text.length>16000000)throw Error('Source response too large');return JSON.parse(text);};
 async function poll(){
  if(busy)return;busy=true;
  try{const [window,original]=await(loadSource?loadSource():Promise.all([read('/window'),read('/population-estimate')]));await store.observe(window,original);}
  catch{store.current=null;store.temporal.reset();store.source=null;store.reason='現行アプリの受信機に接続できません。現行アプリを起動してください。';}finally{busy=false;}
 }
 const server=http.createServer((req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(![`127.0.0.1:${server.address()?.port}`,`localhost:${server.address()?.port}`].includes(req.headers.host))return send(403,{error:'Invalid host'});
  if(req.headers.origin&&!['http://localhost:5174','http://127.0.0.1:5174'].includes(req.headers.origin))return send(403,{error:'Invalid origin'});
  if(req.method!=='GET')return send(405,{error:'Read only'});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/snapshot')return send(200,store.snapshot());
  if(url.pathname==='/history'||url.pathname==='/export'){
   const day=url.searchParams.get('day');if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return send(400,{error:'Invalid day'});
   void store.history(day??undefined).then(value=>{
    if(url.pathname==='/export'){
     if(value.error)return send(503,{error:value.error});
     res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="stresslog-comparison-${value.day}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end('\uFEFF'+CSV_HEADER+value.points.map(csvRow).join(''));
    }else send(200,value);
   },()=>send(503,{error:'History unavailable'}));return;
  }
  return send(404,{error:'Not found'});
 });
 return {server,store,poll,async start(){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});await poll();timer=setInterval(()=>void poll(),pollMs).unref();},async close(){clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,10));await new Promise(resolve=>server.close(resolve));await store.writes;}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=process.argv[2];if(!root)throw Error('Private comparison directory required');const app=createComparisonServer({directory:path.resolve(root)});await app.start();console.log('StressLog comparison ready: loopback 8786');
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
