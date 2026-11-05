import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {ObjectiveStore} from './objective-store.mjs';
const now=Date.now();
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stresslog-objective-test-'));
 t.after(async()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('stresslog-objective-test-'));await fs.rm(dir,{recursive:true,force:true});});return dir;}
function window(){
 const events=[];
 for(let i=0;i<14000;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10_000_000n),values:[1,2]});
 for(let i=0;i<3500;i++)events.push({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(BigInt(i)*40_000_000n),values:[0,0,9.80665]});
 for(let i=0;i<140;i++)events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(BigInt(i)*1_000_000_000n),values:[70],accuracy:3});
 return {connected:true,ppgFresh:true,worn:true,lastReceivedAt:now,lastPpgReceivedAt:now,ppgLagMs:0,model:'synthetic',sessionId:'test',
 streamErrors:0,clockSkewMs:0,registrations:{ppg:true,heartRate:true,acceleration:true},report:{model:'synthetic',reason:'test',startedAtEpochMs:now-140000,events}};
}
test('automatically collects measured features without labels and restores them after restart',async t=>{
 const dir=await temporary(t),store=new ObjectiveStore(dir);await store.ready;
 await store.observe(window(),now);const saved=await store.snapshot();assert.equal(saved.records.length,1);
 assert.equal(saved.records[0].features.heartRateMedian,70);assert.equal('score' in saved.records[0],false);
 await store.observe(window(),now+10000);assert.equal((await store.snapshot()).records.length,1);
 const later=window();later.lastReceivedAt=now+180000;later.lastPpgReceivedAt=now+180000;
 later.report.events=later.report.events.map(event=>({...event,sensorTimestampNs:String(BigInt(event.sensorTimestampNs)+180_000_000_000n)}));
 await store.observe(later,now+180000);const updated=await store.snapshot();assert.equal(updated.records.length,2);
 const restarted=new ObjectiveStore(dir);assert.deepEqual((await restarted.snapshot()).records,updated.records);
});
test('bootstraps physical measurements irrespective of old subjective values and stores no ratings',async t=>{
 const dir=await temporary(t),captures=path.join(dir,'captures');await fs.mkdir(captures);
 const filename='00000000-0000-4000-8000-000000000000.json.gz';
 const archive={capturedAt:now,window:window(),subjectiveStress0to10:0,subjectiveWindowSeconds:300};
 await fs.writeFile(path.join(captures,filename),gzipSync(JSON.stringify(archive)));
 const first=new ObjectiveStore(path.join(dir,'a'),captures),a=await first.snapshot();assert.equal(a.records.length,1);
 await fs.writeFile(path.join(captures,filename),gzipSync(JSON.stringify({...archive,subjectiveStress0to10:10,subjectiveWindowSeconds:120})));
 const second=new ObjectiveStore(path.join(dir,'b'),captures),b=await second.snapshot();assert.deepEqual(a.records,b.records);
 const saved=await fs.readFile(path.join(dir,'a','objective-reference-v1.json'),'utf8');assert.equal(saved.includes('subjective'),false);assert.equal(saved.includes('score'),false);
});
test('does not overwrite a broken reference file or accept disconnected measurements',async t=>{
 const dir=await temporary(t),file=path.join(dir,'objective-reference-v1.json');await fs.writeFile(file,'broken');
 const store=new ObjectiveStore(dir);await store.observe(window(),now);assert.ok((await store.snapshot()).error);
 assert.equal(await fs.readFile(file,'utf8'),'broken');
 const other=new ObjectiveStore(path.join(dir,'other'));await other.observe({...window(),connected:false},now);
 assert.equal((await other.snapshot()).records.length,0);
});

test('merges validated historical sensor references into an existing store once and rejects a broken import without overwriting',async t=>{
 const dir=await temporary(t),first=new ObjectiveStore(dir);await first.observe(window(),now);
 const original=(await first.snapshot()).records[0];
 const historical={...original,id:'historical-sensor-test',sessionId:'earlier-watch-session',at:now-300000,subjectiveStress0to10:9};
 const seed=path.join(dir,'historical-reference-seed-v1.json');
 await fs.writeFile(seed,JSON.stringify({schemaVersion:1,kind:'historical-sensor-only',records:[historical,historical]}));
 const migrated=await new ObjectiveStore(dir).snapshot();assert.equal(migrated.records.length,2);assert.equal(migrated.error,null);
 assert.equal(JSON.stringify(migrated.records).includes('subjective'),false);
 const repeated=await new ObjectiveStore(dir).snapshot();assert.deepEqual(repeated.records,migrated.records);
 const target=path.join(dir,'objective-reference-v1.json'),before=await fs.readFile(target,'utf8');
 await fs.writeFile(seed,'broken');assert.ok((await new ObjectiveStore(dir).snapshot()).error);
 assert.equal(await fs.readFile(target,'utf8'),before);
});
