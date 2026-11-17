import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {ComparisonStore,createComparisonServer,dayKey,csvRow} from './server.mjs';
import {ACTIVITY_CONTEXT_METHOD} from '../../web/src/domain/activityContext.ts';
function fixture(now=Date.now()){
 const origin=1_000_000_000n,events=[];
 for(let i=0;i<=13000;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(origin+BigInt(i)*10_000_000n),values:[0]});
 for(let i=0;i<=3250;i++)events.push({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(origin+BigInt(i)*40_000_000n),values:[0,0,9.80665]});
 for(let i=0;i<=130;i++)events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(origin+BigInt(i)*1_000_000_000n),values:[70],accuracy:3});
 events.sort((a,b)=>Number(BigInt(a.sensorTimestampNs)-BigInt(b.sensorTimestampNs)));
 const window={connected:true,ppgFresh:true,worn:true,sessionId:'synthetic-session',model:'synthetic',lastReceivedAt:now,lastPpgReceivedAt:now,ppgLagMs:0,clockSkewMs:0,registrations:{ppg:true,heartRate:true,acceleration:true},streamErrors:0,batteryPercent:80,report:{model:'synthetic',reason:'completed_test',startedAtEpochMs:now-130000,events}};
 const original={contextMethod:ACTIVITY_CONTEXT_METHOD,current:{observation:{at:now,features:{heartRateMedian:70}},assessment:{stressScore:null,status:'movement'},prediction:{value:88}}};return [window,original];
}
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stresslog-comparison-'));t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('stresslog-comparison-'));await fs.rm(dir,{recursive:true,force:true});});return dir;}
test('same source is compared without modifying it; restart restores history but never a live value',async t=>{
 const dir=await temp(t),store=new ComparisonStore(dir),now=Date.now(),[window,original]=fixture(now),reference=JSON.stringify(original);
 await store.observe(window,original,now);const row=store.snapshot(now).current;assert.ok(row.candidate);assert.equal(row.original.stress,null);assert.equal(row.original.body,88);assert.equal(row.features.heart,70);assert.equal(JSON.stringify(original),reference);
 await store.observe(window,original,now+10000);assert.equal((await store.history(dayKey(now))).points.length,1);
 const csv=await fs.readFile(path.join(dir,dayKey(now)+'.csv'),'utf8');assert.ok(csv.includes('current_stress,current_body'));assert.ok(csv.includes(',,88,movement,'));assert.equal(csv.trim().split('\r\n').length,2);
 const restart=new ComparisonStore(dir);assert.equal(restart.snapshot(now).current,null);assert.equal((await restart.history(dayKey(now))).points.length,1);
 await store.observe({...window,connected:false},original,now+1000);assert.equal(store.snapshot(now+1000).current,null);assert.equal(store.temporal.state,null);assert.equal(store.snapshot(now+1000).last.candidate.value,row.candidate.value);
});
test('unusable candidate retains original reference; corrupt journal is preserved and shown',async t=>{
 const dir=await temp(t),now=Date.now(),[window,original]=fixture(now),store=new ComparisonStore(dir);
 await store.observe({...window,report:{...window.report,events:window.report.events.filter(e=>e.sensorStringType!=='android.sensor.heart_rate')}},original,now);
 assert.equal(store.snapshot(now).current.candidate,null);assert.equal(store.snapshot(now).current.original.body,88);assert.equal((await store.history()).points[0].candidate,null);
 const file=path.join(dir,dayKey(now)+'.jsonl');await fs.writeFile(file,'broken');const restart=new ComparisonStore(dir);assert.ok((await restart.history(dayKey(now))).error);await restart.observe(window,original,now);assert.equal(await fs.readFile(file,'utf8'),'broken');
});
test('isolated loopback API rejects cross-origin and writes; export preserves null stress and model details',async()=>{
 const source=fixture();const app=createComparisonServer({port:0,pollMs:100000,loadSource:async()=>source});await app.start();
 try{
  const base='http://127.0.0.1:'+app.server.address().port;
  assert.equal((await fetch(base+'/snapshot')).status,200);
  assert.equal((await fetch(base+'/snapshot',{headers:{Origin:'http://localhost:5173'}})).status,403);
  assert.equal((await fetch(base+'/snapshot',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/history?day=../../x')).status,400);
  assert.equal((await fetch(base+'/history?day=2026-99-99')).status,200);
  const exported=await fetch(base+'/export');assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/text\/csv/);assert.ok((await exported.text()).includes('candidate_smoothed'));
  const badHost=await new Promise((resolve,reject)=>{http.get(base+'/snapshot',{headers:{Host:'attacker.example'}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject);});assert.equal(badHost,403);
 }finally{await app.close();}
});
test('CSV never turns an unavailable value into zero',()=>{assert.ok(csvRow({at:0,original:null,candidate:null,features:null}).includes(',,,,,,unavailable,'));});
