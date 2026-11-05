import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createBridge} from './bridge.mjs';
function request(options,body) {return new Promise((resolve,reject)=>{
  const req=(options.protocol==='https:'?https:http).request(options,res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),reusedSocket:req.reusedSocket}));});req.on('error',reject);if(body)req.write(Buffer.isBuffer(body)?body:JSON.stringify(body));req.end();
});}

test('first-session population estimate flows through TLS ingestion without personal references',async()=>{
  const tls=process.env.STRESSLOG_TEST_TLS;if(!tls)throw Error('STRESSLOG_TEST_TLS required');
  const cert=fs.readFileSync(path.join(tls,'cert.pem')),key=fs.readFileSync(path.join(tls,'key.pem')),token='b'.repeat(64);
  const bridge=createBridge({cert,key,token,host:'127.0.0.1',ingestPort:0,localPort:0});await bridge.start();
  try{
    const endpoint={protocol:'http:',hostname:'127.0.0.1',port:bridge.local.address().port,path:'/population-estimate',method:'GET'};
    const empty=await request(endpoint);assert.equal(empty.status,200);assert.equal(empty.data.current,null);assert.equal(empty.data.last,null);
    assert.equal(empty.data.model.personalBaseline,false);assert.equal(empty.data.model.subjectiveInputs,false);
    assert.equal((await request({...endpoint,headers:{Origin:'https://untrusted.example'}})).status,403);
    assert.equal((await request({...endpoint,headers:{Host:'untrusted.example'}})).status,403);
    assert.equal((await request({...endpoint,method:'POST'})).status,405);
    const events=[{sensorStringType:'android.sensor.low_latency_offbody_detect',sensorTimestampNs:'1000000000',values:[1]}];
    for(let i=0;i<=7100;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(1_000_000_000n+BigInt(i)*10_000_000n),values:[0]});
    for(let i=0;i<=1775;i++)events.push({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(1_000_000_000n+BigInt(i)*40_000_000n),values:[0,0,9.80665]});
    for(let i=0;i<=71;i++)events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(1_000_000_000n+BigInt(i)*1_000_000_000n),values:[85],accuracy:3});
    events.sort((a,b)=>Number(BigInt(a.sensorTimestampNs)-BigInt(b.sensorTimestampNs)));
    const ingest={protocol:'https:',hostname:'127.0.0.1',port:bridge.ingest.address().port,path:'/ingest',method:'POST',ca:cert,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}};
    for(let offset=0;offset<events.length;offset+=2000){
      const batch={sessionId:'population-first-session-test',model:'synthetic-watch',sequence:offset/2000,
        sentAtEpochMs:Date.now(),sentElapsedNs:'72000000000',registrations:{ppg:true,heartRate:true,acceleration:true},events:events.slice(offset,offset+2000)};
      assert.equal((await request(ingest,batch)).status,200);
    }
    const result=await request(endpoint);assert.equal(result.status,200);assert.ok(result.data.current);
    assert.equal(result.data.current.prediction.head,'heartMotion');assert.ok(result.data.current.prediction.value>=0&&result.data.current.prediction.value<=100);
    assert.equal(result.data.current.observation.sessionId,'population-first-session-test');
  }finally{await bridge.close();}
});
test('TLS + bearer ingestion; isolated loopback read API; end-to-end window',async()=>{
  const dir=process.env.STRESSLOG_TEST_TLS;if(!dir)throw Error('STRESSLOG_TEST_TLS required');
  const cert=fs.readFileSync(path.join(dir,'cert.pem')),key=fs.readFileSync(path.join(dir,'key.pem')),token='a'.repeat(64);
  const bridge=createBridge({cert,key,token,host:'127.0.0.1',ingestPort:0,localPort:0});await bridge.start();
  try {
    const ingestion={protocol:'https:',hostname:'127.0.0.1',port:bridge.ingest.address().port,path:'/ingest',method:'POST',ca:cert,headers:{'Content-Type':'application/json'}};
    const b={sessionId:'test-tls-session',model:'synthetic-test',sequence:0,sentAtEpochMs:Date.now(),sentElapsedNs:'11000000000',events:[{sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:'10000000000',values:[0,1]}]};
    assert.equal((await request(ingestion,b)).status,401);
    assert.equal((await request({...ingestion,headers:{...ingestion.headers,Authorization:'Bearer '+'é'.repeat(64)}},b)).status,401);
    assert.equal((await request({...ingestion,headers:{...ingestion.headers,Authorization:`Bearer ${token}`}},b)).status,200);
    const local={protocol:'http:',hostname:'127.0.0.1',port:bridge.local.address().port,path:'/window',method:'GET'};
    const out=await request(local);assert.equal(out.status,200);assert.equal(out.data.report.events.length,1);assert.equal(out.data.model,'synthetic-test');
    assert.equal((await request({...local,headers:{Origin:'https://untrusted.example'}})).status,403);
    assert.equal((await request({...local,headers:{Host:'attacker.example'}})).status,403);
    assert.equal((await request({...local,method:'POST'})).status,405);
    const compressed={...ingestion,headers:{...ingestion.headers,Authorization:`Bearer ${token}`,'Content-Encoding':'gzip'}};
    const next={...b,sequence:1,events:[{...b.events[0],sensorTimestampNs:'11000000000'}]};
    assert.equal((await request(compressed,gzipSync(JSON.stringify(next)))).status,200);
    const updated=await request(local);
    assert.equal(updated.data.report.events.length,2);
    assert.deepEqual(updated.data.report.events[1].values,next.events[0].values);
    assert.equal((await request(compressed,Buffer.from('invalid gzip'))).status,400);
    assert.equal((await request(compressed,gzipSync('x'.repeat(1_000_001)))).status,400);
    assert.equal((await request({...compressed,headers:{...compressed.headers,Authorization:'wrong'}},gzipSync(JSON.stringify(next)))).status,401);
    assert.equal((await request({...compressed,headers:{...compressed.headers,'Content-Encoding':'br'}},Buffer.from('x'))).status,415);
    assert.equal((await request(local)).data.report.events.length,2);
    assert.equal((await request(compressed,gzipSync(JSON.stringify(next)))).data.accepted,false);
    assert.equal((await request(local)).data.report.events.length,2);
    const agent=new https.Agent({keepAlive:true,maxSockets:1});
    try {
      const first={...next,sequence:2,events:[{...next.events[0],sensorTimestampNs:'12000000000'}]};
      assert.equal((await request({...compressed,agent},gzipSync(JSON.stringify(first)))).status,200);
      await new Promise(resolve=>setTimeout(resolve,6500));
      const second={...first,sequence:3,events:[{...first.events[0],sensorTimestampNs:'13000000000'}]};
      const response=await request({...compressed,agent},gzipSync(JSON.stringify(second)));
      assert.equal(response.status,200);
      assert.equal(response.reusedSocket,true);
      assert.equal((await request(local)).data.report.events.length,4);
    } finally {agent.destroy();}
  }finally{await bridge.close();}
});
test('capture API archives one exact window per self-report and rejects cross-origin writes',async()=>{
  const tls=process.env.STRESSLOG_TEST_TLS;if(!tls)throw Error('STRESSLOG_TEST_TLS required');
  const cert=fs.readFileSync(path.join(tls,'cert.pem')),key=fs.readFileSync(path.join(tls,'key.pem'));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stresslog-capture-api-test-'));
  const bridge=createBridge({cert,key,token:'a'.repeat(64),host:'127.0.0.1',ingestPort:0,localPort:0,captureDirectory:directory});
  await bridge.start();
  try{
    const local={protocol:'http:',hostname:'127.0.0.1',port:bridge.local.address().port,path:'/capture',method:'POST',
      headers:{Origin:'http://localhost:5173','Content-Type':'application/json'}};
    const id='01234567-89ab-4cde-8123-0123456789ab';
    const payload={captureId:id,subjectiveStress0to10:4};
    assert.equal((await request({...local,headers:{...local.headers,Origin:'https://untrusted.example'}},payload)).status,403);
    assert.equal((await request({...local,headers:{'Content-Type':'application/json'}},payload)).status,403);
    assert.equal((await request({...local,headers:{...local.headers,Host:'attacker.example'}},payload)).status,403);
    assert.equal((await request({...local,headers:{...local.headers,'Content-Type':'text/plain'}},payload)).status,415);
    assert.equal((await request({...local,headers:{...local.headers,'Content-Encoding':'gzip'}},payload)).status,415);
    assert.equal((await request(local,Buffer.from('{broken'))).status,400);
    assert.equal((await request(local,Buffer.from('x'.repeat(1025)))).status,413);
    assert.equal((await request(local,{...payload,captureId:'../elsewhere'})).status,400);
    assert.equal((await request(local,{...payload,subjectiveStress0to10:11})).status,400);
    assert.deepEqual(fs.readdirSync(directory),[]);
    const batch={sessionId:'synthetic-capture-session',model:'synthetic-test',sequence:0,sentAtEpochMs:Date.now(),
      sentElapsedNs:'11000000000',events:[{sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:'10000000000',values:[-3,7.123456789]}]};
    bridge.state.accept(batch);
    const first=await request(local,payload);
    assert.equal(first.status,200);assert.equal(first.data.window.report.events.length,1);
    assert.equal(first.data.subjectiveStress0to10,4);
    bridge.state.accept({...batch,sequence:1,events:[{...batch.events[0],sensorTimestampNs:'11000000000'}]});
    const retry=await request(local,payload);
    assert.deepEqual(retry.data,first.data);
    assert.equal((await request(local,{...payload,subjectiveStress0to10:8})).status,409);
    const saved=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,id+'.json.gz'))).toString('utf8'));
    assert.deepEqual(saved,first.data);
    assert.deepEqual(saved.window.report.events[0].values,batch.events[0].values);
    const second=await request(local,{...payload,captureId:'11234567-89ab-4cde-8123-0123456789ab'});
    assert.equal(second.data.window.report.events.length,2);assert.equal(fs.readdirSync(directory).length,2);
    assert.equal((await request({...local,path:'/captures/'+id+'.json.gz',method:'GET'})).status,404);
    const status=await request({...local,path:'/status',method:'GET'});
    assert.equal(status.data.capabilities.captureArchive,true);
    const recovery={...local,path:'/perception-records',method:'GET'};
    assert.deepEqual((await request(recovery)).data,{schemaVersion:1,records:[],unreadable:0});
    const short=await request(local,{...payload,captureId:'21234567-89ab-4cde-8123-0123456789ab',subjectiveWindowSeconds:120});
    assert.equal(short.status,200);
    const recovered=await request(recovery);
    assert.equal(recovered.status,200);assert.equal(recovered.data.records.length,1);
    assert.equal(recovered.data.records[0].captureId,short.data.captureId);
    assert.equal(recovered.data.records[0].score,4);assert.equal(recovered.data.records[0].qualityPassed,false);
    assert.equal('window' in recovered.data.records[0],false);
    assert.deepEqual((await request(recovery)).data,recovered.data);
    assert.equal((await request({...recovery,headers:{Origin:'https://untrusted.example'}})).status,403);
  }finally{
    await bridge.close();
    const resolved=path.resolve(directory);
    assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('stresslog-capture-api-test-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});
