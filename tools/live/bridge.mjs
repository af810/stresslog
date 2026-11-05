import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gunzip} from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { LiveState } from './state.mjs';
import { CaptureStore,CaptureError,validateCaptureRequest } from './captures.mjs';
import {perceptionRecord} from '../../web/src/domain/perceptionRecord.ts';
import {ObjectiveStore} from './objective-store.mjs';
import {PopulationStore} from './population-store.mjs';

export function createBridge({key,cert,token,host='0.0.0.0',ingestPort=8787,localPort=8788,captureDirectory=null,objectiveDirectory=null,populationDirectory=null}) {
  if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token))throw Error('32-byte token required');
  const state=new LiveState();
  const captures=captureDirectory?new CaptureStore(captureDirectory):null;
  const objective=captureDirectory?new ObjectiveStore(objectiveDirectory??path.join(captureDirectory,'objective'),captureDirectory):null;
  const population=new PopulationStore(populationDirectory??(captureDirectory?path.join(captureDirectory,'population'):null));
  let populationTimer;
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const ingest=https.createServer({key,cert,minVersion:'TLSv1.2'},(req,res)=>{
    if(req.method!=='POST' || req.url!=='/ingest')return json(res,404,{error:'Not found'});
    const auth=req.headers.authorization||'';
    const expected=`Bearer ${token}`;
    const receivedAuth=Buffer.from(auth), expectedAuth=Buffer.from(expected);
    if(receivedAuth.length!==expectedAuth.length || !crypto.timingSafeEqual(receivedAuth,expectedAuth))return json(res,401,{error:'Unauthorized'});
    if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON required'});
    const encoding=req.headers['content-encoding']||'identity';
    if(!['identity','gzip'].includes(encoding))return json(res,415,{error:'Unsupported content encoding'});
    let size=0;const chunks=[];let rejected=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>1_000_000){rejected=true;req.destroy();}else chunks.push(chunk);});
    const accept=body=>{
      try{const accepted=state.accept(JSON.parse(body.toString('utf8')));json(res,200,{accepted});}
      catch{json(res,400,{error:'Invalid telemetry batch'});}
    };
    req.on('end',()=>{
      if(rejected)return;
      const body=Buffer.concat(chunks);
      if(encoding==='gzip')gunzip(body,{maxOutputLength:1_000_000},(error,decoded)=>{
        if(error)return json(res,400,{error:'Invalid compressed batch'});
        accept(decoded);
      });
      else accept(body);
    });
    req.on('error',()=>{});
  });
  // Keep the pooled connection alive beyond the watch's six-second send cadence.
  // Node's default five-second idle timeout races with the next upload.
  ingest.keepAliveTimeout=20000;
  ingest.requestTimeout=10000;ingest.headersTimeout=10000;ingest.maxConnections=8;
  async function capture(req,res){
    try{
      if(!req.headers.origin)throw new CaptureError(403,'Origin required');
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw new CaptureError(415,'JSON required');
      if(req.headers['content-encoding'] && req.headers['content-encoding']!=='identity')throw new CaptureError(415,'Uncompressed JSON required');
      if(!captures)throw new CaptureError(503,'Capture archive is not configured');
      const body=await new Promise((resolve,reject)=>{
        const chunks=[];let size=0,failed=false;
        req.on('data',chunk=>{
          size+=chunk.length;
          if(size>1024){if(!failed){failed=true;reject(new CaptureError(413,'Capture request too large'));}}
          else if(!failed)chunks.push(chunk);
        });
        req.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks).toString('utf8'));});
        req.on('error',reject);
      });
      let request;
      try{request=JSON.parse(body);}catch{throw new CaptureError(400,'Invalid JSON');}
      validateCaptureRequest(request);
      const saved=await captures.capture(request,now=>state.window(now));
      json(res,200,saved);
    }catch(error){json(res,error instanceof CaptureError?error.status:503,{error:error instanceof CaptureError?error.message:'Capture could not be archived'});}
  }
  const local=http.createServer((req,res)=>{
    // Browser-facing API is loopback-only. Same-origin Vite proxy, never CORS *.
    if(!['127.0.0.1:8788','localhost:8788',`127.0.0.1:${local.address()?.port}`,`localhost:${local.address()?.port}`].includes(req.headers.host))return json(res,403,{error:'Invalid host'});
    const origin=req.headers.origin;
    if(origin && !['http://localhost:5173','http://127.0.0.1:5173'].includes(origin))return json(res,403,{error:'Invalid origin'});
    if(req.method==='POST' && req.url==='/capture'){void capture(req,res);return;}
    if(req.method!=='GET')return json(res,405,{error:'Read only'});
    if(req.url==='/status')return json(res,200,{...state.status(),capabilities:{captureArchive:Boolean(captures)}});
    if(req.url==='/window')return json(res,200,state.window());
    if(req.url==='/population-estimate'){
      void population.snapshot(state.window()).then(value=>json(res,200,value),()=>json(res,503,{error:'Population estimate unavailable'}));return;
    }
    if(req.url==='/objective-references'){
      if(!objective)return json(res,503,{error:'Objective reference store is not configured'});
      void objective.snapshot().then(value=>json(res,200,value),()=>json(res,503,{error:'Reference store is unavailable'}));return;
    }
    if(req.url==='/perception-records'){
      if(!captures)return json(res,503,{error:'Capture archive is not configured'});
      void captures.listSummaries(capture=>capture.subjectiveWindowSeconds===120?perceptionRecord(capture):null)
        .then(result=>json(res,200,{schemaVersion:1,...result}),()=>json(res,503,{error:'Archived records could not be read'}));
      return;
    }
    return json(res,404,{error:'Not found'});
  });
  local.requestTimeout=10000;local.headersTimeout=10000;local.maxConnections=8;
  return {state,ingest,local,async start(){
    await new Promise((resolve,reject)=>{ingest.once('error',reject);ingest.listen(ingestPort,host,resolve);});
    try {await new Promise((resolve,reject)=>{local.once('error',reject);local.listen(localPort,'127.0.0.1',resolve);});}
    catch(e){ingest.close();throw e;}
    populationTimer=setInterval(()=>{void population.observe(state.window()).catch(()=>{});},15000).unref();
  },async close(){clearInterval(populationTimer);await Promise.all([new Promise(r=>ingest.close(r)),new Promise(r=>local.close(r))]);await captures?.finish();await objective?.finish();await population.finish();}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const root=process.argv[2];if(!root)throw Error('Private runtime directory required');
  const bridge=createBridge({key:fs.readFileSync(path.join(root,'key.pem')),cert:fs.readFileSync(path.join(root,'cert.pem')),token:fs.readFileSync(path.join(root,'token.txt'),'utf8').trim(),captureDirectory:path.join(root,'captures'),objectiveDirectory:path.join(root,'objective'),populationDirectory:path.join(root,'population')});
  await bridge.start();console.log('StressLog encrypted watch receiver ready: TLS 8787 / loopback 8788');
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await bridge.close();process.exit(0);});
}
