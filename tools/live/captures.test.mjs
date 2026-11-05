import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gunzipSync} from 'node:zlib';
import {CaptureStore,CaptureError,validateCaptureRequest} from './captures.mjs';
const id='01234567-89ab-4cde-8123-0123456789ab';
const request={captureId:id,subjectiveStress0to10:4};
const window={sessionId:'synthetic-test',lastReceivedAt:100,connected:true,
  report:{model:'synthetic-test',events:[{sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:'10000000000001',values:[-3,7.123456789]}]}};
async function temporary(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'stresslog-capture-test-'));
  t.after(async()=>{
    const resolved=path.resolve(directory);
    assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('stresslog-capture-test-'));
    await fs.rm(resolved,{recursive:true,force:true});
  });
  return directory;
}
test('capture preserves exact sensor values, timestamps and score, including after restart',async t=>{
  const directory=await temporary(t),store=new CaptureStore(directory);
  const saved=await store.capture(request,()=>window);
  const bytes=await fs.readFile(path.join(directory,id+'.json.gz'));
  assert.deepEqual(JSON.parse(gunzipSync(bytes).toString('utf8')),saved);
  assert.deepEqual(saved.window,window);
  assert.equal(saved.subjectiveStress0to10,4);
  assert.equal(saved.subjectiveWindowSeconds,300);
  const restarted=new CaptureStore(directory);
  assert.deepEqual(await restarted.capture(request,()=>{throw Error('Must reuse the original snapshot');}),saved);
  assert.deepEqual(await fs.readdir(directory),[id+'.json.gz']);
});
test('the self-report duration is preserved and cannot change on retry',async t=>{
  const store=new CaptureStore(await temporary(t));
  const short={...request,subjectiveWindowSeconds:120};
  const saved=await store.capture(short,()=>window);
  assert.equal(saved.subjectiveWindowSeconds,120);
  await assert.rejects(store.capture({...short,subjectiveWindowSeconds:300},()=>window),error=>error.status===409);
  assert.deepEqual(await store.capture(short,()=>window),saved);
  assert.throws(()=>validateCaptureRequest({...request,subjectiveWindowSeconds:60}),error=>error.status===400);
});
test('concurrent retries freeze exactly one snapshot and cannot change the score',async t=>{
  const store=new CaptureStore(await temporary(t));let reads=0;
  const snapshot=()=>{reads++;return window;};
  const [first,retry,conflict]=await Promise.allSettled([
    store.capture(request,snapshot),store.capture(request,snapshot),
    store.capture({...request,subjectiveStress0to10:8},snapshot)]);
  assert.equal(first.status,'fulfilled');assert.equal(retry.status,'fulfilled');
  assert.deepEqual(first.value,retry.value);assert.equal(reads,1);
  assert.equal(conflict.status,'rejected');assert.equal(conflict.reason.status,409);
});
test('unsafe identifiers and invalid scores are rejected before creating files',()=>{
  for(const value of [null,[],{}, {...request,captureId:'../other-file'}, {...request,captureId:[id]},
    {...request,subjectiveStress0to10:null},{...request,subjectiveStress0to10:NaN},
    {...request,subjectiveStress0to10:11},{...request,subjectiveStress0to10:-1},{...request,filename:'other'}])
    assert.throws(()=>validateCaptureRequest(value),error=>error instanceof CaptureError && error.status===400);
});
test('an unreadable prior capture is reported, not overwritten',async t=>{
  const directory=await temporary(t),target=path.join(directory,id+'.json.gz');
  await fs.writeFile(target,'broken');
  await assert.rejects(new CaptureStore(directory).capture(request,()=>window));
  assert.equal(await fs.readFile(target,'utf8'),'broken');
});
test('archive write failure is not reported as a saved capture',async t=>{
  const directory=await temporary(t),target=path.join(directory,'not-a-directory');
  await fs.writeFile(target,'existing file');
  await assert.rejects(new CaptureStore(target).capture(request,()=>window));
  assert.equal(await fs.readFile(target,'utf8'),'existing file');
});

test('compact archive recovery reuses summaries, detects changed files and reports unreadable records',async t=>{
  const directory=await temporary(t),store=new CaptureStore(directory);let projected=0;
  await store.capture(request,()=>window);
  const project=data=>{projected++;return {id:data.captureId,score:data.subjectiveStress0to10};};
  const first=await store.listSummaries(project);
  assert.deepEqual(first,{records:[{id,score:4}],unreadable:0});
  assert.deepEqual(await store.listSummaries(project),first);assert.equal(projected,1);
  await fs.writeFile(path.join(directory,id+'.json.gz'),'broken');
  assert.deepEqual(await store.listSummaries(project),{records:[],unreadable:1});
  await fs.unlink(path.join(directory,id+'.json.gz'));
  assert.deepEqual(await store.listSummaries(project),{records:[],unreadable:0});
  assert.equal(store.summaries.size,0);
});
